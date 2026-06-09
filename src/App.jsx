import { useState, useMemo, useCallback } from "react";
import jsPDF from 'jspdf';
import { 
  calcularCargaTermica, 
  calcularDemandaDesdeCombustible, 
  calcularDemandaDesdeCertificado 
} from "./logic/calculoTermico";
import datosClimaticos, { 
  nombresMeses, 
  poderCalorificoCombustibles, 
  rendimientosGenerador,
  demandaPorCertificado,
  diasPorMes
} from "./data/climaIDAE";
import "./App.css";

// Meses disponibles
const mesesDisponibles = nombresMeses.map((nombre, i) => ({ index: i, nombre }));

// Meses típicos de calefacción por defecto (octubre a abril)
const mesesCalefaccionDefault = [9, 10, 11, 0, 1, 2, 3];
const horasDiariasDefault = 12;

// Listas
const tiposCombustible = Object.entries(poderCalorificoCombustibles).map(([key, val]) => ({ key, ...val }));
const tiposGenerador = Object.entries(rendimientosGenerador).map(([key, val]) => ({ key, ...val }));
const calificaciones = Object.entries(demandaPorCertificado).map(([letra, val]) => ({ letra, ...val }));

export default function App() {
  // ====================================================
  // ESTADOS
  // ====================================================
  
  const [metodoCalculo, setMetodoCalculo] = useState("directo");
  const [demandaDirecta, setDemandaDirecta] = useState(50000);
  
  const [tipoCombustible, setTipoCombustible] = useState("gasoleo");
  const [consumoAnual, setConsumoAnual] = useState(5000);
  const [tipoGenerador, setTipoGenerador] = useState("calderaGasoleoEstandar");
  const [rendimientoUsuario, setRendimientoUsuario] = useState("");
  
  const [m2Utiles, setM2Utiles] = useState(100);
  const [calificacionEnergetica, setCalificacionEnergetica] = useState("D");
  const [demandaPorM2Custom, setDemandaPorM2Custom] = useState("");
  
  const [T_int_original, setT_int_original] = useState(20);
  const [T_int_nueva, setT_int_nueva] = useState(21);
  const [horasDiarias, setHorasDiarias] = useState(horasDiariasDefault);
  
  const [ciudadSeleccionada, setCiudadSeleccionada] = useState(
    datosClimaticos.findIndex(c => c.nombre === "Madrid")
  );
  const [mesesCalefaccion, setMesesCalefaccion] = useState(mesesCalefaccionDefault);
  
  // ====================================================
  // DATOS DERIVADOS
  // ====================================================
  
  const ciudad = datosClimaticos[ciudadSeleccionada] || datosClimaticos[0];
  const combustibleSel = poderCalorificoCombustibles[tipoCombustible];
  const generadorSel = rendimientosGenerador[tipoGenerador];
  const rendimientoActual = rendimientoUsuario !== "" 
    ? parseFloat(rendimientoUsuario) 
    : (generadorSel?.rendimiento || 0.85);
  
  // ====================================================
  // CALCULAR DEMANDA ANUAL
  // ====================================================
  
  const demandaAnualCalc = useMemo(() => {
    switch (metodoCalculo) {
      case "directo":
        return demandaDirecta;
      case "combustible": {
        const rend = rendimientoUsuario !== "" 
          ? parseFloat(rendimientoUsuario) 
          : rendimientosGenerador[tipoGenerador]?.rendimiento || 0.85;
        return calcularDemandaDesdeCombustible({ tipoCombustible, consumoAnual, rendimientoEstacional: rend });
      }
      case "certificado": {
        const demM2 = demandaPorM2Custom !== ""
          ? parseFloat(demandaPorM2Custom)
          : (demandaPorCertificado[calificacionEnergetica]?.min + demandaPorCertificado[calificacionEnergetica]?.max) / 2;
        return calcularDemandaDesdeCertificado({ m2Utiles, demandaPorM2: demM2 });
      }
      default:
        return demandaDirecta;
    }
  }, [metodoCalculo, demandaDirecta, tipoCombustible, consumoAnual, tipoGenerador, 
      rendimientoUsuario, m2Utiles, calificacionEnergetica, demandaPorM2Custom]);
  
  // ====================================================
  // EJECUTAR CÁLCULO COMPLETO
  // ====================================================
  
  const resultado = useMemo(() => {
    if (!ciudad) return null;
    return calcularCargaTermica({
      energiaAnual: demandaAnualCalc,
      T_int_original, T_int_nueva,
      GD_mensuales: ciudad.GD15,
      TA_mensuales: ciudad.TA,
      TS_99: ciudad.TS_99,
      TSMin: ciudad.TSMin,
      mesesCalefaccion, horasDiarias
    });
  }, [demandaAnualCalc, T_int_original, T_int_nueva, ciudad, mesesCalefaccion, horasDiarias]);
  
  // ====================================================
  // HANDLERS
  // ====================================================
  
  const toggleMes = (index) => {
    setMesesCalefaccion(prev => 
      prev.includes(index)
        ? prev.filter(m => m !== index)
        : [...prev, index].sort((a, b) => a - b)
    );
  };
  
  // ====================================================
  // GENERAR PDF
  // ====================================================
  
  const generarPDF = useCallback(async () => {
    if (!resultado || !ciudad) return;
    
    const doc = new jsPDF();
    let y = 15;
    const margen = 15;
    const ancho = 180;
    
    const text = (txt, size = 10, style = 'normal') => {
      doc.setFontSize(size);
      doc.setFont('helvetica', style);
      doc.text(txt, margen, y);
    };
    
    // ==================== TÍTULO ====================
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Informe de Carga Térmica', margen, y);
    y += 8;
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('Generado por Calculadora de Carga Térmica v2.0', margen, y);
    y += 5;
    doc.text('Datos climáticos: Guía técnica IDAE (AEMET 1998-2007)', margen, y);
    y += 10;
    
    // ==================== PROCEDIMIENTO ====================
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('1. Procedimiento de cálculo', margen, y);
    y += 7;
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const procedimiento = [
      `El cálculo parte de la demanda anual de calefacción (${resultado.energiaAnualOriginal.toLocaleString('es-ES', { maximumFractionDigits: 0 })} kWh/año) obtenida a partir de los datos introducidos por el usuario.`,
      ``,
      `Reparto mensual de la demanda:`,
      `La demanda anual se distribuye mensualmente de forma proporcional a los Grados Día (GD) de calefacción base 15/15.`,
      `Para cada mes i de la temporada:`,
      `  Demanda_mes_i = Demanda_anual × (GD_mes_i / Σ GD_temporada)`,
      ``,
      `Cálculo de potencias:`,
      `La potencia media se obtiene dividiendo la demanda total de la temporada entre las horas totales de funcionamiento:`,
      `  P_media = Demanda_temporada / (días_temporada × horas_diarias)`,
      ``,
      `La potencia máxima (diseño) se calcula proyectando la potencia media a las condiciones más desfavorables:`,
      `  P_máx = P_media × (T_int - TS_99) / (T_int - T_ext_media)`,
      `donde TS_99 es la temperatura seca con percentil del 99% (temperatura de diseño en invierno).`,
      ``,
      `Corrección por cambio de temperatura interior:`,
      `Si se modifica la temperatura interior de consigna, la demanda y potencias se corrigen proporcionalmente:`,
      `  Factor_corrección = (T_int_nueva - T_ext_media) / (T_int_original - T_ext_media)`,
      `  Demanda_corregida = Demanda_original × Factor_corrección`,
      ``,
      `Este método está basado en la hipótesis de que la carga térmica es proporcional a la diferencia de temperaturas interior-exterior, que es el fundamento de los métodos de Grados Día.`
    ];
    
    procedimiento.forEach(linea => {
      if (y > 275) { doc.addPage(); y = 15; }
      doc.text(linea, margen, y);
      y += 4.5;
    });
    y += 5;
    
    // ==================== DATOS DE ENTRADA ====================
    if (y > 250) { doc.addPage(); y = 15; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('2. Datos de entrada', margen, y);
    y += 7;
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    let metodoTxt = "Demanda directa";
    let demoTxt = `${resultado.energiaAnualOriginal.toLocaleString()} kWh/año`;
    if (metodoCalculo === "combustible") {
      metodoTxt = `Consumo de ${combustibleSel?.nombre}`;
      demoTxt = `${consumoAnual.toLocaleString()} ${combustibleSel?.unidad} × ${combustibleSel?.PCI_kWh} kWh/${combustibleSel?.unidad} × ${(rendimientoActual * 100).toFixed(0)}% = ${resultado.energiaAnualOriginal.toLocaleString('es-ES', { maximumFractionDigits: 0 })} kWh/año`;
    } else if (metodoCalculo === "certificado") {
      metodoTxt = "Certificado energético";
      demoTxt = `${m2Utiles} m² × ${(demandaAnualCalc / m2Utiles).toFixed(0)} kWh/m²·año = ${resultado.energiaAnualOriginal.toLocaleString('es-ES', { maximumFractionDigits: 0 })} kWh/año`;
    }
    
    const entradas = [
      `Método de cálculo: ${metodoTxt}`,
      `Demanda anual: ${resultado.energiaAnualOriginal.toLocaleString('es-ES', { maximumFractionDigits: 0 })} kWh/año`,
      ``,
      `Ciudad: ${ciudad.nombre} (${ciudad.provincia}) - ${ciudad.ubicacion}`,
      `Altitud: ${ciudad.altitud} m`,
      `Temperatura interior original: ${resultado.T_int_original}°C`,
      `Temperatura interior nuevo generador: ${resultado.T_int_nueva}°C`,
      `Temperatura de diseño (TS_99): ${ciudad.TS_99}°C`,
      `Temperatura mínima histórica: ${ciudad.TSMin}°C`,
      `Periodo de calefacción: ${resultado.mesesCalefaccion.map(i => nombresMeses[i]).join(', ')}`,
      `Horas diarias de funcionamiento: ${resultado.horasDiarias} h/día`,
      `Días totales temporada: ${resultado.diasTemporada} días`,
      `Horas totales temporada: ${resultado.horasTotalesTemporada} horas`,
      `Grados Día totales (base 15/15): ${resultado.GD_total_temporada}`,
      `Temperatura exterior media temporada: ${resultado.T_ext_media_temporada.toFixed(1)}°C`
    ];
    
    entradas.forEach(linea => {
      if (y > 275) { doc.addPage(); y = 15; }
      doc.text(linea, margen, y);
      y += 4.5;
    });
    y += 5;
    
    // ==================== RESULTADOS ====================
    if (y > 250) { doc.addPage(); y = 15; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('3. Resultados del cálculo', margen, y);
    y += 7;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Potencias:', margen, y);
    y += 6;
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    const pots = [
      `Potencia media: ${resultado.P_media_temp_sinCorregir.toFixed(1)} kW (original) → ${resultado.P_media_corregida.toFixed(1)} kW (corregida)`,
      `Potencia máxima (diseño): ${resultado.P_max_sinCorregir.toFixed(1)} kW (original) → ${resultado.P_max_corregida.toFixed(1)} kW (corregida)`,
      `Potencia mínima: ${resultado.P_min_sinCorregir.toFixed(1)} kW (original) → ${resultado.P_min_corregida.toFixed(1)} kW (corregida)`,
      `Factor de corrección por T interior: ${resultado.factorCorreccionMedia.toFixed(3)}`,
      `Demanda anual corregida: ${resultado.energiaAnualCorregida.toLocaleString('es-ES', { maximumFractionDigits: 0 })} kWh/año`
    ];
    
    pots.forEach(linea => {
      doc.text(linea, margen, y);
      y += 5;
    });
    y += 5;
    
    // Tabla mensual
    if (y + 30 + resultado.datosMensuales.length * 6 > 275) { doc.addPage(); y = 15; }
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Reparto mensual de la demanda:', margen, y);
    y += 7;
    
    // Cabecera tabla
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const col = [margen, margen + 30, margen + 60, margen + 90, margen + 120, margen + 150];
    doc.text('Mes', col[0], y);
    doc.text('GD', col[1], y);
    doc.text('T media', col[2], y);
    doc.text('Fracción', col[3], y);
    doc.text('Demanda', col[4], y);
    doc.text('% temp.', col[5], y);
    y += 5;
    doc.line(margen, y - 1, margen + 170, y - 1);
    
    // Filas
    doc.setFont('helvetica', 'normal');
    resultado.datosMensuales.forEach(d => {
      if (y > 270) { doc.addPage(); y = 15; }
      doc.text(d.nombreMes, col[0], y);
      doc.text(String(d.GD), col[1], y);
      doc.text(d.TA.toFixed(1), col[2], y);
      doc.text((d.fraccion * 100).toFixed(1) + '%', col[3], y);
      doc.text(d.energiaKWh.toLocaleString('es-ES', { maximumFractionDigits: 0 }), col[4], y);
      doc.text((d.energiaKWh / resultado.energiaTotalTemporada * 100).toFixed(1) + '%', col[5], y);
      y += 5;
    });
    
    // Total
    doc.line(margen, y - 1, margen + 170, y - 1);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL', col[0], y);
    doc.text(String(resultado.GD_total_temporada), col[1], y);
    doc.text('-', col[2], y);
    doc.text('100%', col[3], y);
    doc.text(resultado.energiaTotalTemporada.toLocaleString('es-ES', { maximumFractionDigits: 0 }), col[4], y);
    doc.text('100%', col[5], y);
    y += 8;
    
    // ==================== CONCLUSIONES ====================
    if (y > 250) { doc.addPage(); y = 15; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('4. Conclusiones y recomendaciones', margen, y);
    y += 7;
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    const conclusiones = [
      `La demanda anual de calefacción para ${ciudad.nombre} es de ${resultado.energiaAnualOriginal.toLocaleString('es-ES', { maximumFractionDigits: 0 })} kWh/año.`,
      ``,
      `Para la selección del nuevo generador, se recomienda considerar una potencia máxima de diseño de ${resultado.P_max_corregida.toFixed(1)} kW,`,
      `que es la potencia necesaria para cubrir la demanda en las condiciones más desfavorables (TS_99 = ${ciudad.TS_99}°C)`,
      `con la nueva temperatura interior de ${resultado.T_int_nueva}°C.`,
      ``,
      `La potencia media durante la temporada será de ${resultado.P_media_corregida.toFixed(1)} kW,`,
      `y la potencia mínima estimada de ${resultado.P_min_corregida.toFixed(1)} kW.`,
      ``,
      `Al cambiar la temperatura interior de ${resultado.T_int_original}°C a ${resultado.T_int_nueva}°C,`,
      `la demanda se verá afectada por un factor de ${resultado.factorCorreccionMedia.toFixed(3)},`,
      `resultando en una demanda anual corregida de ${resultado.energiaAnualCorregida.toLocaleString('es-ES', { maximumFractionDigits: 0 })} kWh/año.`,
      ``,
      `Se recomienda seleccionar un generador con una potencia nominal cercana a la potencia máxima de diseño,`,
      `pero con capacidad de modulación para adaptarse a la potencia mínima.`,
      `En el caso de calderas de condensación, es especialmente importante que puedan trabajar a baja temperatura`,
      `para maximizar su rendimiento estacional.`
    ];
    
    conclusiones.forEach(linea => {
      if (y > 275) { doc.addPage(); y = 15; }
      doc.text(linea, margen, y);
      y += 4.5;
    });
    y += 8;
    
    // ==================== PIE ====================
    if (y > 270) { doc.addPage(); y = 15; }
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.text(`Informe generado el ${new Date().toLocaleDateString('es-ES')} - Calculadora de Carga Térmica v2.0`, margen, y);
    y += 3;
    doc.text('Datos climáticos según Guía Técnica IDAE "Condiciones climáticas exteriores de proyecto" (AEMET)', margen, y);
    
    doc.save('informe_carga_termica.pdf');
  }, [resultado, ciudad, metodoCalculo, combustibleSel, consumoAnual, rendimientoActual, m2Utiles, demandaAnualCalc]);
  
  // ====================================================
  // UI
  // ====================================================
  
  return (
    <div className="app">
      <header className="app-header">
        <h1>Calculadora de Carga Térmica</h1>
        <p className="app-subtitle">Reparto mensual de demanda y dimensionado de generadores</p>
      </header>
      
      <div className="app-content">
        
        {/* ============================================= */}
        {/* PANEL DE ENTRADA */}
        {/* ============================================= */}
        
        <section className="panel panel-inputs" id="panel-entrada">
          <h2>Datos de entrada</h2>
          
          {/* Selector de método */}
          <div className="metodo-selector">
            <button 
              className={`metodo-btn ${metodoCalculo === "directo" ? "active" : ""}`}
              onClick={() => setMetodoCalculo("directo")}
            >
              <span className="metodo-icon">📊</span>
              <span className="metodo-label">Demanda directa</span>
              <span className="metodo-desc">Conozco la demanda anual</span>
            </button>
            <button 
              className={`metodo-btn ${metodoCalculo === "combustible" ? "active" : ""}`}
              onClick={() => setMetodoCalculo("combustible")}
            >
              <span className="metodo-icon">⛽</span>
              <span className="metodo-label">Por consumo combustible</span>
              <span className="metodo-desc">Conozco el consumo y el generador</span>
            </button>
            <button 
              className={`metodo-btn ${metodoCalculo === "certificado" ? "active" : ""}`}
              onClick={() => setMetodoCalculo("certificado")}
            >
              <span className="metodo-icon">🏠</span>
              <span className="metodo-label">Por certificado energético</span>
              <span className="metodo-desc">Conozco m² y calificación</span>
            </button>
          </div>
          
          <div className="grid-inputs">
            
            {/* Columna 1: Demanda */}
            <div className="input-group input-group-demand">
              <h3>
                {metodoCalculo === "directo" && "Demanda anual"}
                {metodoCalculo === "combustible" && "Consumo de combustible"}
                {metodoCalculo === "certificado" && "Certificado energético"}
              </h3>
              
              {metodoCalculo === "directo" && (
                <label>
                  Demanda anual (kWh/año)
                  <input type="number" value={demandaDirecta} onChange={(e) => setDemandaDirecta(Number(e.target.value))} min={0} />
                </label>
              )}
              
              {metodoCalculo === "combustible" && (
                <>
                  <label>
                    Tipo de combustible
                    <select value={tipoCombustible} onChange={(e) => setTipoCombustible(e.target.value)}>
                      {tiposCombustible.map(c => (
                        <option key={c.key} value={c.key}>{c.nombre} ({c.unidad})</option>
                      ))}
                    </select>
                  </label>
                  
                  <label>
                    Consumo anual ({combustibleSel?.unidad || "unidades"})
                    <input type="number" value={consumoAnual} onChange={(e) => setConsumoAnual(Number(e.target.value))} min={0} />
                  </label>
                  
                  <label>
                    Tipo de generador (orientativo)
                    <select value={tipoGenerador} onChange={(e) => { setTipoGenerador(e.target.value); setRendimientoUsuario(""); }}>
                      {tiposGenerador.map(g => (
                        <option key={g.key} value={g.key}>{g.nombre} (η ≈ {(g.rendimiento * 100).toFixed(0)}%)</option>
                      ))}
                    </select>
                    <small className="input-note">Selecciona para ver el rendimiento orientativo. Luego puedes ajustarlo manualmente.</small>
                  </label>
                  
                  <label>
                    Rendimiento estacional (η)
                    <div className="rendimiento-input-group">
                      <input
                        type="number"
                        value={rendimientoUsuario}
                        onChange={(e) => setRendimientoUsuario(e.target.value)}
                        step={0.01}
                        min={0}
                        max={6}
                        placeholder={`${(generadorSel?.rendimiento || 0.85).toFixed(2)}`}
                      />
                      <span className="rendimiento-sugerido">
                        {generadorSel ? `Sugerido: ${(generadorSel.rendimiento * 100).toFixed(0)}%` : ''}
                      </span>
                    </div>
                    <small className="input-note">Introduce tu valor o déjalo vacío para usar el sugerido del generador</small>
                  </label>
                  
                  {combustibleSel && (
                    <div className="info-extra">
                      <p><strong>{combustibleSel.nombre}</strong> - PCI: {combustibleSel.PCI_kWh} kWh/{combustibleSel.unidad}</p>
                      <p>Consumo energético: {(consumoAnual * combustibleSel.PCI_kWh).toLocaleString('es-ES', { maximumFractionDigits: 0 })} kWh</p>
                      <p>Demanda estimada: <strong>{demandaAnualCalc.toLocaleString('es-ES', { maximumFractionDigits: 0 })} kWh/año</strong></p>
                    </div>
                  )}
                </>
              )}
              
              {metodoCalculo === "certificado" && (
                <>
                  <label>
                    Superficie útil (m²)
                    <input type="number" value={m2Utiles} onChange={(e) => setM2Utiles(Number(e.target.value))} min={0} />
                  </label>
                  
                  <label>
                    Calificación energética (calefacción)
                    <select value={calificacionEnergetica} onChange={(e) => setCalificacionEnergetica(e.target.value)}>
                      {calificaciones.map(c => (
                        <option key={c.letra} value={c.letra}>
                          {c.label} ({c.min}-{c.max} kWh/m²·año)
                        </option>
                      ))}
                    </select>
                  </label>
                  
                  <label>
                    Demanda por m² (kWh/m²·año)
                    <input
                      type="number"
                      value={demandaPorM2Custom}
                      onChange={(e) => setDemandaPorM2Custom(e.target.value)}
                      step={1} min={0}
                      placeholder={`Media: ${((demandaPorCertificado[calificacionEnergetica]?.min + demandaPorCertificado[calificacionEnergetica]?.max) / 2).toFixed(0)}`}
                    />
                    <small className="input-note">Déjalo vacío para usar la media de la calificación</small>
                  </label>
                  
                  <div className="info-extra">
                    <p>Demanda estimada: <strong>{demandaAnualCalc.toLocaleString('es-ES', { maximumFractionDigits: 0 })} kWh/año</strong></p>
                    <p>Densidad: {(demandaAnualCalc / m2Utiles).toFixed(0)} kWh/m²·año</p>
                  </div>
                </>
              )}
            </div>
            
            {/* Columna 2: Ciudad y horario */}
            <div className="input-group">
              <h3>Ubicación y horario</h3>
              
              <label>
                Ciudad / Estación
                <select value={ciudadSeleccionada} onChange={(e) => setCiudadSeleccionada(Number(e.target.value))}>
                  {datosClimaticos.map((c, i) => (
                    <option key={i} value={i}>{c.nombre} ({c.provincia})</option>
                  ))}
                </select>
              </label>
              
              <label>
                T interior ORIGINAL (°C)
                <input type="number" value={T_int_original} onChange={(e) => setT_int_original(Number(e.target.value))} step={0.5} />
              </label>
              
              <label>
                T interior NUEVO generador (°C)
                <input type="number" value={T_int_nueva} onChange={(e) => setT_int_nueva(Number(e.target.value))} step={0.5} />
              </label>
              
              <label>
                Horas diarias de calefacción
                <input type="number" value={horasDiarias} onChange={(e) => setHorasDiarias(Number(e.target.value))} min={1} max={24} />
              </label>
              
              <div className="ciudad-info">
                <p><strong>{ciudad.nombre}</strong> - {ciudad.ubicacion}</p>
                <p>Altitud: {ciudad.altitud} m | TS_99: {ciudad.TS_99}°C | TS_min: {ciudad.TSMin}°C</p>
              </div>
            </div>
            
            {/* Columna 3: Meses */}
            <div className="input-group">
              <h3>Periodo de calefacción</h3>
              <p className="input-hint">Selecciona los meses con calefacción</p>
              
              <div className="meses-grid">
                {mesesDisponibles.map(({ index, nombre }) => (
                  <button
                    key={index}
                    className={`mes-btn ${mesesCalefaccion.includes(index) ? 'active' : ''}`}
                    onClick={() => toggleMes(index)}
                    title={nombre}
                  >
                    {nombre.substring(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
        
        {/* ============================================= */}
        {/* RESULTADOS */}
        {/* ============================================= */}
        
        {resultado && (
          <>
            <section className="panel panel-resumen">
              <h2>Resumen de resultados</h2>
              
              <div className="resumen-grid">
                <div className="resumen-card resumen-original">
                  <h4>Demanda actual</h4>
                  <div className="resumen-valor">
                    <span className="valor-num">{resultado.energiaAnualOriginal.toLocaleString('es-ES', { maximumFractionDigits: 0 })}</span>
                    <span className="valor-unidad">kWh/año</span>
                  </div>
                  <p>Demanda anual de calefacción</p>
                  <p className="resumen-detalle">T interior: {resultado.T_int_original}°C</p>
                  <p className="resumen-detalle">{metodoCalculo === "combustible" ? `${combustibleSel?.nombre}: ${consumoAnual.toLocaleString()} ${combustibleSel?.unidad}` : ''}</p>
                  <p className="resumen-detalle">{metodoCalculo === "certificado" ? `${m2Utiles} m² - ${(demandaAnualCalc / m2Utiles).toFixed(0)} kWh/m²·año` : ''}</p>
                </div>
                
                <div className="resumen-card resumen-corregido">
                  <h4>Con nuevo generador</h4>
                  <div className="resumen-valor">
                    <span className="valor-num">{resultado.energiaAnualCorregida.toLocaleString('es-ES', { maximumFractionDigits: 0 })}</span>
                    <span className="valor-unidad">kWh/año</span>
                  </div>
                  <p>Demanda estimada</p>
                  <p className="resumen-detalle">T interior: {resultado.T_int_nueva}°C</p>
                </div>
                
                <div className="resumen-card resumen-temporada">
                  <h4>Temporada de calefacción</h4>
                  <p><strong>{resultado.diasTemporada}</strong> días</p>
                  <p><strong>{resultado.horasTotalesTemporada}</strong> horas totales</p>
                  <p>T_ext media: <strong>{resultado.T_ext_media_temporada.toFixed(1)}°C</strong></p>
                  <p>GD total: <strong>{resultado.GD_total_temporada}</strong></p>
                </div>
              </div>
              
              {/* Potencias */}
              <div className="potencias-section">
                <h3>Potencias calculadas</h3>
                
                <div className="potencias-grid">
                  <div className="potencia-card">
                    <div className="potencia-tipo">Potencia media</div>
                    <div className="potencia-valores">
                      <div className="potencia-valor">
                        <span className="potencia-label">Original</span>
                        <span className="potencia-num">{resultado.P_media_temp_sinCorregir.toFixed(1)} kW</span>
                      </div>
                      <div className="potencia-valor corregido">
                        <span className="potencia-label">Corregida</span>
                        <span className="potencia-num">{resultado.P_media_corregida.toFixed(1)} kW</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="potencia-card potencia-max">
                    <div className="potencia-tipo">Potencia máxima (diseño)</div>
                    <div className="potencia-valores">
                      <div className="potencia-valor">
                        <span className="potencia-label">Original</span>
                        <span className="potencia-num">{resultado.P_max_sinCorregir.toFixed(1)} kW</span>
                      </div>
                      <div className="potencia-valor corregido">
                        <span className="potencia-label">Corregida</span>
                        <span className="potencia-num">{resultado.P_max_corregida.toFixed(1)} kW</span>
                      </div>
                    </div>
                    <div className="potencia-nota">Basada en TS_99 = {ciudad.TS_99}°C</div>
                  </div>
                  
                  <div className="potencia-card potencia-min">
                    <div className="potencia-tipo">Potencia mínima</div>
                    <div className="potencia-valores">
                      <div className="potencia-valor">
                        <span className="potencia-label">Original</span>
                        <span className="potencia-num">{resultado.P_min_sinCorregir.toFixed(1)} kW</span>
                      </div>
                      <div className="potencia-valor corregido">
                        <span className="potencia-label">Corregida</span>
                        <span className="potencia-num">{resultado.P_min_corregida.toFixed(1)} kW</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="factor-correccion">
                  <span>Factor de corrección por T interior: </span>
                  <strong>{resultado.factorCorreccionMedia.toFixed(3)}</strong>
                  <span className="factor-detalle">
                    ({resultado.T_int_nueva}°C - {resultado.T_ext_media_temporada.toFixed(1)}°C) / ({resultado.T_int_original}°C - {resultado.T_ext_media_temporada.toFixed(1)}°C)
                  </span>
                </div>
              </div>
            </section>
            
            {/* Tabla mensual */}
            <section className="panel panel-tabla">
              <h2>Reparto mensual de demanda</h2>
              
              <div className="table-wrapper">
                <table className="tabla-mensual">
                  <thead>
                    <tr>
                      <th>Mes</th>
                      <th>GD (base 15/15)</th>
                      <th>T media (°C)</th>
                      <th>Fracción</th>
                      <th>Demanda (kWh)</th>
                      <th>% temporada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.datosMensuales.map((d, i) => (
                      <tr key={i}>
                        <td><strong>{d.nombreMes}</strong></td>
                        <td>{d.GD}</td>
                        <td>{d.TA.toFixed(1)}</td>
                        <td>{(d.fraccion * 100).toFixed(1)}%</td>
                        <td className="num">{d.energiaKWh.toLocaleString('es-ES', { maximumFractionDigits: 0 })}</td>
                        <td className="num">{(d.energiaKWh / resultado.energiaTotalTemporada * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td><strong>TOTAL</strong></td>
                      <td><strong>{resultado.GD_total_temporada}</strong></td>
                      <td>-</td>
                      <td><strong>100%</strong></td>
                      <td className="num"><strong>{resultado.energiaTotalTemporada.toLocaleString('es-ES', { maximumFractionDigits: 0 })}</strong></td>
                      <td className="num"><strong>100%</strong></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
            
            {/* Gráfica */}
            <section className="panel panel-grafica">
              <h2>Distribución mensual de la demanda</h2>
              
              <div className="barras-container">
                {resultado.datosGrafica.map((d, i) => {
                  const maxEnergia = Math.max(...resultado.datosGrafica.map(g => g.energiaKWh), 1);
                  return (
                    <div key={i} className={`barra-wrapper ${d.enCalefaccion ? 'activo' : 'inactivo'}`}>
                      <div className="barra-label-mes">{d.nombreMes}</div>
                      <div className="barra-track">
                        <div 
                          className="barra-fill"
                          style={{ 
                            height: `${Math.max(3, (d.energiaKWh / maxEnergia) * 100)}%`,
                            backgroundColor: d.enCalefaccion ? '#2563eb' : '#d1d5db'
                          }}
                        />
                        {d.enCalefaccion && d.energiaKWh > 0 && (
                          <div className="barra-valor">{(d.energiaKWh / 1000).toFixed(1)}</div>
                        )}
                      </div>
                      <div className="barra-gd"><small>GD: {d.GD}</small></div>
                    </div>
                  );
                })}
              </div>
              
              <div className="grafica-leyenda">
                <span className="leyenda-item">
                  <span className="leyenda-color" style={{ backgroundColor: '#2563eb' }}></span>
                  Meses con calefacción
                </span>
                <span className="leyenda-item">
                  <span className="leyenda-color" style={{ backgroundColor: '#d1d5db' }}></span>
                  Meses sin calefacción
                </span>
              </div>
            </section>
            
            {/* Datos climáticos */}
            <section className="panel panel-clima">
              <h2>Datos climáticos: {ciudad.nombre}</h2>
              <p className="fuente">Fuente: Guía técnica IDAE - Condiciones climáticas exteriores de proyecto (AEMET 1998-2007)</p>
              
              <div className="clima-grid">
                <div className="clima-item">
                  <span className="clima-label">Provincia</span>
                  <span className="clima-valor">{ciudad.provincia}</span>
                </div>
                <div className="clima-item">
                  <span className="clima-label">Altitud</span>
                  <span className="clima-valor">{ciudad.altitud} m</span>
                </div>
                <div className="clima-item">
                  <span className="clima-label">TS_99 (invierno)</span>
                  <span className="clima-valor">{ciudad.TS_99}°C</span>
                </div>
                <div className="clima-item">
                  <span className="clima-label">TS_min histórica</span>
                  <span className="clima-valor">{ciudad.TSMin}°C</span>
                </div>
                <div className="clima-item">
                  <span className="clima-label">GD total temporada</span>
                  <span className="clima-valor">{resultado.GD_total_temporada}</span>
                </div>
                <div className="clima-item">
                  <span className="clima-label">T_ext media temporada</span>
                  <span className="clima-valor">{resultado.T_ext_media_temporada.toFixed(1)}°C</span>
                </div>
              </div>
            </section>
            
            {/* BOTÓN PDF */}
            <div className="pdf-actions">
              <button 
                className="btn-pdf"
                onClick={generarPDF}
              >
                <span className="btn-pdf-icon">📄</span>
                <span className="btn-pdf-text">Generar Informe PDF Completo</span>
                <span className="btn-pdf-desc">Incluye procedimiento de cálculo, datos, resultados y conclusiones</span>
              </button>
            </div>
          </>
        )}
        
      </div>
      
      <footer className="app-footer">
        <p>Calculadora de Carga Térmica v2.0 - Datos climáticos IDAE (Guía técnica condiciones climáticas exteriores de proyecto)</p>
      </footer>
    </div>
  );
}
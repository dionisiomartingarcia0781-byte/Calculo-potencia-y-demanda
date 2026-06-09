/**
 * Módulo de cálculo de carga térmica y reparto mensual de energía
 * 
 * Basado en:
 * - Datos climáticos IDAE (Guía técnica condiciones climáticas exteriores de proyecto)
 * - Grados día base 15/15 para reparto de energía
 * - Corrección por temperatura interior
 */

import { poderCalorificoCombustibles } from "../data/climaIDAE";

/**
 * Calcula la demanda anual a partir del consumo de combustible
 * @param {Object} params
 * @param {string} params.tipoCombustible - Tipo de combustible ('gasoleo', 'gasNatural', 'butano', 'propano', 'pellet')
 * @param {number} params.consumoAnual - Consumo anual en unidades del combustible
 * @param {number} params.rendimientoEstacional - Rendimiento estacional del generador (0-1)
 * @returns {number} Demanda anual en kWh
 */
export function calcularDemandaDesdeCombustible({ tipoCombustible, consumoAnual, rendimientoEstacional }) {
  const combustible = poderCalorificoCombustibles[tipoCombustible];
  if (!combustible) return 0;
  
  // Demanda = Consumo × PCI × Rendimiento
  const energiaConsumida = consumoAnual * combustible.PCI_kWh;
  return energiaConsumida * rendimientoEstacional;
}

/**
 * Calcula la demanda anual a partir de la calificación energética
 * @param {Object} params
 * @param {number} params.m2Utiles - Metros cuadrados útiles de la vivienda
 * @param {number} params.demandaPorM2 - Demanda anual por m2 (kWh/m²·año)
 * @returns {number} Demanda anual en kWh
 */
export function calcularDemandaDesdeCertificado({ m2Utiles, demandaPorM2 }) {
  return m2Utiles * demandaPorM2;
}

/**
 * Calcula el reparto mensual de energía y las potencias
 * @param {Object} params
 * @param {number} params.energiaAnual - Demanda anual (kWh/año) - ya calculada desde combustible o certificado
 * @param {number} params.T_int_original - Temperatura interior original (ºC)
 * @param {number} params.T_int_nueva - Temperatura interior con nuevo generador (ºC)
 * @param {number[]} params.GD_mensuales - Grados día mensuales (12 valores)
 * @param {number[]} params.TA_mensuales - Temperaturas medias mensuales (12 valores)
 * @param {number} params.TS_99 - Temperatura seca percentil 99% (ºC) - diseño invierno
 * @param {number} params.TSMin - Temperatura mínima histórica (ºC)
 * @param {number[]} params.mesesCalefaccion - Array de índices de meses (0-11) de calefacción
 * @param {number} params.horasDiarias - Horas diarias de funcionamiento
 * @returns {Object} Resultados del cálculo
 */
export function calcularCargaTermica({
  energiaAnual,
  T_int_original,
  T_int_nueva,
  GD_mensuales,
  TA_mensuales,
  TS_99,
  TSMin,
  mesesCalefaccion,
  horasDiarias
}) {
  // =========================================================
  // 1. FILTRAR MESES DE CALEFACCIÓN
  // =========================================================
  
  const indicesMeses = mesesCalefaccion;
  const GD_calefaccion = indicesMeses.map(i => GD_mensuales[i]);
  const TA_calefaccion = indicesMeses.map(i => TA_mensuales[i]);
  const GD_total_temporada = GD_calefaccion.reduce((sum, gd) => sum + gd, 0);
  
  // =========================================================
  // 2. REPARTO MENSUAL DE ENERGÍA
  // =========================================================
  
  const energiaMensual = indicesMeses.map((_, idx) => 
    GD_total_temporada > 0 
      ? energiaAnual * (GD_calefaccion[idx] / GD_total_temporada)
      : 0
  );
  
  const energiaTotalTemporada = energiaMensual.reduce((sum, e) => sum + e, 0);
  
  // =========================================================
  // 3. TEMPERATURA EXTERIOR MEDIA DE LA TEMPORADA
  // =========================================================
  
  const T_ext_media_temporada = TA_calefaccion.length > 0
    ? TA_calefaccion.reduce((sum, t) => sum + t, 0) / TA_calefaccion.length
    : 0;
  
  // =========================================================
  // 4. CÁLCULO DE POTENCIAS (SIN CORRECCIÓN)
  // =========================================================
  
  const diasTemporada = indicesMeses.reduce((sum, i) => {
    const diasPorMes = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return sum + diasPorMes[i];
  }, 0);
  
  const horasTotalesTemporada = diasTemporada * horasDiarias;
  
  const P_media_temp_sinCorregir = horasTotalesTemporada > 0
    ? energiaTotalTemporada / horasTotalesTemporada
    : 0;
  
  const deltaT_media = T_int_original - T_ext_media_temporada;
  
  let P_max_sinCorregir = 0;
  let P_min_sinCorregir = 0;
  
  if (deltaT_media !== 0) {
    const deltaT_max = T_int_original - TS_99;
    P_max_sinCorregir = P_media_temp_sinCorregir * (deltaT_max / deltaT_media);
    
    // Potencia mínima basada en T_media_min_diaria (estimación)
    const T_media_min_diaria = T_ext_media_temporada + 3;
    const deltaT_min = T_int_original - T_media_min_diaria;
    P_min_sinCorregir = P_media_temp_sinCorregir * (deltaT_min / deltaT_media);
  }
  
  // =========================================================
  // 5. CORRECCIÓN POR TEMPERATURA INTERIOR
  // =========================================================
  
  const factorCorreccionMedia = deltaT_media !== 0 
    ? (T_int_nueva - T_ext_media_temporada) / deltaT_media
    : 1;
  
  const factorCorreccionMax = deltaT_media !== 0
    ? (T_int_nueva - TS_99) / (T_int_original - TS_99)
    : 1;
  
  const P_media_corregida = P_media_temp_sinCorregir * factorCorreccionMedia;
  const P_max_corregida = P_max_sinCorregir * factorCorreccionMax;
  const P_min_corregida = P_min_sinCorregir * factorCorreccionMedia;
  const energiaAnualCorregida = energiaAnual * factorCorreccionMedia;
  
  // =========================================================
  // 6. RESULTADOS
  // =========================================================
  
  const datosMensuales = indicesMeses.map((idx, i) => ({
    mes: idx,
    nombreMes: getNombreMes(idx),
    GD: GD_calefaccion[i],
    TA: TA_calefaccion[i],
    energiaKWh: energiaMensual[i],
    fraccion: GD_total_temporada > 0 ? GD_calefaccion[i] / GD_total_temporada : 0
  }));
  
  return {
    datosMensuales,
    energiaAnualOriginal: energiaAnual,
    energiaTotalTemporada,
    energiaAnualCorregida,
    T_int_original,
    T_int_nueva,
    T_ext_media_temporada,
    TS_99,
    TSMin,
    P_media_temp_sinCorregir,
    P_max_sinCorregir,
    P_min_sinCorregir,
    P_media_corregida,
    P_max_corregida,
    P_min_corregida,
    factorCorreccionMedia,
    factorCorreccionMax,
    GD_total_temporada,
    diasTemporada,
    horasDiarias,
    horasTotalesTemporada,
    mesesCalefaccion: indicesMeses,
    datosGrafica: generarDatosGraficaCompleta(indicesMeses, energiaMensual, GD_mensuales, TA_mensuales)
  };
}

function getNombreMes(idx) {
  const nombres = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  return nombres[idx] || `Mes ${idx + 1}`;
}

function generarDatosGraficaCompleta(mesesCalefaccion, energiaMensual, GD_mensuales, TA_mensuales) {
  const energiaPorMes = Array(12).fill(0);
  mesesCalefaccion.forEach((idx, i) => {
    energiaPorMes[idx] = energiaMensual[i];
  });
  
  return Array(12).fill(0).map((_, i) => ({
    mes: i,
    nombreMes: getNombreMes(i).substring(0, 3),
    GD: GD_mensuales[i],
    TA: TA_mensuales[i],
    energiaKWh: energiaPorMes[i],
    enCalefaccion: mesesCalefaccion.includes(i)
  }));
}
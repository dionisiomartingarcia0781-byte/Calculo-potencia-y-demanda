// ======================================================
// simulateACS.js
// Modelo inicial de simulación ACS
// ======================================================

// ------------------------------------------------------
// FUNCIÓN PRINCIPAL
// ------------------------------------------------------

export function simulateACS(config) {

  // ====================================================
  // 1. PARÁMETROS DE ENTRADA
  // ====================================================

  const {

    // -----------------------------
    // Demanda
    // -----------------------------
    personas,
    litrosPersona,
    perfilDemanda,

    // -----------------------------
    // Pérdidas
    // -----------------------------
    porcentajePerdidas,

    // -----------------------------
    // Depósitos
    // -----------------------------
    volumenV1,
    volumenV2,

    // -----------------------------
    // Temperaturas
    // -----------------------------
    temperaturaAcumulacion,
    temperaturaRed,

    // -----------------------------
    // Generador
    // -----------------------------
    potenciaGenerador,
    eficienciaIntercambio,

    // -----------------------------
    // Control
    // -----------------------------
    porcentajeArranque,
    retrasoArranqueMin,

    // -----------------------------
    // Modelo estratificado
    // -----------------------------
    factorUsoV1,

    // -----------------------------
    // Simulación
    // -----------------------------
    pasoMinutos,

    // -----------------------------
    // Nuevos parámetros
    // -----------------------------
    numeroDepositos,
    temperaturaMinima,
    tiempoFueraMin,
    limiteHorario,
    limiteDiario

  } = config;

  const volumenV1Efectivo = numeroDepositos === 1 ? 0 : volumenV1;



  // ====================================================
  // 2. CONSTANTES FÍSICAS
  // ====================================================

  // Agua
  const cp = 4.186; // kJ/kg·K

  // Conversión
  const kWhPorkJ = 1 / 3600;

  // Densidad aproximada del agua
  const rho = 1; // kg/L



  // ====================================================
  // 3. DEMANDA DIARIA
  // ====================================================

  const demandaTotalLitros =
    personas * litrosPersona;

  // Pérdidas añadidas a demanda
  const perdidasLitros =
    demandaTotalLitros * (porcentajePerdidas / 100);

  const demandaConPerdidas =
    demandaTotalLitros + perdidasLitros;



  // ====================================================
  // 4. ENERGÍA NOMINAL DE LOS DEPÓSITOS
  // ====================================================

  function calcularEnergiaDeposito(volumenLitros) {

    // Q = m * cp * deltaT

    const deltaT =
      temperaturaAcumulacion - temperaturaRed;

    const masa =
      volumenLitros * rho;

    const energiakJ =
      masa * cp * deltaT;

    return energiakJ * kWhPorkJ;
  }



  const energiaNominalV1 =
    calcularEnergiaDeposito(volumenV1Efectivo);

  const energiaNominalV2 =
    calcularEnergiaDeposito(volumenV2);



  // ====================================================
  // 5. ENERGÍA UTILIZABLE
  // ====================================================

  const energiaUtilV1 =
    energiaNominalV1 * factorUsoV1;

  const energiaUtilV2 =
    energiaNominalV2;



  // ====================================================
  // 6. ESTADO INICIAL
  // ====================================================

  let energiaV1 = energiaUtilV1;
  let energiaV2 = energiaUtilV2;

  let generadorON = false;

  let retrasoPendiente = 0;

  let tiempoFuera = 0;
  let maxTiempoFuera = 0;

  let cumplimientoHorario = true;
  let totalDemandaDiaria = 0;
  let totalEnergiaDiaria = 0;
  let demandaHora = 0;
  let energiaHora = 0;
  let horaActual = 0;



  // ====================================================
  // 7. CONFIGURACIÓN TEMPORAL
  // ====================================================

  const pasosPorHora =
    60 / pasoMinutos;

  const pasosTotales =
    24 * pasosPorHora;



  // ====================================================
  // 8. RESULTADOS
  // ====================================================

  const resultados = [];



  // ====================================================
  // 9. BUCLE PRINCIPAL
  // ====================================================

  for (let paso = 0; paso < pasosTotales; paso++) {

    // --------------------------------------------------
    // Hora actual
    // --------------------------------------------------

    const hora =
      paso / pasosPorHora;



    // --------------------------------------------------
    // Índice horario
    // --------------------------------------------------

    const horaIndice =
      Math.floor(hora);



    // --------------------------------------------------
    // Fracción horaria de demanda
    // --------------------------------------------------

    const fraccionDemanda =
      perfilDemanda[horaIndice];



    // --------------------------------------------------
    // Demanda en litros en este paso
    // --------------------------------------------------

    const demandaPasoLitros =
      (
        demandaConPerdidas *
        fraccionDemanda
      ) / pasosPorHora;



    // --------------------------------------------------
    // Conversión a energía
    // --------------------------------------------------

    const demandaPasoEnergia =
      calcularEnergiaDeposito(
        demandaPasoLitros
      );

    demandaHora += demandaPasoEnergia;



    // ==================================================
    // 10. DESCARGA DEPÓSITOS
    // ==================================================

    // Primero descarga V2

    let energiaRestante =
      demandaPasoEnergia;



    if (energiaV2 >= energiaRestante) {

      energiaV2 -= energiaRestante;

      energiaRestante = 0;

    } else {

      energiaRestante -= energiaV2;

      energiaV2 = 0;

    }



    // Luego descarga V1

    if (energiaRestante > 0) {

      if (energiaV1 >= energiaRestante) {

        energiaV1 -= energiaRestante;

        energiaRestante = 0;

      } else {

        energiaRestante -= energiaV1;

        energiaV1 = 0;

      }

    }



    // ==================================================
    // 11. CONTROL GENERADOR
    // ==================================================

    const porcentajeEnergiaV2 =
      energiaV2 / energiaUtilV2;



    // Arranque
    if (
      !generadorON &&
      porcentajeEnergiaV2 <
      (1 - porcentajeArranque / 100)
    ) {

      retrasoPendiente += pasoMinutos;

      if (
        retrasoPendiente >=
        retrasoArranqueMin
      ) {

        generadorON = true;

      }

    }



    // ==================================================
    // 12. GENERACIÓN
    // ==================================================

    let energiaGenerada = 0;

    if (generadorON) {

      // Energía generada en este paso

      energiaGenerada =
        (
          potenciaGenerador *
          eficienciaIntercambio *
          pasoMinutos
        ) / 60;

      energiaHora += energiaGenerada;



      // Carga primero V2

      energiaV2 += energiaGenerada;



      // Límite superior

      if (energiaV2 > energiaUtilV2) {

        const exceso =
          energiaV2 - energiaUtilV2;

        energiaV2 = energiaUtilV2;

        energiaV1 += exceso;

      }



      // Límite V1

      if (energiaV1 > energiaUtilV1) {

        energiaV1 = energiaUtilV1;

      }



      // Paro del generador

      if (
        energiaV1 >= energiaUtilV1 &&
        energiaV2 >= energiaUtilV2
      ) {

        generadorON = false;

        retrasoPendiente = 0;

      }

    }



    // ==================================================
    // 13. TEMPERATURAS APROXIMADAS
    // ==================================================

    const temperaturaV1 =
      temperaturaRed +
      (
        (energiaV1 / energiaUtilV1) *
        (temperaturaAcumulacion - temperaturaRed)
      );



    const temperaturaV2 =
      temperaturaRed +
      (
        (energiaV2 / energiaUtilV2) *
        (temperaturaAcumulacion - temperaturaRed)
      );

    // Tracking sanitario
    if (temperaturaV2 < temperaturaMinima) {
      tiempoFuera += pasoMinutos;
      if (tiempoFuera > maxTiempoFuera) maxTiempoFuera = tiempoFuera;
    } else {
      tiempoFuera = 0;
    }

    // Check cumplimiento horario
    if (Math.floor(hora) > horaActual) {
      if (energiaHora < demandaHora * (limiteHorario / 100)) {
        cumplimientoHorario = false;
      }
      demandaHora = 0;
      energiaHora = 0;
      horaActual = Math.floor(hora);
    }

    totalDemandaDiaria += demandaPasoEnergia;
    totalEnergiaDiaria += energiaGenerada;



    // ==================================================
    // 14. GUARDAR RESULTADOS
    // ==================================================

    resultados.push({

      hora: Number(hora.toFixed(2)),

      energiaV1:
        Number(energiaV1.toFixed(2)),

      energiaV2:
        Number(energiaV2.toFixed(2)),

      porcentajeV1:
        Number(
          (
            energiaV1 /
            energiaUtilV1 *
            100
          ).toFixed(1)
        ),

      porcentajeV2:
        Number(
          (
            energiaV2 /
            energiaUtilV2 *
            100
          ).toFixed(1)
        ),

      temperaturaV1:
        Number(temperaturaV1.toFixed(1)),

      temperaturaV2:
        Number(temperaturaV2.toFixed(1)),

      energiaGenerador: Number(energiaGenerada.toFixed(2)),

      generadorON

    });

  }



  const cumplimientoDiario = totalEnergiaDiaria >= totalDemandaDiaria * (limiteDiario / 100);



  // ====================================================
  // 15. SALIDA FINAL
  // ====================================================

  return {

    resumen: {

      demandaTotalLitros,

      perdidasLitros,

      demandaConPerdidas,

      energiaNominalV1,

      energiaNominalV2,

      cumplimientoSanitario: maxTiempoFuera <= tiempoFueraMin,

      cumplimientoHorario,

      cumplimientoDiario

    },

    data: resultados

  };

}
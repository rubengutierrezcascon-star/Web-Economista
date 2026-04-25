import { useState, useEffect, useRef, useCallback } from "react";

const store = {
  async get(k) {
    try {
      const raw = window.localStorage.getItem(k);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  async set(k, v) {
    try {
      window.localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {
      console.error(e);
    }
  }
};

const todayStr = () => new Date().toISOString().split('T')[0];
const addDays = (d, n) => { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt.toISOString().split('T')[0]; };
const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86400000);
const cardIntervalFromHits = (hits) => hits <= 1 ? 14 : hits === 2 ? 28 : 56;
const STORAGE_KEYS = ["opos:topics", "opos:settings", "opos:examBank", "opos:examHistory", "opos:connections", "opos:weekPlan"];

function sm2(card, correct) {
  const q = correct ? 4 : 1;
  const ef = Math.max(1.3, (card.ef || 2.5) + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  const interval = !correct ? 1 : (card.interval || 0) === 0 ? 1 : (card.interval || 0) === 1 ? 6 : Math.round((card.interval || 1) * (card.ef || 2.5));
  return { ...card, ef, interval, nextReview: addDays(todayStr(), interval), hits: (card.hits || 0) + (correct ? 1 : 0), misses: (card.misses || 0) + (correct ? 0 : 1) };
}

function scheduleQuestion(question, correct) {
  if (question.type === "card") {
    const nextHits = (question.hits || 0) + (correct ? 1 : 0);
    const interval = correct ? cardIntervalFromHits(nextHits) : 7;
    return {
      ...question,
      createdAt: question.createdAt || todayStr(),
      interval,
      nextReview: addDays(todayStr(), interval),
      hits: nextHits,
      misses: (question.misses || 0) + (correct ? 0 : 1),
    };
  }
  return sm2(question, correct);
}

function markTopicStudied(topic, date) {
  return {
    ...topic,
    studied: true,
    firstStudyDate: topic.firstStudyDate || date,
    initMastery: topic.initMastery != null ? topic.initMastery : 50,
  };
}

function topicMastery(t) {
  if (!t.studied) return null;
  const qs = t.questions || [];
  if (!qs.length) return t.initMastery != null ? t.initMastery : 0;
  const today = todayStr();
  const tests = qs.filter(q => (q.type || "test") === "test");
  const cards = qs.filter(q => q.type === "card");
  function calcComponent(items, maxPct) {
    if (items.length === 0) return 0;
    let totalAttempts = 0; let totalHits = 0; let latestReview = "2020-01-01";
    items.forEach(q => { totalAttempts += (q.hits || 0) + (q.misses || 0); totalHits += (q.hits || 0); if (q.nextReview && q.nextReview > latestReview) latestReview = q.nextReview; });
    if (totalAttempts === 0) return 0;
    const accuracy = totalHits / totalAttempts;
    const daysSince = Math.max(0, daysBetween(latestReview, today));
    const stability = 10 + accuracy * 30;
    const decay = Math.exp(-daysSince / stability);
    return accuracy * maxPct * decay;
  }
  var lastStudy = t.firstStudyDate || "2020-01-01";
  var sess = t.studySessions || [];
  if (sess.length > 0) sess.forEach(function(s) { if (s.date > lastStudy) lastStudy = s.date; });
  var baseDays = Math.max(0, daysBetween(lastStudy, today));
  var baseDecay = Math.exp(-baseDays / 60);
  var baseScore = 50 * baseDecay;
  var testScore = calcComponent(tests, 25);
  var cardScore = calcComponent(cards, 25);
  return Math.min(100, Math.round(baseScore + testScore + cardScore));
}

const DEF_SETTINGS = { examDate: null, weeklyNew: 2, onboarded: false, criteria: { timeW: 50, masteryW: 50, reviewPerWeek: 4, threshold: 80 } };

const TCEE_SYLLABUS = [
  { n:1, code:"A.1", title:"Objeto y métodos de la ciencia económica. Cuestiones y debates actuales, con especial referencia a la economía conductual", content:"I. Objeto de la ciencia económica\n I.I. Delimitación. Acotación y coincidencia con otras ramas de la Ciencia\n I.II. Controversias sobre el Objeto: acotación del alcance de la ciencia económica\n I.III. Grandes debates y corrientes en Economía; entre otros, el papel del Estado en la economía, la neutralidad del dinero, la existencia del equilibrio\nII. Método\n II.I. Breves referencias a la Epistemología (Descartes frente a Hume; Kuhn, Lakatos, Feyerabend, Popper y otros)\n II.II. Cualidades deseables de un modelo y contrastación\n II.III. Matemáticas, estadística y econometría\n II.IV. Individualismo metodológico, microfundamentación y racionalidad\nIII. Cuestiones y debates actuales\n III.I. La Economía Conductual\n III.II. La Economía de la Complejidad\n III.III. La Economía Experimental\n III.IV. Microdatos y heterogeneidad entre agentes económicos. Desigualdad y colas de la distribución" },
  { n:2, code:"A.2", title:"Los economistas clásicos y Marx", content:"I. Caracterización de la escuela\n I.I. Contexto histórico y autores\n I.II. Método: la Economía Política\nII. Principales líneas de investigación\n II.I. Teoría del Valor\n II.II. Crecimiento y distribución\n II.III. Ley de Say\n II.IV. Economía Monetaria\n II.V. Comercio internacional\n II.VI. La política económica\nIII. La crítica de K. Marx" },
  { n:3, code:"A.3", title:"Los economistas neoclásicos", content:"I. Breve referencia al contexto histórico\nII. La escuela de Cambridge\n II.I. Método\n II.II. Principales líneas de investigación: teoría del valor y equilibrio parcial; teoría de la distribución; Economía del bienestar\nIII. La escuela de Lausana\n III.I. Método\n III.II. Principales líneas de investigación: teoría del valor y equilibrio general; Economía del bienestar\nIV. La escuela de Viena\n IV.I. Método\n IV.II. Principales líneas de investigación: teoría del valor; capital e interés; dinero y política económica; comportamiento dinámico" },
  { n:4, code:"A.4", title:"El pensamiento económico de Keynes. Formalización y comparación con el modelo neoclásico. Referencia a la economía post-keynesiana y el desequilibrio", content:"I. El pensamiento económico de Keynes\n I.I. Contexto histórico y autor\n I.II. Baseline: modelo neoclásico (breve)\n I.III. Formalización del modelo keynesiano: sistema económico y política económica\nII. La economía post-keynesiana\n II.I. Escuela de Cambridge\n II.II. Años 70 y 80: equilibrios múltiples y desequilibrio" },
  { n:5, code:"A.5", title:"La síntesis neoclásica. El monetarismo", content:"I. Contexto histórico, y autores y Universidades de referencia\nII. Síntesis Neoclásica\n II.I. Método: econometría y expectativas estáticas\n II.II. Principales líneas de investigación: el equilibrio general en el IS-LM(-BP); la curva de Phillips\nIII. Monetarismo\n III.I. Método: expectativas adaptativas\n III.II. Principales líneas de investigación: teoría cuantitativa del dinero y reglas de política monetaria; renta permanente; curva de Phillips y tasa natural de paro" },
  { n:6, code:"A.6", title:"La nueva macroeconomía clásica. La hipótesis de las expectativas racionales; la crítica de Lucas; los modelos DSGE", content:"I. Contexto histórico, y autores y Universidades de referencia\nII. Revolución metodológica: la microfundamentación\n II.I. Hipótesis de las expectativas racionales\n II.II. Crítica de Lucas\n II.III. Modelos dinámicos estocásticos de equilibrio general\nIII. Objeto: la vuelta de la Economía neoclásica\n III.I. Precios e información: curva de oferta de Lucas\n III.II. Ciclo real y primer teorema fundamental de la Economía del Bienestar\n III.III. Diseño e implementación de la política económica" },
  { n:7, code:"A.7", title:"La nueva economía keynesiana. Primera y segunda generación", content:"I. Primera generación\n I.I. Contexto, y autores y Universidades de referencia\n I.II. Método: refuerzo de la Síntesis Neoclásica, por el lado de la oferta\n I.III. Objeto: rigideces reales y nominales\nII. Segunda generación\n II.I. Contexto, y autores y Universidades de referencia\n II.II. Método: apalancamiento sobre la Nueva Macroeconomía Clásica\n II.III. Objeto: modelo de tres ecuaciones (aportaciones y limitaciones)" },
  { n:8, code:"A.8", title:"Teoría de la demanda del consumidor (I). Axiomas, utilidad, demanda marshalliana. Preferencia revelada. Precios hedónicos", content:"I. La función de demanda\n I.I. Preferencias y funciones de utilidad\n I.II. Restricción presupuestaria y función de demanda individual\n I.III. Agregación: condiciones y problemas asociados al efecto renta nulo\nII. Estática comparativa\n II.I. Efecto renta\n II.II. Efecto precio propio\n II.III. Efecto precio cruzado\nIII. Otros desarrollos\n III.I. Teoría de la preferencia revelada\n III.II. Producción doméstica\n III.III. Precios hedónicos" },
  { n:9, code:"A.9", title:"Teoría de la demanda del consumidor (II). Dualidad e integrabilidad. Sistemas de demanda empíricos. Medidas de cambio en el bienestar", content:"I. Primal vs Dual\nII. Aplicaciones de la teoría de la dualidad\n II.I. Ecuación de Slutsky\n II.II. Clasificación de los bienes en función de su sutituibilidad/complementariedad bruta o neta\n II.III. Integrabilidad\nIII. Sistemas de demanda utilizados en estudios empíricos\nIV. Medición de cambio en el bienestar\n IV.I. Métrica monetaria\n IV.II. Variación compensatoria y variación equivalente\n IV.III. Índices verdaderos de coste de vida vs Laspeyres y Paasche" },
  { n:10, code:"A.10", title:"Teoría de la demanda del consumidor (III). Elección en situaciones de riesgo e incertidumbre", content:"I. Teoría de la utilidad esperada\nII. Loterías sobre dinero y actitud frente al riesgo\n II.I. Definiciones y axiomas\n II.II. Aplicaciones: la contratación de seguros\n II.III. Dominancia estocástica\nIII. Probabilidades subjetivas e incertidumbre\nIV. Críticas y alternativas a la teoría de la utilidad esperada" },
  { n:11, code:"A.11", title:"Teoría de la producción. Tecnología de la empresa. Función de producción. Rendimientos. Elasticidad de sustitución. Producción conjunta", content:"I. Análisis de la tecnología\n I.I. Conjunto de producción: diferentes casos (producción uniproducto, multiproducto) y conceptos\n I.II. Función de producción: definición y propiedades\nII. Leyes de producción\n II.I. Corto plazo\n II.II. Largo plazo\n II.III. Muy largo plazo\nIII. Problema del productor\n III.I. Función de beneficio y función de oferta individual\n III.II. Agregación y propiedades de la función de oferta de mercado" },
  { n:12, code:"A.12", title:"Teoría de los costes. Análisis de dualidad en el ámbito de la empresa. Aplicaciones empíricas", content:"I. Obtención de la función de costes a partir del análisis de dualidad\n I.I. Primal vs dual\n I.II. Teorema básico de la dualidad\n I.III. Propiedades de la función de costes y de la demanda condicionada de factores\nII. Dimensión temporal de la función de costes\n II.I. Corto plazo vs largo plazo\n II.II. Economías de escala y elasticidad de escala\nIII. Aplicaciones empíricas\n III.I. Métodos de estimación: DEA vs frontera estocástica\n III.II. Ejemplos de estimaciones en sectores económicos\nIV. Críticas a la teoría neoclásica de costes y extensiones" },
  { n:13, code:"A.13", title:"Economía de la información y teoría de la agencia: selección adversa y riesgo moral", content:"I. Riesgo moral\n I.I. Modelo básico: planteamiento del programa de optimización, análisis de las condiciones de primer orden y soluciones\n I.II. Aplicaciones en diversos contextos económicos\nII. Selección adversa\n II.I. Akerloff: mercado de coches de segunda mano\n II.II. Autoselección de los agentes: formalización del problema y representación gráfica\n II.III. Aplicaciones del problema de selección adversa con solución de screening\n II.IV. Soluciones de señalización" },
  { n:14, code:"A.14", title:"Teoría de juegos. Principales conceptos. Aplicaciones, con especial referencia a las subastas", content:"I. Definiciones clave: estrategias, acciones, jugadores, representación matricial y en forma de árbol\nII. Principales juegos estáticos: equilibrio de Nash\nIII. Juegos repetidos y juegos secuenciales: equilibrio de Nash perfecto en subjuegos y estrategias de gatillo\nIV. Juegos en presencia de información imperfecta: Bayes-Nash equilibrium\nV. Diseño de mecanismos. Teoría de subastas\n V.I. Revenue equivalence theorem\n V.II. First-price sealed-bid auction vs second price sealed-bid\n V.III. Multi-unit auctions" },
  { n:15, code:"A.15", title:"La empresa: tamaño eficiente y límites. Costes de transacción. Organización Industrial: barreras y mercados impugnables", content:"I. Teorías sobre la existencia y estructura interna de la empresa\n I.I. Modelo baseline: Enfoque tecnológico\n I.II. Enfoque contractual de la empresa: especial mención a la teoría de los costes de transacción\n I.III. Enfoque de derechos de propiedad\n I.IV. Teoría de la agencia\nII. Teoría sobre el comportamiento de la empresa en el mercado\n II.I. Antecedentes teóricos\n II.II. Teoría de la Organización Industrial: barreras a la entrada y mercados impugnables\n II.III. La Nueva Teoría de la Organización Industrial: Jean Tirole" },
  { n:16, code:"A.16", title:"Análisis de mercados (I). Competencia perfecta. Equilibrio parcial. Dinámicas de ajuste. Eficiencia y bienestar", content:"I. Modelo de competencia perfecta en equilibrio parcial\n I.I. Supuestos y relevancia\n I.II. Demanda\n I.III. Oferta: corto plazo y largo plazo\nII. Características del equilibrio\n II.I. Propiedades positivas: existencia, unicidad y estabilidad. Especial referencia a dinámicas de ajuste convergentes o divergentes a través del modelo de la telaraña\n II.II. Propiedades normativas: análisis de bienestar y eficiencia" },
  { n:17, code:"A.17", title:"Análisis de mercados (II). Monopolio. Discriminación de precios. Monopolio natural. Producción conjunta. Monopsonio. Monopolio bilateral", content:"I. Fijación de precio y análisis de eficiencia y bienestar\n I.I. En monopolio/monopsonio básico\n I.II. En monopolio multiplanta\n I.III. En monopolio multiproducto\n I.IV. En monopolio bilateral\nII. Discriminación de precios: especial desarrollo de la discriminación de segundo grado (discriminación en cantidad y en calidad)\nIII. Monopolio natural" },
  { n:18, code:"A.18", title:"Análisis de mercados (III). Diferenciación de productos: competencia monopolística y otros desarrollos", content:"I. Modelos de producto\n I.I. Con número de empresas endógeno: teoría de la competencia monopolística\n I.II. Con número de empresas fijo: diferenciación en los modelos de Cournot y Bertrand\nII. Modelos espaciales\n II.I. Con número de empresas fijo: modelo de ciudad lineal\n II.II. Con número de empresas endógeno: modelo de ciudad circular" },
  { n:19, code:"A.19", title:"Análisis de mercados (IV). Teoría del oligopolio: soluciones no cooperativas y cooperativas", content:"I. Modelos de oligopolio en juegos no-cooperativos\n I.I. Competencia en cantidades: modelo baseline (Cournot) y relajación de supuestos: competencia secuencial (Stackelberg) y modelización bayesiana\n I.II. Competencia en precios: modelo baseline (Bertrand) y relajación de supuestos\n I.III. Barreras de entrada y amenazas creíbles\nII. Colusión tácita y modelos de oligopolio en juegos cooperativos\n II.I. Juegos repetidos y colusión tácita\n II.II. Alianzas sostenibles: enfoque del núcleo y valor de Shapley" },
  { n:20, code:"A.20", title:"Poder de mercado y regulación óptima. Mercado relevante. Información asimétrica. Aplicaciones prácticas", content:"I. Motivación de la regulación en presencia de poder de mercado: eficiencia, equidad y otras\nII. Regulación con información perfecta\n II.I. Ramsey-Boiteaux pricing\n II.II. Non-linear prices and simple two-part tariffs, Optimal non-linear prices\n II.III. Peak Load Pricing\nIII. Regulación con información asimétrica\n III.I. Cost of services vs rate of return\n III.II. The Averch-Johnson model\n III.III. Tirole y Laffont: cost-plus vs fixed price. La solución de autoselección: el menú de contratos regulatorios\n III.IV. Ratchet Effects o Regulatory Lag\n III.V. Esquemas regulatorios de incentivos: evidencia empírica\nIV. Competencia por el mercado. Diseños de subasta óptimos\nV. Bundling vs unbundling\nVI. Poder de mercado y regulación en mercados de dos lados" },
  { n:21, code:"A.21", title:"La teoría del equilibrio general", content:"I. El modelo de equilibrio general competitivo\n I.I. Comportamiento de los consumidores, de las empresas y caracterización del equilibrio\n I.II. Proposiciones positivas: existencia, unicidad y estabilidad\n I.III. Proposiciones normativas: teoremas fundamentales de la economía del bienestar\nII. Extensiones al modelo básico\n II.I. El enfoque del núcleo e introducción de comportamiento estratégico\n II.II. Presencia de no-convexidades y equilibrios múltiples\n II.III. Tiempo, incertidumbre, mercados contingentes y activos financieros\n II.IV. Introducción del dinero" },
  { n:22, code:"A.22", title:"Economía del bienestar (I). Teoremas fundamentales del bienestar. Óptimo económico y second-best", content:"I. Óptimo económico\n I.I. Obtención de una asignación de recursos eficiente en sentido de Pareto\n I.II. Primer teorema fundamental de la Economía del Bienestar: cumplimiento de las condiciones de eficiencia y prueba por contradicción\n I.III. Segundo teorema fundamental de la Economía del Bienestar: demostración, limitantes y soluciones\nII. Second best y política económica en presencia de problemas de información\n II.I. Teoría del SB: presencia de restricciones no-triviales, resultado general, aplicaciones y limitaciones, origen de la distorsión\n II.II. Información incompleta y diseño de mecanismos: mecanismos en estrategias dominadas, mecanismos en juegos bayesianos" },
  { n:23, code:"A.23", title:"Economía del bienestar (II). Fallos de mercado: externalidades y bienes públicos. Intervención y fallos del sector público", content:"I. Bienes públicos\n I.I. Asignación descentralizada y fallo de mercado\n I.II. Solución sin problemas de información: precios Lindahl\nII. Externalidades\n II.I. Asignación descentralizada y fallo de mercado\n II.II. Soluciones sin problemas de información: impuestos y cuotas vs negociación descentralizada con derechos de propiedad\nIII. Fallos del sector público\n III.I. Problemas de información: aplicación de mecanismos, especial referencia a Clarke-Groves\n III.II. Introducción de estrategias dinámicas: inconsistencia intertemporal\n III.III. Desalineamiento de incentivos y críticas desde la Public Choice School" },
  { n:24, code:"A.24", title:"Economía del bienestar (III). Funciones de bienestar social. Elección colectiva. Teorema de Arrow", content:"I. Breve repaso histórico: antecedentes a la Economía del Bienestar moderna\n I.I. Utilitarismo: cardinalidad y separabilidad aditiva, comparaciones interpersonales, decrecimiento de la utilidad marginal de la renta\n I.II. Robbins y la Economía paretiana\nII. Problemática general de la Teoría de la Elección Social: agregación/agrupación de preferencias\n II.I. Construcción axiomática de un funcional de bienestar social\n II.II. Teoremas de la Imposibilidad: Arrow y salidas. Relajamiento axiomático, especial referencia a la universalidad (Black 1947)\n II.III. Las cuestiones asociadas a la independencia de las alternativas irrelevantes: comparaciones interpersonales, no-manipulabilidad de agenda (Gibbard y Maskin)\nIII. Problemática específica: consideraciones éticas y juicios de valor\n III.I. Herramienta fundamental: las funciones de bienestar social (construcción y valoración)\n III.II. Justicia bajo incertidumbre: neoutilitarismo y neocontractualismo\n III.III. Igualdad: funciones de Atkinson e índices de desigualdad basados en el equivalente igualitariamente distribuido" },
  { n:25, code:"A.25", title:"La teoría neoclásica del mercado de trabajo. Oferta intertemporal. Capital humano. Función de ingresos y evidencia empírica", content:"I. Modelo neoclásico\n I.I. Enfoque estático: obtención de la oferta y propiedades del equilibrio\n I.II. Enfoque dinámico: Lucas, Rapping (1969)\nII. Teoría del capital humano\n II.I. Aportaciones de Becker\n II.II. Ecuaciones de ingresos de Mincer\nIII. Economía empírica\n III.I. Regularidades empíricas sobre la oferta de trabajo\n III.II. Experimentos naturales" },
  { n:26, code:"A.26", title:"Desempleo friccional. Curva de Beveridge. Modelo de búsqueda y emparejamiento (Diamond, Mortensen, Pissarides). Costes de ajuste", content:"I. Modelos de búsqueda\n I.I. Modelo de referencia: flujos y emparejamiento. Implicaciones de política económica\n I.II. Alternativas de especificación de la función de emparejamiento\nII. Modelos de costes de ajuste\n II.I. Modelo de referencia\n II.II. Alternativas de especificación de la función de costes de ajuste" },
  { n:27, code:"A.27", title:"Determinación de salarios: modelos de negociación, salarios de eficiencia y contratos implícitos", content:"I. Breve referencia a la curva salarial (WS). Evidencia empírica\nII. Salarios de eficiencia\n II.I. Trabajo germinal (Solow 1979)\n II.II. Modelo de referencia (Shapiro Stiglitz 1984)\nIII. Salarios de negociación\n III.I. Enfoque estratégico: el sindicato monopolista\n III.II. Enfoque axiomático\nIV. Contratos implícitos\n IV.I. Modelo de referencia\n IV.II. Extensión: insiders y outsiders" },
  { n:28, code:"A.28", title:"La tasa natural de paro y la NAIRU. La persistencia del desempleo", content:"I. Descomposición del desempleo de equilibrio, y relevancia del concepto del nivel estructural a través de la tasa natural de paro\n I.I. Tasa natural de paro (Friedman 1969)\n I.II. Desempleo friccional\n I.III. Desempleo cíclico: ley de Okun\n I.IV. Desempleo estacional: métodos analíticos y propiedades\n I.V. Evidencia empírica e implicaciones de política económica\nII. Introducción de rigideces reales y persistencia y concepto del nivel estructural a través de la NAIRU\n II.I. Obtención de la NAIRU: curvas salarial (WS) y de fijación de precios (PS)\n II.II. Persistencia e histéresis. Diferentes formas\n II.III. Evidencia empírica e implicaciones de política económica\nIII. Aproximación alternativa al fenómeno del desempleo desde la Economía institucional" },
  { n:29, code:"A.29", title:"Modelización dinámica de las tomas de decisiones. Modelos de horizonte infinito y de generaciones solapadas", content:"I. Caracterización general de la optimización dinámica en Economía\n I.I. Funcional y función de utilidad; factor y tasa de descuento. Obtención de una senda de consumo básica en un modelo de tiempo finito\n I.II. Métodos matemáticos alternativos\n I.III. Propiedades deseables de las series temporales\nII. Dos modelos de referencia\n II.I. Agente representativo en horizonte infinito\n II.II. Generaciones solapadas" },
  { n:30, code:"A.30", title:"Magnitudes macroeconómicas y contabilidad nacional", content:"I. Marco conceptual de la contabilidad nacional: unidades estadísticas y agrupación, criterio de residencia, operaciones (flujos y stocks), sistema de cuentas y agregados, valoración y momento del registro, mediciones nominales y reales. Elaboración y fuentes estadísticas de las cuentas nacionales\nII. Cuentas corrientes\n II.I. Aproximación formal (SEC-2010)\n II.II. Interpretación económica y uso\nIII. Cuentas de acumulación\n III.I. Aproximación formal (SEC-2010)\n III.II. Interpretación económica y uso\nIV. Balance\n IV.I. Aproximación formal (SEC-2010)\n IV.II. Interpretación económica y uso\nV. Extensiones\n V.I. Otros elementos relevantes de la contabilidad nacional: Cuentas nacionales trimestrales; contabilidad regional; población e insumos de mano de obra; cuentas satélite\n V.II. Ventajas y limitaciones del PIB e indicadores alternativos. Especial referencia a las nuevas fuentes de información estadística de alta frecuencia" },
  { n:31, code:"A.31", title:"Análisis de las tablas input-output", content:"I. El modelo de demanda\nII. El modelo de precios\nIII. Otros estudios de interdependencia\nIV. Aplicaciones concretas y valoración crítica" },
  { n:32, code:"A.32", title:"Modelo de oferta y demanda agregada en economía abierta. Políticas monetaria y fiscal, shocks y políticas de oferta", content:"I. Shocks de oferta\n I.I. Origen y propagación. Referencia a la heterogeneidad sectorial y los modelos de redes\n I.II. Respuesta de política económica\nII. Shocks de demanda\n II.I. Origen y propagación. Problemáticas asociadas a la interacción con los shocks de oferta\n II.II. Respuesta de política económica\nIII. Extensión: shocks en una economía abierta" },
  { n:33, code:"A.33", title:"Demanda de consumo: ciclo vital y renta permanente. Consumo duradero. Evidencia e implicaciones de política", content:"I. Consumo bajo certidumbre: renta permanente\n I.I. Antecedentes: renta disponible\n I.II. Aportación de Friedman\n I.III. Ciclo vital\nII. Consumo bajo incertidumbre\n II.I. Hipótesis del paseo aleatorio\n II.II. C-CAPM\n II.III. Extensiones: ahorro precautorio, restricciones de liquidez, Economía conductual\nIII. Aproximación de largo plazo: estancamiento secular\nIV. Consumo de bienes duraderos\n IV.I. Particularidades\n IV.II. Implicaciones" },
  { n:34, code:"A.34", title:"Teorías de la inversión en bienes de equipo. Incertidumbre e irreversibilidad. Implicaciones de política económica", content:"I. Inversión bajo certidumbre: costes de ajuste\n I.I. Modelo de referencia\n I.II. Q de Tobin\n I.III. Implicaciones de política económica\nII. Inversión bajo incertidumbre\n II.I. Modificación del modelo de costes de ajuste. Implicaciones de política económica\n II.II. Mercados financieros. Implicaciones de política económica" },
  { n:35, code:"A.35", title:"Teorías de la demanda de dinero. Implicaciones de política económica", content:"I. ¿Por qué el dinero? Existencia de la función de demanda de dinero\n I.I. Aproximación desde la Historia del Pensamiento Económico: Preferencia por la liquidez vs Neocuantitativismo. Diferencias en las implicaciones de diseño e implementación de la política monetaria\n I.II. Dinero fiduciario y condiciones. Implicaciones de política económica: la importancia de la credibilidad y la confianza\nII. ¿Qué determina la cantidad demandada? Especificación de la función de demanda de dinero\n II.I. Aproximación de teoría económica 1: modelos del dinero como medio de cambio (MIU, CIA, ST). Implicaciones de política económica\n II.II. Aproximación de teoría económica 2: modelos del dinero como depósito de valor, y modelos del dinero como unidad de cuenta. Implicaciones de política económica\n II.III. Evidencia empírica sobre los determinantes de la demanda de dinero. Implicaciones de política económica" },
  { n:36, code:"A.36", title:"Política monetaria (I). Diseño e instrumentación", content:"I. Diseño de la política monetaria\n I.I. Justificación, objetivos y discrecionalidad\n I.II. Política monetaria óptima: modelo de la NEK\n I.III. Nuevas problemáticas: desde el Effective Lower Bound hasta los shocks de oferta\nII. Implementación\n II.I. Esquema operativo\n II.II. Elección del instrumento\n II.III. Nuevas problemáticas: CBDC" },
  { n:37, code:"A.37", title:"Política monetaria (II). Mecanismos de transmisión convencional y no convencional. Rigideces y fricciones financieras", content:"I. La eficacia de la política monetaria\n I.I. Neutralidad del dinero (aproximación teórica –breve)\n I.II. Evidencia empírica: Friedman-Schwarz, Fed de Saint Louis, Sims\nII. Mecanismos de transmisión en modelos de expectativas estáticas o adaptativas\n II.I. Debate teórico: la curva de Phillips de la Síntesis vs la curva de Phillips de los Monetaristas\n II.II. Mecanismos de transmisión: efecto liquidez, efecto cartera\n II.III. Limitantes: elasticidades, retardos\nIII. Mecanismos de transmisión en modelos de expectativas racionales\n III.I. Debate teórico: la curva de oferta de Lucas vs la curva de Phillips de la NEK\n III.II. Mecanismos de transmisión: expectativas e información, canal financiero, tipo de cambio\n III.III. Limitantes: sesgo inflacionario, interacción con la política fiscal, Effective Lower Bound, Dilemma de Rey" },
  { n:38, code:"A.38", title:"La política fiscal: efectos sobre el crecimiento económico y el ahorro", content:"I. Los efectos de la política fiscal\n I.I. Breve referencia de Pensamiento Económico: Keynes\n I.II. Aproximación de la nueva macroeconomía clásica\n I.III. Aproximación neokeynesiana\n I.IV. Suavización impositiva e impuestos distorsionantes\nII. La política fiscal y el crecimiento\n II.I. Modelo de agente representativo en horizonte infinito\n II.II. Modelo de generaciones solapadas" },
  { n:39, code:"A.39", title:"Déficit público. Financiación y consecuencias macroeconómicas. Dominación monetaria y fiscal. Dinámica y sostenibilidad de la deuda pública", content:"I. Déficit público. Deuda pública\n I.I. Definición de conceptos (breve)\n I.II. Planteamiento de la restricción presupuestaria intertemporal del gobierno\nII. Financiación ortodoxa\n II.I. Análisis de sostenibilidad de la deuda pública\nIII. Financiación heterodoxa\n III.I. Señoriaje máximo e hiperinflación" },
  { n:40, code:"A.40", title:"Efectividad e interrelación de las políticas monetaria y fiscal desde la Gran Recesión. Multiplicadores fiscales", content:"I. Aproximación empírica 1: Multiplicadores fiscales\n I.I. Explicación de la herramienta\n I.II. Revisión de los principales resultados de la literatura\nII. Aproximación empírica 2: Vectores autorregresivos\n II.I. Explicación de la herramienta\n II.II. Revisión de los principales resultados de la literatura\nIII. Aproximación empírica 3:\n III.I. Explicación de la herramienta\n III.II. Revisión de los principales resultados de la literatura" },
  { n:41, code:"A.41", title:"La inflación: causas y efectos sobre eficiencia y bienestar. Hiperinflación y deflación", content:"I. Causas de la inflación\n I.I. Monetarias\n I.II. Reales (precios relativos): demand-pull, cost-push, build-in\nII. Efectos de la inflación\n II.I. Costes. Inflación anticipada vs no-anticipada\n II.II. ¿Tasa óptima?\nIII. Extensiones: dos casos extremos\n III.I. Hiperinflación\n III.II. Deflación" },
  { n:42, code:"A.42", title:"Teorías de los ciclos económicos: ciclos nominales y reales. Ciclo financiero e interrelaciones con el ciclo real", content:"I. Regularidades empíricas y métodos de análisis del ciclo económico\nII. Teoría del ciclo real\n II.I. Antecedentes, y supuestos\n II.II. Modelo de referencia (Kydland Prescott 1982)\n II.III. Valoración y extensiones. Implicaciones de política económica\nIII. Teoría del ciclo de la Nueva Síntesis\n III.I. Antecedentes, y supuestos\n III.II. Modelo de referencia (Clarida Galí Gertler 1999)\n III.III. Valoración y extensiones, con especial referencia al ciclo financiero. Implicaciones de política económica" },
  { n:43, code:"A.43", title:"Crecimiento económico (I). Acumulación de capital y progreso técnico exógeno. Solow. Solow aumentado. Ramsey-Cass-Koopmans", content:"I. Modelo de Solow\n I.I. Supuestos y debate de las Cambridge\n I.II. Modelo y principales resultados: existencia y estabilidad del estado estacionario, regla de oro, convergencia\n I.III. Extensión: Acumulación de capital humano\nII. Modelo de RCK\n II.I. Solución descentralizada\n II.II. Análisis normativo e implicaciones de política económica\n II.III. Extensiones" },
  { n:44, code:"A.44", title:"Crecimiento económico (II). Modelos de crecimiento endógeno: rendimientos crecientes, capital humano e innovación tecnológica", content:"I. El modelo AK, análisis comparado al modelo de Solow\nII. Crecimiento por externalidades del capital físico\nIII. Crecimiento por acumulación de capital humano\nIV. Crecimiento por acumulación de variedades de inputs. El modelo de Romer.\nV. Evidencia empírica" },
  { n:45, code:"A.45", title:"Evidencia empírica sobre el crecimiento económico y la distribución de la renta. Contabilidad del crecimiento. Convergencia", content:"I. Crecimiento económico y distribución de la renta entre los factores de producción\n I.I. Evolución secular observada y hechos estilizados a partir de la evidencia empírica\n I.II. Teorías explicativas de la evolución observada\nII. Contabilidad del crecimiento con especial referencia a la productividad total de los factores\n II.I. Ecuación fundamental\n II.II. La medición de los inputs\n II.III. Enfoque dual\n II.IV. Evidencia empírica: el análisis de regresión del modelo de Solow y otras estrategias\nIII. Convergencia económica internacional\n III.I. Definiciones de convergencia\n III.II. Evidencia empírica" },
  { n:46, code:"B.1", title:"La información financiera de las empresas: estados de situación y de circulación. Análisis económico y financiero", content:"I. Enfoque formal: la contabilidad según el Plan General de Contabilidad\n I.I. Marco conceptual\n I.II. Balance de situación\n I.III. Cuenta de Resultados\n I.IV. Otras cuentas anuales: estado de cambios en el patrimonio neto, estado de flujos de efectivo, memoria\nII. Enfoque analítico: ratios y contabilidad pro-forma\n II.I. Indicadores de rentabilidad\n II.II. Indicadores de solvencia e indicadores de liquidez\n II.III. Indicadores de mercado" },
  { n:47, code:"B.2", title:"La empresa y las decisiones de inversión. Criterios de valoración de proyectos. Rentabilidad, riesgo y coste del capital", content:"I. Finalidad y clasificación\nII. Valoración de proyectos: rentabilidad y riesgo\n II.I. Modelos baseline: VAN, TIR, payback\n II.II. Introducción de incertidumbre: análisis de sensibilidad, método de Montecarlo, árboles de decisión y opciones reales\n II.III. Modelos para activos no-financieros concretos: real estate, propiedad intelectual\nIII. Coste del capital\n III.I. Estimación directa: CAPM\n III.II. Estimación indirecta: WACC\n III.III. Estimación implícita" },
  { n:48, code:"B.3", title:"La empresa y las decisiones de financiación. Propia vs ajena. Política de dividendos y estructura del capital", content:"I. Fuentes de financiación empresarial\n I.I. Financiación interna: autofinanciación\n I.II. Financiación externa: intermediación bancaria vs. financiación en mercado\nII. Estructura financiera\n II.I. ¿Existe una estructura óptima?\n II.II. Diseño de la estructura en presencia de problemas de información\nIII. Política de dividendos" },
  { n:49, code:"B.4", title:"Crecimiento de la empresa. Valoración de empresas. Fusiones, adquisiciones y alianzas estratégicas", content:"I. Crecimiento inorgánico y otras modificaciones estructurales\n I.I. M&A: diseño y ejecución\n I.II. M&A: financiación, con referencia especial a los LBO\n I.III. Restructuración y formas de desinversión\nII. Métodos de valoración de empresas\n II.I. Descuento de flujos de caja esperados\n II.II. Por comparables\n II.III. Modelos de pricing de opciones\nIII. Alternativa al crecimiento empresarial: alianzas estratégicas" },
  { n:50, code:"B.5", title:"Teoría del comercio internacional (I). Ventaja comparativa ricardiana. Factores específicos. H-O-S: teoremas y extensiones", content:"I. El modelo neoclásico básico (modelo ricardiano): 1 factor productivo no móvil\n I.I. Supuestos\n I.II. Autarquía vs Comercio internacional\n I.III. Críticas y extensiones\nII. El modelo de factores específicos: 2 factores productivos, 1 móvil\n II.I. Supuestos\n II.II. Autarquía vs Comercio Internacional\n II.III. Determinación de la RRI y Modelo de Haberler\nIII. El modelo de Hecksher-Ohlin-Samuelson\n III.I. Supuestos\n III.II. Autarquía vs Comercio Internacional. Tres corolarios del modelo HOS\n III.III. Vanek y evidencia empírica" },
  { n:51, code:"B.6", title:"Teoría del comercio internacional (II). Nueva teoría. Competencia imperfecta, rendimientos crecientes y heterogeneidad empresarial", content:"I. Modelos de competencia monopolística: rendimientos crecientes y diferenciación\n I.I. Krugman\n I.II. Melitz y la heterogeneidad empresarial\n I.III. Extensiones: costes iceberg, home-market effect\nII. Modelos de competencia oligopolista: comportamiento estratégico\n II.I. Competencia en cantidades\n II.II. Competencia en precios\nIII. Otros desarrollos\n III.I. Economías de escala externas y dinámicas. Nueva Geografía Económica\n III.II. Modelos de gravedad" },
  { n:52, code:"B.7", title:"Política comercial (I). Instrumentos y efectos. Barreras arancelarias y no arancelarias", content:"I. Instrumentos arancelarios\n I.I. Competencia perfecta vs imperfecta\n I.II. País pequeño vs país grande\n I.III. Equilibrio parcial vs equilibrio general\nII. Instrumentos no arancelarios\n II.I. Cuotas a la importación\n II.II. Restricciones voluntarias a la exportación\n II.III. Subvenciones a la exportación\n II.IV. Instrumentos de protección encubierta" },
  { n:53, code:"B.8", title:"Política comercial (II). Política comercial estratégica. Política de promoción exterior", content:"I. Política comercial estratégica\n I.I. Defensiva\n I.II. Ofensiva\nII. Política de promoción exterior\n II.I. Justificación\n II.II. Instrumentos\n II.III. Objetivos" },
  { n:54, code:"B.9", title:"Comercio internacional y crecimiento económico. Efectos del comercio sobre el crecimiento", content:"I. Efectos del crecimiento económico sobre el comercio internacional\n I.I. País pequeño vs país grande\n I.II. Crecimiento por acumulación de factores o por progreso tecnológico\n I.III. Efectos sobre producción, consumo, RRI y bienestar. Mención al crecimiento empobrecedor\nII. Efectos del comercio internacional sobre el crecimiento económico\n II.I. Punto de vista histórico\n II.II. Punto de vista teórico. Adaptación de Grossman y Helpman del modelo de Romer\n II.III. Punto de vista empírico" },
  { n:55, code:"B.10", title:"Teoría de la integración económica", content:"I. Efectos de la integración económica\n I.I. Sobre la eficiencia y el bienestar en estructuras de mercado de competencia perfecta vs estructuras de mercado de competencia imperfecta\n I.II. Sobre la localización de las actividades económicas\n I.III. Sobre el crecimiento económico\nII. Evidencia empírica y economía política de la integración económica" },
  { n:56, code:"B.11", title:"Balanza de pagos: concepto, medición e interpretación", content:"I. Marco conceptual de la contabilidad exterior. Elaboración y fuentes estadísticas de la balanza de pagos y la posición de inversión internacional\nII. Cuenta corriente y cuenta de capital\n II.I. Aproximación formal\n II.II. Interpretación económica y uso\nIII. Cuenta financiera\n III.I. Aproximación formal\n III.II. Interpretación económica y uso\nIV. Posición de inversión internacional\n IV.I. Aproximación formal\n IV.II. Interpretación económica y uso" },
  { n:57, code:"B.12", title:"Mecanismos de ajuste de la balanza de pagos. Enfoque intertemporal. Sostenibilidad del déficit y deuda exterior", content:"I. Teorías de la determinación del equilibrio externo\n I.I. Enfoque de flujos: ajuste comercial (elasticidades, multiplicador, absorción, ISLMBP)\n I.II. Enfoque de stocks: ajuste monetario (modelos monetaristas)\n I.III. Enfoque dinámico: ajuste de capital (modelo real e introducción de rigideces)\nII. Sostenibilidad exterior\n II.I. Condición de sostenibilidad. Determinantes\n II.II. Mecanismos de risk-sharing" },
  { n:58, code:"B.13", title:"Mercados de divisas: operaciones e instrumentos", content:"I. Caracterización formal\n I.I. Objeto: divisas\n I.II. Sujetos: agentes\n I.III. Aspectos institucionales\nII. Caracterización operativa\n II.I. Instrumentos\n II.II. Operaciones\nIII. Caracterización económica\n III.I. Hipótesis de los mercados eficientes\n III.II. Valoración crítica y retos de política económica" },
  { n:59, code:"B.14", title:"Teorías de la determinación del tipo de cambio", content:"I. Dos conceptos fundamentales: PPP, CIP\nII. Teorías de la determinación del tipo de cambio nominal\n II.I. Enfoque de flujos\n II.II. Enfoque de stocks: modelo monetarista y extensiones, con especial referencia al modelo de Dornbusch\n II.III. Valoración de los modelos estructurales: evidencia empírica y enfoques alternativos\nIII. Teorías de la determinación del tipo de cambio real\n III.I. Comportamiento dinámico del tipo de cambio real\n III.II. Explicaciones de las desviaciones, con especial referencia al modelo de Balassa-Samuelson" },
  { n:60, code:"B.15", title:"Análisis comparado de regímenes cambiarios. Intervención y regulación de mercados de cambio", content:"I. Diseño del régimen cambiario\n I.I. Análisis comparado de los regímenes polares\n I.II. Determinantes de la elección: modelos y evidencia empírica\nII. Implementación del régimen cambiario\n II.I. Menú de regímenes\n II.II. Intervención en el mercado de divisas\n II.III. Regulación y control de capitales" },
  { n:61, code:"B.16", title:"Teoría de la integración monetaria", content:"I. Análisis de la deseabilidad\n I.I. Teoría económica\n I.II. Evidencia empírica\nII. Diseño e implementación\n II.I. Antecedentes: modelos de áreas monetarias óptimas de primera generación\n II.II. Áreas monetarias óptimas endógenas\n II.III. Mecanismos institucionales: problemas de información, política fiscal, integración financiera" },
  { n:62, code:"B.17", title:"Teorías explicativas de las crisis de balanza de pagos", content:"I. Crisis de primera generación\n I.I. Breve descripción histórica\n I.II. Modelo teórico de referencia\n I.III. Contagio y capacidad de predicción. Implicaciones de política económica\nII. Crisis de segunda generación\n II.I. Breve descripción histórica\n II.II. Modelo teórico de referencia\n II.III. Contagio y capacidad de predicción. Implicaciones de política económica\nIII. Crisis de tercera generación\n III.I. Breve descripción histórica\n III.II. Modelo teórico de referencia\n III.III. Contagio y capacidad de predicción. Implicaciones de política económica\nIV. ¿Hacia un modelo de crisis de cuarta generación?" },
  { n:63, code:"B.18", title:"La nueva globalización económica y financiera. Movimientos internacionales de factores productivos. Cadenas globales de valor", content:"I. Hechos estilizados caracterizadores de la globalización económica y financiera\n I.I. Principales indicadores\n I.II. Factores potenciadores de la globalización y amenazas de retroceso\n I.III. Cadenas globales de valor\nII. Determinantes y efectos de la movilidad de los trabajadores\n II.I. Teoría: modelos de referencia\n II.II. Contrastes empíricos\n II.III. El factor trabajo en las cadenas globales de valor\nIII. Determinantes y efectos de la inversión transfronteriza\n III.I. Teoría: modelos de referencia, en especial el modelo de IED de Helpman, Melitz y Yeaple\n III.II. Contrastes empíricos\n III.III. La inversión en las cadenas globales de valor" },
  { n:64, code:"B.19", title:"Coordinación internacional de políticas económicas. G-20, OCDE y otros foros", content:"I. Spill-overs y análisis de la deseabilidad de la coordinación\n I.I. Modelo de expectativas estáticas: ISLMPBP\n I.II. Modelo de expectativas racionales: Corsetti Pesenti (2004)\n I.III. Evidencia empírica y reflexiones sobre los determinantes y el alcance de la coordinación (políticas de demanda frente a políticas de oferta)\nII. Aproximación desde la Economía Política: mecanismos de implementación de la coordinación\n II.I. Problemática de teoría de juegos\n II.II. Ilustración práctica: principales foros de coordinación: G20, OCDE y otros" },
  { n:65, code:"B.20", title:"El sistema económico desde el siglo XIX hasta la ruptura de Bretton-Woods", content:"I. Primera globalización\n I.I. Surgimiento\n I.II. Fundamentación teórica\n I.III. Funcionamiento en la práctica\nII. La inestabilidad del período entre-guerras\n II.I. 1919-1929\n II.II. La Gran Depresión y sus consecuencias\nIII. Segunda globalización\n III.I. Puesta en marcha: los acuerdos de Bretton Woods\n III.II. Funcionamiento en la práctica\n III.III. Crisis y ruptura del patrón-oro" },
  { n:66, code:"B.21", title:"El sistema económico internacional desde la desaparición de Bretton-Woods", content:"I. Las raíces del 'No Sistema' y hechos estilizados tras la desaparición de Bretton-Woods\nII. Principales episodios de crisis monetarias y crisis financieras\nIII. Evolución y estado actual del Sistema\n III.I. En el plano monetario\n III.II. En el plano financiero\n III.III. En el plano comercial" },
  { n:67, code:"B.22", title:"El Fondo Monetario Internacional. Estructura y políticas. Prevención y solución de crisis", content:"I. Funcionamiento del FMI\n I.I. Recorrido histórico. Motivación de teoría económica. Objetivos\n I.II. Estructura organizativa\n I.III. Estructura financiera: el GRA y el PRGT\nII. Prevención y solución de crisis\n II.I. Actuación ex ante: monitorización, coordinación internacional y asistencia técnica\n II.II. Programación financiera: menú de líneas\n II.III. Iniciativas para economías menos avanzadas: MDRI, HIPC, COVID-19" },
  { n:68, code:"B.23", title:"Instrumentos financieros de renta variable. Análisis fundamental. CAPM, APT. Análisis técnico", content:"I. Teoría de la Elección de cartera: problema del inversor\n I.I. Segunda etapa del problema del inversor: elemento subjetivo (función de utilidad) y optimización\n I.II. Primera etapa del problema del inversor: elemento objetivo (dos métodos para la obtención de la cartera de mercado)\nII. Valoración de activos\n II.I. CAPM\n II.II. APT\nIII. Gestión activa de carteras: búsqueda de alpha y análisis fundamental\nIV. Críticas desde las Finanzas Conductuales y aproximación alternativa: análisis técnico" },
  { n:69, code:"B.24", title:"Instrumentos financieros de renta fija. Precio y rendimiento de bonos. Estructura temporal. Duración y convexidad", content:"I. Valoración de los instrumentos de renta fija y herramientas analíticas\n I.I. Determinación del precio y rendimiento de los bonos\n I.II. Estructura temporal de los tipos de interés: Métodos de construcción de la curva\n I.III. Estructura temporal de los tipos de interés: Teorías de interpretación de la curva\nII. Gestión de carteras de renta fija\n II.I. Medición del riesgo de tipo de interés: duración y convexidad\n II.II. Estrategias de cobertura del riesgo de tipo de interés: inmunización y swaps. Interacción con otros riesgos financieros\n II.III. Estrategias de inversión en renta fija: gestión activa vs gestión pasiva" },
  { n:70, code:"B.25", title:"Instrumentos y mercados de derivados", content:"I. Futuros y forwards\n I.I. Características básicas y valoración\n I.II. Usos: cobertura y búsqueda de rentabilidad\n I.III. Mercados\nII. Opciones\n II.I. Características básicas y valoración (método binominal y BSM)\n II.II. Usos: cobertura y búsqueda de rentabilidad (Griegas)\n II.III. Mercados\nIII. Swaps\n III.I. Fundamentos\n III.II. Instrumentos concretos" },
  { n:71, code:"B.26", title:"Crisis financieras y pánicos bancarios. Crisis 2007-2008. Gestión de riesgos de instituciones financieras", content:"I. Crisis financieras\n I.I. Visión estilizada del sistema financiero. Vulnerabilidades y riesgos. Shocks y propagación. Ilustración a través del caso de la Crisis de 2007-08\n I.II. Crisis bancarias: modelo de pánico (Diamond Dybvig 1983)\nII. Gestión de riesgos financieros\n II.I. Riesgo de mercado: modelos VaR\n II.II. Riesgo de crédito" },
  { n:72, code:"B.27", title:"Regulación financiera bancaria y no-bancaria. Fundamentos teóricos y evidencia empírica", content:"I. Regulación de conducta y ejercicio de la actividad\nII. Regulación prudencial\n II.I. Regulación por el activo frente a regulación por el capital: NBFI frente a entidades de crédito y aseguradoras\n II.II. Herramientas macroprudenciales\nIII. Supervisión\n III.I. Problemática de diseño: modelos de supervisión; cuestiones transfronterizas\n III.II. Instrumentos de simulación: tests de estrés" },
  { n:73, code:"B.28", title:"Economía de los países en desarrollo. Teorías recientes. Aproximación experimental e implicaciones de política", content:"I. Hechos estilizados de las economías en desarrollo\nII. Aproximación macroeconómica\n II.I. Tendencias globales en crecimiento, desigualdad y pobreza\n II.II. Teorías sobre por qué algunos países se quedan atrás (Acemoglu, Johnson and Robinson). Especial mención a las instituciones y evidencia empírica\nIII. Aproximación microeconómica\n III.I. Las contribuciones pioneras de Angus Deaton y Amartya Sen\n III.II. Las dimensiones de la pobreza. Enfoque empírico a través del uso de RCT: salud, educación, terreno y trabajo, restricciones crediticias, migraciones y redes, corrupción" },
  { n:74, code:"B.29", title:"Financiación exterior del desarrollo económico. Deuda externa. Ayuda al desarrollo", content:"I. Financiación exterior de las economías en desarrollo\n I.I. Sistematización de las distintas fuentes de financiación\n I.II. Especial referencia a la Ayuda Oficial al Desarrollo\nII. El problema de la sostenibilidad de la deuda\n II.I. Mecanismos de restructuración y análisis de deseabilidad\n II.II. Medidas multilaterales: actores internacionales y programas concretos" },
  { n:75, code:"B.30", title:"Grupo del Banco Mundial, Bancos Regionales de Desarrollo y otras IFI multilaterales", content:"I. Panorámica de las instituciones financieras multilaterales de desarrollo\n I.I. Aspectos comunes\n I.II. Ejes diferenciadores\n I.III. Grandes tendencias en apoyos y despliegue geográfico\nII. Grupo Banco Mundial\n II.I. Aspectos Generales: organización y evolución/valoración de las políticas del Grupo Banco Mundial\n II.II. Análisis de las cinco grandes instituciones: año de fundación y miembros, descripción de los productos aportando ordenes de magnitud, destinatarios y modos de captación de recursos\nIII. Bancos Regionales de Desarrollo, con especial mención a las nuevas grandes incorporaciones en el panorama mundial" },
  { n:76, code:"B.31", title:"Cambio climático e impacto económico. Modelos integrados de evaluación. Acuerdos internacionales y medidas", content:"I. Cambio climático e impacto económico\n I.I. Breve descripción y medición de las causas y principales manifestaciones observadas y previstas\n I.II. Impacto económico observado y previsto\nII. Modelos Integrados de Evaluación\n II.I. Contribuciones de Nordhaus y otros autores. El modelo DICE y extensiones (RICE, PRICE…)\n II.II. Resultados, estimaciones y recomendaciones de política económica\nIII. Acuerdos internacionales y principales medidas contra el cambio climático" },
  { n:77, code:"B.32", title:"Perspectivas económicas mundiales. Flujos comerciales y financieros. Nuevas áreas emergentes", content:"I. Flujos comerciales en la actualidad\n I.I. Principales vías de suministros entre zonas geográficas\n I.II. Principales mercancías y servicios de intercambio en el marco de las cadenas globales de valor\n I.III. Análisis de interdependencia\nII. Flujos financieros internacionales en la actualidad\n II.I. Principales lazos financieros entre zonas geográficas\n II.II. Principales instrumentos de emisión y recepción\n II.III. Análisis de interdependencia\nIII. Perspectivas económicas mundiales según el último informe del FMI" },
  { n:78, code:"B.33", title:"La OMC. Antecedentes y organización actual. GATT y acuerdos sobre comercio de mercancías", content:"I. La OMC\n I.I. Recorrido histórico. Motivación de teoría económica. Objetivos\n I.II. Estructura organizativa\n I.III. Cuerpo jurídico: los Acuerdos de Marrakech\nII. Acuerdos sobre el comercio de mercancías\n II.I. GATT\n II.II. Otros acuerdos multilaterales: procedimientos, barreras no-arancelarias, defensa comercial, acuerdos específicos\n II.III. Acuerdos plurilaterales" },
  { n:79, code:"B.34", title:"La OMC. Acuerdos distintos de los de mercancías", content:"I. Acuerdos sobre el comercio de servicios\n I.I. GATS\n I.II. Acuerdos plurilaterales\nII. Derechos de propiedad intelectual y otros temas transversales\n II.I. TRIPS\n II.II. Otros temas transversales" },
  { n:80, code:"B.35", title:"Procesos de integración no comunitarios", content:"I. Encaje histórico y actual entre los procesos de integración regionales y la OMC\nII. Procesos de integración más destacados\n II.I. Principales hitos históricos\n II.II. Análisis de los efectos económicos" },
  { n:81, code:"B.36", title:"Tratados, orden jurídico e instituciones de la Unión Europea", content:"I. El proyecto europeo a través de los tratados: Recorrido histórico, motivación de teoría económica y objetivos\nII. Orden jurídico: el acervo europeo\n II.I. Fuentes de Derecho de la UE: Derecho primario, Derecho derivado y fuentes subsidiarias\n II.II. Procedimientos de adopción de decisiones\n II.III. Sistema de competencias\n II.IV. Mecanismos de flexibilidad\nIII. Las instituciones europeas" },
  { n:82, code:"B.37", title:"Finanzas de la Unión Europea y presupuesto comunitario. Marco financiero plurianual actual", content:"I. Las finanzas de la UE y el presupuesto europeo\n I.I. Recorrido histórico, motivación de teoría económica, y objetivos\n I.II. Marco jurídico y ciclo presupuestario\n I.III. Actividad no-presupuestaria\nII. Marco financiero plurianual 2021-27 y NGEU/MRR\n II.I. Ingresos, con referencia especial a NGEU\n II.II. Gastos, con referencia especial al MRR" },
  { n:83, code:"B.38", title:"Política agrícola de la UE. Problemas y reformas. Política pesquera común", content:"I. Política agraria común\n I.I. Recorrido histórico, motivación de teoría económica y objetivos; con especial referencia a los problemas y transformaciones en los distintos procesos de reforma\n I.II. Marco jurídico, competencial y organismos\n I.III. Instrumentos financieros: FEAGA y FEADER\nII. Política pesquera común\n II.I. Recorrido histórico, motivación de teoría económica y objetivos\n II.II. Marco jurídico, competencial y organismos\n II.III. Instrumentos financieros: FEMP" },
  { n:84, code:"B.39", title:"Mercado único de la UE. Libre circulación de mercancías, servicios, personas y capitales. Política de competencia", content:"I. Las cuatro libertades de circulación\n I.I. Mercancías\n I.II. Personas\n I.III. Servicios\n I.IV. Capitales\nII. Política de Competencia\n II.I. Normas aplicables a las empresas\n II.II. Normas aplicables a los Estados\n II.III. Otras cuestiones: fiscalidad, contratación pública, Derecho societario y propiedad intelectual/industrial" },
  { n:85, code:"B.40", title:"Cohesión Económica y Social en la UE. Política regional. Política social y de empleo. Convergencia real", content:"I. Política regional\n I.I. Recorrido histórico, motivación de teoría económica y objetivos\n I.II. Marco jurídico, competencial y organismos. La coordinación a través del Marco Estratégico Común\n I.III. Instrumentos financieros: FEDER, FC\nII. Política social y de empleo\n II.I. Recorrido histórico, motivación de teoría económica y objetivos\n II.II. Marco jurídico, competencial y organismos\n II.III. Instrumentos financieros: FSE\nIII. Implicaciones sobre el proceso de convergencia\n III.I. Revisión de la literatura empírica: convergencia entre Estados miembro, y convergencia entre ciudadanos de la UE\n III.II. Valoración del impacto de los fondos estructurales en el proceso de convergencia" },
  { n:86, code:"B.41", title:"La política comercial de la Unión Europea", content:"I. Visión de conjunto\n I.I. Recorrido histórico, motivación de teoría económica y objetivos\n I.II. Marco jurídico, competencial y organismos\nII. Política comercial común autónoma\n II.I. Actuación en precios: régimen general arancelario y excepciones\n II.II. Actuación en cantidades: régimen general y excepciones\n II.III. Medidas de defensa comercial\nIII. Política comercial común convencional\n III.I. Fundamentos de Derecho Internacional Público y adopción de decisiones\n III.II. La UE en la OMC\n III.III. Tratados bilaterales" },
  { n:87, code:"B.42", title:"Relaciones económicas exteriores de la UE. Política de cooperación al desarrollo", content:"I. Estrategia exterior de la UE\n I.I. Visión regional: política de adhesión y política de vecindad\n I.II. Visión global: presencia en foros internacionales. Referencia al rol internacional del euro\nII. Relaciones económicas exteriores\n II.I. Política común en materia de movimiento de capitales\n II.II. Política común en materia de movimiento de trabajadores\n II.III. Relaciones bilaterales con bloques relevantes\nIII. Política de cooperación al desarrollo\n III.I. Ventajas comerciales con ciertos socios\n III.II. Ayuda Oficial al Desarrollo" },
  { n:88, code:"B.43", title:"Origen del euro. SME. Criterios de convergencia. SEBC: objetivos e instrumentos. Política monetaria en la Eurozona desde 2009", content:"I. Aproximación histórica\n I.I. El Sistema Monetario Europeo como antecedente de la UEM: diseño institucional, y funcionamiento en la práctica\n I.II. Plan Delors y construcción de la UEM\n I.III. Primeros años, y procesos de reforma a raíz de la crisis de la Eurozona y la crisis de la pandemia\nII. Estructuración de la política monetaria de la UE\n II.I. Marco jurídico-institucional: el Sistema Europeo de Bancos Centrales\n II.II. Objetivos; valoración, con referencia a la Revisión Estratégica de 2021\n II.III. Instrumentos: operaciones de mercado abierto, compras de activos, facilidades permanentes, requerimiento de reservas" },
  { n:89, code:"B.44", title:"Unión Bancaria: pilares y código normativo único. Unión de Mercados de Capitales", content:"I. Visión de conjunto\n I.I. Recorrido histórico y motivación de teoría económica\n I.II. Marco jurídico, competencial y organismos, con especial referencia al Sistema Europeo de Supervisión Financiera\nII. La Unión Bancaria\n II.I. El Código Normativo Único: CRR, CRD, BRRD, DGSD, PSD\n II.II. El Mecanismo Único de Supervisión\n II.III. El Mecanismo Único de Resolución\n II.IV. EDIS y otras cuestiones pendientes (especial referencia a los SBBS)\nIII. La Unión del Mercado de Capitales\n III.I. Mercado único: instrumentos e infraestructuras\n III.II. Promoción de la financiación de las PYME\n III.III. Protección del inversor minorista\nIV. Otros ámbitos de regulación financiera\n IV.I. Políticas transversales: Finanzas digitales y finanzas sostenibles\n IV.II. Seguros: Directiva de Solvencia II\n IV.III. Criptoactivos y ciberseguridad: MiCA y DORA" },
  { n:90, code:"B.45", title:"Gobernanza económica de la UE y zona euro. Semestre Europeo. Reglas fiscales y PDM. MEDE. Respuesta fiscal post-COVID", content:"I. Visión de conjunto\n I.I. Recorrido histórico y motivación de teoría económica, con especial referencia a la reforma de 2011 y a la respuesta a la crisis de la pandemia\n I.II. Marco jurídico, competencial y organismos\n I.III. Procedimiento de coordinación: Semestre Europeo\nII. Coordinación de política fiscal\n II.I. Reglas fiscales; con valoración crítica\n II.II. Procedimiento: brazo preventivo y brazo correctivo\nIII. Equilibrio macroeconómico\n III.I. Indicadores y umbrales\n III.II. Procedimiento\nIV. Mecanismos de asistencia financiera a los Estados Miembro\n IV.I. MEDE\n IV.II. Mecanismo de ayuda a las balanzas de pagos\n IV.III. Mecanismos extraordinarios frente a la pandemia: NGEU y SURE" },
];

function initTopics() {
  return TCEE_SYLLABUS.map(t => ({
    id: `t${t.n}`, number: t.n, name: `${t.code}. ${t.title}`,
    studied: false, firstStudyDate: null, content: t.content,
    schemas: [], questions: [], initMastery: null, coverage: null, studySessions: [], pdfs: [],
  }));
}

function applyStudiedPreset(topics) {
  const startDate = new Date("2026-01-05");
  return topics.map(t => {
    if (t.number >= 8 && t.number <= 27) {
      const weeksSinceStart = Math.floor((t.number - 8) / 2);
      const d = new Date(startDate);
      d.setDate(d.getDate() + weeksSinceStart * 7);
      return { ...t, studied: true, firstStudyDate: d.toISOString().split('T')[0], initMastery: 50 };
    }
    return t;
  });
}

async function callClaude(messages, system) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Falta VITE_ANTHROPIC_API_KEY. Para produccion conviene mover estas llamadas a un backend.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "interleaved-thinking-2025-05-14",
      "anthropic-dangerous-direct-browser-access": "true",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: "claude-opus-4-7",
      max_tokens: 16000,
      thinking: { type: "enabled", budget_tokens: 10000 },
      system,
      messages,
    })
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  return d.content.filter(b => b.type === "text").map(b => b.text || '').join('');
}

async function callClaudePDF(b64, prompt, system) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Falta VITE_ANTHROPIC_API_KEY. Para produccion conviene mover estas llamadas a un backend.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "interleaved-thinking-2025-05-14",
      "anthropic-dangerous-direct-browser-access": "true",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: "claude-opus-4-7",
      max_tokens: 16000,
      thinking: { type: "enabled", budget_tokens: 10000 },
      system,
      messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }, { type: "text", text: prompt }] }],
    })
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  return d.content.filter(b => b.type === "text").map(b => b.text || '').join('');
}

const BG = "var(--color-background-tertiary)";
const CARD = "var(--color-background-primary)";
const BORDER = "var(--color-border-tertiary)";
const TEXT = "var(--color-text-primary)";
const MUTED = "var(--color-text-secondary)";
const ACCENT = "#534AB7";
const GREEN = "#3B6D11";
const RED = "#A32D2D";
const YELLOW = "#BA7517";
const BLUE = "#185FA5";

const card = { background: CARD, border: `0.5px solid ${BORDER}`, borderRadius: 12, padding: 20, marginBottom: 16 };
const btn = (bg, col) => ({ background: bg || ACCENT, color: col || "white", border: "none", padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500 });
const inp = { background: BG, border: `0.5px solid ${BORDER}`, color: TEXT, padding: "8px 12px", borderRadius: 8, fontSize: 13, width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 12, color: MUTED, marginBottom: 4, display: "block" };
const tag = (c) => ({ background: c + "22", color: c, padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 500, display: "inline-block" });
const h1s = { fontSize: 20, fontWeight: 500, marginBottom: 16, color: TEXT };
const h2s = { fontSize: 15, fontWeight: 500, marginBottom: 12, color: TEXT };

export default function App() {
  const aiConfigured = Boolean(import.meta.env.VITE_ANTHROPIC_API_KEY);
  const [topics, setTopics] = useState(null);
  const [settings, setSettings] = useState(null);
  const [examBank, setExamBank] = useState(null);
  const [examHistory, setExamHistory] = useState(null);
  const [connections, setConnections] = useState(null);
  const [view, setView] = useState("home");
  const [selId, setSelId] = useState(null);
  const [loading, setLoading] = useState(true);
  const backupInputRef = useRef(null);

  useEffect(() => {
    (async () => {
      const t = await store.get("opos:topics");
      const s = await store.get("opos:settings");
      const eb = await store.get("opos:examBank");
      const eh = await store.get("opos:examHistory");
      const cn = await store.get("opos:connections");
      setTopics(t || initTopics());
      setSettings(s || DEF_SETTINGS);
      setExamBank(eb || []);
      setExamHistory(eh || []);
      setConnections(cn || []);
      setLoading(false);
    })();
  }, []);

  const saveTopics = useCallback((next) => {
    setTopics(next);
    store.set("opos:topics", next);
  }, []);

  const saveTopic = useCallback((id, updates) => {
    setTopics(prev => {
      const next = prev.map(t => t.id === id ? { ...t, ...updates } : t);
      store.set("opos:topics", next);
      return next;
    });
  }, []);

  const saveSettings = useCallback((s) => { setSettings(s); store.set("opos:settings", s); }, []);
  const saveExamBank = useCallback((b) => { setExamBank(b); store.set("opos:examBank", b); }, []);
  const saveExamHistory = useCallback((h) => { setExamHistory(h); store.set("opos:examHistory", h); }, []);
  const saveConnections = useCallback((c) => { setConnections(c); store.set("opos:connections", c); }, []);

  function exportBackup() {
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        version: 1,
        app: "tcee-study-hub",
        data: Object.fromEntries(STORAGE_KEYS.map(key => [key, window.localStorage.getItem(key)])),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-tcee-${todayStr()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      alert("Copia de seguridad descargada.");
    } catch (err) {
      alert("No se pudo exportar la copia: " + err.message);
    }
  }

  async function importBackup(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || parsed.app !== "tcee-study-hub" || !parsed.data) throw new Error("El archivo no parece una copia valida.");
      if (!confirm("Esto sustituira los datos guardados en este navegador. ¿Quieres continuar?")) return;

      STORAGE_KEYS.forEach(key => {
        const value = parsed.data[key];
        if (typeof value === "string") window.localStorage.setItem(key, value);
        else window.localStorage.removeItem(key);
      });

      const nextTopics = await store.get("opos:topics");
      const nextSettings = await store.get("opos:settings");
      const nextExamBank = await store.get("opos:examBank");
      const nextExamHistory = await store.get("opos:examHistory");
      const nextConnections = await store.get("opos:connections");

      setTopics(nextTopics || initTopics());
      setSettings(nextSettings || DEF_SETTINGS);
      setExamBank(nextExamBank || []);
      setExamHistory(nextExamHistory || []);
      setConnections(nextConnections || []);
      setView("home");
      setSelId(null);
      alert("Copia importada correctamente.");
    } catch (err) {
      alert("No se pudo importar la copia: " + err.message);
    } finally {
      event.target.value = "";
    }
  }

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: MUTED, fontSize: 14 }}>Cargando...</div>;

  if (!settings.onboarded) return <Onboarding topics={topics} settings={settings} onDone={(t, s) => { saveTopics(t); saveSettings({ ...s, onboarded: true }); }} />;

  const topic = topics ? topics.find(t => t.id === selId) : null;

  return (
    <div style={{ fontFamily: "var(--font-sans)", minHeight: "100vh", background: BG }}>
      <Nav view={view} setView={v => { setView(v); if (v !== "topic") setSelId(null); }} />
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 24px" }}>
        {!aiConfigured && (
          <div style={{ ...card, background: "#fff6de", borderColor: "#e7b643", marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#6b4f00", marginBottom: 6 }}>Funciones IA sin configurar</div>
            <div style={{ fontSize: 13, color: "#7a5a00", lineHeight: 1.6 }}>
              El chat, el analisis de PDFs y la generacion asistida necesitan `VITE_ANTHROPIC_API_KEY`.
              Para desarrollo local puede ir en `.env.local`, aunque para produccion es mejor mover esas llamadas a un backend.
            </div>
          </div>
        )}
        {view === "home" && <Home topics={topics} settings={settings} setView={setView} onExportBackup={exportBackup} onImportBackup={() => backupInputRef.current && backupInputRef.current.click()} />}
        {view === "topics" && <TopicsList topics={topics} onSelect={id => { setSelId(id); setView("topic"); }} />}
        {view === "topic" && topic && <TopicDetail topic={topic} topics={topics} connections={connections} onUpdate={saveTopic} onBack={() => setView("topics")} />}
        {view === "review" && <Review topics={topics} onUpdate={saveTopic} />}
        {view === "exam" && <ExamSimulator topics={topics} examBank={examBank} saveExamBank={saveExamBank} examHistory={examHistory} saveExamHistory={saveExamHistory} />}
        {view === "connections" && <Connections topics={topics} connections={connections} saveConnections={saveConnections} />}
        {view === "progress" && <Progress topics={topics} settings={settings} examHistory={examHistory} />}
        {view === "plan" && <WeeklyPlan topics={topics} settings={settings} onSaveSettings={saveSettings} setTopics={saveTopics} />}
      </div>
      <input ref={backupInputRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={importBackup} />
    </div>
  );
}

function Nav({ view, setView }) {
  const tabs = [
    { id: "home", icon: "🏠", label: "Inicio" },
    { id: "topics", icon: "📚", label: "Temas" },
    { id: "review", icon: "🔁", label: "Repaso" },
    { id: "exam", icon: "📝", label: "Simulacro" },
    { id: "connections", icon: "🔗", label: "Conexiones" },
    { id: "progress", icon: "📊", label: "Progreso" },
    { id: "plan", icon: "📅", label: "Plan" },
  ];
  return (
    <div style={{ background: CARD, borderBottom: `0.5px solid ${BORDER}`, display: "flex", alignItems: "center", padding: "0 16px", gap: 2, position: "sticky", top: 0, zIndex: 10, flexWrap: "wrap" }}>
      <span style={{ fontWeight: 500, color: ACCENT, fontSize: 13, marginRight: 12, paddingRight: 12, borderRight: `0.5px solid ${BORDER}` }}>Rubén · TCEE</span>
      {tabs.map(t => (
        <button key={t.id} onClick={() => setView(t.id)} style={{ background: view === t.id ? ACCENT + "18" : "transparent", color: view === t.id ? ACCENT : MUTED, border: "none", padding: "11px 12px", cursor: "pointer", fontSize: 13, fontWeight: view === t.id ? 500 : 400, borderBottom: view === t.id ? `2px solid ${ACCENT}` : "2px solid transparent" }}>{t.icon} {t.label}</button>
      ))}
    </div>
  );
}

function Onboarding({ topics, settings, onDone }) {
  const [step, setStep] = useState(0);
  const [examDate, setExamDate] = useState("");
  const [sel, setSel] = useState({});
  const [dates, setDates] = useState({});
  const [masteries, setMasteries] = useState({});

  const studiedNums = Object.keys(sel).filter(k => sel[k]).map(Number);

  function finish() {
    const t = topics.map(tp => {
      const s = sel[tp.number];
      return { ...tp, studied: !!s, firstStudyDate: s ? (dates[tp.number] || todayStr()) : null, initMastery: s ? (parseInt(masteries[tp.number] || "50")) : null };
    });
    onDone(t, { ...settings, examDate: examDate || null });
  }

  function applyPreset() {
    const t = applyStudiedPreset(topics);
    const sObj = {}; const dObj = {}; const mObj = {};
    t.forEach(tp => { if (tp.studied) { sObj[tp.number] = true; dObj[tp.number] = tp.firstStudyDate; mObj[tp.number] = "50"; } });
    setSel(sObj); setDates(dObj); setMasteries(mObj);
    setStep(1);
  }

  const steps = ["Bienvenida", "Examen", "Temas", "Confirmar"];

  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "var(--font-sans)" }}>
      <div style={{ ...card, maxWidth: 620, width: "100%", marginBottom: 0 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
          {steps.map((s, i) => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? ACCENT : BORDER }} />)}
        </div>
        {step === 0 && (
          <div>
            <div style={h1s}>Bienvenido 🎓</div>
            <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>Configuremos tu espacio para la oposición TCEE (90 temas).</p>
            <div style={{ background: ACCENT + "10", border: `0.5px solid ${ACCENT}40`, borderRadius: 8, padding: 12, marginBottom: 20 }}>
              <p style={{ color: TEXT, fontSize: 13, margin: 0, lineHeight: 1.7 }}>💡 Preset disponible: A.8 a A.27 como estudiados (enero 2026, 2/semana).</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={btn(GREEN)} onClick={applyPreset}>⚡ Aplicar preset</button>
              <button style={btn()} onClick={() => setStep(1)}>Manualmente →</button>
            </div>
          </div>
        )}
        {step === 1 && (
          <div>
            <div style={h1s}>📅 Fecha del examen</div>
            <label style={lbl}>Fecha (opcional)</label>
            <input type="date" style={inp} value={examDate} onChange={e => setExamDate(e.target.value)} />
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button style={btn(BG, MUTED)} onClick={() => setStep(0)}>← Atrás</button>
              <button style={btn()} onClick={() => setStep(2)}>Siguiente →</button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div>
            <div style={h1s}>📚 Temas estudiados</div>
            <p style={{ color: MUTED, fontSize: 14, marginBottom: 12 }}>Haz clic en los temas que ya has estudiado.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 5, marginBottom: 16 }}>
              {Array.from({ length: 90 }, (_, i) => i + 1).map(n => (
                <button key={n} onClick={() => setSel(p => ({ ...p, [n]: !p[n] }))} style={{ background: sel[n] ? ACCENT : BORDER, border: "none", borderRadius: 6, padding: "5px 0", color: sel[n] ? "white" : MUTED, cursor: "pointer", fontSize: 11, fontWeight: sel[n] ? 500 : 400 }}>{n}</button>
              ))}
            </div>
            {studiedNums.length > 0 && (
              <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 12 }}>
                {studiedNums.map(n => (
                  <div key={n} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: MUTED, width: 48, flexShrink: 0 }}>T.{n}</span>
                    <input type="date" style={{ ...inp, width: "auto", flex: 1 }} value={dates[n] || ""} onChange={e => setDates(p => ({ ...p, [n]: e.target.value }))} />
                    <input type="number" min={0} max={100} style={{ ...inp, width: 64, flexShrink: 0 }} placeholder="%" value={masteries[n] || ""} onChange={e => setMasteries(p => ({ ...p, [n]: e.target.value }))} />
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button style={btn(BG, MUTED)} onClick={() => setStep(1)}>← Atrás</button>
              <button style={btn()} onClick={() => setStep(3)}>Siguiente →</button>
            </div>
          </div>
        )}
        {step === 3 && (
          <div>
            <div style={h1s}>✅ Todo listo</div>
            <div style={{ background: BG, borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <p style={{ color: MUTED, margin: "0 0 6px", fontSize: 14 }}>📅 Examen: <strong style={{ color: TEXT }}>{examDate || "—"}</strong></p>
              <p style={{ color: MUTED, margin: 0, fontSize: 14 }}>📚 Estudiados: <strong style={{ color: TEXT }}>{studiedNums.length}/90</strong></p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={btn(BG, MUTED)} onClick={() => setStep(2)}>← Atrás</button>
              <button style={btn(GREEN)} onClick={finish}>🚀 ¡Empezar!</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Home({ topics, settings, setView, onExportBackup, onImportBackup }) {
  const studied = topics.filter(t => t.studied);
  const pct = Math.round(studied.length / 90 * 100);
  let dueToday = 0;
  topics.forEach(t => { (t.questions || []).forEach(q => { if (!q.nextReview || q.nextReview <= todayStr()) dueToday++; }); });
  const weeksLeft = settings.examDate ? Math.max(0, Math.ceil(daysBetween(todayStr(), settings.examDate) / 7)) : null;
  const weeksNeeded = Math.ceil((90 - studied.length) / (settings.weeklyNew || 2));
  const onTrack = weeksLeft !== null ? weeksLeft >= weeksNeeded : null;
  const stats = [
    { label: "Estudiados", value: `${studied.length}/90`, color: ACCENT },
    { label: "Progreso", value: `${pct}%`, color: BLUE },
    { label: "Preguntas hoy", value: dueToday, color: dueToday ? YELLOW : GREEN },
    { label: "Semanas al examen", value: weeksLeft !== null ? weeksLeft : "—", color: onTrack === false ? RED : GREEN },
  ];
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 500, color: TEXT }}>Bienvenido Rubén, futuro Economista del Estado</div>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{todayStr()} · {studied.length} temas estudiados · {90 - studied.length} pendientes</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 16 }}>
        {stats.map((s, i) => (
          <div key={i} style={{ ...card, textAlign: "center", marginBottom: 0, padding: 14 }}>
            <div style={{ fontSize: 26, fontWeight: 500, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={card}>
        <div style={{ ...h2s, marginBottom: 8 }}>Progreso de la oposición</div>
        <div style={{ background: BORDER, borderRadius: 20, height: 10, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: ACCENT, transition: "width 0.5s" }} />
        </div>
        {onTrack === false && <div style={{ marginTop: 12, padding: "8px 12px", background: RED + "15", border: `0.5px solid ${RED}40`, borderRadius: 8, fontSize: 12, color: RED }}>⚠️ Necesitas {weeksNeeded} semanas, quedan {weeksLeft}.</div>}
        {onTrack === true && <div style={{ marginTop: 12, padding: "8px 12px", background: GREEN + "15", border: `0.5px solid ${GREEN}40`, borderRadius: 8, fontSize: 12, color: GREEN }}>✅ Vas a tiempo ({weeksLeft} disponibles, {weeksNeeded} necesarias).</div>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔁</div>
          <div style={h2s}>Repaso</div>
          <div style={{ color: MUTED, fontSize: 13, marginBottom: 12 }}>{dueToday} preguntas hoy</div>
          <button style={btn(ACCENT)} onClick={() => setView("review")}>Repasar</button>
        </div>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📝</div>
          <div style={h2s}>Simulacro</div>
          <div style={{ color: MUTED, fontSize: 13, marginBottom: 12 }}>Simulacro tipo test</div>
          <button style={btn(BLUE)} onClick={() => setView("exam")}>Hacer simulacro</button>
        </div>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📅</div>
          <div style={h2s}>Plan</div>
          <div style={{ color: MUTED, fontSize: 13, marginBottom: 12 }}>Plan semanal IA</div>
          <button style={btn(GREEN)} onClick={() => setView("plan")}>Ver plan</button>
        </div>
      </div>
      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ ...h2s, marginBottom: 8 }}>Copia de seguridad</div>
        <div style={{ color: MUTED, fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
          Descarga un archivo con tus datos y restauralo cuando quieras en este navegador.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btn(BLUE)} onClick={onExportBackup}>Descargar copia</button>
          <button style={btn(BG, MUTED)} onClick={onImportBackup}>Importar copia</button>
        </div>
      </div>
    </div>
  );
}

function TopicsList({ topics, onSelect }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const filtered = topics.filter(t => {
    const matchF = filter === "all" || (filter === "studied" && t.studied) || (filter === "pending" && !t.studied);
    const matchS = !search || t.name.toLowerCase().includes(search.toLowerCase()) || String(t.number).includes(search);
    return matchF && matchS;
  });
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ ...h1s, marginBottom: 0, flex: 1 }}>Mis Temas ({topics.filter(t => t.studied).length}/90)</div>
        <input style={{ ...inp, width: 180 }} placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
        {["all", "studied", "pending"].map(f => (
          <button key={f} style={btn(filter === f ? ACCENT : BG, filter === f ? "white" : MUTED)} onClick={() => setFilter(f)}>
            {f === "all" ? "Todos" : f === "studied" ? "Estudiados" : "Pendientes"}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
        {filtered.map(t => {
          const m = topicMastery(t);
          const mColor = m === null ? MUTED : m >= 80 ? GREEN : m >= 50 ? YELLOW : RED;
          const qCount = (t.questions || []).length;
          const pdfCount = (t.pdfs || []).length;
          const sessCount = (t.studySessions || []).length;
          return (
            <div key={t.id} onClick={() => onSelect(t.id)} style={{ ...card, marginBottom: 0, padding: 12, cursor: "pointer", borderColor: t.studied ? ACCENT + "60" : BORDER }}>
              <div style={{ fontSize: 10, color: MUTED, marginBottom: 3 }}>Tema {t.number}</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: TEXT, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={tag(t.studied ? GREEN : MUTED)}>{t.studied ? "✓" : "—"}</span>
                {m !== null && <span style={{ fontSize: 10, color: mColor, fontWeight: 500 }}>{m}%</span>}
              </div>
              {qCount > 0 && <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>{qCount} preguntas</div>}
              {pdfCount > 0 && <div style={{ fontSize: 10, color: BLUE, marginTop: 2, fontWeight: 500 }}>📄 {pdfCount} PDF{pdfCount !== 1 ? "s" : ""}</div>}
              {sessCount > 0 && <div style={{ fontSize: 10, color: ACCENT, marginTop: 2, fontWeight: 500 }}>📖 {sessCount} ses.</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TopicDetail({ topic, topics, connections, onUpdate, onBack }) {
  const [tab, setTab] = useState("info");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [newQ, setNewQ] = useState({ q: "", opts: ["", "", "", ""], correct: 0 });
  const [newCard, setNewCard] = useState({ q: "", a: "" });
  const [expandedSchema, setExpandedSchema] = useState(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [miniReview, setMiniReview] = useState(null);
  const [miniIdx, setMiniIdx] = useState(0);
  const [miniShowAns, setMiniShowAns] = useState(false);
  const [miniWrittenAnswer, setMiniWrittenAnswer] = useState("");
  const [miniStats, setMiniStats] = useState({ correct: 0, wrong: 0 });
  const fileRef = useRef();
  const chatEnd = useRef();

  useEffect(() => { if (chatEnd.current) chatEnd.current.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);

  function getAllContent() {
    const pdfs = topic.pdfs || [];
    if (pdfs.length > 0) return pdfs.map(p => `--- ${p.name} ---\n${p.content}`).join("\n\n");
    return topic.content || "";
  }

  function startMiniReview(type) {
    let qs = (topic.questions || []);
    if (type === "test") qs = qs.filter(q => (q.type || "test") === "test");
    if (type === "card") qs = qs.filter(q => q.type === "card");
    qs = qs.slice().sort(() => Math.random() - 0.5);
    if (!qs.length) { alert("No hay preguntas de este tipo."); return; }
    setMiniReview(qs); setMiniIdx(0); setMiniShowAns(false); setMiniWrittenAnswer(""); setMiniStats({ correct: 0, wrong: 0 });
  }

  function miniAnswer(correct) {
    const q = miniReview[miniIdx];
    const upd = scheduleQuestion(q, correct);
    onUpdate(topic.id, { questions: (topic.questions || []).map(x => x.id === q.id ? { ...x, ...upd } : x) });
    setMiniStats({ correct: miniStats.correct + (correct ? 1 : 0), wrong: miniStats.wrong + (correct ? 0 : 1) });
    if (miniIdx + 1 >= miniReview.length) setMiniReview(null);
    else { setMiniIdx(miniIdx + 1); setMiniShowAns(false); setMiniWrittenAnswer(""); }
  }

  async function handlePDF(e) {
    const file = e.target.files[0]; if (!file) return;
    setPdfLoading(true);
    try {
      const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
      const extracted = await callClaudePDF(b64, "Extrae y organiza todo el contenido de este documento de forma completa y estructurada para oposición. Usa Markdown.", `Experto en TCEE procesando ${topic.name}.`);
      const newPdf = { id: Date.now().toString(), name: file.name, content: extracted, date: todayStr() };
      onUpdate(topic.id, { ...markTopicStudied(topic, todayStr()), pdfs: [...(topic.pdfs || []), newPdf] });
    } catch (err) { alert("Error: " + err.message); }
    setPdfLoading(false); e.target.value = "";
  }

  async function generateSchema(type) {
    const ac = getAllContent();
    if (!ac || ac.length < 500) { alert("Primero sube un PDF."); return; }
    setSchemaLoading(type);
    try {
      const prompts = {
        esquema: `Genera esquema jerárquico detallado del contenido:\n\n${ac.substring(0, 6000)}`,
        resumen: `Resumen ejecutivo para oposición:\n\n${ac.substring(0, 6000)}`,
        conceptos: `12 conceptos clave con definición y relevancia:\n\n${ac.substring(0, 6000)}`
      };
      const result = await callClaude([{ role: "user", content: prompts[type] }], `Experto en TCEE, ${topic.name}.`);
      const schema = { id: Date.now().toString(), type, title: `${type} — ${topic.name}`, content: result, date: todayStr() };
      onUpdate(topic.id, { schemas: [...(topic.schemas || []), schema] });
    } catch (err) { alert("Error: " + err.message); }
    setSchemaLoading(false);
  }

  async function sendChat() {
    const msg = chatInput.trim(); if (!msg) return;
    setChatInput("");
    const hist = [...chatHistory, { role: "user", content: msg }];
    setChatHistory(hist); setChatLoading(true);
    try {
      const ac = getAllContent();
      const system = `Experto en TCEE, ${topic.name}.${ac ? "\n\nCONTENIDO:\n" + ac.substring(0, 5000) : ""}`;
      const reply = await callClaude(hist.map(m => ({ role: m.role, content: m.content })), system);
      setChatHistory([...hist, { role: "assistant", content: reply }]);
    } catch (err) { setChatHistory([...hist, { role: "assistant", content: "Error: " + err.message }]); }
    setChatLoading(false);
  }

  function addQuestion() {
    if (!newQ.q.trim() || newQ.opts.some(o => !o.trim())) { alert("Completa pregunta y opciones."); return; }
    const q = { id: Date.now().toString(), type: "test", q: newQ.q, options: newQ.opts, correct: newQ.correct, interval: 0, ef: 2.5, nextReview: todayStr(), hits: 0, misses: 0 };
    onUpdate(topic.id, { questions: [...(topic.questions || []), q], coverage: null });
    setNewQ({ q: "", opts: ["", "", "", ""], correct: 0 });
  }

  function addCard() {
    if (!newCard.q.trim() || !newCard.a.trim()) { alert("Completa pregunta y respuesta."); return; }
    const q = { id: Date.now().toString(), type: "card", q: newCard.q, answer: newCard.a, createdAt: todayStr(), interval: 7, ef: 2.5, nextReview: addDays(todayStr(), 7), hits: 0, misses: 0 };
    onUpdate(topic.id, { questions: [...(topic.questions || []), q], coverage: null });
    setNewCard({ q: "", a: "" });
  }

  async function analyzeCoverage() {
    const ac = getAllContent();
    if (!ac || ac.length < 500) { alert("Sube un PDF."); return; }
    if (!(topic.questions || []).length) { alert("Añade al menos una pregunta."); return; }
    setCoverageLoading(true);
    try {
      const qt = topic.questions.map((q, i) => `${i + 1}. ${q.q}`).join("\n");
      const prompt = `Analiza cobertura de preguntas respecto al temario.\n\nTEMARIO:\n${ac.substring(0, 8000)}\n\nPREGUNTAS:\n${qt}\n\nResponde SOLO JSON:\n{"percentage": 65, "covered": ["C1"], "uncovered": ["C4"], "recommendation": "Sugerencia"}`;
      const r = await callClaude([{ role: "user", content: prompt }], "Responde SIEMPRE con JSON válido.");
      const parsed = JSON.parse(r.replace(/```json|```/g, "").trim());
      onUpdate(topic.id, { coverage: { ...parsed, date: todayStr() } });
    } catch (err) { alert("Error: " + err.message); }
    setCoverageLoading(false);
  }

  function registerSession() {
    const s = topic.studySessions || [];
    onUpdate(topic.id, { ...markTopicStudied(topic, todayStr()), studySessions: [...s, { id: Date.now().toString(), date: todayStr() }] });
  }

  const myConnections = (connections || []).filter(c => c.fromNumber === topic.number || c.toNumber === topic.number);
  const sessions = topic.studySessions || [];
  const pdfs = topic.pdfs || [];
  const tabs = [
    { id: "info", label: "📋 Contenido" },
    { id: "study", label: "🤖 Chat IA" },
    { id: "questions", label: `❓ Preguntas (${(topic.questions || []).length})` },
    { id: "connections", label: `🔗 Conexiones (${myConnections.length})` },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button style={btn(BG, MUTED)} onClick={onBack}>← Volver</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 500, color: TEXT }}>{topic.name}</div>
          <div style={{ fontSize: 12, color: MUTED }}>Tema {topic.number}{topic.firstStudyDate ? ` · Primer estudio: ${topic.firstStudyDate}` : ""}</div>
        </div>
        <span style={tag(topic.studied ? GREEN : MUTED)}>{topic.studied ? "✓ Estudiado" : "Sin estudiar"}</span>
        {topicMastery(topic) !== null && <span style={{ fontSize: 12, color: MUTED }}>{topicMastery(topic)}% dominio</span>}
      </div>
      <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: `0.5px solid ${BORDER}` }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ background: "transparent", color: tab === t.id ? ACCENT : MUTED, border: "none", borderBottom: tab === t.id ? `2px solid ${ACCENT}` : "2px solid transparent", padding: "9px 14px", cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 500 : 400 }}>{t.label}</button>
        ))}
      </div>

      {tab === "info" && (
        <div>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={h2s}>📖 Sesiones de estudio</div>
                <div style={{ fontSize: 11, color: MUTED }}>Total: {sessions.length} sesiones</div>
              </div>
              <button style={btn(GREEN)} onClick={registerSession}>➕ Registrar hoy</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minHeight: 30 }}>
              {sessions.length === 0 ? <div style={{ color: MUTED, fontSize: 13 }}>Sin sesiones todavía.</div> :
                sessions.slice().reverse().map(s => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, background: BG, border: `0.5px solid ${BORDER}`, borderRadius: 20, padding: "3px 4px 3px 10px", fontSize: 11 }}>
                    <span style={{ color: TEXT }}>{s.date}</span>
                    <button onClick={() => onUpdate(topic.id, { studySessions: sessions.filter(x => x.id !== s.id) })} style={{ background: "transparent", border: "none", color: RED, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 4px" }}>×</button>
                  </div>
                ))
              }
            </div>
          </div>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={h2s}>Material del tema</div>
                <div style={{ fontSize: 11, color: MUTED }}>{pdfs.length > 0 ? `${pdfs.length} PDF${pdfs.length !== 1 ? "s" : ""} subidos` : "Sin PDFs"}</div>
              </div>
              <button style={btn()} onClick={() => fileRef.current.click()} disabled={pdfLoading}>{pdfLoading ? "Procesando..." : "📤 Añadir PDF"}</button>
            </div>
            {pdfs.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: BG, borderRadius: 8, padding: "8px 12px", marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📄 {p.name}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>{p.date} · {Math.round((p.content || "").length / 1000)}k chars</div>
                </div>
                <button style={{ ...btn(RED), padding: "3px 8px", fontSize: 11 }} onClick={() => onUpdate(topic.id, { pdfs: pdfs.filter(x => x.id !== p.id) })}>✕</button>
              </div>
            ))}
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 12, color: MUTED, cursor: "pointer", padding: "6px 0" }}>Ver estructura oficial del temario</summary>
              <div style={{ background: BG, borderRadius: 8, padding: 12, marginTop: 8, fontSize: 12, color: TEXT, whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{topic.content || ""}</div>
            </details>
            <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={handlePDF} />
          </div>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={h2s}>Esquemas y resúmenes</div>
              <div style={{ display: "flex", gap: 6 }}>
                {["esquema", "resumen", "conceptos"].map(t => (
                  <button key={t} style={btn(BLUE)} onClick={() => generateSchema(t)} disabled={!!schemaLoading}>{schemaLoading === t ? "..." : `+ ${t}`}</button>
                ))}
              </div>
            </div>
            {(topic.schemas || []).length === 0 ? <p style={{ color: MUTED, fontSize: 13 }}>Genera esquemas o resúmenes con IA (requiere PDF).</p> :
              (topic.schemas || []).map(s => (
                <div key={s.id} style={{ background: BG, borderRadius: 8, padding: 12, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: expandedSchema === s.id ? 8 : 0 }}>
                    <span style={{ fontWeight: 500, fontSize: 13, cursor: "pointer", color: TEXT }} onClick={() => setExpandedSchema(expandedSchema === s.id ? null : s.id)}>{s.title}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button style={{ ...btn(BG, MUTED), padding: "3px 8px", fontSize: 11 }} onClick={() => setExpandedSchema(expandedSchema === s.id ? null : s.id)}>{expandedSchema === s.id ? "Colapsar" : "Ver"}</button>
                      <button style={{ ...btn(RED), padding: "3px 8px", fontSize: 11 }} onClick={() => onUpdate(topic.id, { schemas: (topic.schemas || []).filter(x => x.id !== s.id) })}>✕</button>
                    </div>
                  </div>
                  {expandedSchema === s.id && <div style={{ fontSize: 12, color: MUTED, whiteSpace: "pre-wrap", lineHeight: 1.7, maxHeight: 300, overflowY: "auto" }}>{s.content}</div>}
                </div>
              ))
            }
          </div>
        </div>
      )}

      {tab === "study" && (
        <div style={card}>
          <div style={h2s}>Chat IA — {topic.name}</div>
          {pdfs.length === 0 && <div style={{ padding: "8px 12px", background: YELLOW + "15", border: `0.5px solid ${YELLOW}40`, borderRadius: 8, fontSize: 12, color: YELLOW, marginBottom: 12 }}>⚠️ Sube un PDF para darle contexto a la IA.</div>}
          <div style={{ background: BG, borderRadius: 8, padding: 12, height: 340, overflowY: "auto", marginBottom: 12 }}>
            {chatHistory.length === 0 && <div style={{ color: MUTED, fontSize: 13, textAlign: "center", marginTop: 80 }}>Pregúntame sobre {topic.name}.</div>}
            {chatHistory.map((m, i) => (
              <div key={i} style={{ marginBottom: 10, display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "85%", padding: "8px 12px", borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px", background: m.role === "user" ? ACCENT : CARD, color: m.role === "user" ? "white" : TEXT, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.6, border: m.role === "assistant" ? `0.5px solid ${BORDER}` : "none" }}>{m.content}</div>
              </div>
            ))}
            {chatLoading && <div style={{ color: MUTED, fontSize: 12, padding: 4 }}>✦ Escribiendo...</div>}
            <div ref={chatEnd} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...inp, flex: 1 }} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !chatLoading) sendChat(); }} placeholder="Escribe tu pregunta..." />
            <button style={btn()} onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>Enviar</button>
          </div>
          {chatHistory.length > 0 && <button style={{ ...btn(BG, MUTED), marginTop: 8, fontSize: 11 }} onClick={() => setChatHistory([])}>Limpiar</button>}
        </div>
      )}

      {tab === "questions" && (
        <div>
          {miniReview && (
            <div style={{ ...card, borderLeft: "4px solid " + ACCENT, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: MUTED }}>{miniIdx + 1}/{miniReview.length} · <span style={{ color: GREEN }}>ok {miniStats.correct}</span> <span style={{ color: RED }}>x {miniStats.wrong}</span></span>
                <button style={btn(BG, MUTED)} onClick={() => setMiniReview(null)}>Salir</button>
              </div>
              {(() => {
                const q = miniReview[miniIdx];
                const isCard = q.type === "card";
                return (
                  <div>
                    <div style={{ marginBottom: 8 }}><span style={tag(isCard ? BLUE : GREEN)}>{isCard ? "Tarjeta" : "Test"}</span></div>
                    <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16, lineHeight: 1.6, color: TEXT }}>{q.q}</div>
                    {!miniShowAns ? (
                      isCard ? (
                        <div>
                          <p style={{ fontSize: 12, color: MUTED, marginBottom: 10, fontStyle: "italic" }}>Escribe tu respuesta y luego comparala con la tarjeta.</p>
                          <textarea
                            style={{ ...inp, minHeight: 110, resize: "vertical", marginBottom: 14 }}
                            value={miniWrittenAnswer}
                            onChange={e => setMiniWrittenAnswer(e.target.value)}
                            placeholder="Escribe aqui tu respuesta..."
                          />
                          <button style={{ ...btn(ACCENT), padding: "10px 24px" }} onClick={() => setMiniShowAns(true)}>Comparar respuesta</button>
                        </div>
                      ) : (
                        <button style={{ ...btn(ACCENT), padding: "10px 24px" }} onClick={() => setMiniShowAns(true)}>Ver respuesta</button>
                      )
                    ) : (
                      <div>
                        {isCard ? (
                          <div>
                            <div style={{ background: BG, border: "0.5px solid " + BORDER, borderRadius: 8, padding: 14, marginBottom: 12 }}>
                              <div style={{ fontSize: 11, color: MUTED, fontWeight: 500, marginBottom: 6 }}>TU RESPUESTA</div>
                              <div style={{ fontSize: 14, color: TEXT, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{miniWrittenAnswer.trim() || "No has escrito respuesta."}</div>
                            </div>
                            <div style={{ background: BLUE + "10", border: "0.5px solid " + BLUE + "40", borderRadius: 8, padding: 14, marginBottom: 12 }}>
                              <div style={{ fontSize: 11, color: BLUE, fontWeight: 500, marginBottom: 6 }}>RESPUESTA DE LA TARJETA</div>
                              <div style={{ fontSize: 14, color: TEXT, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{q.answer}</div>
                            </div>
                          </div>
                        ) : (
                          (q.options || []).map((opt, i) => (
                            <div key={i} style={{ background: i === q.correct ? GREEN + "20" : BG, border: "0.5px solid " + (i === q.correct ? GREEN : BORDER), borderRadius: 8, padding: "8px 14px", marginBottom: 7, fontSize: 13, color: i === q.correct ? GREEN : MUTED }}>
                              {i === q.correct ? "✓" : "—"} {String.fromCharCode(65 + i)}) {opt}
                            </div>
                          ))
                        )}
                        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                          <button style={{ ...btn(RED), padding: "8px 24px" }} onClick={() => miniAnswer(false)}>✗ No la sabía</button>
                          <button style={{ ...btn(GREEN), padding: "8px 24px" }} onClick={() => miniAnswer(true)}>✓ La sabía</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
          {!miniReview && (
            <div style={{ ...card, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: TEXT, marginRight: 8 }}>Repaso rápido de este tema:</span>
              <button style={btn(ACCENT)} onClick={() => startMiniReview("all")}>Todas</button>
              <button style={btn(GREEN)} onClick={() => startMiniReview("test")}>Solo test</button>
              <button style={btn(BLUE)} onClick={() => startMiniReview("card")}>Solo tarjetas</button>
            </div>
          )}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={h2s}>📊 Cobertura del temario</div>
              <button style={btn(BLUE)} onClick={analyzeCoverage} disabled={coverageLoading || pdfs.length === 0 || !(topic.questions || []).length}>
                {coverageLoading ? "Analizando..." : topic.coverage ? "🔄 Re-analizar" : "🔍 Analizar"}
              </button>
            </div>
            {!topic.coverage ? <p style={{ color: MUTED, fontSize: 13 }}>Analiza qué % del temario cubren tus preguntas.</p> : (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
                  <div style={{ position: "relative", width: 88, height: 88 }}>
                    <svg viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
                      <circle cx="50" cy="50" r="42" fill="none" stroke={BORDER} strokeWidth="10" />
                      <circle cx="50" cy="50" r="42" fill="none" stroke={topic.coverage.percentage >= 75 ? GREEN : topic.coverage.percentage >= 50 ? YELLOW : RED} strokeWidth="10" strokeDasharray={`${(topic.coverage.percentage / 100) * 263.9} 263.9`} strokeLinecap="round" />
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 500, color: TEXT }}>{topic.coverage.percentage}%</div>
                  </div>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 500, color: TEXT, marginBottom: 4 }}>Cobertura estimada</div><div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>{topic.coverage.recommendation}</div></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ background: GREEN + "10", border: `0.5px solid ${GREEN}40`, borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: GREEN, marginBottom: 6 }}>✓ Cubiertas ({(topic.coverage.covered || []).length})</div>
                    {(topic.coverage.covered || []).map((c, i) => <div key={i} style={{ fontSize: 12, color: TEXT, padding: "2px 0", lineHeight: 1.5 }}>• {c}</div>)}
                  </div>
                  <div style={{ background: RED + "10", border: `0.5px solid ${RED}40`, borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: RED, marginBottom: 6 }}>✗ Sin preguntas ({(topic.coverage.uncovered || []).length})</div>
                    {(topic.coverage.uncovered || []).map((c, i) => <div key={i} style={{ fontSize: 12, color: TEXT, padding: "2px 0", lineHeight: 1.5 }}>• {c}</div>)}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={card}>
              <div style={h2s}>➕ Pregunta tipo test</div>
              <label style={lbl}>Enunciado</label>
              <textarea style={{ ...inp, minHeight: 60, resize: "vertical", marginBottom: 10 }} value={newQ.q} onChange={e => setNewQ(p => ({ ...p, q: e.target.value }))} />
              <label style={lbl}>Opciones</label>
              {newQ.opts.map((opt, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                  <input type="radio" name="correct_new" checked={newQ.correct === i} onChange={() => setNewQ(p => ({ ...p, correct: i }))} style={{ cursor: "pointer" }} />
                  <input style={{ ...inp, borderColor: newQ.correct === i ? GREEN : BORDER }} value={opt} onChange={e => setNewQ(p => ({ ...p, opts: p.opts.map((o, j) => j === i ? e.target.value : o) }))} placeholder={`Opción ${String.fromCharCode(65 + i)}`} />
                </div>
              ))}
              <button style={{ ...btn(GREEN), marginTop: 8 }} onClick={addQuestion}>+ Test</button>
            </div>
            <div style={card}>
              <div style={h2s}>🃏 Tarjeta de estudio</div>
              <label style={lbl}>Pregunta</label>
              <textarea style={{ ...inp, minHeight: 60, resize: "vertical", marginBottom: 10 }} value={newCard.q} onChange={e => setNewCard(p => ({ ...p, q: e.target.value }))} />
              <label style={lbl}>Respuesta</label>
              <textarea style={{ ...inp, minHeight: 100, resize: "vertical", marginBottom: 10 }} value={newCard.a} onChange={e => setNewCard(p => ({ ...p, a: e.target.value }))} />
              <button style={{ ...btn(BLUE), marginTop: 8 }} onClick={addCard}>+ Tarjeta</button>
            </div>
          </div>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={h2s}>Preguntas ({(topic.questions || []).length})</div>
              <div style={{ fontSize: 12, color: MUTED }}>{(topic.questions || []).filter(q => (q.type || "test") === "test").length} test · {(topic.questions || []).filter(q => q.type === "card").length} tarjetas</div>
            </div>
            {(topic.questions || []).length === 0 ? <p style={{ color: MUTED, fontSize: 13 }}>Sin preguntas.</p> :
              (topic.questions || []).map((q, i) => {
                const isCard = q.type === "card";
                return (
                  <div key={q.id} style={{ background: BG, borderRadius: 8, padding: 12, marginBottom: 8, borderLeft: `3px solid ${isCard ? BLUE : GREEN}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ ...tag(isCard ? BLUE : GREEN), marginRight: 8 }}>{isCard ? "🃏" : "📝"}</span>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{i + 1}. {q.q}</span>
                      </div>
                      <button style={{ ...btn(RED), padding: "2px 7px", fontSize: 11 }} onClick={() => onUpdate(topic.id, { questions: (topic.questions || []).filter(x => x.id !== q.id) })}>✕</button>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      {isCard ? <div style={{ fontSize: 12, color: MUTED, marginLeft: 8 }}><strong style={{ color: BLUE }}>R:</strong> {q.answer}</div> :
                        (q.options || []).map((o, oi) => <div key={oi} style={{ fontSize: 12, color: oi === q.correct ? GREEN : MUTED, marginLeft: 8 }}>{oi === q.correct ? "✓" : "-"} {String.fromCharCode(65 + oi)}) {o}</div>)
                      }
                    </div>
                    <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 11, color: MUTED, flexWrap: "wrap" }}>
                      {q.createdAt && <span>Creada: {q.createdAt}</span>}
                      <span style={{ color: GREEN }}>✓ {q.hits || 0}</span><span style={{ color: RED }}>✗ {q.misses || 0}</span><span>Próximo: {q.nextReview || todayStr()}</span>
                    </div>
                  </div>
                );
              })
            }
          </div>
        </div>
      )}

      {tab === "connections" && (
        <div style={card}>
          <div style={h2s}>🔗 Conexiones con otros temas</div>
          <p style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>Para añadir nuevas, ve a la pestaña "Conexiones".</p>
          {myConnections.length === 0 ? <p style={{ color: MUTED, fontSize: 13, textAlign: "center", padding: 20 }}>Sin conexiones todavía.</p> :
            myConnections.map(c => {
              const otherNumber = c.fromNumber === topic.number ? c.toNumber : c.fromNumber;
              const other = topics.find(t => t.number === otherNumber);
              if (!other) return null;
              const isOut = c.fromNumber === topic.number;
              return (
                <div key={c.id} style={{ background: BG, borderRadius: 8, padding: 12, marginBottom: 8, borderLeft: `3px solid ${isOut ? ACCENT : BLUE}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12, flexWrap: "wrap" }}>
                    <span style={{ color: MUTED }}>{isOut ? "Hacia →" : "← Desde"}</span>
                    <span style={tag(isOut ? BLUE : ACCENT)}>T.{other.number}</span>
                    <span style={{ fontSize: 11, color: MUTED }}>{other.name.substring(0, 60)}</span>
                    <span style={{ ...tag(c.auto ? BLUE : GREEN), fontSize: 10 }}>{c.auto ? "🤖 IA" : "✍️ Manual"}</span>
                  </div>
                  <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.6 }}>{c.description}</div>
                </div>
              );
            })
          }
        </div>
      )}
    </div>
  );
}

function Review({ topics, onUpdate }) {
  const [mode, setMode] = useState("picker");
  const [selTopics, setSelTopics] = useState([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [cards, setCards] = useState([]);
  const [idx, setIdx] = useState(0);
  const [showAns, setShowAns] = useState(false);
  const [writtenAnswer, setWrittenAnswer] = useState("");
  const [selectedOption, setSelectedOption] = useState(null);
  const [stats, setStats] = useState({ correct: 0, wrong: 0 });
  const studied = topics.filter(t => t.studied && (t.questions || []).length > 0);
  const today = todayStr();

  function matchesType(q) {
    const t = q.type || "test";
    if (typeFilter === "all") return true;
    return typeFilter === t;
  }

  let dueCount = 0; let dueTests = 0; let dueCards = 0;
  topics.forEach(t => { (t.questions || []).forEach(q => { if (!q.nextReview || q.nextReview <= today) { dueCount++; if ((q.type || "test") === "test") dueTests++; else dueCards++; } }); });

  function startSession(tIds) {
    const cs = [];
    tIds.forEach(id => {
      const t = topics.find(x => x.id === id);
      if (!t) return;
      (t.questions || []).forEach(q => { if (!matchesType(q)) return; if (!q.nextReview || q.nextReview <= today) cs.push({ ...q, topicId: id, topicName: t.name }); });
    });
    cs.sort(() => Math.random() - 0.5);
    if (cs.length === 0) { alert("No hay preguntas pendientes."); return; }
    setCards(cs); setIdx(0); setShowAns(false); setWrittenAnswer(""); setSelectedOption(null); setStats({ correct: 0, wrong: 0 }); setMode("session");
  }

  function answer(correct) {
    const c = cards[idx];
    const t = topics.find(x => x.id === c.topicId);
    if (t) { const upd = scheduleQuestion(c, correct); onUpdate(t.id, { questions: (t.questions || []).map(q => q.id === c.id ? { ...q, ...upd } : q) }); }
    setStats({ correct: stats.correct + (correct ? 1 : 0), wrong: stats.wrong + (correct ? 0 : 1) });
    if (idx + 1 >= cards.length) setMode("results");
    else { setIdx(idx + 1); setShowAns(false); setWrittenAnswer(""); setSelectedOption(null); }
  }

  if (mode === "picker") {
    return (
      <div>
        <div style={h1s}>Sesión de repaso</div>
        <div style={card}>
          <div style={{ ...h2s, marginBottom: 10 }}>Tipo de preguntas</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn(typeFilter === "all" ? ACCENT : BG, typeFilter === "all" ? "white" : MUTED)} onClick={() => setTypeFilter("all")}>Todas ({dueCount})</button>
            <button style={btn(typeFilter === "test" ? GREEN : BG, typeFilter === "test" ? "white" : MUTED)} onClick={() => setTypeFilter("test")}>📝 Test ({dueTests})</button>
            <button style={btn(typeFilter === "card" ? BLUE : BG, typeFilter === "card" ? "white" : MUTED)} onClick={() => setTypeFilter("card")}>🃏 Tarjetas ({dueCards})</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          <div style={{ ...card, marginBottom: 0, cursor: "pointer", textAlign: "center" }} onClick={() => startSession(studied.map(t => t.id))}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🌐</div>
            <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Total</div>
            <div style={{ color: MUTED, fontSize: 12 }}>Todos los estudiados</div>
          </div>
          <div style={{ ...card, marginBottom: 0, cursor: "pointer", textAlign: "center" }} onClick={() => startSession(selTopics)}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🎯</div>
            <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Selección</div>
            <div style={{ color: MUTED, fontSize: 12 }}>Elige temas abajo</div>
          </div>
          <div style={{ ...card, marginBottom: 0, textAlign: "center", background: ACCENT + "12" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
            <div style={{ fontWeight: 500, fontSize: 14 }}>Pendientes hoy</div>
            <div style={{ color: MUTED, fontSize: 12 }}>{typeFilter === "all" ? dueCount : typeFilter === "test" ? dueTests : dueCards}</div>
          </div>
        </div>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={h2s}>Selecciona temas</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={btn(BLUE)} onClick={() => setSelTopics(studied.map(t => t.id))}>Todos</button>
              <button style={btn(BG, MUTED)} onClick={() => setSelTopics([])}>Ninguno</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 6, marginBottom: 12 }}>
            {studied.map(t => {
              const isSel = selTopics.includes(t.id);
              let due = 0;
              (t.questions || []).forEach(q => { if (matchesType(q) && (!q.nextReview || q.nextReview <= today)) due++; });
              return (
                <div key={t.id} onClick={() => setSelTopics(p => isSel ? p.filter(id => id !== t.id) : [...p, t.id])} style={{ ...card, marginBottom: 0, padding: 8, cursor: "pointer", borderColor: isSel ? ACCENT : BORDER, background: isSel ? ACCENT + "12" : CARD, textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 500 }}>T.{t.number}</div>
                  {due > 0 && <div style={{ fontSize: 10, color: YELLOW }}>{due}↑</div>}
                </div>
              );
            })}
          </div>
          <button style={btn(GREEN)} onClick={() => startSession(selTopics)} disabled={selTopics.length === 0}>▶ Iniciar ({selTopics.length})</button>
        </div>
      </div>
    );
  }

  if (mode === "results") {
    const total = stats.correct + stats.wrong;
    const pct = total ? Math.round(stats.correct / total * 100) : 0;
    return (
      <div style={{ textAlign: "center", paddingTop: 30 }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>{pct >= 70 ? "🎉" : pct >= 40 ? "💪" : "📖"}</div>
        <div style={h1s}>Completada</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ ...card, marginBottom: 0, minWidth: 100 }}><div style={{ fontSize: 28, fontWeight: 500, color: GREEN }}>{stats.correct}</div><div style={{ fontSize: 12, color: MUTED }}>Aciertos</div></div>
          <div style={{ ...card, marginBottom: 0, minWidth: 100 }}><div style={{ fontSize: 28, fontWeight: 500, color: RED }}>{stats.wrong}</div><div style={{ fontSize: 12, color: MUTED }}>Fallos</div></div>
          <div style={{ ...card, marginBottom: 0, minWidth: 100 }}><div style={{ fontSize: 28, fontWeight: 500, color: ACCENT }}>{pct}%</div><div style={{ fontSize: 12, color: MUTED }}>Precisión</div></div>
        </div>
        <button style={btn()} onClick={() => setMode("picker")}>Nueva sesión</button>
      </div>
    );
  }

  const c = cards[idx];
  const isCard = c.type === "card";
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <button style={btn(BG, MUTED)} onClick={() => setMode("picker")}>✕ Salir</button>
        <span style={{ fontSize: 13, color: MUTED }}>{idx + 1}/{cards.length} · <span style={{ color: GREEN }}>✓{stats.correct}</span> <span style={{ color: RED }}>✗{stats.wrong}</span></span>
        <span style={{ fontSize: 11, color: MUTED, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.topicName}</span>
      </div>
      <div style={{ background: BORDER, borderRadius: 20, height: 5, marginBottom: 16 }}>
        <div style={{ width: `${(idx / cards.length) * 100}%`, height: "100%", background: ACCENT, borderRadius: 20 }} />
      </div>
      <div style={{ ...card, minHeight: 180, borderLeft: `4px solid ${isCard ? BLUE : GREEN}` }}>
        <div style={{ marginBottom: 10 }}><span style={tag(isCard ? BLUE : GREEN)}>{isCard ? "🃏 Tarjeta" : "📝 Test"}</span></div>
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 20, lineHeight: 1.6, color: TEXT }}>{c.q}</div>
        {!showAns ? (
          <div>
            {isCard ? (
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 12, color: MUTED, marginBottom: 10, fontStyle: "italic" }}>Escribe tu respuesta y luego comparala con la tarjeta.</p>
                <textarea
                  style={{ ...inp, minHeight: 110, resize: "vertical", marginBottom: 14, textAlign: "left" }}
                  value={writtenAnswer}
                  onChange={e => setWrittenAnswer(e.target.value)}
                  placeholder="Escribe aqui tu respuesta..."
                />
                <button style={{ ...btn(ACCENT), padding: "10px 24px" }} onClick={() => setShowAns(true)}>Comparar respuesta</button>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 12, color: MUTED, marginBottom: 10, fontStyle: "italic" }}>Selecciona la respuesta que creas correcta y luego revela.</p>
                {(c.options || []).map((opt, i) => {
                  const sel = selectedOption === i;
                  return (
                    <div key={i} onClick={() => setSelectedOption(i)} style={{ background: sel ? ACCENT + "20" : BG, border: `0.5px solid ${sel ? ACCENT : BORDER}`, borderRadius: 8, padding: "10px 14px", marginBottom: 7, fontSize: 13, cursor: "pointer", color: sel ? ACCENT : TEXT, fontWeight: sel ? 500 : 400 }}>
                      {String.fromCharCode(65 + i)}) {opt}
                    </div>
                  );
                })}
                <div style={{ textAlign: "center", marginTop: 14 }}>
                  <button style={{ ...btn(ACCENT), padding: "10px 24px" }} onClick={() => setShowAns(true)}>Revelar respuesta</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            {isCard ? (
              <div>
                <div style={{ fontSize: 11, color: BLUE, fontWeight: 500, marginBottom: 6 }}>COMPARA TU RESPUESTA</div>
                <div style={{ background: BG, border: `0.5px solid ${BORDER}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: MUTED, fontWeight: 500, marginBottom: 6 }}>TU RESPUESTA</div>
                  <div style={{ fontSize: 14, color: TEXT, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{writtenAnswer.trim() || "No has escrito respuesta."}</div>
                </div>
                <div style={{ fontSize: 11, color: BLUE, fontWeight: 500, marginBottom: 6 }}>RESPUESTA DE LA TARJETA</div>
                <div style={{ fontSize: 14, color: TEXT, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{c.answer}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 10 }}>
                  Si fallas volvera en 1 semana. Si aciertas: 2 semanas la primera vez, 4 la segunda y 8 a partir de la tercera.
                </div>
              </div>
            ) : (
              <div>
                {(c.options || []).map((opt, i) => {
                  const isCorrect = i === c.correct;
                  const isSelected = i === selectedOption;
                  const wrongSelected = isSelected && !isCorrect;
                  return (
                    <div key={i} style={{ background: isCorrect ? GREEN + "20" : wrongSelected ? RED + "20" : BG, border: `0.5px solid ${isCorrect ? GREEN : wrongSelected ? RED : BORDER}`, borderRadius: 8, padding: "8px 14px", marginBottom: 7, fontSize: 13, color: isCorrect ? GREEN : wrongSelected ? RED : MUTED, fontWeight: isCorrect || isSelected ? 500 : 400 }}>
                      {isCorrect ? "✓" : isSelected ? "✗" : "—"} {String.fromCharCode(65 + i)}) {opt}
                    </div>
                  );
                })}
              </div>
            )}
            <p style={{ fontSize: 12, color: MUTED, textAlign: "center", marginBottom: 10, marginTop: 14 }}>¿La sabías?</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button style={{ ...btn(RED), padding: "10px 28px", fontSize: 15 }} onClick={() => answer(false)}>✗ No la sabía</button>
              <button style={{ ...btn(GREEN), padding: "10px 28px", fontSize: 15 }} onClick={() => answer(true)}>✓ La sabía</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ExamSimulator({ topics, examBank, saveExamBank, examHistory, saveExamHistory }) {
  const [mode, setMode] = useState("home");
  const [uploading, setUploading] = useState(false);
  const [config, setConfig] = useState({ total: 45, mixOwn: 50, minutes: 90 });
  const [session, setSession] = useState(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState(null);
  const fileRef = useRef();
  const ownQuestions = [];
  topics.forEach(t => { (t.questions || []).forEach(q => { if ((q.type || "test") === "test") ownQuestions.push({ ...q, source: "propias", topicName: t.name }); }); });
  const totalBankQs = examBank.reduce((s, e) => s + e.questions.filter(q => q.correct !== -1).length, 0);

  function finishExam() {
    if (!session) return;
    let correct = 0; let wrong = 0; let blank = 0;
    const detail = session.questions.map((q, i) => {
      const ans = answers[i];
      if (ans === undefined) { blank++; return { ...q, userAnswer: null, result: "blank" }; }
      if (ans === q.correct) { correct++; return { ...q, userAnswer: ans, result: "correct" }; }
      wrong++; return { ...q, userAnswer: ans, result: "wrong" };
    });
    const score = correct - wrong / 4;
    const scoreOn10 = Math.max(0, Math.round(score / session.questions.length * 100) / 10);
    const record = { id: Date.now().toString(), date: todayStr(), config: session.config, total: session.questions.length, correct, wrong, blank, rawScore: Math.round(score * 100) / 100, scoreOn10, durationSeconds: Math.round((Date.now() - session.startTime) / 1000), questionsDetail: detail };
    saveExamHistory([record, ...examHistory]);
    setResult(record); setMode("result");
  }

  useEffect(() => {
    if (mode !== "session") return;
    const i = setInterval(() => { setTimeLeft(tl => { if (tl <= 1) { clearInterval(i); finishExam(); return 0; } return tl - 1; }); }, 1000);
    return () => clearInterval(i);
  }, [mode]);

  async function handlePDFUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    try {
      const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
      const prompt = "Extrae TODAS las preguntas tipo test del PDF. Para cada una: enunciado, 4 opciones (A,B,C,D), respuesta correcta (índice 0-3, -1 si no se sabe). Responde SOLO JSON válido sin markdown:\n[{\"q\":\"Enunciado\",\"options\":[\"A\",\"B\",\"C\",\"D\"],\"correct\":0}]";
      const result = await callClaudePDF(b64, prompt, "Responde SIEMPRE con JSON válido.");
      const extracted = JSON.parse(result.replace(/```json|```/g, "").trim());
      const newExam = { id: Date.now().toString(), name: file.name.replace(".pdf", ""), date: todayStr(), questions: extracted.map((q, i) => ({ ...q, id: `${Date.now()}_${i}` })) };
      saveExamBank([...examBank, newExam]);
      alert(`✓ ${extracted.length} preguntas extraídas.`);
    } catch (err) { alert("Error: " + err.message); }
    setUploading(false); e.target.value = "";
  }

  function startExam() {
    const nOwn = Math.round(config.total * config.mixOwn / 100);
    const nBank = config.total - nOwn;
    if (nOwn > ownQuestions.length) { alert(`Solo tienes ${ownQuestions.length} preguntas propias.`); return; }
    if (nBank > totalBankQs) { alert(`Solo tienes ${totalBankQs} preguntas en el banco.`); return; }
    const ownSample = ownQuestions.slice().sort(() => Math.random() - 0.5).slice(0, nOwn);
    const allBank = [];
    examBank.forEach(e => e.questions.forEach(q => { if (q.correct !== -1) allBank.push({ ...q, source: e.name }); }));
    const bankSample = allBank.sort(() => Math.random() - 0.5).slice(0, nBank);
    const all = [...ownSample, ...bankSample].sort(() => Math.random() - 0.5);
    setSession({ questions: all, config: { ...config }, startTime: Date.now() });
    setAnswers({}); setIdx(0); setTimeLeft(config.minutes * 60); setMode("session");
  }

  if (mode === "session" && session) {
    const q = session.questions[idx];
    const mm = Math.floor(timeLeft / 60); const ss = timeLeft % 60;
    const timeColor = timeLeft < 300 ? RED : timeLeft < 900 ? YELLOW : ACCENT;
    const answered = Object.keys(answers).length;
    return (
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, padding: 12, background: CARD, border: `0.5px solid ${BORDER}`, borderRadius: 12 }}>
          <div><div style={{ fontSize: 11, color: MUTED }}>Pregunta</div><div style={{ fontSize: 18, fontWeight: 500 }}>{idx + 1}/{session.questions.length}</div></div>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 11, color: MUTED }}>Tiempo</div><div style={{ fontSize: 22, fontWeight: 500, color: timeColor, fontFamily: "monospace" }}>{mm}:{ss < 10 ? "0" : ""}{ss}</div></div>
          <div style={{ textAlign: "right" }}><div style={{ fontSize: 11, color: MUTED }}>Respondidas</div><div style={{ fontSize: 18, fontWeight: 500 }}>{answered}/{session.questions.length}</div></div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 8 }}>Fuente: {q.source}</div>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16, lineHeight: 1.6 }}>{idx + 1}. {q.q}</div>
          {(q.options || []).map((opt, i) => {
            const sel = answers[idx] === i;
            return (
              <div key={i} onClick={() => setAnswers({ ...answers, [idx]: i })} style={{ background: sel ? ACCENT + "20" : BG, border: `0.5px solid ${sel ? ACCENT : BORDER}`, borderRadius: 8, padding: "10px 14px", marginBottom: 7, fontSize: 13, cursor: "pointer", color: sel ? ACCENT : TEXT }}>
                {String.fromCharCode(65 + i)}) {opt}
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={btn(BG, MUTED)} onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}>← Anterior</button>
            {answers[idx] !== undefined && <button style={btn(BG, MUTED)} onClick={() => { const a = { ...answers }; delete a[idx]; setAnswers(a); }}>Borrar</button>}
            <div style={{ flex: 1 }} />
            {idx < session.questions.length - 1 ? <button style={btn()} onClick={() => setIdx(idx + 1)}>Siguiente →</button> :
              <button style={btn(GREEN)} onClick={() => { if (confirm(`¿Finalizar? ${answered}/${session.questions.length} respondidas.`)) finishExam(); }}>✓ Finalizar</button>}
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>Navegación:</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(15, 1fr)", gap: 4 }}>
            {session.questions.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)} style={{ background: i === idx ? ACCENT : answers[i] !== undefined ? GREEN + "40" : BG, color: i === idx ? "white" : answers[i] !== undefined ? GREEN : MUTED, border: `0.5px solid ${BORDER}`, borderRadius: 4, padding: "4px 0", fontSize: 10, cursor: "pointer" }}>{i + 1}</button>
            ))}
          </div>
        </div>
        <button style={{ ...btn(RED), marginTop: 8 }} onClick={() => { if (confirm("¿Abandonar?")) { setMode("home"); setSession(null); } }}>✕ Abandonar</button>
      </div>
    );
  }

  if (mode === "result" && result) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>{result.scoreOn10 >= 5 ? "🎉" : result.scoreOn10 >= 3 ? "💪" : "📖"}</div>
          <div style={h1s}>Simulacro completado</div>
          <div style={{ fontSize: 36, fontWeight: 500, color: result.scoreOn10 >= 5 ? GREEN : result.scoreOn10 >= 3 ? YELLOW : RED }}>{result.scoreOn10}/10</div>
          <div style={{ fontSize: 13, color: MUTED }}>Puntuación bruta: {result.rawScore} sobre {result.total}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
          {[{v:result.correct,c:GREEN,l:"Aciertos"},{v:result.wrong,c:RED,l:"Fallos"},{v:result.blank,c:MUTED,l:"Blanco"},{v:Math.round(result.durationSeconds/60)+"min",c:ACCENT,l:"Duración"}].map((s,i) => (
            <div key={i} style={{ ...card, textAlign: "center", marginBottom: 0, padding: 14 }}><div style={{ fontSize: 22, fontWeight: 500, color: s.c }}>{s.v}</div><div style={{ fontSize: 11, color: MUTED }}>{s.l}</div></div>
          ))}
        </div>
        <div style={card}>
          <div style={h2s}>Revisión</div>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {result.questionsDetail.map((q, i) => {
              const color = q.result === "correct" ? GREEN : q.result === "wrong" ? RED : MUTED;
              return (
                <div key={i} style={{ borderLeft: `3px solid ${color}`, padding: "10px 12px", marginBottom: 8, background: BG, borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>{i + 1} · {q.source} · {q.result === "correct" ? "✓ Acierto" : q.result === "wrong" ? "✗ Fallo" : "— Blanco"}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{q.q}</div>
                  {(q.options || []).map((opt, oi) => (
                    <div key={oi} style={{ fontSize: 12, marginLeft: 8, lineHeight: 1.6, color: oi === q.correct ? GREEN : oi === q.userAnswer ? RED : MUTED }}>
                      {oi === q.correct ? "✓" : oi === q.userAnswer ? "✗" : "-"} {String.fromCharCode(65 + oi)}) {opt}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <button style={btn()} onClick={() => { setMode("home"); setSession(null); setResult(null); }}>🏠 Volver</button>
      </div>
    );
  }

  return (
    <div>
      <div style={h1s}>📝 Simulacro tipo test</div>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div><div style={h2s}>📚 Banco de exámenes anteriores</div><div style={{ fontSize: 11, color: MUTED }}>{totalBankQs} preguntas en {examBank.length} exámenes</div></div>
          <button style={btn(BLUE)} onClick={() => fileRef.current.click()} disabled={uploading}>{uploading ? "Procesando..." : "📤 Subir PDF"}</button>
          <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={handlePDFUpload} />
        </div>
        {examBank.length === 0 ? <p style={{ color: MUTED, fontSize: 13 }}>Sube PDFs de exámenes anteriores.</p> :
          examBank.map(e => (
            <div key={e.id} style={{ background: BG, borderRadius: 8, padding: 10, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div style={{ fontSize: 13, fontWeight: 500 }}>📄 {e.name}</div><div style={{ fontSize: 11, color: MUTED }}>{e.date} · {e.questions.filter(q => q.correct !== -1).length} preguntas</div></div>
              <button style={{ ...btn(RED), padding: "3px 8px", fontSize: 11 }} onClick={() => { if (confirm("¿Eliminar?")) saveExamBank(examBank.filter(x => x.id !== e.id)); }}>✕</button>
            </div>
          ))
        }
      </div>
      <div style={card}>
        <div style={h2s}>⚙️ Configurar simulacro</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div><label style={lbl}>Número de preguntas</label><input type="number" min={5} max={100} style={inp} value={config.total} onChange={e => setConfig(p => ({ ...p, total: parseInt(e.target.value) || 45 }))} /></div>
          <div><label style={lbl}>Tiempo (minutos)</label><input type="number" min={10} max={240} style={inp} value={config.minutes} onChange={e => setConfig(p => ({ ...p, minutes: parseInt(e.target.value) || 90 }))} /></div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={lbl}>Mezcla: {config.mixOwn}% propias · {100 - config.mixOwn}% banco</label>
            <input type="range" min={0} max={100} step={10} style={{ width: "100%" }} value={config.mixOwn} onChange={e => setConfig(p => ({ ...p, mixOwn: parseInt(e.target.value) }))} />
          </div>
        </div>
        <button style={btn(GREEN)} onClick={startExam} disabled={config.total < 5}>▶ Iniciar simulacro</button>
      </div>
      {examHistory.length > 0 && (
        <div style={card}>
          <div style={h2s}>📊 Histórico ({examHistory.length})</div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {examHistory.map(h => (
              <div key={h.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr 1fr auto", gap: 10, alignItems: "center", padding: "8px 10px", background: BG, borderRadius: 6, marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: MUTED }}>{h.date}</span>
                <span><strong style={{ color: h.scoreOn10 >= 5 ? GREEN : h.scoreOn10 >= 3 ? YELLOW : RED, fontSize: 14 }}>{h.scoreOn10}/10</strong></span>
                <span style={{ color: GREEN }}>✓ {h.correct}</span>
                <span style={{ color: RED }}>✗ {h.wrong}</span>
                <span style={{ color: MUTED }}>— {h.blank}</span>
                <button style={{ ...btn(RED), padding: "2px 7px", fontSize: 11 }} onClick={() => saveExamHistory(examHistory.filter(x => x.id !== h.id))}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Connections({ topics, connections, saveConnections }) {
  const [filter, setFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newC, setNewC] = useState({ from: "", to: "", description: "" });
  const [generating, setGenerating] = useState(null);

  async function generateForTopic(topic) {
    setGenerating(topic.id);
    try {
      const list = topics.filter(t => t.id !== topic.id).map(t => `${t.number}. ${t.name.substring(0, 80)}`).join("\n");
      const prompt = `Para "${topic.name}" de TCEE, identifica 5-8 conexiones con otros temas del temario.\n\nTEMAS:\n${list}\n\nResponde SOLO JSON:\n[{"toNumber": 6, "description": "Explicación 1-2 frases"}]`;
      const result = await callClaude([{ role: "user", content: prompt }], "Experto TCEE. Responde SIEMPRE JSON válido.");
      const parsed = JSON.parse(result.replace(/```json|```/g, "").trim());
      const newConnections = parsed.map(c => ({ id: `${Date.now()}_${c.toNumber}_${Math.random().toString(36).substr(2, 5)}`, fromNumber: topic.number, toNumber: c.toNumber, description: c.description, auto: true, date: todayStr() })).filter(c => topics.some(t => t.number === c.toNumber));
      saveConnections([...connections, ...newConnections]);
    } catch (err) { alert("Error: " + err.message); }
    setGenerating(null);
  }

  function addManual() {
    const fromN = parseInt(newC.from); const toN = parseInt(newC.to);
    if (!fromN || !toN || !newC.description.trim()) { alert("Completa todos los campos."); return; }
    if (fromN === toN || !topics.find(t => t.number === fromN) || !topics.find(t => t.number === toN)) { alert("Números inválidos."); return; }
    saveConnections([...connections, { id: Date.now().toString(), fromNumber: fromN, toNumber: toN, description: newC.description, auto: false, date: todayStr() }]);
    setNewC({ from: "", to: "", description: "" }); setShowAdd(false);
  }

  const filtered = connections.filter(c => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    const from = topics.find(t => t.number === c.fromNumber); const to = topics.find(t => t.number === c.toNumber);
    return (from && from.name.toLowerCase().includes(f)) || (to && to.name.toLowerCase().includes(f)) || c.description.toLowerCase().includes(f) || String(c.fromNumber).includes(f) || String(c.toNumber).includes(f);
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ ...h1s, marginBottom: 0, flex: 1 }}>Conexiones ({connections.length})</div>
        <input style={{ ...inp, width: 220 }} placeholder="Buscar..." value={filter} onChange={e => setFilter(e.target.value)} />
        <button style={btn(ACCENT)} onClick={() => setShowAdd(!showAdd)}>{showAdd ? "Cerrar" : "+ Manual"}</button>
      </div>
      {showAdd && (
        <div style={card}>
          <div style={h2s}>Nueva conexión manual</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
            <div><label style={lbl}>Tema origen (número)</label><input type="number" min={1} max={90} style={inp} value={newC.from} onChange={e => setNewC(p => ({ ...p, from: e.target.value }))} placeholder="Ej: 43" /></div>
            <div><label style={lbl}>Tema destino (número)</label><input type="number" min={1} max={90} style={inp} value={newC.to} onChange={e => setNewC(p => ({ ...p, to: e.target.value }))} placeholder="Ej: 44" /></div>
          </div>
          <label style={lbl}>Descripción</label>
          <textarea style={{ ...inp, minHeight: 70, resize: "vertical", marginBottom: 10 }} value={newC.description} onChange={e => setNewC(p => ({ ...p, description: e.target.value }))} placeholder="Describe la conexión..." />
          <button style={btn(GREEN)} onClick={addManual}>Guardar</button>
        </div>
      )}
      <div style={card}>
        <div style={h2s}>Generar con IA</div>
        <p style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>Clic en un tema para generar 5-8 conexiones automáticas.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 4 }}>
          {topics.map(t => {
            const hasConn = connections.some(c => c.fromNumber === t.number);
            return (
              <button key={t.id} onClick={() => generateForTopic(t)} disabled={generating === t.id} title={t.name} style={{ background: generating === t.id ? BLUE : hasConn ? BLUE + "30" : BG, color: generating === t.id ? "white" : hasConn ? BLUE : MUTED, border: `0.5px solid ${BORDER}`, borderRadius: 4, padding: "5px 0", fontSize: 11, cursor: generating === t.id ? "wait" : "pointer" }}>
                {generating === t.id ? "..." : t.number}
              </button>
            );
          })}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div style={card}><p style={{ color: MUTED, fontSize: 13, textAlign: "center", padding: 20 }}>{connections.length === 0 ? "Sin conexiones." : "Sin resultados."}</p></div>
      ) : (
        filtered.map(c => {
          const from = topics.find(t => t.number === c.fromNumber); const to = topics.find(t => t.number === c.toNumber);
          if (!from || !to) return null;
          return (
            <div key={c.id} style={{ ...card, marginBottom: 8, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={tag(ACCENT)}>T.{from.number}</span><span style={{ color: MUTED, fontSize: 12 }}>{from.name.substring(0, 35)}</span>
                    <span style={{ color: BLUE, fontSize: 14 }}>→</span>
                    <span style={tag(BLUE)}>T.{to.number}</span><span style={{ color: MUTED, fontSize: 12 }}>{to.name.substring(0, 35)}</span>
                    <span style={{ ...tag(c.auto ? BLUE : GREEN), fontSize: 10 }}>{c.auto ? "🤖 IA" : "✍️ Manual"}</span>
                  </div>
                  <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.6 }}>{c.description}</div>
                </div>
                <button onClick={() => saveConnections(connections.filter(x => x.id !== c.id))} style={{ background: RED, color: "white", border: "none", padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, flexShrink: 0 }}>Eliminar</button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function Progress({ topics, settings, examHistory }) {
  const studied = topics.filter(t => t.studied);
  let totalQs = 0; let totalAns = 0; let totalHits = 0;
  topics.forEach(t => { totalQs += (t.questions || []).length; (t.questions || []).forEach(q => { totalAns += (q.hits || 0) + (q.misses || 0); totalHits += (q.hits || 0); }); });
  const thr = (settings.criteria && settings.criteria.threshold) || 80;
  const mastered = studied.filter(t => (topicMastery(t) || 0) >= thr);
  const ranked = studied.map(t => ({ ...t, m: topicMastery(t) || 0 })).sort((a, b) => a.m - b.m);
  const withSessions = topics.filter(t => (t.studySessions || []).length > 0);
  const totalSessions = withSessions.reduce((s, t) => s + t.studySessions.length, 0);

  function shortName(t) { const p = t.name.split(". "); return p.length > 1 ? p.slice(1).join(". ").substring(0, 28) : t.name.substring(0, 28); }

  return (
    <div>
      <div style={h1s}>Progreso</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 16 }}>
        {[{l:"Estudiados",v:`${studied.length}/90`,c:ACCENT},{l:"Dominados",v:mastered.length,c:GREEN},{l:"Preguntas",v:totalQs,c:BLUE},{l:"% aciertos",v:totalAns?`${Math.round(totalHits/totalAns*100)}%`:"—",c:YELLOW}].map((s,i) => (
          <div key={i} style={{ ...card, textAlign: "center", marginBottom: 0, padding: 14 }}><div style={{ fontSize: 22, fontWeight: 500, color: s.c }}>{s.v}</div><div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{s.l}</div></div>
        ))}
      </div>
      {examHistory && examHistory.length > 0 && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={h2s}>Evolución simulacros</div>
            <div style={{ fontSize: 12, color: MUTED }}>Media: <strong style={{ color: ACCENT }}>{Math.round(examHistory.reduce((s,h)=>s+h.scoreOn10,0)/examHistory.length*10)/10}/10</strong></div>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 60 }}>
            {examHistory.slice(0, 10).reverse().map(h => (
              <div key={h.id} title={`${h.date}: ${h.scoreOn10}/10`} style={{ flex: 1, background: h.scoreOn10 >= 5 ? GREEN : h.scoreOn10 >= 3 ? YELLOW : RED, height: Math.max(5, h.scoreOn10 / 10 * 60), borderRadius: 4, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 2 }}>
                <span style={{ fontSize: 9, color: "white", fontWeight: 500 }}>{h.scoreOn10}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {totalSessions > 0 && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={h2s}>Sesiones de estudio</div>
            <div style={{ fontSize: 13, color: MUTED }}>Total: <strong style={{ color: ACCENT }}>{totalSessions}</strong></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 8, fontWeight: 500 }}>Más estudiados</div>
              {withSessions.slice().sort((a,b)=>b.studySessions.length-a.studySessions.length).slice(0,5).map(t => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `0.5px solid ${BORDER}` }}>
                  <span style={{ fontSize: 12 }}>T.{t.number} {shortName(t)}</span>
                  <span style={{ color: ACCENT, fontSize: 13, fontWeight: 500 }}>{t.studySessions.length}x</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 8, fontWeight: 500 }}>Poco repasados</div>
              {studied.filter(t=>(t.studySessions||[]).length<=1).slice(0,5).map(t => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `0.5px solid ${BORDER}` }}>
                  <span style={{ fontSize: 12 }}>T.{t.number} {shortName(t)}</span>
                  <span style={{ color: (t.studySessions||[]).length===0?RED:YELLOW, fontSize: 13, fontWeight: 500 }}>{(t.studySessions||[]).length}x</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div style={card}><div style={h2s}>Necesitan refuerzo</div>{ranked.slice(0,5).map(t=><div key={t.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`0.5px solid ${BORDER}`}}><span style={{fontSize:12}}>T.{t.number} {shortName(t)}</span><span style={{color:RED,fontSize:13,fontWeight:500}}>{t.m}%</span></div>)}</div>
        <div style={card}><div style={h2s}>Mejor dominados</div>{ranked.slice(-5).reverse().map(t=><div key={t.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`0.5px solid ${BORDER}`}}><span style={{fontSize:12}}>T.{t.number} {shortName(t)}</span><span style={{color:GREEN,fontSize:13,fontWeight:500}}>{t.m}%</span></div>)}</div>
      </div>
      <div style={card}>
        <div style={h2s}>Mapa de dominio</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(10, minmax(0, 1fr))", gap: 4 }}>
          {Array.from({ length: 90 }, (_, i) => i + 1).map(n => {
            const t = topics.find(x => x.number === n); const m = t ? topicMastery(t) : null;
            const color = !t || !t.studied ? BORDER : m === null ? MUTED : m >= thr ? GREEN : m >= 50 ? YELLOW : RED;
            return <div key={n} title={`T${n}: ${m!==null?m+"%":"—"}`} style={{ background: color, borderRadius: 4, padding: "5px 0", textAlign: "center", fontSize: 10, color: "white", fontWeight: 500, opacity: t&&t.studied?1:0.35 }}>{n}</div>;
          })}
        </div>
      </div>
    </div>
  );
}

function WeeklyPlan({ topics, settings, onSaveSettings, setTopics }) {
  const [planData, setPlanData] = useState(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [crit, setCrit] = useState(settings.criteria || DEF_SETTINGS.criteria);
  const [examDate, setExamDate] = useState(settings.examDate || "");
  const [weeklyNew, setWeeklyNew] = useState(settings.weeklyNew || 2);

  var studied = topics.filter(function(t) { return t.studied; });
  var pending = topics.filter(function(t) { return !t.studied; });
  var weeksLeft = examDate ? Math.ceil(daysBetween(todayStr(), examDate) / 7) : null;
  var weeksNeeded = Math.ceil(pending.length / weeklyNew);
  var onTrack = weeksLeft !== null ? weeksLeft >= weeksNeeded : null;

  function getCurrentSunday() {
    var d = new Date(); var day = d.getDay();
    d.setDate(d.getDate() - day);
    return d.toISOString().split('T')[0];
  }

  function getSuggestedTaskTopics() {
    var studiedSorted = studied.slice().sort(function(a, b) {
      var dateA = a.firstStudyDate || "2099-01-01"; var dateB = b.firstStudyDate || "2099-01-01";
      return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
    });
    var result = [];
    for (var i = 0; i < studiedSorted.length && result.length < 4; i++) result.push(studiedSorted[i].number);
    return result;
  }

  function createWeekPlan(sunday, carryOverTasks) {
    var suggested = getSuggestedTaskTopics();
    var newTasks = [];
    for (var i = 0; i < 4; i++) {
      newTasks.push({ id: sunday + "_task_" + i, topicNumber: suggested[i] || 1, type: i % 2 === 0 ? "test" : "card", done: false, fromWeek: sunday });
    }
    return { weekStart: sunday, newTopics: [0, 0], topicsChecked: [false, false], tasks: (carryOverTasks || []).concat(newTasks) };
  }

  useEffect(function() {
    (async function() {
      var saved = await store.get("opos:weekPlan");
      var sunday = getCurrentSunday();
      if (!saved) {
        var plan = createWeekPlan(sunday, []);
        setPlanData(plan); store.set("opos:weekPlan", plan);
      } else if (saved.weekStart !== sunday) {
        var pendingTasks = (saved.tasks || []).filter(function(t) { return !t.done; });
        pendingTasks.forEach(function(t) { t.fromWeek = t.fromWeek || saved.weekStart; });
        var plan2 = createWeekPlan(sunday, pendingTasks);
        setPlanData(plan2); store.set("opos:weekPlan", plan2);
      } else { setPlanData(saved); }
      setPlanLoading(false);
    })();
  }, []);

  function savePlan(p) { setPlanData(p); store.set("opos:weekPlan", p); }

  function setNewTopic(slotIdx, topicNumber) {
    var p = { ...planData, newTopics: planData.newTopics.slice() };
    p.newTopics[slotIdx] = topicNumber; savePlan(p);
  }

  function toggleTopicChecked(slotIdx) {
    var p = { ...planData, topicsChecked: planData.topicsChecked.slice() };
    var wasChecked = p.topicsChecked[slotIdx];
    p.topicsChecked[slotIdx] = !wasChecked; savePlan(p);
    if (!wasChecked && p.newTopics[slotIdx] > 0) {
      var tn = p.newTopics[slotIdx];
      var updated = topics.map(function(x) { return x.number === tn ? markTopicStudied(x, todayStr()) : x; });
      setTopics(updated); store.set("opos:topics", updated);
    }
  }

  function changeTaskTopic(taskId, newTopicNumber) {
    savePlan({ ...planData, tasks: planData.tasks.map(function(t) { return t.id === taskId ? { ...t, topicNumber: newTopicNumber } : t; }) });
  }

  function changeTaskType(taskId, newType) {
    savePlan({ ...planData, tasks: planData.tasks.map(function(t) { return t.id === taskId ? { ...t, type: newType } : t; }) });
  }

  function toggleTaskDone(taskId) {
    savePlan({ ...planData, tasks: planData.tasks.map(function(t) { return t.id === taskId ? { ...t, done: !t.done } : t; }) });
  }

  function removeTask(taskId) {
    savePlan({ ...planData, tasks: planData.tasks.filter(function(t) { return t.id !== taskId; }) });
  }

  function saveConfig() { onSaveSettings({ ...settings, criteria: crit, examDate: examDate || null, weeklyNew }); setEditing(false); }

  function reloadSyllabus() {
    if (!confirm("¿Recargar títulos oficiales TCEE manteniendo datos?")) return;
    var fresh = initTopics();
    var merged = fresh.map(function(f) {
      var ex = topics.find(function(t) { return t.number === f.number; });
      if (!ex) return f;
      return { ...f, studied: ex.studied, firstStudyDate: ex.firstStudyDate, initMastery: ex.initMastery, schemas: ex.schemas || [], questions: ex.questions || [], coverage: ex.coverage, studySessions: ex.studySessions || [], pdfs: ex.pdfs || [] };
    });
    setTopics(merged); store.set("opos:topics", merged);
  }

  function applyPresetAction() {
    if (!confirm("¿Marcar A.8-A.27 como estudiados?")) return;
    var updated = applyStudiedPreset(topics); setTopics(updated); store.set("opos:topics", updated);
  }

  if (planLoading) return <div style={{ color: MUTED, fontSize: 14, padding: 40, textAlign: "center" }}>Cargando plan...</div>;

  var carryOverTasks = planData.tasks.filter(function(t) { return t.fromWeek !== planData.weekStart && !t.done; });
  var thisWeekTasks = planData.tasks.filter(function(t) { return t.fromWeek === planData.weekStart; });
  var completedCount = planData.tasks.filter(function(t) { return t.done; }).length;

  // Shared task row renderer
  function TaskRow({ task, isCarryOver }) {
    var tp = topics.find(function(t) { return t.number === task.topicNumber; });
    var tName = tp ? tp.name.substring(0, 55) : "Tema " + task.topicNumber;
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 14, background: task.done ? GREEN + "10" : isCarryOver ? RED + "08" : BG, border: "0.5px solid " + (task.done ? GREEN + "40" : isCarryOver ? RED + "30" : BORDER), borderRadius: 8, marginBottom: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, alignItems: "center" }}>
          {/* Checkbox visual */}
          <div onClick={function() { toggleTaskDone(task.id); }} style={{ width: 24, height: 24, borderRadius: 6, background: task.done ? GREEN : "transparent", border: "2px solid " + (task.done ? GREEN : BORDER), cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {task.done && <span style={{ color: "white", fontSize: 14, fontWeight: 700, lineHeight: 1 }}>✓</span>}
          </div>
          {/* Marcar hecho button */}
          {!task.done && (
            <button onClick={function() { toggleTaskDone(task.id); }} style={{ background: GREEN, color: "white", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 10, fontWeight: 500, whiteSpace: "nowrap" }}>
              ✓ Hecho
            </button>
          )}
          {task.done && (
            <button onClick={function() { toggleTaskDone(task.id); }} style={{ background: BG, color: MUTED, border: `0.5px solid ${BORDER}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 10, whiteSpace: "nowrap" }}>
              Deshacer
            </button>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: task.done ? GREEN : TEXT, textDecoration: task.done ? "line-through" : "none" }}>Crear 15</span>
            <select value={task.type} onChange={function(e) { changeTaskType(task.id, e.target.value); }} disabled={task.done} style={{ background: BG, border: "0.5px solid " + BORDER, borderRadius: 6, padding: "2px 8px", fontSize: 12, color: TEXT, cursor: task.done ? "default" : "pointer" }}>
              <option value="test">preguntas test</option>
              <option value="card">tarjetas</option>
            </select>
            {isCarryOver && <span style={{ ...tag(RED), fontSize: 10 }}>↩ semana {task.fromWeek}</span>}
          </div>
          <select value={task.topicNumber} onChange={function(e) { changeTaskTopic(task.id, parseInt(e.target.value)); }} disabled={task.done} style={{ ...inp, fontSize: 12, padding: "4px 8px", cursor: task.done ? "default" : "pointer" }}>
            {studied.map(function(t) { return <option key={t.number} value={t.number}>T.{t.number} — {t.name.substring(0, 60)}</option>; })}
          </select>
          {isCarryOver && <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Arrastrada desde la semana del {task.fromWeek}</div>}
        </div>
        <button onClick={function() { removeTask(task.id); }} style={{ background: RED, color: "white", border: "none", padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, flexShrink: 0, alignSelf: "flex-start" }}>✕</button>
      </div>
    );
  }

  return (
    <div>
      <div style={h1s}>Plan de estudio semanal</div>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={h2s}>Configuración</div>
          <button style={btn(editing ? GREEN : BG, editing ? "white" : MUTED)} onClick={editing ? saveConfig : function() { setEditing(true); }}>{editing ? "Guardar" : "Editar"}</button>
        </div>
        {!editing ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[{l:"Fecha examen",v:examDate||"—"},{l:"Nuevos/semana",v:weeklyNew},{l:"Repasos/semana",v:crit.reviewPerWeek},{l:"Peso tiempo",v:crit.timeW+"%"},{l:"Peso dominio",v:crit.masteryW+"%"},{l:"Umbral dominio",v:crit.threshold+"%"}].map(function(s,i) {
              return <div key={i}><div style={lbl}>{s.l}</div><div style={{ color: TEXT, fontWeight: 500, fontSize: 14 }}>{s.v}</div></div>;
            })}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div><label style={lbl}>Fecha examen</label><input type="date" style={inp} value={examDate} onChange={function(e) { setExamDate(e.target.value); }} /></div>
            <div><label style={lbl}>Nuevos/semana</label><input type="number" min={1} max={7} style={inp} value={weeklyNew} onChange={function(e) { setWeeklyNew(parseInt(e.target.value)||1); }} /></div>
            <div><label style={lbl}>Repasos/semana</label><input type="number" min={1} max={10} style={inp} value={crit.reviewPerWeek} onChange={function(e) { setCrit({...crit,reviewPerWeek:parseInt(e.target.value)||1}); }} /></div>
            <div><label style={lbl}>Umbral (%)</label><input type="number" min={0} max={100} style={inp} value={crit.threshold} onChange={function(e) { setCrit({...crit,threshold:parseInt(e.target.value)||0}); }} /></div>
            <div><label style={lbl}>Peso tiempo: {crit.timeW}%</label><input type="range" min={0} max={100} step={5} style={{ width: "100%" }} value={crit.timeW} onChange={function(e) { var v=parseInt(e.target.value); setCrit({...crit,timeW:v,masteryW:100-v}); }} /></div>
            <div><label style={lbl}>Peso dominio: {crit.masteryW}%</label><input type="range" min={0} max={100} step={5} style={{ width: "100%" }} value={crit.masteryW} onChange={function(e) { var v=parseInt(e.target.value); setCrit({...crit,masteryW:v,timeW:100-v}); }} /></div>
          </div>
        )}
        {onTrack === false && !editing && <div style={{ marginTop: 12, padding: "8px 12px", background: RED+"15", border:"0.5px solid "+RED+"40", borderRadius:8, fontSize:12, color:RED }}>⚠️ Necesitas {weeksNeeded} semanas, quedan {weeksLeft}.</div>}
        {onTrack === true && !editing && <div style={{ marginTop: 12, padding: "8px 12px", background: GREEN+"15", border:"0.5px solid "+GREEN+"40", borderRadius:8, fontSize:12, color:GREEN }}>✅ Vas a tiempo ({weeksLeft} disponibles, {weeksNeeded} necesarias).</div>}
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={h2s}>Semana del {planData.weekStart}</div>
            <div style={{ fontSize: 12, color: MUTED }}>{completedCount}/{planData.tasks.length} tareas completadas{carryOverTasks.length > 0 ? ` · ${carryOverTasks.length} arrastradas` : ""}</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ background: BG, border: `0.5px solid ${BORDER}`, borderRadius: 20, height: 6, width: 120, overflow: "hidden" }}>
              <div style={{ width: `${planData.tasks.length ? (completedCount/planData.tasks.length*100) : 0}%`, height: "100%", background: GREEN, transition: "width 0.3s" }} />
            </div>
            <span style={{ fontSize: 11, color: MUTED }}>{planData.tasks.length ? Math.round(completedCount/planData.tasks.length*100) : 0}%</span>
          </div>
        </div>

        {/* New topics this week */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: TEXT, marginBottom: 10 }}>📚 Temas nuevos esta semana</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[0, 1].map(function(slotIdx) {
              var selectedNum = planData.newTopics[slotIdx];
              var checked = planData.topicsChecked[slotIdx];
              var selectedTopic = topics.find(function(t) { return t.number === selectedNum; });
              return (
                <div key={slotIdx} style={{ background: checked ? GREEN + "10" : BG, border: "0.5px solid " + (checked ? GREEN + "40" : BORDER), borderRadius: 8, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: MUTED, fontWeight: 500 }}>Tema {slotIdx + 1}</span>
                    <button onClick={function() { toggleTopicChecked(slotIdx); }} style={{ background: checked ? GREEN : "transparent", color: checked ? "white" : MUTED, border: "0.5px solid " + (checked ? GREEN : BORDER), borderRadius: 6, padding: "5px 14px", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
                      {checked ? "✓ Estudiado" : "Marcar como estudiado"}
                    </button>
                  </div>
                  <select value={selectedNum} onChange={function(e) { setNewTopic(slotIdx, parseInt(e.target.value)); }} style={{ ...inp, cursor: "pointer" }}>
                    <option value={0}>— Selecciona un tema —</option>
                    {pending.map(function(t) { return <option key={t.number} value={t.number}>T.{t.number} — {t.name.substring(0, 60)}</option>; })}
                  </select>
                  {selectedTopic && <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>{selectedTopic.content.split('\n')[0]}</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Carry-over tasks */}
        {carryOverTasks.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: RED, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span>⚠️ Tareas arrastradas ({carryOverTasks.length})</span>
              <span style={{ fontSize: 11, color: MUTED, fontWeight: 400 }}>de semanas anteriores</span>
            </div>
            {carryOverTasks.map(function(task) { return <TaskRow key={task.id} task={task} isCarryOver={true} />; })}
          </div>
        )}

        {/* This week tasks */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: TEXT, marginBottom: 8 }}>📝 Tareas de esta semana</div>
          <div style={{ padding: "8px 12px", background: ACCENT + "10", borderRadius: 8, fontSize: 12, color: MUTED, marginBottom: 12, lineHeight: 1.6 }}>
            Cada tarea = 15 preguntas/tarjetas. Usa el botón <strong style={{ color: GREEN }}>✓ Hecho</strong> cuando completes cada tarea. Puedes cambiar el tema y tipo.
          </div>
          {thisWeekTasks.map(function(task) { return <TaskRow key={task.id} task={task} isCarryOver={false} />; })}
        </div>
      </div>

      <div style={card}>
        <div style={h2s}>Gestión de datos</div>
        <p style={{ color: MUTED, fontSize: 13, marginBottom: 10 }}>Utilidades para reconfigurar manteniendo tu progreso.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btn(BLUE)} onClick={reloadSyllabus}>Recargar temario oficial</button>
          <button style={btn(GREEN)} onClick={applyPresetAction}>Marcar A.8-A.27 estudiados</button>
        </div>
      </div>
    </div>
  );
}


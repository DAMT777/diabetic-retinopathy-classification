"use strict";

// Límite igual al del servidor, para avisar antes de enviar.
const TAMANO_MAXIMO = 15 * 1024 * 1024;
const NIVELES = ["Sin RD", "Leve", "Moderada", "Severa", "Proliferativa"];
const INDICE_REFERIBLE = 2;

const el = (id) => document.getElementById(id);
const zonaCarga = el("zona-carga");
const entradaArchivo = el("entrada-archivo");
const vistaPrevia = el("vista-previa");
const galeria = el("galeria");

const ESTADOS = ["estado-inicial", "estado-analizando", "estado-resultado", "estado-error"];
let urlPrevia = null;

// ---------- Estados del panel de resultado ----------

function mostrarEstado(id) {
  ESTADOS.forEach((e) => { el(e).hidden = e !== id; });
}

function bloquearControles(bloquear) {
  // Evita envíos dobles mientras se analiza.
  [zonaCarga, galeria].forEach((c) => c.classList.toggle("desactivado", bloquear));
  entradaArchivo.disabled = bloquear;
  zonaCarga.setAttribute("aria-disabled", String(bloquear));
  galeria.querySelectorAll("button").forEach((b) => { b.disabled = bloquear; });
}

function mostrarError(mensaje) {
  el("mensaje-error").textContent = mensaje;
  mostrarEstado("estado-error");
}

// En una sola columna el resultado queda debajo; se lleva la vista hasta él.
function enfocarResultado() {
  if (window.matchMedia("(max-width: 860px)").matches) {
    el("panel-resultado").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function marcarEjemplo(nombre) {
  galeria.querySelectorAll(".ejemplo").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.nombre === nombre));
  });
}

function reiniciar() {
  if (urlPrevia) URL.revokeObjectURL(urlPrevia);
  urlPrevia = null;
  vistaPrevia.removeAttribute("src");
  el("zona-cargada").hidden = true;
  el("zona-vacia").hidden = false;
  entradaArchivo.value = "";
  marcarEjemplo(null);
  mostrarEstado("estado-inicial");
  window.scrollTo({ top: 0, behavior: "smooth" });
  zonaCarga.focus({ preventScroll: true });
}

// ---------- Vista previa ----------

function mostrarVistaPrevia(archivo) {
  // Se libera la URL anterior para no acumular memoria.
  if (urlPrevia) URL.revokeObjectURL(urlPrevia);
  urlPrevia = URL.createObjectURL(archivo);
  vistaPrevia.src = urlPrevia;
  el("nombre-archivo").textContent = archivo.name;
  el("zona-vacia").hidden = true;
  el("zona-cargada").hidden = false;
}

// ---------- Validación y envío ----------

function validarArchivo(archivo) {
  if (!archivo.type.startsWith("image/")) return "El archivo seleccionado no es una imagen.";
  if (archivo.size > TAMANO_MAXIMO) return "La imagen supera el tamaño máximo de 15 MB.";
  return null;
}

async function analizar(archivo) {
  const problema = validarArchivo(archivo);
  if (problema) {
    mostrarError(problema);
    enfocarResultado();
    return;
  }

  mostrarVistaPrevia(archivo);
  mostrarEstado("estado-analizando");
  bloquearControles(true);
  enfocarResultado();

  const formulario = new FormData();
  formulario.append("archivo", archivo); // sin Content-Type manual: el navegador fija el boundary

  try {
    const respuesta = await fetch("/api/predecir", { method: "POST", body: formulario });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      mostrarError(typeof datos.detail === "string" ? datos.detail : `Error del servidor (${respuesta.status}).`);
      return;
    }
    mostrarResultado(datos);
  } catch (error) {
    mostrarError("No se pudo conectar con el servidor. Revisa que esté en ejecución e inténtalo de nuevo.");
  } finally {
    bloquearControles(false);
  }
}

// ---------- Resultado ----------

// Números con coma decimal, como se escriben en español.
function formatear(valor, decimales) {
  return valor.toLocaleString("es-CO", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

function formatearPorcentaje(valor) {
  return formatear(valor * 100, 1) + "%";
}

// Las barras se crean en 0 y crecen en el siguiente cuadro, para animar la transición.
function animarAncho(elemento, porcentaje) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    elemento.style.width = porcentaje;
  }));
}

function construirBarras(probabilidades, indicePredicho) {
  const contenedor = el("barras");
  contenedor.replaceChildren();
  // Orden de la escala (0 a 4), nunca por probabilidad: la escala es ordinal
  // y así se ve si el modelo dudaba entre niveles vecinos.
  [...probabilidades].sort((a, b) => a.indice - b.indice).forEach((p) => {
    const fila = document.createElement("div");
    fila.className = "fila-barra" + (p.indice === indicePredicho ? " destacada" : "");

    const nombre = document.createElement("span");
    nombre.className = "nombre-clase";
    nombre.textContent = p.clase;

    const pista = document.createElement("div");
    pista.className = "pista";
    const relleno = document.createElement("div");
    relleno.className = "relleno";
    pista.appendChild(relleno);
    animarAncho(relleno, (p.probabilidad * 100).toFixed(2) + "%");

    const porcentaje = document.createElement("span");
    porcentaje.className = "porcentaje";
    porcentaje.textContent = formatearPorcentaje(p.probabilidad);

    fila.append(nombre, pista, porcentaje);
    contenedor.appendChild(fila);
  });
}

// Escala de 5 niveles con la posición de la predicción y del diagnóstico real.
function construirEscala(contenedor, indicePredicho, indiceReal) {
  contenedor.replaceChildren();
  NIVELES.forEach((nombre, i) => {
    const columna = document.createElement("div");

    const segmento = document.createElement("div");
    segmento.className = "segmento";
    if (i === indicePredicho) segmento.classList.add("predicho");
    if (i === indiceReal) segmento.classList.add("es-real");
    segmento.textContent = nombre;

    const marcas = document.createElement("div");
    marcas.className = "marcas";
    if (i === indicePredicho) marcas.appendChild(crearMarca("Modelo"));
    if (i === indiceReal) marcas.appendChild(crearMarca("Real"));

    columna.append(segmento, marcas);
    contenedor.appendChild(columna);
  });

  const zona = document.createElement("div");
  zona.className = "zona-referible";
  zona.textContent = "Referible";
  contenedor.appendChild(zona);
}

function crearMarca(texto) {
  const marca = document.createElement("span");
  marca.className = "marca";
  marca.textContent = texto;
  return marca;
}

function mostrarReferible(referible) {
  const pastilla = el("referible");
  pastilla.textContent = referible ? "Se recomienda derivar al oftalmólogo" : "Control de rutina";
  pastilla.className = "pastilla " + (referible ? "referible" : "rutina");
}

function mostrarDiagnosticoReal(real, coincide) {
  const parrafo = el("diagnostico-real");
  parrafo.replaceChildren();
  parrafo.className = "real";
  if (real === null || real === undefined) {
    parrafo.hidden = true;
    return;
  }
  const valor = document.createElement("strong");
  valor.textContent = real;
  parrafo.classList.add(coincide ? "acierto" : "fallo");
  parrafo.append("Diagnóstico real: ", valor, coincide ? ". Coincide con la predicción." : ". No coincide con la predicción.");
  parrafo.hidden = false;
}

function mostrarResultado(datos) {
  el("prediccion-nombre").textContent = datos.prediccion;
  mostrarReferible(datos.referible);
  mostrarDiagnosticoReal(datos.real, datos.coincide);

  const indiceReal = datos.real ? NIVELES.indexOf(datos.real) : -1;
  construirEscala(el("escala"), datos.indice, indiceReal);
  construirBarras(datos.probabilidades, datos.indice);

  el("imagen-original").src = urlPrevia;
  el("imagen-modelo").src = datos.imagen_modelo;
  mostrarEstado("estado-resultado");
}

// ---------- Galería de ejemplos ----------

async function analizarEjemplo(nombre) {
  marcarEjemplo(nombre);
  try {
    const respuesta = await fetch("/ejemplos/" + encodeURIComponent(nombre));
    if (!respuesta.ok) throw new Error();
    const blob = await respuesta.blob();
    // Se conserva el nombre original para que la API reconozca el diagnóstico real.
    await analizar(new File([blob], nombre, { type: blob.type }));
  } catch (error) {
    mostrarError("No se pudo cargar la imagen de ejemplo.");
  }
}

function crearMiniatura(ejemplo) {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "ejemplo";
  boton.dataset.nombre = ejemplo.nombre;
  boton.setAttribute("aria-pressed", "false");

  const img = document.createElement("img");
  img.src = "/ejemplos/" + encodeURIComponent(ejemplo.nombre);
  img.alt = "Fondo de ojo de ejemplo " + ejemplo.id_code + ", diagnóstico real " + (ejemplo.real || "desconocido");
  img.loading = "lazy";

  const etiqueta = document.createElement("span");
  etiqueta.textContent = ejemplo.real || "Sin etiqueta";

  boton.append(img, etiqueta);
  boton.addEventListener("click", () => analizarEjemplo(ejemplo.nombre));
  return boton;
}

async function cargarGaleria() {
  try {
    const respuesta = await fetch("/api/ejemplos");
    if (!respuesta.ok) throw new Error();
    const ejemplos = await respuesta.json();
    galeria.replaceChildren(...ejemplos.map(crearMiniatura));
  } catch (error) {
    const aviso = document.createElement("p");
    aviso.className = "texto-suave pequeno";
    aviso.textContent = "No se pudieron cargar los ejemplos.";
    galeria.replaceChildren(aviso);
  }
}

// ---------- Eventos de la zona de carga ----------

function configurarZonaCarga() {
  entradaArchivo.addEventListener("change", () => {
    if (entradaArchivo.files.length) {
      marcarEjemplo(null);
      analizar(entradaArchivo.files[0]);
    }
  });

  // Teclado: Enter o Espacio abren el selector de archivos.
  zonaCarga.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" || evento.key === " ") {
      evento.preventDefault();
      if (!entradaArchivo.disabled) entradaArchivo.click();
    }
  });

  // Arrastrar y soltar.
  ["dragenter", "dragover"].forEach((tipo) => zonaCarga.addEventListener(tipo, (evento) => {
    evento.preventDefault();
    zonaCarga.classList.add("arrastrando");
  }));
  ["dragleave", "drop"].forEach((tipo) => zonaCarga.addEventListener(tipo, (evento) => {
    evento.preventDefault();
    zonaCarga.classList.remove("arrastrando");
  }));
  zonaCarga.addEventListener("drop", (evento) => {
    const archivo = evento.dataTransfer.files[0];
    if (archivo && !entradaArchivo.disabled) {
      marcarEjemplo(null);
      analizar(archivo);
    }
  });
}

// ======================================================================
// Pestañas (patrón accesible de WAI-ARIA)
// ======================================================================

const pestanas = [...document.querySelectorAll('[role="tab"]')];

function activarPestana(pestana, enfocar) {
  pestanas.forEach((p) => {
    const activa = p === pestana;
    p.setAttribute("aria-selected", String(activa));
    p.tabIndex = activa ? 0 : -1;
    el(p.getAttribute("aria-controls")).hidden = !activa;
  });
  if (enfocar) pestana.focus();
  // Se guarda en la URL para que la pestaña se mantenga al recargar.
  history.replaceState(null, "", "#" + pestana.dataset.hash);
  if (pestana.dataset.hash === "metricas") cargarMetricas();
}

function pestanaDesdeHash() {
  const hash = location.hash.replace("#", "");
  return pestanas.find((p) => p.dataset.hash === hash) || pestanas[0];
}

function configurarPestanas() {
  pestanas.forEach((p) => p.addEventListener("click", () => activarPestana(p, false)));
  // Flechas, Inicio y Fin mueven el foco entre pestañas.
  el("pestana-clasificar").parentElement.addEventListener("keydown", (evento) => {
    const actual = pestanas.indexOf(document.activeElement);
    if (actual === -1) return;
    const destinos = {
      ArrowRight: (actual + 1) % pestanas.length,
      ArrowLeft: (actual - 1 + pestanas.length) % pestanas.length,
      Home: 0,
      End: pestanas.length - 1,
    };
    if (evento.key in destinos) {
      evento.preventDefault();
      activarPestana(pestanas[destinos[evento.key]], true);
    }
  });
  window.addEventListener("hashchange", () => activarPestana(pestanaDesdeHash(), false));
  activarPestana(pestanaDesdeHash(), false);
}

// ======================================================================
// Pestaña Métricas del modelo
// ======================================================================

let metricas = null;

function crear(etiqueta, clase, texto) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
}

function colorVariable(nombre) {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}

function conjuntoSeleccionado() {
  return document.querySelector('input[name="conjunto"]:checked').value;
}

// Se piden solo la primera vez que se abre la pestaña.
async function cargarMetricas() {
  if (metricas) return;
  metricas = {};
  try {
    const respuesta = await fetch("/api/metricas");
    if (!respuesta.ok) throw new Error();
    metricas = await respuesta.json();
  } catch (error) {
    metricas = null;
    el("metricas-cargando").textContent = "No se pudieron cargar las métricas. Revisa que el servidor esté en ejecución y recarga la página.";
    return;
  }
  construirFicha();
  construirSeccionesPorConjunto();
  construirGraficos();
  document.querySelectorAll('input[name="conjunto"]').forEach((r) => r.addEventListener("change", construirSeccionesPorConjunto));
  document.querySelectorAll('input[name="vista-matriz"]').forEach((r) => r.addEventListener("change", construirMatriz));
  el("metricas-cargando").hidden = true;
  el("metricas-contenido").hidden = false;
}

function construirSeccionesPorConjunto() {
  construirTarjetasPrincipales();
  construirCalibracion();
  construirTablaPorClase();
  construirMatriz();
}

// ---------- 1. Ficha del modelo y validación cruzada ----------

function construirFicha() {
  const m = metricas;
  const filas = [
    ["Parámetros", formatear(m.parametros / 1e6, 1) + " M"],
    ["Tamaño del archivo", formatear(m.tamano_mb, 1) + " MB"],
    ["Tiempo en este equipo", formatear(m.tiempo_ms, 0) + " ms"],
    ["Épocas entrenadas", String(m.epocas_entrenadas)],
    ["Época seleccionada", String(m.epoca_seleccionada)],
  ];
  el("ficha").replaceChildren(...filas.map(([titulo, valor]) => {
    const grupo = crear("div");
    grupo.append(crear("dt", "", titulo), crear("dd", "", valor));
    return grupo;
  }));
  el("ficha-criterio").textContent = "Criterio de selección: " +
    m.criterio_seleccion.charAt(0).toLowerCase() + m.criterio_seleccion.slice(1) + ".";

  const vc = m.validacion_cruzada;
  el("validacion-cruzada").textContent = "Validación cruzada de 2 folds: exactitud de " +
    formatear(vc.exactitud_media, 3) + " ± " + formatear(vc.exactitud_desv, 3) +
    ". Con esta validación se seleccionó la arquitectura del proyecto.";
}

// ---------- 2 y 3. Tarjetas de métricas ----------

const METRICAS_PRINCIPALES = [
  { clave: "exactitud", nombre: "Exactitud", porcentaje: true,
    texto: "Proporción de imágenes clasificadas en el nivel correcto." },
  { clave: "exactitud_balanceada", nombre: "Exactitud balanceada", porcentaje: true,
    texto: "Promedio de aciertos de cada nivel; no se deja inflar por la clase mayoritaria." },
  { clave: "f1_macro", nombre: "F1 macro", porcentaje: false,
    texto: "Equilibrio entre precisión y exhaustividad, con el mismo peso para cada nivel." },
  { clave: "qwk", nombre: "QWK", porcentaje: false,
    texto: "Concordancia con el diagnóstico real; castiga más los errores entre niveles lejanos." },
  { clave: "map", nombre: "mAP", porcentaje: false,
    texto: "Qué tan bien ordena las probabilidades para encontrar cada nivel, promediado." },
  { clave: "auc_macro", nombre: "AUC macro", porcentaje: false,
    texto: "Capacidad de separar cada nivel de los demás; 1 es perfecto y 0,5 es azar." },
  { clave: "sensibilidad_referible", nombre: "Sensibilidad referible", porcentaje: true,
    texto: "De los casos que debían derivarse (Moderada o más), cuántos detectó." },
  { clave: "especificidad_referible", nombre: "Especificidad referible", porcentaje: true,
    texto: "De los casos que no debían derivarse, cuántos reconoció como tales." },
];

const METRICAS_CALIBRACION = [
  { clave: "ece", nombre: "ECE", porcentaje: false,
    texto: "Diferencia promedio entre la confianza del modelo y su tasa real de acierto. Menor es mejor." },
  { clave: "perdida", nombre: "Pérdida", porcentaje: false,
    texto: "Entropía cruzada: castiga las probabilidades altas puestas en la clase equivocada. Menor es mejor." },
  { clave: "brier", nombre: "Brier", porcentaje: false,
    texto: "Error cuadrático entre las probabilidades y el diagnóstico real. Menor es mejor." },
  { clave: "confianza_media_errores", nombre: "Confianza media en los errores", porcentaje: true,
    texto: "Probabilidad promedio que el modelo dio a sus predicciones equivocadas." },
];

function crearTarjetasMetricas(contenedor, definiciones, bloque) {
  contenedor.replaceChildren(...definiciones.map((d) => {
    const valor = bloque[d.clave];
    const tarjeta = crear("article", "tarjeta-metrica");
    tarjeta.append(
      crear("h3", "", d.nombre),
      crear("p", "valor", d.porcentaje ? formatearPorcentaje(valor) : formatear(valor, 3)),
      crear("p", "", d.texto),
    );
    return tarjeta;
  }));
}

function construirTarjetasPrincipales() {
  crearTarjetasMetricas(el("tarjetas-principales"), METRICAS_PRINCIPALES, metricas[conjuntoSeleccionado()]);
}

function construirCalibracion() {
  const bloque = metricas[conjuntoSeleccionado()];
  crearTarjetasMetricas(el("tarjetas-calibracion"), METRICAS_CALIBRACION, bloque);
  // Frase calculada con los datos: cuánta confianza pone el modelo cuando se equivoca.
  el("lectura-calibracion").textContent = "Cuando el modelo se equivoca, asigna en promedio un " +
    formatearPorcentaje(bloque.confianza_media_errores) + " de probabilidad a la clase equivocada, " +
    "aunque su exactitud real es del " + formatearPorcentaje(bloque.exactitud) + ".";
}

// ---------- 4. Métricas por clase ----------

function construirTablaPorClase() {
  const bloque = metricas[conjuntoSeleccionado()];
  const columnas = [
    ["precision", "Precisión", 3], ["exhaustividad", "Exhaustividad", 3], ["f1", "F1", 3],
    ["ap", "AP", 3], ["auc", "AUC", 3], ["soporte", "Soporte", 0],
  ];

  const thead = crear("thead");
  const filaEncabezado = crear("tr");
  filaEncabezado.appendChild(crear("th", "", "Clase"));
  columnas.forEach(([, nombre]) => {
    const th = crear("th", "", nombre);
    th.scope = "col";
    filaEncabezado.appendChild(th);
  });
  thead.appendChild(filaEncabezado);

  const tbody = crear("tbody");
  metricas.clases.forEach((clase) => {
    const fila = crear("tr");
    const encabezado = crear("th", "", clase);
    encabezado.scope = "row";
    fila.appendChild(encabezado);
    columnas.forEach(([clave, , decimales]) => {
      fila.appendChild(crear("td", "", formatear(bloque.por_clase[clase][clave], decimales)));
    });
    tbody.appendChild(fila);
  });

  el("tabla-por-clase").replaceChildren(thead, tbody);
}

// ---------- 5. Matriz de confusión ----------

function construirMatriz() {
  const matriz = metricas[conjuntoSeleccionado()].matriz_confusion;
  const comoProporcion = document.querySelector('input[name="vista-matriz"]:checked').value === "proporcion";
  const clases = metricas.clases;

  const tabla = crear("table", "tabla-matriz");
  tabla.appendChild(crear("caption", "oculto", "Matriz de confusión: filas, diagnóstico real; columnas, predicción del modelo."));

  const thead = crear("thead");
  const filaEncabezado = crear("tr");
  filaEncabezado.appendChild(crear("th", "", "Real"));
  clases.forEach((clase) => {
    const th = crear("th", "", clase);
    th.scope = "col";
    filaEncabezado.appendChild(th);
  });
  thead.appendChild(filaEncabezado);

  const tbody = crear("tbody");
  matriz.forEach((valores, i) => {
    const total = valores.reduce((a, b) => a + b, 0);
    const fila = crear("tr");
    const encabezado = crear("th", "", clases[i]);
    encabezado.scope = "row";
    fila.appendChild(encabezado);
    valores.forEach((valor, j) => {
      const proporcion = total ? valor / total : 0;
      const celda = crear("td", "", comoProporcion ? formatearPorcentaje(proporcion) : String(valor));
      // Intensidad del color principal según la proporción por fila; texto blanco en fondos oscuros.
      celda.style.backgroundColor = `rgba(18, 53, 91, ${(0.04 + proporcion * 0.9).toFixed(3)})`;
      if (proporcion > 0.55) celda.classList.add("oscura");
      if (i === j) celda.classList.add("diagonal");
      celda.title = `Real ${clases[i]}, predicha ${clases[j]}: ${valor} de ${total} (${formatearPorcentaje(proporcion)})`;
      fila.appendChild(celda);
    });
    tbody.appendChild(fila);
  });
  tabla.append(thead, tbody);

  const desplazable = crear("div", "tabla-scroll");
  desplazable.appendChild(tabla);
  el("matriz").replaceChildren(crear("p", "eje-predicha", "Predicción del modelo"), desplazable);
}

// ---------- 6. Curvas de entrenamiento (SVG) ----------

const SVG_NS = "http://www.w3.org/2000/svg";

function crearSvg(etiqueta, atributos) {
  const nodo = document.createElementNS(SVG_NS, etiqueta);
  Object.entries(atributos || {}).forEach(([k, v]) => nodo.setAttribute(k, v));
  return nodo;
}

// Marcas "redondas" para el eje Y (pasos de 1, 2 o 5 por potencia de 10).
function escalaAgradable(minimo, maximo, marcas) {
  const pasoBruto = (maximo - minimo || 1) / marcas;
  const potencia = Math.pow(10, Math.floor(Math.log10(pasoBruto)));
  const paso = [1, 2, 5, 10].map((f) => f * potencia).find((p) => p >= pasoBruto);
  const inicio = Math.floor(minimo / paso) * paso;
  const fin = Math.ceil(maximo / paso) * paso;
  const valores = [];
  for (let v = inicio; v <= fin + paso / 2; v += paso) valores.push(Number(v.toFixed(10)));
  return { inicio, fin, valores, decimales: Math.max(0, -Math.floor(Math.log10(paso))) };
}

function dibujarGrafico(figura, { titulo, series, tituloY, formatoValor, epocaSeleccionada }) {
  const ancho = 560, alto = 300;
  const margen = { izq: 52, der: 16, sup: 22, inf: 44 };
  const anchoUtil = ancho - margen.izq - margen.der;
  const altoUtil = alto - margen.sup - margen.inf;

  const todos = series.flatMap((s) => s.valores);
  const epocas = Math.max(...todos.map((p) => p.x));
  const ejeY = escalaAgradable(Math.min(...todos.map((p) => p.y)), Math.max(...todos.map((p) => p.y)), 5);
  const x = (epoca) => margen.izq + ((epoca - 1) / (epocas - 1)) * anchoUtil;
  const y = (valor) => margen.sup + (1 - (valor - ejeY.inicio) / (ejeY.fin - ejeY.inicio)) * altoUtil;

  figura.replaceChildren(crear("figcaption", "", titulo));
  const svg = crearSvg("svg", { viewBox: `0 0 ${ancho} ${alto}`, role: "img", "aria-label": titulo });

  // Rejilla y eje Y
  ejeY.valores.forEach((valor) => {
    svg.appendChild(crearSvg("line", { class: "rejilla", x1: margen.izq, x2: ancho - margen.der, y1: y(valor), y2: y(valor) }));
    const texto = crearSvg("text", { class: "marca-texto", x: margen.izq - 8, y: y(valor) + 4, "text-anchor": "end" });
    texto.textContent = formatear(valor, ejeY.decimales);
    svg.appendChild(texto);
  });

  // Eje X: una marca por época y etiqueta cada 5
  svg.appendChild(crearSvg("line", { class: "eje", x1: margen.izq, x2: ancho - margen.der, y1: alto - margen.inf, y2: alto - margen.inf }));
  for (let e = 1; e <= epocas; e++) {
    svg.appendChild(crearSvg("line", { class: "eje", x1: x(e), x2: x(e), y1: alto - margen.inf, y2: alto - margen.inf + 4 }));
    if (e === 1 || e % 5 === 0) {
      const texto = crearSvg("text", { class: "marca-texto", x: x(e), y: alto - margen.inf + 18, "text-anchor": "middle" });
      texto.textContent = e;
      svg.appendChild(texto);
    }
  }
  const tituloX = crearSvg("text", { class: "titulo-eje", x: margen.izq + anchoUtil / 2, y: alto - 6, "text-anchor": "middle" });
  tituloX.textContent = "Época";
  const tituloEjeY = crearSvg("text", { class: "titulo-eje", transform: `translate(12 ${margen.sup + altoUtil / 2}) rotate(-90)`, "text-anchor": "middle" });
  tituloEjeY.textContent = tituloY;
  svg.append(tituloX, tituloEjeY);

  // Línea vertical en la época seleccionada
  const xs = x(epocaSeleccionada);
  svg.appendChild(crearSvg("line", { class: "linea-seleccion", x1: xs, x2: xs, y1: margen.sup, y2: alto - margen.inf }));
  const textoSeleccion = crearSvg("text", { class: "texto-seleccion", x: xs - 4, y: margen.sup - 8, "text-anchor": "end" });
  textoSeleccion.textContent = `Época seleccionada (${epocaSeleccionada})`;
  svg.appendChild(textoSeleccion);

  series.forEach((serie) => {
    const ruta = serie.valores.map((p, i) => `${i ? "L" : "M"}${x(p.x).toFixed(1)} ${y(p.y).toFixed(1)}`).join(" ");
    svg.appendChild(crearSvg("path", { class: "serie" + (serie.validacion ? " validacion" : ""), d: ruta, stroke: serie.color }));
  });

  // Globo con la época y el valor al pasar el mouse; los puntos van encima de las líneas.
  const globo = crear("div", "globo");
  series.forEach((serie) => {
    serie.valores.forEach((p) => {
      const grupo = crearSvg("g");
      const zona = crearSvg("circle", { class: "zona-punto", cx: x(p.x), cy: y(p.y), r: 9 });
      const punto = crearSvg("circle", { class: "punto", cx: x(p.x), cy: y(p.y), r: 3, fill: serie.color });
      const descripcion = `${serie.nombre}, época ${p.x}: ${formatoValor(p.y)}`;
      const tituloSvg = crearSvg("title");
      tituloSvg.textContent = descripcion;
      zona.appendChild(tituloSvg);

      zona.addEventListener("mouseenter", () => {
        globo.textContent = descripcion;
        const caja = figura.getBoundingClientRect();
        const marca = punto.getBoundingClientRect();
        // Se mantiene dentro del gráfico para no provocar desplazamiento horizontal.
        const mitad = globo.offsetWidth / 2;
        const centro = marca.left + marca.width / 2 - caja.left;
        globo.style.left = Math.min(Math.max(centro, mitad), caja.width - mitad) + "px";
        globo.style.top = (marca.top - caja.top) + "px";
        globo.classList.add("visible");
      });
      zona.addEventListener("mouseleave", () => globo.classList.remove("visible"));

      grupo.append(zona, punto);
      svg.appendChild(grupo);
    });
  });

  figura.append(svg, globo, crearLeyenda(series));
}

// Leyenda en texto con una muestra de la línea (continua o discontinua).
function crearLeyenda(series) {
  const lista = crear("ul", "leyenda");
  series.forEach((serie) => {
    const item = crear("li");
    const muestra = crearSvg("svg", { viewBox: "0 0 28 10", "aria-hidden": "true" });
    muestra.appendChild(crearSvg("line", {
      x1: 1, x2: 27, y1: 5, y2: 5, stroke: serie.color, "stroke-width": 2.5,
      "stroke-dasharray": serie.validacion ? "6 4" : "none",
    }));
    item.append(muestra, serie.nombre);
    lista.appendChild(item);
  });
  return lista;
}

function construirGraficos() {
  const historial = metricas.historial;
  const serie = (clave, nombre, color, validacion) => ({
    nombre, color, validacion,
    valores: historial.map((h) => ({ x: h.epoca, y: h[clave] })),
  });
  const azul = colorVariable("--color-primario");
  const ocre = colorVariable("--color-serie-2");
  const verde = colorVariable("--color-serie-3");
  const epocaSeleccionada = metricas.epoca_seleccionada;
  const tresDecimales = (v) => formatear(v, 3);

  dibujarGrafico(el("grafico-perdida"), {
    titulo: "Pérdida por época", tituloY: "Pérdida", formatoValor: tresDecimales, epocaSeleccionada,
    series: [
      serie("perdida_train", "Entrenamiento", azul, false),
      serie("perdida_val", "Validación", ocre, true),
    ],
  });

  dibujarGrafico(el("grafico-exactitud"), {
    titulo: "Exactitud por época", tituloY: "Exactitud", formatoValor: formatearPorcentaje, epocaSeleccionada,
    series: [
      serie("exactitud_train", "Entrenamiento", azul, false),
      serie("exactitud_val", "Validación", ocre, true),
    ],
  });

  dibujarGrafico(el("grafico-validacion"), {
    titulo: "Métricas de validación por época", tituloY: "Valor", formatoValor: tresDecimales, epocaSeleccionada,
    series: [
      serie("f1_macro_val", "F1 macro (validación)", azul, true),
      serie("qwk_val", "QWK (validación)", ocre, true),
      serie("map_val", "mAP (validación)", verde, true),
    ],
  });
}

// ---------- Inicio ----------

document.addEventListener("DOMContentLoaded", () => {
  configurarPestanas();
  configurarZonaCarga();
  construirEscala(el("escala-inicial"), -1, -1);
  el("boton-otra").addEventListener("click", reiniciar);
  el("boton-reintentar").addEventListener("click", reiniciar);
  cargarGaleria();
});

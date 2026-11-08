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

function formatearPorcentaje(valor) {
  return (valor * 100).toFixed(1) + "%";
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

// ---------- Inicio ----------

document.addEventListener("DOMContentLoaded", () => {
  configurarZonaCarga();
  construirEscala(el("escala-inicial"), -1, -1);
  el("boton-otra").addEventListener("click", reiniciar);
  el("boton-reintentar").addEventListener("click", reiniciar);
  cargarGaleria();
});

"use strict";

// Límite igual al del servidor, para avisar antes de enviar.
const TAMANO_MAXIMO = 15 * 1024 * 1024;

const el = (id) => document.getElementById(id);
const zonaCarga = el("zona-carga");
const entradaArchivo = el("entrada-archivo");
const vistaPrevia = el("vista-previa");
const zonaTexto = el("zona-texto");
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

function reiniciar() {
  if (urlPrevia) URL.revokeObjectURL(urlPrevia);
  urlPrevia = null;
  vistaPrevia.hidden = true;
  vistaPrevia.removeAttribute("src");
  zonaTexto.hidden = false;
  entradaArchivo.value = "";
  mostrarEstado("estado-inicial");
  zonaCarga.focus();
}

// ---------- Vista previa ----------

function mostrarVistaPrevia(archivo) {
  // Se libera la URL anterior para no acumular memoria.
  if (urlPrevia) URL.revokeObjectURL(urlPrevia);
  urlPrevia = URL.createObjectURL(archivo);
  vistaPrevia.src = urlPrevia;
  vistaPrevia.hidden = false;
  zonaTexto.hidden = true;
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
    return;
  }

  mostrarVistaPrevia(archivo);
  mostrarEstado("estado-analizando");
  bloquearControles(true);

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
    relleno.style.width = (p.probabilidad * 100).toFixed(2) + "%";
    pista.appendChild(relleno);

    const porcentaje = document.createElement("span");
    porcentaje.className = "porcentaje";
    porcentaje.textContent = formatearPorcentaje(p.probabilidad);

    fila.append(nombre, pista, porcentaje);
    contenedor.appendChild(fila);
  });
}

function mostrarReferible(referible) {
  const pastilla = el("referible");
  pastilla.textContent = referible ? "Se recomienda derivar al oftalmólogo" : "Control de rutina";
  pastilla.className = "pastilla " + (referible ? "referible" : "rutina");
}

function mostrarDiagnosticoReal(real, coincide) {
  const parrafo = el("diagnostico-real");
  parrafo.replaceChildren();
  if (real === null || real === undefined) {
    parrafo.hidden = true;
    return;
  }
  const valor = document.createElement("strong");
  valor.textContent = real;
  const nota = coincide ? " (coincide con la predicción)" : " (no coincide con la predicción)";
  parrafo.append("Diagnóstico real: ", valor, nota);
  parrafo.hidden = false;
}

function mostrarResultado(datos) {
  el("prediccion-nombre").textContent = datos.prediccion;
  el("prediccion-confianza").textContent = formatearPorcentaje(datos.confianza);
  mostrarReferible(datos.referible);
  mostrarDiagnosticoReal(datos.real, datos.coincide);
  construirBarras(datos.probabilidades, datos.indice);
  el("imagen-modelo").src = datos.imagen_modelo;
  mostrarEstado("estado-resultado");
}

// ---------- Galería de ejemplos ----------

async function analizarEjemplo(nombre) {
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
    if (entradaArchivo.files.length) analizar(entradaArchivo.files[0]);
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
    if (archivo && !entradaArchivo.disabled) analizar(archivo);
  });
}

// ---------- Inicio ----------

document.addEventListener("DOMContentLoaded", () => {
  configurarZonaCarga();
  el("boton-otra").addEventListener("click", reiniciar);
  el("boton-reintentar").addEventListener("click", reiniciar);
  cargarGaleria();
});

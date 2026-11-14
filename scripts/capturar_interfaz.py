"""Genera capturas de pantalla de la interfaz para el informe.

Abre Google Chrome sin ventana, recorre la aplicacion en escritorio y en movil
y guarda las capturas en docs/capturas/. Usa el protocolo de depuracion de
Chrome directamente, sin Selenium ni Playwright.

Requisitos:
  - La aplicacion en ejecucion:  cd retinopatia-app && uvicorn main:app
  - Google Chrome instalado (google-chrome en el PATH).
  - La libreria websockets (viene con uvicorn[standard], ya instalada en el
    entorno de la app).

Uso, desde la raiz del proyecto:
  retinopatia-app/.venv/bin/python scripts/capturar_interfaz.py
"""
import asyncio
import base64
import json
import shutil
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

import websockets

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "docs" / "capturas"
URL = "http://localhost:8000/"
PUERTO = 9223
ESCALA = 2  # densidad de pixeles: capturas nitidas para el informe

# Ejemplos de la galeria usados en las capturas (id_code: motivo)
ACIERTO_SANO = "b9bc81fcb075.png"        # Sin RD, bien clasificado
ACIERTO_REFERIBLE = "70d657f8f503.png"   # Proliferativa, bien clasificado
ERROR = "1bb0ddfe753a.png"               # Leve predicho como Moderada


class Navegador:
    """Cliente minimo del protocolo de depuracion de Chrome."""

    def __init__(self, ws):
        self.ws = ws
        self.id = 0

    async def enviar(self, metodo, **params):
        self.id += 1
        mi_id = self.id
        await self.ws.send(json.dumps({"id": mi_id, "method": metodo, "params": params}))
        while True:
            mensaje = json.loads(await self.ws.recv())
            if mensaje.get("id") == mi_id:
                if "error" in mensaje:
                    raise RuntimeError(f"{metodo}: {mensaje['error']}")
                return mensaje.get("result", {})

    async def js(self, codigo):
        resultado = await self.enviar("Runtime.evaluate", expression=codigo, awaitPromise=True, returnByValue=True)
        return resultado.get("result", {}).get("value")

    async def tamano(self, ancho, alto, movil=False):
        await self.enviar("Emulation.setDeviceMetricsOverride", width=ancho, height=alto,
                          deviceScaleFactor=ESCALA, mobile=movil)

    async def abrir(self, hash_):
        await self.enviar("Page.navigate", url=f"{URL}?captura={time.time()}#{hash_}")
        await asyncio.sleep(1.5)

    async def guardar(self, nombre, selector=None, pagina_completa=False):
        """Captura la ventana, la pagina completa o un solo elemento."""
        params = {"format": "png", "captureBeyondViewport": pagina_completa or bool(selector)}
        if selector:
            caja = await self.js(
                f"(() => {{ const r = document.querySelector({json.dumps(selector)}).getBoundingClientRect();"
                f" return [r.left + scrollX, r.top + scrollY, r.width, r.height]; }})()"
            )
            margen = 12
            params["clip"] = {"x": max(caja[0] - margen, 0), "y": max(caja[1] - margen, 0),
                              "width": caja[2] + 2 * margen, "height": caja[3] + 2 * margen, "scale": 1}
        elif pagina_completa:
            alto = await self.js("document.documentElement.scrollHeight")
            ancho = await self.js("document.documentElement.clientWidth")
            params["clip"] = {"x": 0, "y": 0, "width": ancho, "height": alto, "scale": 1}
        datos = await self.enviar("Page.captureScreenshot", **params)
        (SALIDA / nombre).write_bytes(base64.b64decode(datos["data"]))
        print("  guardada", nombre)

    async def ejemplo(self, nombre):
        """Clasifica un ejemplo de la galeria y espera el resultado."""
        await self.js(
            f"(async () => {{ document.querySelector('.ejemplo[data-nombre=\"{nombre}\"]').click();"
            " for (let i = 0; i < 100 && document.getElementById('estado-resultado').hidden; i++)"
            " await new Promise(r => setTimeout(r, 100)); })()"
        )
        await asyncio.sleep(0.6)  # deja terminar la animacion de las barras


async def capturar():
    perfil = tempfile.mkdtemp(prefix="chrome_captura_")
    chrome = subprocess.Popen(
        ["google-chrome", "--headless=new", f"--remote-debugging-port={PUERTO}", f"--user-data-dir={perfil}",
         "--hide-scrollbars", "--no-first-run", "--disable-gpu", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(50):
            try:
                paginas = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PUERTO}/json/list"))
                destino = next(p for p in paginas if p["type"] == "page")
                break
            except Exception:
                time.sleep(0.2)
        async with websockets.connect(destino["webSocketDebuggerUrl"], max_size=None) as ws:
            n = Navegador(ws)
            await n.enviar("Page.enable")

            print("Escritorio (1440 px)")
            await n.tamano(1440, 900)
            await n.abrir("clasificar")
            await n.guardar("01_clasificar_inicial.png")

            await n.ejemplo(ACIERTO_SANO)
            await n.guardar("02_resultado_sin_rd_acierto.png", pagina_completa=True)

            await n.ejemplo(ACIERTO_REFERIBLE)
            await n.guardar("03_resultado_proliferativa_acierto.png", pagina_completa=True)
            await n.guardar("04_panel_resultado.png", selector="#panel-resultado")

            await n.ejemplo(ERROR)
            await n.guardar("05_resultado_error_de_clasificacion.png", pagina_completa=True)
            await n.guardar("06_imagen_original_y_preprocesada.png", selector=".imagenes-resultado")

            await n.js("mostrarEstado('estado-analizando')")
            await n.guardar("07_estado_analizando.png", selector="#panel-resultado")

            await n.js(
                "(() => { const dt = new DataTransfer();"
                " dt.items.add(new File(['texto'], 'nota.txt', {type: 'text/plain'}));"
                " document.getElementById('zona-carga').dispatchEvent("
                "new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true})); })()"
            )
            await asyncio.sleep(0.4)
            await n.guardar("08_estado_error_archivo_no_valido.png", selector="#panel-resultado")

            await n.abrir("metricas")
            await asyncio.sleep(0.8)
            await n.guardar("09_metricas_validacion_completa.png", pagina_completa=True)
            await n.guardar("10_ficha_del_modelo.png", selector="section[aria-labelledby=titulo-ficha]")
            await n.guardar("11_metricas_principales_validacion.png", selector="#tarjetas-principales")
            await n.guardar("12_calibracion_validacion.png", selector="#tarjetas-calibracion")
            await n.guardar("13_metricas_por_clase_validacion.png", selector="#tabla-por-clase")
            await n.guardar("14_matriz_confusion_validacion.png", selector="#matriz")

            await n.js("document.querySelector('input[name=\"conjunto\"][value=\"prueba\"]').click()")
            await asyncio.sleep(0.4)
            await n.guardar("15_metricas_prueba_completa.png", pagina_completa=True)
            await n.guardar("16_metricas_principales_prueba.png", selector="#tarjetas-principales")
            await n.guardar("17_calibracion_prueba.png", selector="#tarjetas-calibracion")
            await n.guardar("18_metricas_por_clase_prueba.png", selector="#tabla-por-clase")
            await n.guardar("19_matriz_confusion_prueba.png", selector="#matriz")
            await n.js("document.querySelector('input[name=\"vista-matriz\"][value=\"proporcion\"]').click()")
            await asyncio.sleep(0.4)
            await n.guardar("20_matriz_confusion_prueba_proporcion.png", selector="#matriz")

            await n.guardar("21_curvas_de_entrenamiento.png", selector=".graficos")

            print("Movil (390 px)")
            await n.tamano(390, 844, movil=True)
            await n.abrir("clasificar")
            await n.guardar("22_movil_clasificar_inicial.png", pagina_completa=True)
            await n.ejemplo(ACIERTO_REFERIBLE)
            await n.guardar("23_movil_resultado.png", selector="#panel-resultado")
            await n.abrir("metricas")
            await asyncio.sleep(0.8)
            await n.guardar("24_movil_metricas.png", pagina_completa=True)
    finally:
        chrome.terminate()
        chrome.wait()
        shutil.rmtree(perfil, ignore_errors=True)


if __name__ == "__main__":
    SALIDA.mkdir(parents=True, exist_ok=True)
    asyncio.run(capturar())

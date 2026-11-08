"""API y servidor web para clasificar retinopatia diabetica con EfficientNet-B0."""
import base64
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles

import retina

# Rutas absolutas: la app funciona sin importar desde que carpeta se ejecute.
BASE = Path(__file__).parent
RUTA_PESOS = BASE / "modelo" / "efficientnet_b0_final_pesos.pt"
RUTA_ETIQUETAS = BASE / "datos" / "etiquetas_test.csv"
DIR_EJEMPLOS = BASE / "ejemplos"
DIR_STATIC = BASE / "static"

TAMANO_MAXIMO = 15 * 1024 * 1024  # 15 MB
INDICE_REFERIBLE = 2  # desde Moderada se recomienda derivar al oftalmologo

# Inferencia en CPU: el modelo es pequeno y asi la app corre en cualquier equipo.
DEVICE = torch.device("cpu")

# Modelo y etiquetas se cargan una sola vez al iniciar. Cargarlos en cada
# peticion tardaria segundos y desperdiciaria memoria.
MODELO = retina.cargar_modelo(RUTA_PESOS, DEVICE)
ETIQUETAS = (
    pd.read_csv(RUTA_ETIQUETAS, dtype={"id_code": str})
    .set_index("id_code")["diagnosis"]
    .astype(int)
    .to_dict()
)

app = FastAPI(title="Clasificacion de retinopatia diabetica", version="1.0")


def imagen_a_data_url(img_rgb):
    """Codifica una imagen RGB como PNG en base64 para mostrarla en el navegador."""
    ok, buffer = cv2.imencode(".png", cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR))
    if not ok:
        raise HTTPException(status_code=500, detail="No se pudo codificar la imagen procesada.")
    return "data:image/png;base64," + base64.b64encode(buffer.tobytes()).decode("ascii")


# Las rutas /api se declaran antes de montar los estaticos en "/";
# de lo contrario el montaje capturaria tambien estas peticiones.

# Se usa "def" y no "async def": la inferencia ocupa la CPU, y con "def"
# FastAPI la ejecuta en un hilo aparte sin bloquear las demas peticiones.
@app.post("/api/predecir")
def predecir(archivo: UploadFile = File(...)):
    contenido = archivo.file.read()
    if len(contenido) > TAMANO_MAXIMO:
        raise HTTPException(status_code=413, detail="La imagen supera el tamaño máximo de 15 MB.")

    # Se decodifica en memoria, sin guardar nada en disco.
    img_bgr = cv2.imdecode(np.frombuffer(contenido, np.uint8), cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise HTTPException(status_code=400, detail="El archivo no es una imagen válida.")

    # OpenCV entrega BGR y retina.predecir espera RGB.
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    probs, normalizada = retina.predecir(MODELO, img_rgb, DEVICE)

    indice = int(np.argmax(probs))
    # El nombre del archivo sin extension es el id_code del conjunto de prueba.
    real_idx = ETIQUETAS.get(Path(archivo.filename or "").stem)

    return {
        "prediccion": retina.NOMBRES[indice],
        "indice": indice,
        "confianza": float(probs[indice]),
        "referible": bool(indice >= INDICE_REFERIBLE),
        # Siempre en el orden de la escala (0 a 4), nunca ordenadas por probabilidad.
        "probabilidades": [
            {"indice": i, "clase": nombre, "probabilidad": float(probs[i])}
            for i, nombre in retina.NOMBRES.items()
        ],
        "real": retina.NOMBRES[real_idx] if real_idx is not None else None,
        "coincide": bool(real_idx == indice) if real_idx is not None else None,
        "imagen_modelo": imagen_a_data_url(normalizada),
    }


@app.get("/api/ejemplos")
def ejemplos():
    lista = []
    for ruta in DIR_EJEMPLOS.glob("*.png"):
        real_idx = ETIQUETAS.get(ruta.stem)
        lista.append({
            "nombre": ruta.name,
            "id_code": ruta.stem,
            "real": retina.NOMBRES[real_idx] if real_idx is not None else None,
            "_orden": real_idx if real_idx is not None else 99,
        })
    lista.sort(key=lambda e: (e["_orden"], e["nombre"]))
    for e in lista:
        del e["_orden"]
    return lista


@app.get("/api/salud")
def salud():
    return {"estado": "ok", "modelo": retina.ARQUITECTURA, "clases": len(retina.NOMBRES)}


app.mount("/ejemplos", StaticFiles(directory=DIR_EJEMPLOS), name="ejemplos")
app.mount("/", StaticFiles(directory=DIR_STATIC, html=True), name="static")

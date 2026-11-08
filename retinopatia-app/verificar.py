"""Comprueba que la app reproduce las predicciones de la evaluacion oficial.

Clasifica las 10 imagenes de ejemplos/ con retina.py y compara contra
datos/predicciones_test.csv. Si coinciden, la app usa el mismo modelo y el
mismo preprocesamiento que se evaluaron.
"""
import sys
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
import torch

import retina

BASE = Path(__file__).parent
TOLERANCIA = 0.01  # la evaluacion uso precision mixta en GPU; aqui es CPU float32


def main():
    device = torch.device("cpu")
    modelo = retina.cargar_modelo(BASE / "modelo" / "efficientnet_b0_final_pesos.pt", device)
    oficial = pd.read_csv(BASE / "datos" / "predicciones_test.csv", dtype={"id_code": str}).set_index("id_code")
    columnas = [f"p_{i}" for i in range(len(retina.NOMBRES))]

    rutas = sorted((BASE / "ejemplos").glob("*.png"))
    coincidencias = 0
    dif_global = 0.0

    print(f"{'id_code':<14} {'ahora':<14} {'evaluacion':<14} {'coincide':<9} dif_max")
    for ruta in rutas:
        img = cv2.cvtColor(cv2.imread(str(ruta), cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)
        probs, _ = retina.predecir(modelo, img, device)
        fila = oficial.loc[ruta.stem]

        pred_ahora = int(np.argmax(probs))
        pred_oficial = int(fila["pred"])
        dif = float(np.abs(probs - fila[columnas].to_numpy(dtype=np.float32)).max())
        coincide = pred_ahora == pred_oficial

        coincidencias += coincide
        dif_global = max(dif_global, dif)
        print(f"{ruta.stem:<14} {retina.NOMBRES[pred_ahora]:<14} {retina.NOMBRES[pred_oficial]:<14} "
              f"{'si' if coincide else 'NO':<9} {dif:.6f}")

    print()
    print(f"Coincidencias: {coincidencias} de {len(rutas)}")
    print(f"Diferencia maxima global: {dif_global:.6f}")

    correcto = coincidencias == len(rutas) == 10 and dif_global < TOLERANCIA
    print("RESULTADO: " + ("verificacion superada" if correcto else "verificacion FALLIDA"))
    if not correcto and coincidencias == len(rutas):
        # Diferencia conocida y aceptada: los PNG de ejemplos/ ya estan recortados a 384x384,
        # y retina.predecir los vuelve a recortar y redimensionar. La evaluacion oficial partio
        # de las fotos originales, asi que esa segunda interpolacion cambia algunos pixeles.
        # Solo se nota en los casos donde el modelo no estaba saturado cerca del 100%.
        print("NOTA: todas las clases coinciden. La diferencia en probabilidades se explica por el")
        print("      doble recorte de los ejemplos ya preprocesados (ver README, seccion 4).")
    sys.exit(0 if correcto else 1)


if __name__ == "__main__":
    main()

"""Genera las graficas y tablas del informe a partir de los datos de la aplicacion.

Lee retinopatia-app/datos/metricas.json, predicciones_test.csv y las imagenes
de retinopatia-app/ejemplos/. No recalcula metricas: solo las dibuja y las
exporta. Las salidas quedan en docs/graficas/ y docs/tablas/.

Requisitos: el entorno de la app con matplotlib instalado
  retinopatia-app/.venv/bin/pip install matplotlib

Uso, desde la raiz del proyecto:
  retinopatia-app/.venv/bin/python scripts/generar_figuras.py
"""
import json
import sys
from pathlib import Path

import cv2
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.ticker import FuncFormatter

RAIZ = Path(__file__).resolve().parent.parent
APP = RAIZ / "retinopatia-app"
sys.path.insert(0, str(APP))
import retina  # noqa: E402  (solo se usa normalizar_color, sin modificarla)

GRAFICAS = RAIZ / "docs" / "graficas"
TABLAS = RAIZ / "docs" / "tablas"

# Mismos colores que la interfaz
AZUL = "#12355b"
OCRE = "#a35a12"
VERDE = "#2f7266"
GRIS = "#9aa5b1"
ROJO = "#b42318"
TEXTO = "#1f2933"
SUAVE = "#52606d"

plt.rcParams.update({
    "figure.dpi": 100,
    "savefig.dpi": 200,
    "savefig.bbox": "tight",
    "font.size": 11,
    "axes.edgecolor": "#d9dee3",
    "axes.labelcolor": TEXTO,
    "axes.titlesize": 13,
    "axes.titleweight": "bold",
    "axes.titlecolor": TEXTO,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.grid": True,
    "grid.color": "#e8ecf0",
    "xtick.color": SUAVE,
    "ytick.color": SUAVE,
    "legend.frameon": False,
})

CONJUNTOS = {"validacion": "Validación", "prueba": "Prueba"}


def coma(valor, decimales=2):
    """Formato con coma decimal, como en la interfaz."""
    return f"{valor:.{decimales}f}".replace(".", ",")


def formato_eje(decimales):
    return FuncFormatter(lambda v, _: coma(v, decimales))


def guardar(fig, nombre):
    fig.savefig(GRAFICAS / nombre)
    plt.close(fig)
    print("  grafica", nombre)


# ---------------------------------------------------------------------------
# Curvas de entrenamiento
# ---------------------------------------------------------------------------

def curvas(m):
    h = pd.DataFrame(m["historial"])
    epoca = m["epoca_seleccionada"]

    def marcar_seleccion(ax):
        ax.axvline(epoca, color=ROJO, linestyle=":", linewidth=1.5)
        ax.annotate(f"Época seleccionada ({epoca})", xy=(epoca, 1), xycoords=("data", "axes fraction"),
                    xytext=(-6, -4), textcoords="offset points", ha="right", va="top", color=ROJO, fontsize=9)

    def preparar(ax, titulo, eje_y, decimales):
        ax.set_title(titulo, loc="left")
        ax.set_xlabel("Época")
        ax.set_ylabel(eje_y)
        ax.set_xticks([1, 5, 10, 15, 20])
        ax.yaxis.set_major_formatter(formato_eje(decimales))
        marcar_seleccion(ax)
        ax.legend(loc="best")

    fig, ax = plt.subplots(figsize=(7, 4.2))
    ax.plot(h.epoca, h.perdida_train, color=AZUL, marker="o", markersize=3.5, label="Entrenamiento")
    ax.plot(h.epoca, h.perdida_val, color=OCRE, marker="o", markersize=3.5, linestyle="--", label="Validación")
    preparar(ax, "Pérdida por época", "Pérdida (entropía cruzada)", 1)
    guardar(fig, "01_curva_perdida.png")

    fig, ax = plt.subplots(figsize=(7, 4.2))
    ax.plot(h.epoca, h.exactitud_train, color=AZUL, marker="o", markersize=3.5, label="Entrenamiento")
    ax.plot(h.epoca, h.exactitud_val, color=OCRE, marker="o", markersize=3.5, linestyle="--", label="Validación")
    preparar(ax, "Exactitud por época", "Exactitud", 1)
    guardar(fig, "02_curva_exactitud.png")

    fig, ax = plt.subplots(figsize=(7, 4.2))
    ax.plot(h.epoca, h.f1_macro_val, color=AZUL, marker="o", markersize=3.5, linestyle="--", label="F1 macro")
    ax.plot(h.epoca, h.qwk_val, color=OCRE, marker="o", markersize=3.5, linestyle="--", label="QWK")
    ax.plot(h.epoca, h.map_val, color=VERDE, marker="o", markersize=3.5, linestyle="--", label="mAP")
    preparar(ax, "Métricas de validación por época", "Valor", 1)
    guardar(fig, "03_curva_metricas_validacion.png")

    h.to_csv(TABLAS / "historial_entrenamiento.csv", index=False)
    print("  tabla historial_entrenamiento.csv")


# ---------------------------------------------------------------------------
# Matrices de confusion
# ---------------------------------------------------------------------------

def matrices(m):
    clases = m["clases"]
    numero = 4
    for clave, nombre in CONJUNTOS.items():
        mat = np.array(m[clave]["matriz_confusion"])
        prop = mat / mat.sum(axis=1, keepdims=True)
        for como_proporcion in (False, True):
            fig, ax = plt.subplots(figsize=(6.4, 5.4))
            ax.grid(False)
            ax.imshow(prop, cmap=matplotlib.colors.LinearSegmentedColormap.from_list("azul", ["#f4f6f8", AZUL]),
                      vmin=0, vmax=1)
            for i in range(5):
                for j in range(5):
                    texto = f"{coma(prop[i, j] * 100, 1)}%" if como_proporcion else str(mat[i, j])
                    ax.text(j, i, texto, ha="center", va="center", fontsize=11,
                            color="white" if prop[i, j] > 0.55 else TEXTO,
                            fontweight="bold" if i == j else "normal")
            ax.set_xticks(range(5), clases, rotation=20, ha="right")
            ax.set_yticks(range(5), clases)
            ax.set_xlabel("Predicción del modelo")
            ax.set_ylabel("Diagnóstico real")
            ax.spines[:].set_visible(False)
            tipo = "proporción por clase real" if como_proporcion else "número de imágenes"
            ax.set_title(f"Matriz de confusión, {nombre.lower()} ({tipo})", loc="left", fontsize=12)
            sufijo = "proporcion" if como_proporcion else "conteo"
            guardar(fig, f"{numero:02d}_matriz_confusion_{clave}_{sufijo}.png")
            numero += 1


# ---------------------------------------------------------------------------
# Metricas globales y por clase
# ---------------------------------------------------------------------------

GLOBALES = [
    ("exactitud", "Exactitud"), ("exactitud_balanceada", "Exactitud balanceada"), ("f1_macro", "F1 macro"),
    ("precision_macro", "Precisión macro"), ("exhaustividad_macro", "Exhaustividad macro"), ("qwk", "QWK"),
    ("map", "mAP"), ("auc_macro", "AUC macro"), ("sensibilidad_referible", "Sensibilidad referible"),
    ("especificidad_referible", "Especificidad referible"), ("mae_niveles", "MAE en niveles"),
    ("exactitud_mas_menos_1", "Exactitud a ±1 nivel"), ("perdida", "Pérdida"), ("brier", "Brier"),
    ("ece", "ECE"), ("confianza_media_errores", "Confianza media en errores"),
]


def barras_agrupadas(ax, etiquetas, series, colores, decimales=3):
    ancho = 0.8 / len(series)
    x = np.arange(len(etiquetas))
    for k, ((nombre, valores), color) in enumerate(zip(series.items(), colores)):
        pos = x - 0.4 + ancho / 2 + k * ancho
        barras = ax.bar(pos, valores, ancho * 0.92, color=color, label=nombre)
        for b, v in zip(barras, valores):
            ax.text(b.get_x() + b.get_width() / 2, v + 0.01, coma(v, decimales), ha="center", va="bottom",
                    fontsize=8, color=SUAVE)
    ax.set_xticks(x, etiquetas)
    ax.grid(axis="x", visible=False)
    ax.yaxis.set_major_formatter(formato_eje(1))


def globales(m):
    filas = [{"metrica": nombre, "validacion": m["validacion"][k], "prueba": m["prueba"][k]} for k, nombre in GLOBALES]
    tabla = pd.DataFrame(filas)
    tabla.round(4).to_csv(TABLAS / "metricas_globales.csv", index=False)
    with open(TABLAS / "metricas_globales.md", "w", encoding="utf-8") as f:
        f.write("| Métrica | Validación | Prueba |\n|---|---:|---:|\n")
        for fila in filas:
            f.write(f"| {fila['metrica']} | {coma(fila['validacion'], 3)} | {coma(fila['prueba'], 3)} |\n")
    print("  tabla metricas_globales.csv y .md")

    principales = ["exactitud", "exactitud_balanceada", "f1_macro", "qwk", "map", "auc_macro",
                   "sensibilidad_referible", "especificidad_referible"]
    nombres = dict(GLOBALES)
    fig, ax = plt.subplots(figsize=(11, 4.8))
    barras_agrupadas(ax, [nombres[k].replace(" ", "\n") for k in principales],
                     {"Validación": [m["validacion"][k] for k in principales],
                      "Prueba": [m["prueba"][k] for k in principales]}, [AZUL, OCRE])
    ax.set_ylim(0, 1.08)
    ax.set_title("Métricas principales en validación y prueba", loc="left")
    ax.legend(loc="upper left", ncols=2)
    guardar(fig, "08_metricas_principales.png")

    calib = ["ece", "perdida", "brier", "confianza_media_errores"]
    fig, ax = plt.subplots(figsize=(8, 4.2))
    barras_agrupadas(ax, [nombres[k].replace(" ", "\n", 1) for k in calib],
                     {"Validación": [m["validacion"][k] for k in calib],
                      "Prueba": [m["prueba"][k] for k in calib]}, [AZUL, OCRE])
    ax.set_ylim(0, 1.05)
    ax.set_title("Calibración (menor es mejor)", loc="left")
    ax.legend(loc="upper left", ncols=2)
    guardar(fig, "09_calibracion.png")


def por_clase(m):
    clases = m["clases"]
    numero = 10
    for clave, nombre in CONJUNTOS.items():
        datos = m[clave]["por_clase"]
        tabla = pd.DataFrame([{"clase": c, **datos[c]} for c in clases])
        tabla.round(4).to_csv(TABLAS / f"metricas_por_clase_{clave}.csv", index=False)
        print(f"  tabla metricas_por_clase_{clave}.csv")

        fig, ax = plt.subplots(figsize=(9, 4.4))
        barras_agrupadas(ax, clases, {
            "Precisión": [datos[c]["precision"] for c in clases],
            "Exhaustividad": [datos[c]["exhaustividad"] for c in clases],
            "F1": [datos[c]["f1"] for c in clases],
        }, [AZUL, OCRE, VERDE], decimales=2)
        ax.set_ylim(0, 1.1)
        ax.set_title(f"Métricas por clase, {nombre.lower()}", loc="left")
        ax.legend(loc="upper right", ncols=3)
        guardar(fig, f"{numero:02d}_metricas_por_clase_{clave}.png")
        numero += 1

    # Imagenes por clase en cada conjunto (soporte), para mostrar el desbalance
    fig, ax = plt.subplots(figsize=(8, 4.2))
    barras_agrupadas(ax, clases, {
        nombre: [m[clave]["por_clase"][c]["soporte"] for c in clases] for clave, nombre in CONJUNTOS.items()
    }, [AZUL, OCRE], decimales=0)
    ax.yaxis.set_major_formatter(formato_eje(0))
    ax.set_ylabel("Número de imágenes")
    ax.set_title("Imágenes por clase en validación y prueba", loc="left")
    ax.legend(loc="upper right", ncols=2)
    guardar(fig, "12_imagenes_por_clase.png")


# ---------------------------------------------------------------------------
# Imagenes: preprocesamiento y galeria de ejemplos
# ---------------------------------------------------------------------------

def leer_rgb(ruta):
    return cv2.cvtColor(cv2.imread(str(ruta)), cv2.COLOR_BGR2RGB)


def imagenes(m):
    clases = m["clases"]
    pred = pd.read_csv(APP / "datos" / "predicciones_test.csv", dtype={"id_code": str}).set_index("id_code")
    rutas = sorted((APP / "ejemplos").glob("*.png"), key=lambda r: (int(pred.loc[r.stem, "diagnosis"]), r.stem))

    # Un ejemplo por clase: imagen recortada (384x384) y lo que ve el modelo
    una_por_clase = []
    for idx in range(5):
        una_por_clase.append(next(r for r in rutas if int(pred.loc[r.stem, "diagnosis"]) == idx))
    fig, ejes = plt.subplots(2, 5, figsize=(13, 5.4), layout="constrained")
    for col, ruta in enumerate(una_por_clase):
        img = leer_rgb(ruta)
        for fila, imagen in enumerate((img, retina.normalizar_color(img))):
            ax = ejes[fila, col]
            ax.imshow(imagen)
            ax.axis("off")
        ejes[0, col].set_title(f"{clases[col]}\n{ruta.stem}", fontsize=10, fontweight="normal")
    ejes[0, 0].text(-0.08, 0.5, "Recortada\n384×384", transform=ejes[0, 0].transAxes, rotation=90,
                    ha="right", va="center", fontsize=10, color=SUAVE)
    ejes[1, 0].text(-0.08, 0.5, "Color\nnormalizado", transform=ejes[1, 0].transAxes, rotation=90,
                    ha="right", va="center", fontsize=10, color=SUAVE)
    fig.suptitle("Preprocesamiento: imagen recortada y lo que ve el modelo", x=0.02, ha="left",
                 fontweight="bold", color=TEXTO)
    guardar(fig, "13_preprocesamiento_por_clase.png")

    # Galeria de los 10 ejemplos con su clase real y la predicha en la evaluacion
    filas = []
    fig, ejes = plt.subplots(2, 5, figsize=(13, 7.2), layout="constrained")
    for ax, ruta in zip(ejes.flat, rutas):
        f = pred.loc[ruta.stem]
        real, predicha = clases[int(f["diagnosis"])], clases[int(f["pred"])]
        confianza = float(f[f"p_{int(f['pred'])}"])
        acierto = real == predicha
        ax.imshow(leer_rgb(ruta))
        ax.set_xticks([])
        ax.set_yticks([])
        ax.grid(False)
        for borde in ax.spines.values():
            borde.set_visible(True)
            borde.set_color(VERDE if acierto else ROJO)
            borde.set_linewidth(3)
        ax.set_title(f"{ruta.stem}\nReal: {real}\nPredicha: {predicha} ({coma(confianza * 100, 1)}%)",
                     fontsize=9, fontweight="normal", color=TEXTO)
        filas.append({"id_code": ruta.stem, "clase_real": real, "clase_predicha": predicha,
                      "confianza": round(confianza, 4), "acierto": "si" if acierto else "no",
                      "tamano_original": f["tamano"]})
    fig.suptitle("Ejemplos de la galería (borde verde: acierto; borde rojo: error)", x=0.02, ha="left",
                 fontweight="bold", color=TEXTO)
    guardar(fig, "14_ejemplos_galeria.png")

    pd.DataFrame(filas).to_csv(TABLAS / "ejemplos_galeria.csv", index=False)
    print("  tabla ejemplos_galeria.csv")


def main():
    GRAFICAS.mkdir(parents=True, exist_ok=True)
    TABLAS.mkdir(parents=True, exist_ok=True)
    m = json.loads((APP / "datos" / "metricas.json").read_text(encoding="utf-8"))
    curvas(m)
    matrices(m)
    globales(m)
    por_clase(m)
    imagenes(m)


if __name__ == "__main__":
    main()

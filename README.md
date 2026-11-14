# Clasificación del grado de retinopatía diabética con EfficientNet-B0

Proyecto académico de Ingeniería de Sistemas (Universidad de los Llanos). Clasifica fotografías de fondo de ojo del conjunto APTOS 2019 en los cinco niveles de la escala clínica internacional de retinopatía diabética (Sin RD, Leve, Moderada, Severa y Proliferativa) con una red EfficientNet-B0 ajustada por transferencia de aprendizaje, e incluye una aplicación web para usar el modelo y consultar sus métricas.

## Estructura del repositorio

```
Notebooks/          Análisis, partición, entrenamiento y figuras (Kaggle y Google Colab).
retinopatia-app/    Aplicación web (FastAPI + HTML, CSS y JavaScript) con el modelo final.
docs/               Informe final en PDF (formato Springer LNCS) y diapositivas de la presentación.
```

Quedan fuera de Git, por tamaño o por ser locales: `prueba_384/` (las 534 imágenes de prueba preprocesadas) y los entornos virtuales.

## Flujo del proyecto

| Etapa | Archivo |
|---|---|
| Análisis exploratorio, eliminación de duplicados con etiquetas contradictorias y preprocesamiento a 384x384 | `Notebooks/notebook_kaggle.ipynb` |
| Partición estratificada 70/15/15 por grupos de duplicados y folds de la validación cruzada | `Notebooks/particion.ipynb` |
| Validación cruzada de 2 folds de EfficientNet-B0 frente a ResNet-50 (selección de arquitectura, punto b) y primer entrenamiento | `Notebooks/entrenamiento.ipynb` |
| Segundo entrenamiento de EfficientNet-B0 con checkpoints cada 2 épocas, selección de la época 20, evaluación (puntos c y d) y archivos para la app | `Notebooks/entrenamiento_efficientnet.ipynb` |
| Figuras para el artículo | `Notebooks/graficas.ipynb` |
| Aplicación web (punto f) | `retinopatia-app/` |

## Datos

APTOS 2019 Blindness Detection (Kaggle): 3.662 imágenes. Se eliminaron 79 imágenes de 37 grupos de duplicados idénticos con diagnósticos distintos, y quedaron 3.583, divididas en entrenamiento (2.507), validación (542) y prueba (534), sin que una misma imagen aparezca en dos particiones.

## Resultados

En la validación cruzada, EfficientNet-B0 obtuvo una exactitud de 0,820 ± 0,000 frente a 0,814 ± 0,012 de ResNet-50, con 5,9 veces menos parámetros, y se eligió como arquitectura. Resultados del modelo final (época 20), tomados de `retinopatia-app/datos/metricas.json`:

| Métrica | Validación | Prueba |
|---|---:|---:|
| Exactitud | 0,838 | 0,830 |
| Exactitud balanceada | 0,657 | 0,655 |
| F1 macro | 0,678 | 0,663 |
| QWK | 0,889 | 0,905 |
| mAP | 0,680 | 0,688 |
| AUC macro | 0,929 | 0,938 |
| Sensibilidad referible | 0,926 | 0,925 |
| Especificidad referible | 0,930 | 0,950 |
| ECE | 0,117 | 0,112 |

El informe completo, en formato Springer LNCS, está en `docs/` en PDF.

## Cómo ejecutar la aplicación

```bash
cd retinopatia-app
python -m venv .venv
source .venv/bin/activate
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
python verificar.py
uvicorn main:app --reload
```

Luego se abre http://localhost:8000. Los detalles de la app, la API y las decisiones técnicas están en [`retinopatia-app/README.md`](retinopatia-app/README.md).

## Limitaciones

- **Sobreconfianza:** el modelo asigna en promedio un 87,8% de probabilidad a sus predicciones equivocadas en validación; una probabilidad alta no garantiza que la predicción sea correcta.
- **Desbalance de clases:** la mitad de las imágenes son Sin RD y menos del 5% son Severa, la clase con peor desempeño (F1 de 0,340 en prueba).
- **Herramienta académica:** no reemplaza el diagnóstico de un oftalmólogo y sus resultados solo son válidos para imágenes similares a las de APTOS 2019.

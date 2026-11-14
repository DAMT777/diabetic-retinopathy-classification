# Clasificación de retinopatía diabética: aplicación web

Aplicación con FastAPI, HTML5, CSS3 y JavaScript puro que clasifica una imagen de fondo de ojo en los cinco niveles de la escala clínica internacional de retinopatía diabética (RD) con el modelo EfficientNet-B0 del segundo entrenamiento (checkpoint de la época 20).

| Índice | Nivel | Descripción |
|---|---|---|
| 0 | Sin RD | No se observan signos de retinopatía |
| 1 | Leve | Solo microaneurismas, pequeños puntos rojos en la retina |
| 2 | Moderada | Hemorragias y exudados más numerosos |
| 3 | Severa | Lesiones extensas en toda la retina y zonas con mala irrigación |
| 4 | Proliferativa | Crecimiento de vasos sanguíneos anormales; riesgo de pérdida de visión |

Desde Moderada (índice 2) la retinopatía se considera **referible**: se recomienda valoración oftalmológica.

La interfaz tiene dos pestañas:

- **Clasificar:** se sube una imagen (clic, arrastrar y soltar o teclado) o se elige uno de los 10 ejemplos del conjunto de prueba. Muestra el nivel estimado, su posición en la escala, la probabilidad de cada nivel, el diagnóstico real cuando la imagen es del conjunto de prueba, y la imagen cargada junto a la que ve el modelo.
- **Métricas del modelo:** ficha del modelo, métricas principales y de calibración en validación o prueba, métricas por clase, matriz de confusión y curvas de entrenamiento con la época seleccionada.

## Estructura

```
retinopatia-app/
├── modelo/efficientnet_b0_final_pesos.pt   Pesos del modelo (state_dict de PyTorch, 16,4 MB). Solo lectura.
├── datos/etiquetas_test.csv                Diagnóstico real de las 534 imágenes de prueba. Solo lectura.
├── datos/predicciones_test.csv             Predicciones de la evaluación, usadas por verificar.py. Solo lectura.
├── datos/metricas.json                     Métricas de validación, prueba y entrenamiento. Solo lectura.
├── ejemplos/<id_code>.png                  10 imágenes de prueba de 384x384, dos por nivel. Solo lectura.
├── static/index.html                       Estructura de la página y de las dos pestañas.
├── static/styles.css                       Estilos, con variables de diseño en :root.
├── static/app.js                           Lógica del navegador: pestañas, envío, resultado, tablas y gráficos SVG.
├── retina.py                               Preprocesamiento, carga del modelo y predicción.
├── main.py                                 API con FastAPI y servidor de archivos estáticos.
├── verificar.py                            Comprueba que la app reproduce la evaluación del modelo.
└── requirements.txt                        Dependencias de Python (sin torch, que se instala aparte).
```

## Arquitectura

```
 Navegador (index.html + app.js)
        |  POST /api/predecir (multipart, campo "archivo")
        v
 main.py (FastAPI)
        |  valida tamaño (15 MB) y que sea imagen; decodifica en memoria, BGR -> RGB
        v
 retina.py
        |  1. recorte del borde negro y lienzo cuadrado de 384x384 (si la imagen no mide ya 384x384)
        |  2. normalización de color: 4*I - 4*desenfoque + 128, calculado solo sobre la retina
        |  3. normalización con media y desviación de ImageNet
        |  4. EfficientNet-B0 -> softmax -> 5 probabilidades
        v
 main.py: JSON con predicción, probabilidades, diagnóstico real e imagen procesada en base64

 Pestaña de métricas:  GET /api/metricas  ->  datos/metricas.json + tiempo de inferencia medido
```

## Preprocesamiento y verificación

El modelo solo da probabilidades confiables si recibe imágenes procesadas exactamente como en su entrenamiento, por eso todo el preprocesamiento está en `retina.py` y no se modifica.

Las fotos originales pasan por el recorte completo. Las imágenes que ya miden 384x384 (los ejemplos de la galería y las de `prueba_384/`) ya fueron recortadas en el preprocesamiento del proyecto, así que solo reciben la normalización de color: recortarlas otra vez cambiaría la imagen que ve el modelo. Las fotos originales nunca miden 384x384, de modo que ambos casos reproducen exactamente el preprocesamiento del entrenamiento.

`verificar.py` lo comprueba: clasifica las 10 imágenes de `ejemplos/` y las compara con `datos/predicciones_test.csv`. El criterio es 10 de 10 clases iguales y una diferencia máxima de probabilidad menor a 0,01 (no es 0 porque la evaluación usó precisión mixta en GPU y la app calcula en CPU con 32 bits). Resultado actual: 10 de 10 y diferencia máxima de 0,0028.

## Instalación

Requiere Python 3.10 o superior.

```bash
python -m venv .venv
source .venv/bin/activate        # en Windows: .venv\Scripts\activate
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

`torch` y `torchvision` se instalan desde el índice de CPU para no descargar las librerías de GPU. `torchvision` debe venir del mismo índice: si se descarga desde PyPI no coincide con el `torch` de CPU y aparece el error `operator torchvision::nms does not exist`.

## Ejecución

```bash
python verificar.py
uvicorn main:app --reload
```

Al arrancar, el servidor carga el modelo una vez y mide el tiempo de inferencia en CPU (2 predicciones de calentamiento y la mediana de 10 medidas); en el equipo de desarrollo fue de unos 310 ms.

- Interfaz: http://localhost:8000 (pestaña de métricas: http://localhost:8000/#metricas)
- Documentación automática de la API: http://localhost:8000/docs
- Desde un celular en la misma red: `uvicorn main:app --host 0.0.0.0 --port 8000` y abrir `http://<IP-del-computador>:8000`.

## Endpoints

### `POST /api/predecir`

Formulario multipart con el campo de archivo `archivo`. Ejemplo con `ejemplos/a8652b2de23f.png`:

```json
{
  "prediccion": "Moderada",
  "indice": 2,
  "confianza": 0.991,
  "referible": true,
  "probabilidades": [
    {"indice": 0, "clase": "Sin RD", "probabilidad": 0.000},
    {"indice": 1, "clase": "Leve", "probabilidad": 0.001},
    {"indice": 2, "clase": "Moderada", "probabilidad": 0.991},
    {"indice": 3, "clase": "Severa", "probabilidad": 0.000},
    {"indice": 4, "clase": "Proliferativa", "probabilidad": 0.008}
  ],
  "real": "Moderada",
  "coincide": true,
  "imagen_modelo": "data:image/png;base64,..."
}
```

`real` y `coincide` se obtienen buscando el nombre del archivo sin extensión en `datos/etiquetas_test.csv`; si la imagen no es del conjunto de prueba valen `null`. Errores: 413 si la imagen supera 15 MB y 400 si el archivo no es una imagen válida.

### `GET /api/metricas`

Devuelve `datos/metricas.json` con el campo `tiempo_ms` agregado: modelo, parámetros, tamaño, época seleccionada, criterio de selección, validación cruzada, bloques `validacion` y `prueba` (exactitud, exactitud balanceada, F1 macro, QWK, mAP, AUC macro, sensibilidad y especificidad referible, pérdida, Brier, ECE, confianza media en los errores, métricas por clase y matriz de confusión) e `historial` por época. La app no recalcula métricas: muestra las de la evaluación.

### `GET /api/ejemplos`

Lista de ejemplos ordenada por diagnóstico real:

```json
[{"nombre": "b9bc81fcb075.png", "id_code": "b9bc81fcb075", "real": "Sin RD"}, ...]
```

### `GET /api/salud`

```json
{"estado": "ok", "modelo": "efficientnet_b0", "clases": 5}
```

## Decisiones técnicas

- **`def` y no `async def` en la predicción.** La inferencia ocupa la CPU; con `def`, FastAPI la ejecuta en un hilo aparte y el servidor sigue atendiendo otras peticiones.
- **El modelo se carga una sola vez**, al importar `main.py`, junto con las etiquetas y las métricas.
- **Las barras siguen el orden de la escala**, nunca se ordenan por probabilidad: los niveles son ordinales y así se ve si el modelo dudaba entre niveles vecinos.
- **Se muestra la imagen normalizada**, que es lo que realmente recibe el modelo.
- **Sin CORS**: la página y la API se sirven desde el mismo origen.
- **Pestañas en la URL** (`#clasificar` y `#metricas`), para que se mantengan al recargar.
- **Gráficos SVG sin librerías**, con `viewBox` para adaptarse al ancho.
- **Textos con `textContent`**: el frontend nunca inserta HTML proveniente de la API.

## Limitaciones

- Herramienta académica: no reemplaza el diagnóstico de un oftalmólogo.
- El modelo es sobreconfiado: muchos de sus errores tienen probabilidades cercanas al 100%.
- Rinde peor en las clases con pocas imágenes, sobre todo Severa.
- Los resultados solo son válidos para imágenes similares a las de APTOS 2019.

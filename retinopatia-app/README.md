# Clasificación de retinopatía diabética: interfaz web

## 1. Qué es el proyecto

Proyecto académico de Ingeniería de Sistemas. Un modelo EfficientNet-B0, entrenado con el dataset APTOS 2019, clasifica imágenes de fondo de ojo en los 5 niveles de la escala clínica internacional de retinopatía diabética (RD):

| Índice | Nivel | Descripción |
|---|---|---|
| 0 | Sin RD | No se observan signos de retinopatía |
| 1 | Leve | Solo microaneurismas, pequeños puntos rojos en la retina |
| 2 | Moderada | Hemorragias y exudados más numerosos |
| 3 | Severa | Lesiones extensas en toda la retina y zonas con mala irrigación |
| 4 | Proliferativa | Crecimiento de vasos sanguíneos anormales; riesgo de pérdida de visión |

Desde Moderada (índice 2) la retinopatía se considera **referible**: se recomienda derivar al oftalmólogo.

La interfaz permite subir una imagen (o elegir uno de los 10 ejemplos del conjunto de prueba) y muestra el nivel predicho, la probabilidad de cada nivel, si el caso es referible, el diagnóstico real cuando se conoce y la imagen tal como la ve el modelo.

El análisis de datos, el entrenamiento y la evaluación se hicieron antes y no forman parte de esta carpeta. Resultados en prueba: exactitud 0,830, F1 macro cercano a 0,63, QWK cercano a 0,88.

## 2. Estructura de directorios

```
retinopatia-app/
├── modelo/efficientnet_b0_final_pesos.pt   Pesos del modelo final (state_dict de PyTorch). Solo lectura.
├── datos/etiquetas_test.csv                Diagnóstico real de las 534 imágenes de prueba. Solo lectura.
├── datos/predicciones_test.csv             Predicciones de la evaluación oficial, usadas por verificar.py. Solo lectura.
├── ejemplos/<id_code>.png                  10 imágenes de prueba de 384x384 (5 aciertos y 5 errores). Solo lectura.
├── static/index.html                       Estructura de la página.
├── static/styles.css                       Estilos, con variables de diseño en :root.
├── static/app.js                           Lógica del navegador: carga, envío y dibujo del resultado.
├── retina.py                               Preprocesamiento y predicción. Única fuente de verdad.
├── main.py                                 API con FastAPI y servidor de archivos estáticos.
├── verificar.py                            Comprueba que la app reproduce la evaluación oficial.
├── requirements.txt                        Dependencias de Python (sin torch, que se instala aparte).
├── .gitignore                              Excluye el entorno virtual y archivos temporales.
└── README.md                               Este documento.
```

## 3. Arquitectura

```
 Navegador (index.html + app.js)
        |
        |  POST /api/predecir  (multipart, campo "archivo")
        v
 main.py (FastAPI)
        |  valida tamaño (15 MB) y que sea imagen
        |  decodifica en memoria con OpenCV, BGR -> RGB
        v
 retina.py
        |  1. recortar_y_redimensionar: quita el borde negro, hace cuadrada la foto, 384x384
        |  2. normalizar_color: resta el desenfoque gaussiano para resaltar lesiones
        |  3. normaliza con media y desviación de ImageNet y crea el tensor
        |  4. EfficientNet-B0 -> softmax -> 5 probabilidades
        v
 main.py
        |  arma el JSON: predicción, confianza, referible, probabilidades,
        |  diagnóstico real (si la imagen es del conjunto de prueba) e imagen procesada en base64
        v
 Navegador: dibuja el resultado
```

El frontend y la API se sirven desde el mismo servidor y el mismo origen.

## 4. Por qué el preprocesamiento no debe modificarse

Una red neuronal aprende a partir de imágenes con unas características concretas: recorte, tamaño, contraste y normalización. Si en producción recibe imágenes procesadas de otra forma, sigue entregando probabilidades sin ningún error visible, pero esas probabilidades ya no son confiables. Por eso `retina.py` es una copia exacta del código usado al entrenar y evaluar, y nadie más implementa preprocesamiento.

`verificar.py` lo comprueba: clasifica las 10 imágenes de `ejemplos/` y compara con las predicciones de la evaluación oficial (`datos/predicciones_test.csv`). El criterio es que coincidan las 10 clases y que la diferencia máxima de probabilidad sea menor a 0,01 (no es exactamente 0 porque la evaluación usó precisión mixta en GPU y aquí se calcula en CPU con 32 bits).

**Resultado actual:** las 10 clases coinciden, pero la diferencia máxima es 0,147, por lo que el script informa "verificación FALLIDA" y una nota explicativa. La causa conocida y aceptada es esta: los PNG de `ejemplos/` ya están recortados a 384x384 con franjas negras, y `retina.predecir` los vuelve a recortar y redimensionar. La evaluación oficial partió de las fotos originales, de mayor resolución, así que esta segunda interpolación cambia levemente algunos píxeles. El efecto solo se nota en los casos donde el modelo no estaba saturado (por ejemplo 0,73 o 0,83 en la evaluación); en los casos cercanos al 100% la diferencia es prácticamente nula. Con las fotos originales la diferencia debería quedar por debajo de 0,01.

## 5. Instalación

Requiere Python 3.10 o superior.

```bash
python -m venv .venv
source .venv/bin/activate        # en Windows: .venv\Scripts\activate
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

`torch` se instala desde el índice de CPU para no descargar las librerías de GPU, que pesan varios GB. `torchvision` también se instala desde ese índice: `timm` lo necesita, y si se descarga desde PyPI su versión no coincide con el `torch` de CPU y aparece el error `operator torchvision::nms does not exist`.

## 6. Cómo ejecutar

```bash
python verificar.py
uvicorn main:app --reload
```

- Interfaz: http://localhost:8000
- Documentación automática de la API: http://localhost:8000/docs
- Para abrirla desde un celular en la misma red Wi-Fi: `uvicorn main:app --host 0.0.0.0 --port 8000` y en el celular abrir `http://<IP-del-computador>:8000` (la IP se consulta con `ip addr` en Linux, `ipconfig` en Windows o `ifconfig` en macOS).

## 7. Endpoints

### `POST /api/predecir`

Formulario multipart con un único campo de archivo llamado `archivo`.

```json
{
  "prediccion": "Moderada",
  "indice": 2,
  "confianza": 0.793,
  "referible": true,
  "probabilidades": [
    {"indice": 0, "clase": "Sin RD", "probabilidad": 0.0},
    {"indice": 1, "clase": "Leve", "probabilidad": 0.0},
    {"indice": 2, "clase": "Moderada", "probabilidad": 0.793},
    {"indice": 3, "clase": "Severa", "probabilidad": 0.200},
    {"indice": 4, "clase": "Proliferativa", "probabilidad": 0.007}
  ],
  "real": "Moderada",
  "coincide": true,
  "imagen_modelo": "data:image/png;base64,..."
}
```

`real` y `coincide` se obtienen buscando el nombre del archivo (sin extensión) en `datos/etiquetas_test.csv`; si la imagen no es del conjunto de prueba valen `null`.

Errores:
- 413 `{"detail": "La imagen supera el tamaño máximo de 15 MB."}`
- 400 `{"detail": "El archivo no es una imagen válida."}`

### `GET /api/ejemplos`

Lista de ejemplos ordenada por diagnóstico real y luego por nombre:

```json
[{"nombre": "b9bc81fcb075.png", "id_code": "b9bc81fcb075", "real": "Sin RD"}, ...]
```

### `GET /api/salud`

```json
{"estado": "ok", "modelo": "efficientnet_b0", "clases": 5}
```

## 8. Decisiones técnicas

- **`def` y no `async def` en la predicción.** La inferencia es cálculo pesado en la CPU. Si la función fuera `async`, se ejecutaría en el bucle de eventos y bloquearía todas las demás peticiones mientras dura. Con `def`, FastAPI la ejecuta en un hilo aparte y el servidor sigue respondiendo.
- **El modelo se carga una sola vez.** Construir la red y leer 16 MB de pesos tarda; hacerlo en cada petición haría la app lenta. Por eso el modelo y las etiquetas se cargan al importar `main.py`.
- **Las barras siguen el orden de la escala.** Los niveles son ordinales: Moderada está entre Leve y Severa. Si las barras se ordenaran por probabilidad se perdería esa información; en el orden de la escala se ve de inmediato si el modelo dudaba entre niveles vecinos (lo esperable) o entre niveles lejanos.
- **No hay CORS.** El navegador solo exige CORS cuando una página pide datos a otro origen. Aquí la página y la API se sirven desde el mismo servidor, así que no hace falta y no se abre la API a otros sitios.
- **Se muestra la imagen normalizada.** Es lo que realmente recibe el modelo. Permite comprobar que el recorte fue correcto y entender por qué una foto mal iluminada o mal centrada puede dar un resultado extraño.
- **Rutas con `Path(__file__).parent`.** La app funciona sin importar desde qué carpeta se ejecute.
- **Textos con `textContent`.** El frontend nunca inserta HTML proveniente de la API, lo que evita inyecciones de código.

## 9. Limitaciones

- Es una herramienta académica y no reemplaza el diagnóstico de un oftalmólogo.
- El modelo es **sobreconfiado**: muchos de sus errores tienen probabilidades cercanas al 100%. Un 99% no garantiza que la predicción sea correcta. De los 10 ejemplos incluidos, 5 son errores, varios con confianza mayor al 99%.
- Los resultados solo son válidos para imágenes de fondo de ojo similares a las de APTOS 2019 (cámaras, iluminación y población de ese dataset). Cualquier otra imagen recibirá igualmente una predicción, pero sin sentido clínico.

# Material para el informe

El informe final en formato Springer LNCS está en `Clasificación_del_grado_de_retinopatía_diabética_en_imágenes_de_fondo_de_ojo_con_EfficientNet_B0.pdf`.

Capturas de la aplicación, gráficas y tablas del modelo EfficientNet-B0 (segundo entrenamiento, época 20). Todo se generó a partir de los archivos de `retinopatia-app/` sin recalcular métricas: las gráficas y tablas salen de `datos/metricas.json` y `datos/predicciones_test.csv`.

## Cómo regenerarlo

Desde la raíz del proyecto, con la aplicación en ejecución (`cd retinopatia-app && uvicorn main:app`):

```bash
retinopatia-app/.venv/bin/python scripts/capturar_interfaz.py
retinopatia-app/.venv/bin/python scripts/generar_figuras.py
```

- `capturar_interfaz.py` necesita Google Chrome instalado. Abre el navegador sin ventana y recorre la aplicación.
- `generar_figuras.py` necesita matplotlib en el entorno de la app (`retinopatia-app/.venv/bin/pip install matplotlib`). No forma parte de `requirements.txt` porque la aplicación no lo usa.

## `capturas/`: la interfaz

Escritorio a 1440 px de ancho, salvo las tres últimas (celular, 390 px). Resolución doble para que se vean nítidas impresas.

| Archivo | Contenido |
|---|---|
| `01_clasificar_inicial.png` | Pestaña Clasificar antes de cargar una imagen |
| `02_resultado_sin_rd_acierto.png` | Caso sano bien clasificado (`b9bc81fcb075`, Sin RD, 100,0%) |
| `03_resultado_proliferativa_acierto.png` | Caso referible bien clasificado (`70d657f8f503`, Proliferativa, 90,7%) |
| `04_panel_resultado.png` | Solo el panel de resultado del caso anterior |
| `05_resultado_error_de_clasificacion.png` | Error: `1bb0ddfe753a`, real Leve, predicho Moderada con 100,0% |
| `06_imagen_original_y_preprocesada.png` | Imagen cargada y lo que ve el modelo, del caso anterior |
| `07_estado_analizando.png` | Estado de procesamiento con barra indeterminada |
| `08_estado_error_archivo_no_valido.png` | Mensaje de error al subir un archivo que no es imagen |
| `09_metricas_validacion_completa.png` | Pestaña Métricas completa, conjunto de validación |
| `10_ficha_del_modelo.png` | Ficha de EfficientNet-B0 |
| `11` a `14` | Métricas principales, calibración, tabla por clase y matriz, en validación |
| `15_metricas_prueba_completa.png` | Pestaña Métricas completa, conjunto de prueba |
| `16` a `19` | Métricas principales, calibración, tabla por clase y matriz, en prueba |
| `20_matriz_confusion_prueba_proporcion.png` | Matriz de prueba en proporción por clase real |
| `21_curvas_de_entrenamiento.png` | Las tres curvas de entrenamiento de la interfaz |
| `22_movil_clasificar_inicial.png` | Pestaña Clasificar en el celular |
| `23_movil_resultado.png` | Resultado en el celular |
| `24_movil_metricas.png` | Pestaña Métricas en el celular |

## `graficas/`: figuras para el informe

Generadas con matplotlib a 200 ppp, con los colores de la interfaz y coma decimal.

| Archivo | Contenido |
|---|---|
| `01_curva_perdida.png` | Pérdida de entrenamiento y validación por época, con la época seleccionada |
| `02_curva_exactitud.png` | Exactitud de entrenamiento y validación por época |
| `03_curva_metricas_validacion.png` | F1 macro, QWK y mAP de validación por época |
| `04` y `05` | Matriz de confusión de validación, en conteo y en proporción por clase real |
| `06` y `07` | Matriz de confusión de prueba, en conteo y en proporción por clase real |
| `08_metricas_principales.png` | Ocho métricas principales, validación frente a prueba |
| `09_calibracion.png` | ECE, pérdida, Brier y confianza media en los errores |
| `10` y `11` | Precisión, exhaustividad y F1 por clase, en validación y en prueba |
| `12_imagenes_por_clase.png` | Número de imágenes por clase: muestra el desbalance |
| `13_preprocesamiento_por_clase.png` | Un ejemplo por clase: imagen recortada y con color normalizado |
| `14_ejemplos_galeria.png` | Los 10 ejemplos con clase real, predicha y probabilidad (verde acierto, rojo error) |

## `tablas/`: datos en texto

| Archivo | Contenido |
|---|---|
| `metricas_globales.md` | Tabla lista para pegar: 16 métricas en validación y prueba |
| `metricas_globales.csv` | La misma tabla en CSV |
| `metricas_por_clase_validacion.csv` y `_prueba.csv` | Precisión, exhaustividad, F1, AP, AUC y soporte por clase |
| `historial_entrenamiento.csv` | Pérdida, exactitud, F1, QWK y mAP por época |
| `ejemplos_galeria.csv` | Los 10 ejemplos con clase real, predicha, probabilidad y resolución original |

## Resultados de los ejemplos de la galería

De los 10 ejemplos, 5 son aciertos y 5 errores. Los cinco errores tienen una probabilidad de 98% o más, lo que ilustra la sobreconfianza del modelo.

| id_code | Real | Predicha | Probabilidad | Resultado |
|---|---|---|---:|---|
| b9bc81fcb075 | Sin RD | Sin RD | 100,0% | Acierto |
| cb0cc98d7e35 | Sin RD | Leve | 98,0% | Error |
| 1bb0ddfe753a | Leve | Moderada | 100,0% | Error |
| 494fc9c745a3 | Leve | Leve | 76,4% | Acierto |
| a8652b2de23f | Moderada | Moderada | 99,1% | Acierto |
| d952dbfb0fe4 | Moderada | Severa | 99,1% | Error |
| 91cf56d3d1af | Severa | Severa | 96,8% | Acierto |
| af3b0115aad1 | Severa | Proliferativa | 100,0% | Error |
| 312694ea8e6a | Proliferativa | Severa | 100,0% | Error |
| 70d657f8f503 | Proliferativa | Proliferativa | 90,7% | Acierto |

## Notas

- El tiempo de inferencia que aparece en las capturas (310 ms) se midió en el equipo de desarrollo y cambia según el procesador.
- Las imágenes de los ejemplos ya están recortadas a 384×384; la figura 13 muestra el paso de normalización de color, que es lo que ve el modelo.

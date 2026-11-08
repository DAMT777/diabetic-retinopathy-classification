import cv2
import numpy as np
import torch
import timm
import albumentations as A
from albumentations.pytorch import ToTensorV2

NOMBRES = {0: "Sin RD", 1: "Leve", 2: "Moderada", 3: "Severa", 4: "Proliferativa"}
ORDEN = list(NOMBRES.values())
TAM = 384
MEDIA = (0.485, 0.456, 0.406)
DESV = (0.229, 0.224, 0.225)
ARQUITECTURA = "efficientnet_b0"


def recortar_y_redimensionar(img_rgb, tam=TAM, umbral=7):
    gris = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
    mascara = gris > umbral
    filas = np.where(mascara.any(axis=1))[0]
    cols = np.where(mascara.any(axis=0))[0]
    if len(filas) and len(cols):
        img_rgb = img_rgb[filas[0]:filas[-1] + 1, cols[0]:cols[-1] + 1]

    h, w = img_rgb.shape[:2]
    lado = max(h, w)
    lienzo = np.zeros((lado, lado, 3), dtype=img_rgb.dtype)
    y0, x0 = (lado - h) // 2, (lado - w) // 2
    lienzo[y0:y0 + h, x0:x0 + w] = img_rgb
    return cv2.resize(lienzo, (tam, tam), interpolation=cv2.INTER_AREA)


def normalizar_color(img_rgb, sigma_rel=30, umbral=10, erosion=3):
    tam = img_rgb.shape[0]
    sigma = tam / sigma_rel
    img = img_rgb.astype(np.float32)

    gris = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
    mascara = (gris > umbral).astype(np.float32)
    nucleo = np.ones((2 * erosion + 1, 2 * erosion + 1), np.uint8)
    mascara = cv2.erode(mascara, nucleo)

    suma = cv2.GaussianBlur(img * mascara[:, :, None], (0, 0), sigma)
    peso = cv2.GaussianBlur(mascara, (0, 0), sigma)[:, :, None]
    desenfoque = suma / np.maximum(peso, 1e-3)

    salida = 4 * img - 4 * desenfoque + 128
    salida = np.clip(salida, 0, 255) * mascara[:, :, None]
    return salida.astype(np.uint8)


_transformar = A.Compose([
    A.Resize(TAM, TAM),
    A.Normalize(mean=MEDIA, std=DESV),
    ToTensorV2(),
])


def cargar_modelo(ruta_pesos, device):
    modelo = timm.create_model(ARQUITECTURA, pretrained=False, num_classes=len(NOMBRES))
    modelo.load_state_dict(torch.load(ruta_pesos, map_location=device))
    return modelo.to(device).eval()


@torch.no_grad()
def predecir(modelo, img_rgb, device):
    recortada = recortar_y_redimensionar(img_rgb)
    normalizada = normalizar_color(recortada)
    x = _transformar(image=normalizada)["image"].unsqueeze(0).to(device)
    probs = modelo(x).float().softmax(1)[0].cpu().numpy()
    return probs, normalizada

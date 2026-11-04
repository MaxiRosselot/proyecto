# Logo de RepisasPro: el simbolo de repisa de Don Maxi (public/web/logo-icono.png) en los colores
# de la marca, con el nombre abajo. Genera public/pyme/*.png. Uso: python scripts/logo-repisaspro.py
# (la tipografia es Bahnschrift, de Windows).
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import os
base = os.path.abspath(os.path.join(os.path.dirname(__file__), '..')).replace(os.sep, '/') + '/'
icono = Image.open(base + 'public/web/logo-icono.png').convert('RGBA')

def tenir(img, hexcolor):
    a = np.array(img); r, g, b = (int(hexcolor[i:i+2], 16) for i in (1, 3, 5))
    a[..., 0], a[..., 1], a[..., 2] = r, g, b
    return Image.fromarray(a)

AZUL, CELESTE, TINTA, BLANCO = '#1F5BFF', '#5EC8FF', '#0B1626', '#FFFFFF'
for nombre, color in [('azul', AZUL), ('celeste', CELESTE), ('blanco', BLANCO)]:
    tenir(icono, color).save(base + f'public/pyme/icono-{nombre}.png')

F = 'C:/Windows/Fonts/bahnschrift.ttf'
def fuente(tam, peso):
    f = ImageFont.truetype(F, tam)
    try: f.set_variation_by_axes([peso, 100])
    except Exception: pass
    return f

def apilado(icon_color, repisas_color, pro_color, tag_color, archivo):
    W, H = 760, 820
    lienzo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ic = tenir(icono, icon_color)
    esc = 480 / ic.height
    ic = ic.resize((round(ic.width * esc), 480), Image.LANCZOS)
    lienzo.alpha_composite(ic, ((W - ic.width) // 2, 10))
    d = ImageDraw.Draw(lienzo)
    f1, f2 = fuente(120, 400), fuente(120, 700)
    t1, t2 = 'REPISAS', 'PRO'
    w1 = d.textlength(t1, font=f1); w2 = d.textlength(t2, font=f2)
    x = (W - (w1 + w2)) / 2; y = 530
    d.text((x, y), t1, font=f1, fill=repisas_color)
    d.text((x + w1, y), t2, font=f2, fill=pro_color)
    f3 = fuente(34, 400)
    tag = 'ESTANTERÍAS PARA EMPRESAS'
    esp = 7
    ancho = sum(d.textlength(c, font=f3) for c in tag) + esp * (len(tag) - 1)
    x = (W - ancho) / 2
    for c in tag:
        d.text((x, 690), c, font=f3, fill=tag_color); x += d.textlength(c, font=f3) + esp
    lienzo = lienzo.crop(lienzo.getbbox())
    lienzo.save(base + f'public/pyme/{archivo}')
    return lienzo

claro = apilado(AZUL, TINTA, AZUL, '#5B6878', 'logo-repisaspro.png')
oscuro = apilado(CELESTE, BLANCO, CELESTE, '#9FB0C4', 'logo-repisaspro-oscuro.png')
S = base + 'public/pyme/'
hoja = Image.new('RGBA', (claro.width + oscuro.width + 120, max(claro.height, oscuro.height) + 60), '#FFFFFF')
hoja.alpha_composite(claro, (30, 30))
fondo = Image.new('RGBA', (oscuro.width + 60, oscuro.height + 60), TINTA)
fondo.alpha_composite(oscuro, (30, 30))
hoja.alpha_composite(fondo, (claro.width + 60, 0))
hoja.save(S + 'muestra-logos.png')
print(claro.size, oscuro.size)

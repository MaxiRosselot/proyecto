// Genera los iconos de la app del panel (pantalla de inicio del iPhone y Android) desde public/logo.png:
// el simbolo dorado de Don Maxi, sin el texto, sobre el fondo oscuro del panel.
//   node scripts/generar-iconos.mjs
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const FONDO = '#18181B'
// Recorte del simbolo dentro del logo de 1080 x 1080 (sin "DON MAXI / OPTIMIZA TU ESPACIO").
const SIMBOLO = { x: 392, y: 272, ancho: 282, alto: 396 }
// Cuanto ocupa el simbolo del alto del icono. "maskable" deja margen para que Android lo recorte en circulo.
const ICONOS = [
  { archivo: 'icon-180.png', lado: 180, alto: .62 },
  { archivo: 'icon-192.png', lado: 192, alto: .62 },
  { archivo: 'icon-512.png', lado: 512, alto: .62 },
  { archivo: 'icon-512-maskable.png', lado: 512, alto: .48 },
]

const logo = 'data:image/png;base64,' + readFileSync('public/logo.png').toString('base64')
mkdirSync('public/app', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage()
  for (const icono of ICONOS) {
    const png = await page.evaluate(async ({ logo, icono, SIMBOLO, FONDO }) => {
      const img = new Image(); img.src = logo; await img.decode()
      const c = Object.assign(document.createElement('canvas'), { width: icono.lado, height: icono.lado })
      const g = c.getContext('2d')
      g.fillStyle = FONDO; g.fillRect(0, 0, icono.lado, icono.lado)
      const alto = icono.lado * icono.alto, ancho = alto * SIMBOLO.ancho / SIMBOLO.alto
      g.imageSmoothingQuality = 'high'
      g.drawImage(img, SIMBOLO.x, SIMBOLO.y, SIMBOLO.ancho, SIMBOLO.alto, (icono.lado - ancho) / 2, (icono.lado - alto) / 2, ancho, alto)
      return c.toDataURL('image/png').split(',')[1]
    }, { logo, icono, SIMBOLO, FONDO })
    writeFileSync('public/app/' + icono.archivo, Buffer.from(png, 'base64'))
    console.log('public/app/' + icono.archivo)
  }
} finally { await browser.close() }

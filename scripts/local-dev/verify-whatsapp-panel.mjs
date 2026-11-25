// Prueba E2E: WhatsApp dentro del panel. Con la extension (Edge, porque Chrome ya no carga
// extensiones por linea de comandos) WhatsApp Web se ve dentro, "Preguntar" deja el mensaje listo en
// la ventana sin abrir otra pestaña y el buscador encuentra al cliente. Sin la extension, salen las
// instrucciones. Contra el entorno local (start-native.mjs).   node scripts/local-dev/verify-whatsapp-panel.mjs
import { chromium, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const extension = resolve(dirname(fileURLToPath(import.meta.url)), '../../extension-whatsapp')
const perfil = mkdtempSync(join(tmpdir(), 'wa-panel-'))

async function entrar(page) {
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
}

const ctx = await chromium.launchPersistentContext(perfil, {
  channel: 'msedge', headless: false, viewport: { width: 1500, height: 900 },
  args: ['--headless=new', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
})
try {
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base })
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  await entrar(page)
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = async (ruta, data) => (await page.request.fetch(base + '/.netlify/functions/' + ruta, { method: data ? 'POST' : 'GET', data, headers: { Authorization: 'Bearer ' + token } })).json()
  const nombre = 'Prueba Whatsapp ' + Date.now().toString(36)
  const q = await api('save-quote', { crear: true, nombre, telefono: '9 3333 4444', subtotal: 100000, iva: 19000, total: 119000, repisas: [{ largo: 1.2, prof: .45, alto: 2, niveles: 5, unidades: 1, valor: 100000 }], adicionales: {} })

  // Abrir WhatsApp: la ventana aparece a la derecha y WhatsApp Web carga dentro (pide el QR).
  await page.getByRole('button', { name: 'WhatsApp', exact: true }).click()
  const ventana = page.getByTestId('ventana-whatsapp')
  await expect(ventana).toBeVisible()
  const marco = page.frameLocator('iframe[title="WhatsApp Web"]')
  await expect(marco.getByText(/Escanea|Scan|código QR|QR code/i).first()).toBeVisible({ timeout: 30000 })

  // "Preguntar" no abre otra pestaña: deja el mensaje listo (y copiado) en la ventana.
  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  const paginas = ctx.pages().length
  await page.locator('#cot-' + q.cotNum).getByTestId('seguimiento-whatsapp').getByRole('button', { name: 'Preguntar' }).click()
  const listo = ventana.getByTestId('whatsapp-para-enviar')
  await expect(listo.getByText(nombre)).toBeVisible()
  await expect(listo.getByText('+56 9 3333 4444')).toBeVisible()
  await expect(listo.getByText('✓ Mensaje copiado')).toBeVisible()
  if (ctx.pages().length !== paginas) throw new Error('Preguntar abrió otra pestaña con la ventana abierta')
  const copiado = await page.evaluate(() => navigator.clipboard.readText())
  if (!copiado.includes('N° ' + q.cotNum)) throw new Error('No quedó copiado el mensaje: ' + copiado)

  // Buscar al cliente y copiar su numero.
  await ventana.getByLabel('Buscar cliente').fill(nombre.split(' ').at(-1))
  const resultado = ventana.getByTestId('whatsapp-resultados')
  await expect(resultado.getByText(nombre)).toBeVisible()
  await resultado.getByRole('button', { name: 'Copiar número' }).click()
  if (await page.evaluate(() => navigator.clipboard.readText()) !== '+56 9 3333 4444') throw new Error('No copió el número')
  await page.screenshot({ path: process.env.SHOT || 'whatsapp-panel.png' })

  // Cerrar: el panel vuelve a todo el ancho y queda el boton para abrirla otra vez.
  await ventana.getByRole('button', { name: 'Cerrar WhatsApp' }).click()
  await expect(ventana).toBeHidden()
  await expect(page.getByRole('button', { name: 'WhatsApp', exact: true })).toBeVisible()
  await api('delete-quote', { cotNum: q.cotNum })
  if (errors.length) throw new Error(errors.join('\n'))
} finally { await ctx.close(); rmSync(perfil, { recursive: true, force: true }) }

// Sin la extension: instrucciones para instalarla, sin iframe.
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await entrar(page)
  await page.getByRole('button', { name: 'WhatsApp', exact: true }).click()
  await expect(page.getByTestId('whatsapp-sin-extension')).toBeVisible()
  await expect(page.locator('iframe[title="WhatsApp Web"]')).toHaveCount(0)
  const zip = await page.request.get(base + '/whatsapp-en-el-panel.zip')
  if (!zip.ok() || (await zip.body()).length < 1000) throw new Error('No se puede descargar la extensión')
} finally { await browser.close() }
console.log('OK whatsapp en el panel')

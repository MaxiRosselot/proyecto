// Prueba E2E: la seccion WhatsApp. Clientes a la izquierda, WhatsApp Web al centro (con la extension,
// en Edge) y la ficha a la derecha: esperar hasta una fecha, bitacora, mensaje "en su chat" que anota
// la pregunta, mis mensajes con {nombre}, y el mismo WhatsApp (sin recargar) al ir a otra seccion y
// volver. Contra el entorno local (start-native.mjs).   node scripts/local-dev/verify-modulo-whatsapp.mjs
import { chromium, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ahoraEnZona, sumarDias } from '../../netlify/functions/lib/horarios.mjs'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const extension = resolve(dirname(fileURLToPath(import.meta.url)), '../../extension-whatsapp')
const perfil = mkdtempSync(join(tmpdir(), 'wa-modulo-'))
const ctx = await chromium.launchPersistentContext(perfil, {
  channel: 'msedge', headless: false, viewport: { width: 1600, height: 950 },
  args: ['--headless=new', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
})
let api, cotNum
try {
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base })
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  api = async (ruta, data) => (await page.request.fetch(base + '/.netlify/functions/' + ruta, { method: data ? 'POST' : 'GET', data, headers: { Authorization: 'Bearer ' + token } })).json()
  const nombre = 'Modulo Whatsapp ' + Date.now().toString(36)
  cotNum = (await api('save-quote', { crear: true, nombre, telefono: '9 5555 6666', subtotal: 100000, iva: 19000, total: 119000, repisas: [{ largo: 1.2, prof: .45, alto: 2, niveles: 5, unidades: 1, valor: 100000 }], adicionales: {} })).cotNum
  const hoy = ahoraEnZona().fecha

  // Abrir la seccion: WhatsApp al centro, cargado dentro (pide el QR), sobre su hueco.
  await page.getByRole('navigation').getByRole('button', { name: 'WhatsApp', exact: true }).click()
  const modulo = page.getByTestId('modulo-whatsapp')
  await expect(modulo).toBeVisible()
  const marco = page.frameLocator('iframe[title="WhatsApp Web"]')
  await expect(marco.getByText(/Escanea|Scan|código QR|QR code/i).first()).toBeVisible({ timeout: 30000 })
  const [hueco, iframe] = await Promise.all([modulo.getByTestId('lugar-whatsapp').boundingBox(), page.getByTestId('marco-whatsapp').boundingBox()])
  if (Math.abs(hueco.x - iframe.x) > 2 || Math.abs(hueco.width - iframe.width) > 2) throw new Error(`WhatsApp no quedó en su lugar: ${JSON.stringify({ hueco, iframe })}`)
  await page.evaluate(() => { window.__marco = document.querySelector('[data-testid=marco-whatsapp]') })

  // Buscar al cliente y elegirlo: su ficha a la derecha.
  await modulo.getByLabel('Buscar cliente').fill(nombre)
  await page.getByTestId('cliente-' + cotNum).click()
  const ficha = page.getByTestId('ficha-cliente')
  await expect(ficha.getByText(nombre)).toBeVisible()
  await expect(ficha.getByText('+56 9 5555 6666')).toBeVisible()

  // "En su chat" con el mensaje de seguimiento: lo deja escrito en su chat y anota la pregunta.
  await page.getByTestId('mensaje-sin-respuesta').getByRole('button', { name: 'En su chat' }).click()
  await expect(page.getByTestId('ficha-seguimiento').getByText(/Preguntado 1 vez/)).toBeVisible()
  const src = await page.getByTestId('marco-whatsapp').getAttribute('src')
  if (!src.includes('web.whatsapp.com/send?phone=56955556666&text=Hola+Modulo')) throw new Error('No abrió su chat con el mensaje: ' + src)

  // Pospuso: esperar 2 semanas. Sale del "toca preguntar" y aparece en Esperando.
  await page.getByTestId('ficha-seguimiento').getByRole('button', { name: '2 semanas' }).click()
  await expect(page.getByTestId('ficha-seguimiento').getByText(/Esperando hasta el/)).toBeVisible()
  await page.getByTestId('ficha-bitacora').getByLabel('Nota para la bitácora').fill('Lo ve con su señora en diciembre')
  await page.getByTestId('ficha-bitacora').getByRole('button', { name: 'Anotar' }).click()
  await expect(page.getByTestId('ficha-bitacora').getByText('Lo ve con su señora en diciembre')).toBeVisible()
  const guardada = (await api('get-quotes')).quotes.find(x => x.cotNum === cotNum)
  const esperado = { preguntas: [hoy], esperarHasta: sumarDias(hoy, 14), bitacora: [{ fecha: hoy, texto: 'Lo ve con su señora en diciembre' }] }
  if (JSON.stringify(guardada.seguimiento) !== JSON.stringify(esperado)) throw new Error('Quedó guardado ' + JSON.stringify(guardada.seguimiento))
  await modulo.getByLabel('Buscar cliente').fill('')
  await modulo.getByRole('button', { name: /^Esperando · / }).click()
  await expect(page.getByTestId('lista-clientes').getByTestId('cliente-' + cotNum)).toBeVisible()

  // Mis mensajes: con el nombre del cliente.
  await expect(page.getByTestId('mensaje-propio-saludo').getByText('Hola Modulo 👋 Te escribo de Repisas Don Maxi.')).toBeVisible()
  await page.screenshot({ path: process.env.SHOT || 'modulo-whatsapp.png' })

  // Ir a Cotizaciones y volver: el mismo WhatsApp, sin recargar, y en Cotizaciones se ve la espera.
  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await expect(page.getByTestId('marco-whatsapp')).toBeHidden()
  await expect(page.locator('#cot-' + cotNum).getByText(/Esperando hasta el/)).toBeVisible()
  await page.getByRole('navigation').getByRole('button', { name: 'WhatsApp', exact: true }).click()
  await expect(page.getByTestId('marco-whatsapp')).toBeVisible()
  if (!await page.evaluate(() => window.__marco === document.querySelector('[data-testid=marco-whatsapp]'))) throw new Error('WhatsApp se volvió a cargar')

  // Un boton de WhatsApp de otra parte (aqui, el evento que mandan) elige al cliente y deja el mensaje.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('dm:whatsapp-para-enviar', { detail: { telefono: '+56955556666', texto: 'Mensaje de prueba', cliente: 'X' } })))
  await expect(modulo.getByTestId('whatsapp-para-enviar').getByText('Mensaje de prueba')).toBeVisible()
  await expect(page.getByTestId('whatsapp-para-enviar')).toHaveCount(1)
  await expect(page.getByTestId('ficha-cliente').getByText(nombre)).toBeVisible()
  if (errors.length) throw new Error(errors.join('\n'))
} finally {
  if (api && cotNum) await api('delete-quote', { cotNum }).catch(() => {})
  await ctx.close(); rmSync(perfil, { recursive: true, force: true })
}
console.log('OK seccion WhatsApp')

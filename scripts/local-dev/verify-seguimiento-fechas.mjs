// Prueba E2E: el seguimiento por WhatsApp se puede anotar con una fecha anterior y corregir.
// Contra el entorno local (start-native.mjs).   node scripts/local-dev/verify-seguimiento-fechas.mjs
import { chromium, expect } from '@playwright/test'
import { ahoraEnZona, sumarDias } from '../../netlify/functions/lib/horarios.mjs'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = async (ruta, data) => (await page.request.fetch(base + '/.netlify/functions/' + ruta, { method: data ? 'POST' : 'GET', data, headers: { Authorization: 'Bearer ' + token } })).json()
  const nombre = 'Prueba Seguimiento ' + Date.now().toString(36)
  const q = await api('save-quote', { crear: true, nombre, telefono: '9 ' + String(Date.now()).slice(-8), subtotal: 100000, iva: 19000, total: 119000, repisas: [{ largo: 1.2, prof: .45, alto: 2, niveles: 5, unidades: 1, valor: 100000 }], adicionales: {} })
  const hace5 = sumarDias(ahoraEnZona().fecha, -5)

  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  const tarjeta = page.locator('#cot-' + q.cotNum)
  const seg = tarjeta.getByTestId('seguimiento-whatsapp')
  await seg.getByRole('button', { name: '✓ Ya le pregunté' }).click()
  await seg.getByLabel('Fecha de la pregunta').fill(hace5)
  await seg.getByRole('button', { name: 'Anotar' }).click()
  await expect(seg.getByText('Preguntado 1 vez · hace 5 días · toca preguntar')).toBeVisible()
  // Respondio hoy (fecha por defecto).
  await seg.getByRole('button', { name: 'Respondió' }).click()
  await seg.getByRole('button', { name: 'Anotar' }).click()
  await expect(seg.getByText('Respondió hoy')).toBeVisible()
  // Ver las fechas y quitar la respuesta.
  await seg.getByText('Respondió hoy').click()
  await expect(seg.getByTestId('fechas-seguimiento')).toBeVisible()
  await page.screenshot({ path: process.env.SHOT || 'seguimiento.png', clip: { x: 220, y: 0, width: 980, height: 500 } })
  await seg.getByRole('button', { name: 'Quitar la respuesta' }).click()
  await expect(seg.getByText(/Preguntado 1 vez · hace 5 días/)).toBeVisible()
  const guardada = (await api('get-quotes')).quotes.find(x => x.cotNum === q.cotNum)
  if (JSON.stringify(guardada.seguimiento) !== JSON.stringify({ preguntas: [hace5] })) throw new Error('quedó ' + JSON.stringify(guardada.seguimiento))
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('ok: fecha atrasada, respuesta y corrección')
} finally { await browser.close() }

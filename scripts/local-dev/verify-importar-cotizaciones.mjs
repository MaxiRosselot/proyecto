// Prueba E2E: Cotizaciones → Importar crea las cotizaciones de un .json (con su modelo 3D) y se
// abren en el cotizador con su planta. Contra el entorno local (start-native.mjs).
//   node scripts/local-dev/verify-importar-cotizaciones.mjs [archivo.json]
import { chromium, expect } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const archivo = path.resolve(process.argv[2] || '../bodegas-plano.json')
const lista = JSON.parse(readFileSync(archivo, 'utf8'))
const evidence = path.resolve('docs/evidence/2026-11-05-importar')
mkdirSync(evidence, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  page.on('dialog', d => d.accept())
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await page.getByTestId('importar-cotizaciones').setInputFiles(archivo)
  await expect(page.getByText(lista[0].nombre).first()).toBeVisible({ timeout: 60000 })
  const { quotes } = await (await page.request.get(base + '/.netlify/functions/get-quotes', { headers: { Authorization: 'Bearer ' + token } })).json()
  const creadas = lista.map(c => quotes.find(q => q.nombre === c.nombre))
  expect(creadas.every(q => q && q.tieneProyecto3d)).toBe(true)
  // La de las diagonales se abre en el cotizador con su planta.
  const q4 = creadas[3]
  const completa = (await (await page.request.get(base + '/.netlify/functions/get-quotes?cotNum=' + q4.cotNum, { headers: { Authorization: 'Bearer ' + token } })).json()).quote
  expect(completa.proyecto3d.room.planta.some(s => s.direccion === 'abajo-izquierda')).toBe(true)
  await page.getByText(q4.nombre).first().click()
  await page.locator('#cot-' + q4.cotNum).getByRole('button', { name: 'Abrir en cotizador' }).click()
  await page.waitForTimeout(8000)
  await page.screenshot({ path: path.join(evidence, '01-abierta.png'), fullPage: true })
  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, creadas: creadas.map(q => [q.cotNum, q.nombre]) }))
} finally { await browser.close() }

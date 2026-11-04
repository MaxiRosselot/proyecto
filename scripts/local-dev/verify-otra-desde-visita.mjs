// Prueba E2E: en Cotizar, "Desde visita": despues de generar, la visita sigue elegida (aunque paso
// a cotizada) y "Otra para este cliente" usa su nombre. Contra el entorno local (start-native.mjs).
//   node scripts/local-dev/verify-otra-desde-visita.mjs
import { chromium, expect } from '@playwright/test'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
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
  const { visits } = await (await page.request.get(base + '/.netlify/functions/get-visits', { headers: { Authorization: 'Bearer ' + token } })).json()
  const v = visits[0]
  const nombre = v.summary.replace(/^Visita — /, '').replace(/ \(.*\)$/, '')
  expect((await (await page.request.post(base + '/.netlify/functions/update-visit-status', { headers: { Authorization: 'Bearer ' + token }, data: { visitId: v.id, nombre, status: 'realizada', email: v.email, celular: v.celular, direccion: v.direccion } })).json()).ok).toBe(true)

  // Un nombre viejo en "Ingreso manual" no debe colarse.
  await page.getByRole('navigation').getByRole('button', { name: 'Cotizar', exact: true }).click()
  await page.getByRole('button', { name: 'Ingreso manual' }).click()
  await page.getByPlaceholder('Nombre completo').fill('Javier Viejo')
  await page.getByRole('navigation').getByRole('button', { name: 'Visitas', exact: true }).click()
  await page.waitForTimeout(1500)
  await page.getByRole('navigation').getByRole('button', { name: 'Cotizar', exact: true }).click()
  await page.getByRole('button', { name: 'Desde visita' }).click()
  await page.getByRole('button', { name: new RegExp(nombre.split(' ')[0]) }).first().click()
  await page.getByRole('button', { name: 'Generar Cotizacion PDF' }).click()
  await expect(page.getByRole('button', { name: '👥 Otra para este cliente' })).toBeVisible({ timeout: 90000 })
  // Sigue elegida aunque ya este cotizada.
  await expect(page.getByRole('button', { name: new RegExp(nombre.split(' ')[0]) }).first()).toBeVisible()
  await page.getByRole('button', { name: '👥 Otra para este cliente' }).click()
  await expect(page.getByTestId('nueva-desde')).toContainText(nombre)
  await expect(page.getByTestId('nueva-desde')).not.toContainText('Javier')
  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, nombre }))
} finally { await browser.close() }

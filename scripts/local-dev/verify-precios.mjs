// Prueba E2E: cambiar un precio de la tabla desde Cotizar y que se use en todo lo que viene.
// Contra el entorno local (start-native.mjs), con datos limpios.
//   node scripts/local-dev/verify-precios.mjs
import { chromium, expect } from '@playwright/test'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const PASSWORD = process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  page.on('dialog', d => d.accept())
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Cotizar', exact: true }).click()
  await page.getByRole('button', { name: 'Reiniciar' }).click()
  const precios = page.locator('.quote-price-field input')

  // Dos repisas iguales (2,43 x 0,48 x 2 m, $110.000 en la tabla). Se cambia el precio de la primera.
  await page.getByRole('button', { name: '+ Agregar repisa' }).click()
  await expect(precios).toHaveCount(2)
  await expect(precios.nth(1)).toHaveValue('110000')
  await precios.first().fill('130000')
  await page.getByRole('button', { name: 'Actualizar valor en tabla' }).first().click()
  await expect(page.getByRole('status').filter({ hasText: 'Precio guardado en la planilla: $130.000' })).toBeVisible()
  // La otra fila del mismo rango tambien pasa al precio nuevo.
  await expect(precios.nth(1)).toHaveValue('130000')

  // Cotizacion nueva: el mismo tamaño ya sale con el precio nuevo.
  await page.getByRole('button', { name: 'Reiniciar' }).click()
  await expect(precios.first()).toHaveValue('130000')
  // Y al volver a entrar (relee la planilla).
  await page.getByRole('navigation').getByRole('button', { name: 'Inicio', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Cotizar', exact: true }).click()
  await page.getByRole('button', { name: 'Reiniciar' }).click()
  await expect(precios.first()).toHaveValue('130000')

  // /cotiza lee la misma planilla, sin cache.
  const web = await page.request.get(base + '/.netlify/functions/cotizacion-web')
  expect((await web.json()).tabla.find(f => f.alto === 200 && f.prof === 40 && f.desde === 194).precio).toBe(130000)

  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true }))
} finally { await browser.close() }

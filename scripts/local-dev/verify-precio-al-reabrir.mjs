// Prueba E2E: una cotizacion con un precio editado a mano lo mantiene al abrirla en el cotizador
// (el 3D manda sus modulos y antes volvian al precio de la tabla). Contra el entorno local.
//   node scripts/local-dev/verify-precio-al-reabrir.mjs
import { chromium, expect } from '@playwright/test'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const proyecto3d = { units: 'cm', room: { backWallCm: 260, leftWallCm: 200, rightWallCm: 200, heightCm: 240, door: { wall: 'front', fromLeftCornerCm: 100, toRightCornerCm: 80 } },
  shelving: { layout: 'manual', heightCm: 200, depthCm: 68, runs: [{ id: 'fondo', wall: 'back', startCm: 0, lengthCm: 243, depthCm: 68 }] } }
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
  const q = await (await page.request.post(base + '/.netlify/functions/save-quote', { headers: { Authorization: 'Bearer ' + token }, data: { crear: true, nombre: 'Rosa Precio Propio', subtotal: 145000, iva: 27550, total: 172550,
    repisas: [{ largo: 2.43, prof: .68, alto: 2, niveles: 4, unidades: 1, valor: 145000, kind: 'shelf' }], adicionales: {}, proyecto3d } })).json()
  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await page.getByText('Rosa Precio Propio').first().click()
  await page.locator('#cot-' + q.cotNum).getByRole('button', { name: 'Abrir en cotizador' }).click()
  await page.waitForTimeout(9000)   // el 3D carga y manda sus modulos
  await expect(page.locator('input[value="145000"]')).toHaveCount(1)
  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, cotNum: q.cotNum }))
} finally { await browser.close() }

// Prueba E2E: Instalaciones → "🪵 Materiales": terciado y laterales de las instalaciones que
// vienen, por dia y en total, para copiar al maestro. Contra el entorno local, con datos limpios.
//   node scripts/local-dev/verify-materiales.mjs
import { chromium, expect } from '@playwright/test'
import { ahoraEnZona, sumarDias } from '../../netlify/functions/lib/horarios.mjs'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base })
  const page = await context.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = async (ruta, body) => (await page.request[body ? 'post' : 'get'](base + '/.netlify/functions/' + ruta, { headers: { Authorization: 'Bearer ' + token }, ...(body ? { data: body } : {}) })).json()

  // Dos instalaciones en los proximos dias, con sus repisas.
  const hoy = ahoraEnZona().fecha
  const crear = async (nombre, fecha, repisas) => {
    const { siguiente } = await api('get-quotes')
    const r = await api('save-quote', { crear: true, cotNum: siguiente, nombre, status: 'confirmada', repisas, adicionales: {}, subtotal: 1, iva: 0, total: 1 })
    expect(r.ok).toBe(true)
    expect((await api('save-quote', { cotNum: r.cotNum, instalacion: { fecha, inicio: '10:00', fin: '13:00' } })).ok).toBe(true)
  }
  await crear('Prueba Materiales Uno', sumarDias(hoy, 1), [{ largo: 2.43, prof: 0.48, alto: 2, niveles: 4, unidades: 2, valor: 1 }])
  await crear('Prueba Materiales Dos', sumarDias(hoy, 2), [{ largo: 0.96, prof: 0.68, alto: 3, niveles: 6, unidades: 1, valor: 1 }])

  await page.getByRole('navigation').getByRole('button', { name: 'Instalaciones', exact: true }).click()
  await page.getByRole('button', { name: '🪵 Materiales' }).click()
  const panel = page.getByTestId('materiales-proximos')
  const texto = panel.getByTestId('materiales-texto')
  await expect(texto).toContainText('Prueba Materiales Uno')
  await expect(texto).toContainText('• 8 × 243 × 40 cm')
  await expect(texto).toContainText('• 6 × 200 × 48 cm')
  await expect(texto).toContainText('• 6 × 96 × 60 cm')
  await expect(texto).toContainText('• 2 × 300 × 68 cm')
  await expect(texto).toContainText('🧮 *Total*')
  await panel.getByRole('button', { name: '📋 Copiar lista para el maestro' }).click()
  const copiado = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')
  expect(copiado).toMatch(/^🪵 \*Materiales para las próximas instalaciones\*/)
  expect(copiado.indexOf('Prueba Materiales Uno')).toBeLessThan(copiado.indexOf('Prueba Materiales Dos'))
  await page.screenshot({ path: 'docs/evidence/materiales.png' })
  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true }))
} finally { await browser.close() }

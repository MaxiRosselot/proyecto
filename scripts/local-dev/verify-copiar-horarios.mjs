// Prueba E2E: "Copiar horarios disponibles" en una cotizacion copia los horarios libres de los
// proximos 10 dias para esa instalacion. Contra el entorno local (start-native.mjs).
//   node scripts/local-dev/verify-copiar-horarios.mjs
import { chromium, expect } from '@playwright/test'
import { ahoraEnZona, sumarDias } from '../../netlify/functions/lib/horarios.mjs'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const contexto = await browser.newContext({ viewport: { width: 1300, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await contexto.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const q = await (await page.request.post(base + '/.netlify/functions/save-quote', { headers: { Authorization: 'Bearer ' + token }, data: { crear: true, nombre: 'Hugo Sin Link', telefono: '9 4545 6767', subtotal: 200000, iva: 38000, total: 238000,
    repisas: [{ largo: 2.43, prof: .48, alto: 2, niveles: 4, unidades: 1, valor: 200000 }], adicionales: {} } })).json()
  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await page.getByText('Hugo Sin Link').first().click()
  const boton = page.locator('#cot-' + q.cotNum).getByTestId('copiar-horarios').first()
  await boton.click()
  await expect(boton).toHaveText('✓ Horarios copiados')
  const texto = await page.evaluate(() => navigator.clipboard.readText())
  expect(texto).toMatch(/^Hola Hugo 👋 Estos son los horarios disponibles para tu instalación \(dura aprox\./)
  expect(texto).toMatch(/• (Lunes|Martes|Miércoles|Jueves|Viernes) \d+ de \w+: \d{2}:\d{2}/)
  // Solo hasta 10 dias.
  const dias = [...texto.matchAll(/• \S+ (\d+) de/g)].map(m => Number(m[1]))
  const tope = Number(sumarDias(ahoraEnZona().fecha, 10).slice(8))
  expect(dias.length).toBeGreaterThan(0)
  expect(dias.length).toBeLessThanOrEqual(11)
  expect(errors).toEqual([])
  console.log(texto)
  console.log(JSON.stringify({ ok: true, tope }))
} finally { await browser.close() }

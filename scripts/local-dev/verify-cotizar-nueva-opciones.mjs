// Prueba E2E: en Cotizar, con una cotizacion guardada abierta, "Otra para este cliente" deja los
// datos y el contenido con N° nuevo, y "Empezar de cero" limpia todo. Contra el entorno local.
//   node scripts/local-dev/verify-cotizar-nueva-opciones.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve('docs/evidence/2026-11-03-cotizar-nueva-opciones')
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
  const api = async (ruta, data) => (await page.request.fetch(base + '/.netlify/functions/' + ruta, { method: data ? 'POST' : 'GET', data, headers: { Authorization: 'Bearer ' + token } })).json()
  const q = await api('save-quote', { crear: true, nombre: 'Ramón Dos Opciones', email: 'ramon@example.cl', telefono: '9 1212 3434', direccion: 'Maipú', subtotal: 170000, iva: 32300, total: 202300,
    repisas: [{ largo: 2, prof: .48, alto: 2, niveles: 4, unidades: 1, valor: 170000 }], adicionales: { recargo_pct: 5 } })

  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await page.getByText('Ramón Dos Opciones').first().click()
  await page.locator('#cot-' + q.cotNum).getByRole('button', { name: 'Abrir en cotizador' }).click()
  await expect(page.getByTestId('numero-cotizacion')).toContainText(String(q.cotNum))
  await page.getByTestId('nueva-cotizacion-opciones').screenshot({ path: path.join(evidence, '01-opciones.png') })

  await page.getByRole('button', { name: '👥 Otra para este cliente' }).click()
  await expect(page.getByTestId('nueva-desde')).toContainText(`ya tiene la N° ${q.cotNum}`)
  await expect(page.getByTestId('numero-cotizacion')).not.toContainText(String(q.cotNum))
  await expect(page.locator('input[value="Ramón Dos Opciones"]')).toHaveCount(1)
  await page.screenshot({ path: path.join(evidence, '02-otra-para-cliente.png') })

  // Vuelve a la guardada y empieza de cero.
  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  const abrir = page.locator('#cot-' + q.cotNum).getByRole('button', { name: 'Abrir en cotizador' })
  if (!(await abrir.isVisible())) await page.locator('#cot-' + q.cotNum).getByText('Ramón Dos Opciones').first().click()
  await abrir.click()
  await expect(page.getByTestId('numero-cotizacion')).toContainText(String(q.cotNum))
  await page.getByRole('button', { name: '✨ Empezar de cero' }).click()
  await expect(page.getByTestId('numero-cotizacion')).not.toContainText(String(q.cotNum))
  await expect(page.locator('input[value="Ramón Dos Opciones"]')).toHaveCount(0)
  await expect(page.getByTestId('nueva-desde')).toHaveCount(0)
  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, evidence }))
} finally { await browser.close() }

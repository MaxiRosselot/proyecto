// Prueba E2E: con una cotizacion guardada abierta en Cotizar, escribir otro cliente y generar crea
// una cotizacion nueva; la abierta queda intacta. Corregir el nombre del mismo cliente la sigue
// actualizando. Contra el entorno local.
//   node scripts/local-dev/verify-otro-cliente-no-pisa.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve('docs/evidence/2026-11-26-otro-cliente-no-pisa')
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
  const q = await api('save-quote', { crear: true, nombre: 'Verónica Primera', email: 'vero@example.cl', telefono: '9 5555 1111', direccion: 'Las Condes', subtotal: 170000, iva: 32300, total: 202300,
    repisas: [{ largo: 2, prof: .48, alto: 2, niveles: 4, unidades: 1, valor: 170000 }] })

  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await page.getByText('Verónica Primera').first().click()
  await page.locator('#cot-' + q.cotNum).getByRole('button', { name: 'Abrir en cotizador' }).click()
  await expect(page.getByTestId('numero-cotizacion')).toHaveText('N° ' + q.cotNum)

  // Mismo cliente con el nombre completado: sigue siendo la misma.
  await page.getByPlaceholder('Nombre completo').fill('Verónica Primera Soto')
  await expect(page.getByTestId('numero-cotizacion')).toHaveText('N° ' + q.cotNum)
  await expect(page.getByTestId('otro-cliente')).toHaveCount(0)

  // Otro cliente: aviso y N° nuevo.
  await page.getByPlaceholder('Nombre completo').fill('Mauricio Segundo')
  await page.getByPlaceholder('+56 9 XXXX XXXX').fill('9 7777 2222')
  await expect(page.getByTestId('otro-cliente')).toContainText(`N° ${q.cotNum}`)
  await expect(page.getByTestId('numero-cotizacion')).not.toHaveText('N° ' + q.cotNum)
  await page.screenshot({ path: path.join(evidence, '01-aviso-otro-cliente.png') })

  await page.getByRole('button', { name: 'Generar Cotizacion PDF' }).click()
  await expect(page.getByText(/Cotización N° \d+ guardada/)).toBeVisible({ timeout: 120000 })
  const texto = await page.getByText(/Cotización N° \d+ guardada/).textContent()
  const nuevo = texto.match(/N° (\d+)/)[1]
  expect(nuevo).not.toBe(String(q.cotNum))

  const original = (await api('get-quotes?cotNum=' + q.cotNum)).quote
  expect(original.nombre).toBe('Verónica Primera')
  const creada = (await api('get-quotes?cotNum=' + nuevo)).quote
  expect(creada.nombre).toBe('Mauricio Segundo')
  // Desde aqui queda abierta la nueva: el aviso desaparece.
  await expect(page.getByTestId('numero-cotizacion')).toHaveText('N° ' + nuevo)
  await expect(page.getByTestId('otro-cliente')).toHaveCount(0)
  await page.screenshot({ path: path.join(evidence, '02-nueva-creada.png') })

  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, original: q.cotNum, nuevo, evidence }))
} finally { await browser.close() }

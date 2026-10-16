// Prueba E2E del formulario de agendar: cantidades sin ceros adelante, repisas editables y la
// cuenta en columna. Contra el entorno local (start-native.mjs), con datos limpios.
//   node scripts/local-dev/verify-agendar-montos.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { ahoraEnZona, sumarDias } from '../../netlify/functions/lib/horarios.mjs'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve('docs/evidence/2026-10-16-agendar')
mkdirSync(evidence, { recursive: true })
const pesos = n => '$' + n.toLocaleString('es-CL')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = async (ruta, data) => (await page.request.fetch(base + '/.netlify/functions/' + ruta, { method: data ? 'POST' : 'GET', data, headers: { Authorization: 'Bearer ' + token } })).json()
  const q = await api('save-quote', { crear: true, nombre: 'Camila Rojas', telefono: '9 1111 2222', subtotal: 290000, iva: 55100, total: 345100,
    repisas: [{ largo: 2.43, prof: .48, alto: 2, niveles: 4, unidades: 1, valor: 110000 }, { largo: 1.57, prof: .48, alto: 2, niveles: 4, unidades: 2, valor: 90000 }], adicionales: {} })

  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await page.getByText('Camila Rojas').click()
  const tarjeta = page.locator('#cot-' + q.cotNum)
  await tarjeta.getByTestId('siguiente-paso').getByRole('button', { name: 'Agendar instalación' }).click()

  // Se escribe "2" sobre un campo que tiene 0: queda 2, no "02" ni 20.
  const cajas = tarjeta.getByLabel('Cantidad de Cajas organizadoras')
  await cajas.click()
  await page.keyboard.type('2')
  await expect(cajas).toHaveValue('2')
  // El cliente se queda solo con la repisa de 2,43 m, y a $100.000.
  await tarjeta.getByLabel('Cantidad de la repisa 2').click()
  await page.keyboard.type('0')
  await tarjeta.getByLabel('Precio de la repisa 1').click()
  await page.keyboard.type('100000')
  await tarjeta.getByRole('button', { name: /Transferencia · 10%/ }).click()
  // 100.000 + 2 x 15.000 = 130.000; -10% = 117.000; IVA 22.230; total 139.230.
  const resumen = tarjeta.getByTestId('resumen-montos')
  await expect(resumen).toContainText('Repisas' + pesos(100000))
  await expect(resumen).toContainText('Servicios adicionales' + pesos(30000))
  await expect(resumen).toContainText('-' + pesos(13000))
  await expect(resumen).toContainText('Neto' + pesos(117000))
  await expect(tarjeta.getByTestId('total-instalacion')).toHaveText(pesos(139230))
  await expect(tarjeta.getByTestId('repisas-agendar')).toContainText('no va')
  await tarjeta.getByLabel('Día de la instalación').fill(sumarDias(ahoraEnZona().fecha, 3))
  await page.screenshot({ path: path.join(evidence, '01-agendar.png'), fullPage: true })
  await tarjeta.getByRole('button', { name: 'Agendar instalación' }).last().click()
  await expect(tarjeta.getByTestId('instalacion-agendada')).toBeVisible()

  const guardada = (await api('get-quotes?cotNum=' + q.cotNum)).quote
  expect(guardada.repisas.map(r => [r.unidades, r.valor])).toEqual([[1, 100000], [0, 90000]])
  expect([Number(guardada.total), guardada.adicionales.qty_cajas, guardada.adicionales.descuento_pct]).toEqual([139230, 2, 10])
  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true }))
} finally { await browser.close() }

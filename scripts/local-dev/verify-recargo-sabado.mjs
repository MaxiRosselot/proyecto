// Prueba E2E: agendar una instalacion un sabado suma 5% al total (y se guarda en la cotizacion).
// Contra el entorno local (start-native.mjs).
//   node scripts/local-dev/verify-recargo-sabado.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { ahoraEnZona, diaSemana, sumarDias } from '../../netlify/functions/lib/horarios.mjs'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve('docs/evidence/2026-11-03-recargo-sabado')
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
  const q = await api('save-quote', { crear: true, nombre: 'Sofía Sábado', telefono: '9 3333 4444', subtotal: 100000, iva: 19000, total: 119000,
    repisas: [{ largo: 2.43, prof: .48, alto: 2, niveles: 4, unidades: 1, valor: 100000 }], adicionales: {} })

  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await page.getByText('Sofía Sábado').click()
  const tarjeta = page.locator('#cot-' + q.cotNum)
  await tarjeta.getByTestId('siguiente-paso').getByRole('button', { name: 'Agendar instalación' }).click()
  let sabado = sumarDias(ahoraEnZona().fecha, 2)
  while (diaSemana(sabado) !== 6) sabado = sumarDias(sabado, 1)
  await tarjeta.getByLabel('Día de la instalación').fill(sabado)
  // 100.000 + 5% = 105.000 neto; IVA 19.950; total 124.950.
  await expect(tarjeta.getByTestId('recargo-sabado')).toBeVisible()
  await expect(tarjeta.getByTestId('resumen-montos')).toContainText('+' + pesos(5000))
  await expect(tarjeta.getByTestId('total-instalacion')).toHaveText(pesos(124950))
  await tarjeta.getByTestId('resumen-montos').screenshot({ path: path.join(evidence, '01-recargo.png') })
  await tarjeta.getByRole('button', { name: 'Agendar instalación' }).last().click()
  await expect(tarjeta.getByTestId('instalacion-agendada')).toBeVisible()
  const guardada = (await api('get-quotes?cotNum=' + q.cotNum)).quote
  expect([Number(guardada.total), guardada.adicionales.recargo_pct]).toEqual([124950, 5])

  // Pasarla a un lunes (desde Instalaciones) quita el recargo.
  let lunes = sumarDias(sabado, 2)
  expect((await api('planilla', { accion: 'actualizar', cotNum: q.cotNum, cambios: { fecha: lunes } })).ok).toBe(true)
  const movida = (await api('get-quotes?cotNum=' + q.cotNum)).quote
  expect([Number(movida.total), movida.adicionales.recargo_pct]).toEqual([119000, undefined])
  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, sabado, evidence }))
} finally { await browser.close() }

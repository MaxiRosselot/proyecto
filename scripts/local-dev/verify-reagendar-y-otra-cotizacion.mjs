// Prueba E2E: reagendar una instalacion marcada como hecha que no se hizo (vuelve a pendiente) y
// dar otra cotizacion a un cliente que ya tiene una (N° nuevo, y en Cotizaciones aparecen juntas).
// Contra el entorno local (start-native.mjs), con datos limpios.
//   node scripts/local-dev/verify-reagendar-y-otra-cotizacion.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { ahoraEnZona, sumarDias } from '../../netlify/functions/lib/horarios.mjs'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve('docs/evidence/2026-11-03-reagendar-y-otra-cotizacion')
mkdirSync(evidence, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = async (ruta, body) => (await page.request[body ? 'post' : 'get'](base + '/.netlify/functions/' + ruta, { headers: { Authorization: 'Bearer ' + token }, ...(body ? { data: body } : {}) })).json()
  const cotizacion = async cotNum => (await api('get-quotes')).quotes.find(q => String(q.cotNum) === String(cotNum))

  // ── 1. Instalacion marcada como hecha que no se hizo ──
  const hoy = ahoraEnZona().fecha
  const ayer = sumarDias(hoy, -1), nueva = sumarDias(hoy, 7)
  const { cotizacion: venta } = await api('planilla', { accion: 'crear', nombre: 'Rita No Se Hizo', fecha: ayer, inicio: '10:00', fin: '12:00' })
  expect((await api('planilla', { accion: 'actualizar', cotNum: venta.cotNum, cambios: { instalada: true } })).ok).toBe(true)
  await page.getByRole('navigation').getByRole('button', { name: 'Instalaciones', exact: true }).click()
  await page.getByRole('tab', { name: 'Todo' }).click().catch(() => {})
  await page.getByLabel('Fecha de Rita No Se Hizo').click()
  const dialogo = page.getByRole('dialog', { name: 'Reagendar a Rita No Se Hizo' })
  await expect(dialogo.getByTestId('reagendar-hecha')).toContainText('instalada')
  await dialogo.getByLabel('Nuevo día').fill(nueva)
  await dialogo.screenshot({ path: path.join(evidence, '01-reagendar-hecha.png') })
  await dialogo.getByRole('button', { name: 'Reagendar como pendiente' }).click()
  await expect(dialogo).toHaveCount(0)
  const reagendada = await cotizacion(venta.cotNum)
  expect([reagendada.instalacion.fecha, reagendada.instalacion.instalada]).toEqual([nueva, false])
  await expect(page.getByLabel('Instalada: Rita No Se Hizo')).not.toBeChecked()

  // El detalle (lo que se abre en el celular) tambien ofrece reagendar, y si esta hecha "No se realizó".
  await api('planilla', { accion: 'actualizar', cotNum: venta.cotNum, cambios: { instalada: true } })
  await page.reload(); await expect(page.getByRole('navigation')).toBeVisible()
  await page.getByRole('navigation').getByRole('button', { name: 'Instalaciones', exact: true }).click()
  await page.getByRole('tab', { name: 'Todo' }).click().catch(() => {})
  await page.getByRole('button', { name: 'Rita No Se Hizo', exact: true }).click()
  await page.getByRole('button', { name: '↩️ No se realizó · reagendar' }).click()
  await expect(page.getByRole('dialog', { name: 'Reagendar a Rita No Se Hizo' }).getByTestId('reagendar-hecha')).toBeVisible()
  await page.keyboard.press('Escape')

  // ── 2. Otra cotizacion para el mismo cliente ──
  const { siguiente } = await api('get-quotes')
  const r = await api('save-quote', { crear: true, cotNum: siguiente, nombre: 'Doris Dos Cotizaciones', email: 'doris@example.cl', telefono: '9 4444 5555', direccion: 'Grecia 1500, Ñuñoa', status: 'por confirmar',
    repisas: [{ largo: 2.43, prof: 0.48, alto: 2, niveles: 4, unidades: 1, valor: 200000 }], adicionales: {}, subtotal: 200000, iva: 38000, total: 238000 })
  expect(r.ok).toBe(true)
  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await page.getByText('Doris Dos Cotizaciones').first().click()
  await page.getByTestId('nueva-para-cliente').getByRole('button', { name: '➕ Nueva cotización para este cliente' }).click()
  await expect(page.getByTestId('nueva-desde')).toContainText(`ya tiene la N° ${r.cotNum}`)
  await expect(page.getByTestId('numero-cotizacion')).not.toContainText(String(r.cotNum))
  await expect(page.locator('input[value="Doris Dos Cotizaciones"]')).toHaveCount(1)
  await page.screenshot({ path: path.join(evidence, '02-nueva-para-cliente.png') })

  // La segunda (guardada como la guarda el cotizador) y la confirmada: juntas y enlazadas.
  const segunda = await api('save-quote', { crear: true, cotNum: (await api('get-quotes')).siguiente, nombre: 'Doris Dos Cotizaciones', email: 'Doris@example.cl', telefono: '+56 9 4444 5555', direccion: 'Grecia 1500, Ñuñoa', status: 'por confirmar',
    repisas: [{ largo: 1.5, prof: 0.38, alto: 2, niveles: 4, unidades: 1, valor: 120000 }], adicionales: {}, subtotal: 120000, iva: 22800, total: 142800 })
  expect(segunda.ok).toBe(true)
  expect((await api('save-quote', { cotNum: segunda.cotNum, status: 'confirmada' })).ok).toBe(true)
  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await page.getByRole('button', { name: 'Actualizar' }).click()
  const tarjeta = page.locator('#cot-' + r.cotNum)
  await expect(tarjeta).toContainText('👥 2 cotizaciones')
  await tarjeta.getByText('Doris Dos Cotizaciones').click()
  const otras = tarjeta.getByTestId('otras-del-cliente')
  await expect(otras).toContainText(`N° ${segunda.cotNum} · Confirmada`)
  await page.screenshot({ path: path.join(evidence, '03-juntas.png') })
  await otras.getByRole('button', { name: new RegExp(`N° ${segunda.cotNum}`) }).click()
  await expect(page.locator('#cot-' + segunda.cotNum)).toBeVisible()
  await expect(page.locator('#cot-' + segunda.cotNum)).toContainText('👥 2 cotizaciones')

  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, evidence }))
} finally { await browser.close() }

// Prueba E2E del dashboard de Instalaciones: totales del mes, desglose por servicio y por tipo,
// cambio de mes, filtro y salto a la cotizacion. Contra el entorno local, con datos limpios.
//   node scripts/local-dev/verify-instalaciones.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { ahoraEnZona, sumarDias } from '../../netlify/functions/lib/horarios.mjs'
import { sumarMeses } from '../../netlify/functions/lib/resumen-instalaciones.mjs'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const PASSWORD = process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo'
const evidence = path.resolve('docs/evidence/2026-10-14-instalaciones')
mkdirSync(evidence, { recursive: true })
const hoy = ahoraEnZona().fecha
const mes = hoy.slice(0, 7)
const dia = n => `${mes}-${String(n).padStart(2, '0')}`
const pesos = n => '$' + n.toLocaleString('es-CL')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = async (ruta, data) => {
    const r = await page.request.fetch(base + '/.netlify/functions/' + ruta, { method: 'POST', data, headers: { Authorization: 'Bearer ' + token } })
    const j = await r.json(); if (!r.ok()) throw new Error(ruta + ': ' + JSON.stringify(j)); return j
  }

  // Tres instalaciones este mes y una el mes anterior.
  const casos = [
    { nombre: 'Ana Rojas', valor: 200000, fecha: dia(3), adicionales: {}, pago: 238000 },
    { nombre: 'Bruno Soto', valor: 300000, fecha: dia(12), adicionales: { qty_retiro_orden: 1, precio_retiro_orden: 40000, qty_retiro_basura: 1, precio_retiro_basura: 30000 }, pago: 220000 },
    { nombre: 'Carla Pinto', valor: 150000, fecha: sumarDias(hoy, 3) <= dia(28) ? sumarDias(hoy, 3) : dia(28), adicionales: { qty_cajas: 4, precio_cajas: 15000 } },
    { nombre: 'Diego Lagos', valor: 100000, fecha: sumarMeses(mes, -1) + '-20', adicionales: {} },
  ]
  for (const c of casos) {
    const q = await api('save-quote', { crear: true, nombre: c.nombre, telefono: '9 1111 2222', direccion: 'Calle 1', subtotal: c.valor, iva: Math.round(c.valor * .19), total: Math.round(c.valor * 1.19),
      repisas: [{ largo: 2.43, prof: .48, alto: 2, niveles: 4, unidades: 1, valor: c.valor }], adicionales: {} })
    await api('instalacion', { accion: 'agendar', cotNum: q.cotNum, fecha: c.fecha, inicio: '10:00', fin: '13:00', adicionales: c.adicionales, invitar: false })
    if (c.pago) await api('pagos', { accion: 'registrar', cotNum: q.cotNum, monto: c.pago, medio: 'Transferencia', fecha: c.fecha })
    c.cotNum = q.cotNum
  }
  const netoMes = 200000 + 370000 + 210000
  const totalMes = [200000, 370000, 210000].reduce((s, n) => s + Math.round(n * 1.19), 0)

  await page.getByRole('navigation').getByRole('button', { name: 'Estadísticas', exact: true }).click()
  const kpis = page.getByTestId('kpis')
  await expect(kpis).toContainText(pesos(totalMes))
  await expect(kpis).toContainText('Instalaciones3')
  await expect(kpis).toContainText(pesos(238000 + 220000))
  const desglose = page.getByTestId('desglose')
  await expect(desglose.locator('[data-concepto="repisas"]')).toContainText(pesos(Math.round(650000 * 1.19)))
  await expect(desglose.locator('[data-concepto="retiro_orden"]')).toContainText(pesos(Math.round(40000 * 1.19)))
  await page.screenshot({ path: path.join(evidence, '01-mes.png'), fullPage: true })

  await page.getByRole('tab', { name: 'Neto' }).click()
  await expect(kpis).toContainText(pesos(netoMes))
  await expect(desglose.locator('[data-concepto="retiro_orden"]')).toContainText(pesos(40000))
  await page.getByRole('tab', { name: 'Por tipo de trabajo' }).click()
  await expect(desglose.locator('[data-concepto="con_retiro_orden"]')).toContainText(pesos(370000))
  await expect(desglose.locator('[data-concepto="solo_repisas"]')).toContainText(pesos(200000))
  await page.screenshot({ path: path.join(evidence, '02-neto-por-tipo.png'), fullPage: true })

  // Filtro y salto a la cotizacion.
  await page.getByRole('button', { name: /^Repisas \+ retiro y orden · 1/ }).click()
  await expect(page.getByTestId('fila-instalacion')).toHaveCount(1)
  await page.getByTestId('fila-instalacion').click()
  await expect(page.locator('#cot-' + casos[1].cotNum)).toBeVisible()

  // Mes anterior: solo Diego, y el actual compara contra el.
  await page.getByRole('navigation').getByRole('button', { name: 'Estadísticas', exact: true }).click()
  await page.getByRole('button', { name: 'Mes anterior' }).click()
  await expect(page.getByTestId('fila-instalacion')).toHaveCount(1)
  await expect(page.getByTestId('fila-instalacion')).toContainText('Diego Lagos')

  const movil = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await movil.goto(base + '/admin')
  await movil.locator('input[type=password]').fill(PASSWORD)
  await movil.getByRole('button', { name: 'Ingresar' }).click()
  await movil.getByRole('navigation').getByRole('button', { name: 'Stats' }).click()
  await expect(movil.getByTestId('kpis')).toContainText(pesos(totalMes))
  expect(await movil.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await movil.screenshot({ path: path.join(evidence, '03-movil.png'), fullPage: true })

  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, mes, evidence }))
} finally { await browser.close() }

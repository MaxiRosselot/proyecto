// Prueba E2E: el admin habilita horarios y la pagina publica de agendar los respeta.
// Corre contra el entorno local (start-native.mjs): no toca Google ni datos reales.
//   node scripts/local-dev/verify-horarios.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { ahoraEnZona, diaSemana, sumarDias } from '../../netlify/functions/lib/horarios.mjs'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const PASSWORD = process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo'
const evidence = path.resolve('docs/evidence/2026-10-07-horarios')
mkdirSync(evidence, { recursive: true })

// Fechas de prueba relativas a hoy: el proximo sabado, el domingo siguiente y el otro.
const hoy = ahoraEnZona().fecha
let sabado = sumarDias(hoy, 1)
while (diaSemana(sabado) !== 6) sabado = sumarDias(sabado, 1)
const domingo = sumarDias(sabado, 1)
const domingoCerrado = sumarDias(sabado, 8)
let lunes = sumarDias(hoy, 1)
while (diaSemana(lunes) !== 1) lunes = sumarDias(lunes, 1)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  const shot = name => page.screenshot({ path: path.join(evidence, name), fullPage: true })
  const fechasPublicas = async () => (await (await page.request.get(base + '/.netlify/functions/horarios')).json()).dias

  // Sin sesion se puede leer lo publico, pero no la configuracion ni guardarla.
  expect((await page.request.get(base + '/.netlify/functions/horarios?config=1')).status()).toBe(401)
  expect((await page.request.post(base + '/.netlify/functions/horarios', { data: { semanal: {} } })).status()).toBe(401)

  // ── Admin: domingo 10-14, abrir el sabado 9-11 y cerrar un domingo ──
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Horarios', exact: true }).click()
  await expect(page.getByText('Horario semanal', { exact: true })).toBeVisible()

  const filaDomingo = page.locator('[data-dia="0"]')
  await filaDomingo.getByLabel('Desde').selectOption('10:00')
  await filaDomingo.getByLabel('Hasta').selectOption('14:00')

  await page.getByLabel('Fecha especial').fill(sabado)
  await page.getByRole('button', { name: 'Abrir con horario' }).click()
  const filaSabado = page.locator(`[data-fecha="${sabado}"]`)
  await filaSabado.getByLabel('Desde').selectOption('09:00')
  await filaSabado.getByLabel('Hasta').selectOption('11:00')

  await page.getByLabel('Fecha especial').fill(domingoCerrado)
  await page.getByRole('button', { name: 'Cerrar ese día' }).click()
  await expect(page.locator(`[data-fecha="${domingoCerrado}"]`).getByText('Cerrado')).toBeVisible()

  // Un rango al reves no se puede guardar.
  await filaSabado.getByLabel('Hasta').selectOption('08:00')
  await expect(page.getByText(/"hasta" debe ser después/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
  await filaSabado.getByLabel('Hasta').selectOption('11:00')

  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('status')).toContainText('Horarios guardados')
  await shot('01-admin-horarios.png')

  const dias = Object.fromEntries((await fechasPublicas()).map(d => [d.fecha, d.horas]))
  expect(dias[sabado]).toEqual(['09:00', '09:30', '10:00', '10:30'])
  expect(dias[domingo][0]).toBe('10:00')
  expect(dias[domingo].at(-1)).toBe('13:30')
  expect(dias[domingoCerrado]).toBeUndefined()

  // ── Pagina publica ──
  const publica = await browser.newPage({ viewport: { width: 430, height: 932 } })
  publica.on('pageerror', e => errors.push(e.stack || e.message))
  await publica.goto(base + '/')
  await expect(publica.getByText('Fechas disponibles')).toBeVisible()
  const botonesFecha = publica.locator('.date-btn')
  await expect(botonesFecha).toHaveCount(Object.keys(dias).length)
  await expect(botonesFecha.first()).toContainText(/sábado/i)
  await botonesFecha.first().click()
  await expect(publica.locator('.slot')).toHaveText(['09:00', '09:30', '10:00', '10:30'])
  await expect(publica.locator('.slot:not([disabled])')).toHaveCount(4)
  await publica.screenshot({ path: path.join(evidence, '02-publica-sabado.png'), fullPage: true })

  await publica.getByRole('button', { name: '09:30' }).click()
  await publica.locator('.grid input').nth(0).fill('Cliente')
  await publica.locator('.grid input').nth(1).fill('Prueba Horarios')
  await publica.locator('.grid input').nth(2).fill('cliente.horarios@example.com')
  await publica.locator('.grid input').nth(3).fill('+56 9 1111 2222')
  await publica.locator('.grid input').nth(4).fill('Calle de prueba 123')
  await publica.getByRole('button', { name: /Agendar visita/ }).click()
  await publica.waitForURL(/confirm\.html/)

  // La hora tomada ya no se ofrece.
  await publica.goto(base + '/')
  await publica.locator('.date-btn').first().click()
  await expect(publica.getByRole('button', { name: '09:30' })).toBeDisabled()
  await expect(publica.locator('.slot:not([disabled])')).toHaveCount(3)

  // El servidor rechaza horas fuera del horario aunque se salten la pagina.
  const reservar = (fechaISO, horaHHmm) => page.request.post(base + '/.netlify/functions/create_event', {
    data: { nombre: 'X', apellido: 'Y', email: 'x@example.com', fechaISO, horaHHmm },
  })
  expect((await reservar(sabado, '15:00')).status()).toBe(400)
  expect((await reservar(lunes, '10:00')).status()).toBe(400)
  expect((await reservar(domingoCerrado, '10:00')).status()).toBe(400)
  expect((await reservar(sabado, '09:30')).status()).toBe(409)

  // La visita aparece en el admin.
  await page.getByRole('navigation').getByRole('button', { name: 'Visitas', exact: true }).click()
  await expect(page.getByText('Cliente Prueba Horarios').first()).toBeVisible()
  await shot('03-admin-visita-agendada.png')

  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, sabado, domingo, domingoCerrado, evidence }))
} finally { await browser.close() }

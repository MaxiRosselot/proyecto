// Prueba E2E de la planilla de Instalaciones: importar el Excel (de ejemplo), editar en la celda
// (nota, documento, instalada, montos, fecha), registrar un pago, agregar y cancelar instalaciones,
// el detalle y el cobro por WhatsApp. Contra el entorno local (start-native.mjs), con datos limpios.
//   node scripts/local-dev/verify-planilla.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve('docs/evidence/2026-10-16-planilla')
mkdirSync(evidence, { recursive: true })
const EXCEL = path.resolve('scripts/local-dev/fixtures/ventas-ejemplo.xlsx')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  page.on('dialog', d => d.accept())
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = async ruta => (await page.request.get(base + '/.netlify/functions/' + ruta, { headers: { Authorization: 'Bearer ' + token } })).json()
  const venta = async nombre => (await api('get-quotes')).quotes.find(q => q.nombre === nombre)

  // ── Importar ──
  await page.getByRole('navigation').getByRole('button', { name: 'Instalaciones', exact: true }).click()
  await page.getByRole('button', { name: 'Importar Excel' }).click()
  await page.getByLabel('Archivo Excel').setInputFiles(EXCEL)
  const reporte = page.getByTestId('reporte-importar')
  await expect(reporte).toContainText('6ventas nuevas')
  await expect(reporte).toContainText('VENTAS ENERO (2) · VENTAS 2026 (4)')
  await expect(reporte).toContainText('Ignoradas (no son de ventas): ENERO 2025')
  await page.screenshot({ path: path.join(evidence, '01-importar.png') })
  await page.getByRole('button', { name: 'Importar 6 ventas' }).click()
  await expect(reporte).toContainText('Listo: 6 ventas importadas')
  await expect(reporte).toContainText('No encontré en el calendario el evento de 1 próximas: Pedro Futuro')
  await page.getByRole('button', { name: 'Ver la planilla' }).click()

  // ── La planilla con todo el historial ──
  const planilla = page.getByTestId('planilla')
  await expect(planilla.getByTestId('fila-planilla')).toHaveCount(7) // 6 importadas + 1 de ejemplo del entorno local
  const fila = nombre => planilla.locator('tr', { has: page.getByRole('button', { name: nombre, exact: true }) })
  await expect(fila('Camila Ejemplo')).toContainText('$238.000')
  await expect(fila('Ignacia Demo').getByLabel('Nota de Ignacia Demo')).toHaveValue('CAJAS PENDIENTES')
  await expect(fila('Ignacia Demo').getByLabel('Instalada: Ignacia Demo')).toBeChecked()
  await expect(fila('Pedro Futuro').getByLabel('Instalada: Pedro Futuro')).not.toBeChecked()
  await expect(page.getByRole('button', { name: /^Documentos por emitir · 1/ })).toBeVisible()
  await page.getByRole('button', { name: /^Sin fecha/ }).click()
  await expect(planilla.getByRole('button', { name: 'Lucia Ficticia', exact: true })).toBeVisible()
  await expect(fila('Lucia Ficticia')).toContainText('$238.000')
  await page.getByRole('button', { name: /^Todas/ }).click()
  await page.screenshot({ path: path.join(evidence, '02-planilla.png') })

  // ── Teclado, como en Excel: flechas para moverse, Enter guarda y baja ──
  const enFoco = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  await fila('Tomas Prueba').getByLabel('Nota de Tomas Prueba').click()
  await page.keyboard.press('ArrowDown')
  expect(await enFoco()).toBe('Nota de Camila Ejemplo')
  await page.keyboard.press('ArrowRight') // salta la ✕ de cancelar
  expect(await enFoco()).toBe('Instalada: Camila Ejemplo')
  await page.keyboard.press('ArrowRight')
  expect(await enFoco()).toBe('Fecha de Camila Ejemplo')
  await page.keyboard.press('ArrowUp')
  expect(await enFoco()).toBe('Fecha de Tomas Prueba')
  // Una nota se escribe y con Enter se guarda y baja a la fila siguiente.
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft')
  expect(await enFoco()).toBe('Nota de Camila Ejemplo')
  await page.keyboard.type('Llamar antes')
  await page.keyboard.press('ArrowLeft') // dentro del texto: mueve el cursor, no cambia de celda
  expect(await enFoco()).toBe('Nota de Camila Ejemplo')
  await page.keyboard.press('Enter')
  expect(await enFoco()).toBe('Nota de Ignacia Demo')
  // La celda que se dejo vuelve a quedar sin borde (solo la activa se marca).
  const borde = etiqueta => page.getByLabel(etiqueta).evaluate(e => getComputedStyle(e).borderTopColor)
  await expect.poll(() => borde('Nota de Camila Ejemplo')).toBe('rgba(0, 0, 0, 0)') // tras el desvanecido
  expect(await borde('Nota de Ignacia Demo')).not.toBe('rgba(0, 0, 0, 0)')
  await expect.poll(async () => (await venta('Camila Ejemplo')).instalacion.nota).toBe('Llamar antes')

  // ── Editar en la celda ──
  // Documento: la boleta de Ignacia ya se emitio.
  await fila('Ignacia Demo').getByLabel('Documento de Ignacia Demo').selectOption('B')
  await expect(page.getByRole('button', { name: /^Documentos por emitir · 0/ })).toBeVisible()
  // Nota y marca de instalada en Pedro, y le ponen precio al instalar: repisas y retiro de basura.
  await fila('Pedro Futuro').getByLabel('Nota de Pedro Futuro').fill('Fabricar repisa angosta')
  await fila('Pedro Futuro').getByLabel('Nota de Pedro Futuro').press('Enter')
  await fila('Pedro Futuro').getByLabel('repisas de Pedro Futuro').click()
  await page.keyboard.type('150000')
  await page.keyboard.press('Enter')
  await fila('Pedro Futuro').getByLabel('retiro_basura de Pedro Futuro').click()
  await page.keyboard.type('30000')
  await page.keyboard.press('Enter')
  await expect(fila('Pedro Futuro')).toContainText('$214.200') // 180.000 neto + IVA
  // Sin evento enlazado: se avisa en la fila y en el detalle.
  await expect(fila('Pedro Futuro').getByLabel('Sin evento: Pedro Futuro')).toBeVisible()
  await fila('Pedro Futuro').getByRole('button', { name: 'Pedro Futuro', exact: true }).click()
  await expect(page.getByTestId('calendario-venta')).toContainText('Sin evento enlazado')
  await expect(page.getByTestId('calendario-venta')).toContainText('No hay eventos ese día')
  await page.getByRole('dialog', { name: 'Pedro Futuro' }).getByRole('button', { name: 'Cerrar' }).click()
  // Fecha: como no tenia evento (ni hay uno con su nombre ese dia), al moverla se crea en el calendario.
  await fila('Pedro Futuro').getByLabel('Fecha de Pedro Futuro').fill('2027-03-12')
  await fila('Pedro Futuro').getByLabel('Fecha de Pedro Futuro').press('Enter')
  await expect.poll(async () => (await venta('Pedro Futuro'))?.instalacion?.eventId || '').not.toBe('')
  const pedro = await venta('Pedro Futuro')
  expect([pedro.instalacion.nota, pedro.instalacion.fecha, Number(pedro.subtotal)]).toEqual(['Fabricar repisa angosta', '2027-03-12', 180000])
  const eventos = (await api('eventos-local')).eventos
  expect(eventos[pedro.instalacion.eventId].start.dateTime).toBe('2027-03-12T10:00:00')
  await expect(fila('Pedro Futuro').getByLabel('Sin evento: Pedro Futuro')).toHaveCount(0)
  await fila('Pedro Futuro').getByRole('button', { name: 'Pedro Futuro', exact: true }).click()
  await expect(page.getByTestId('calendario-venta')).toContainText('Enlazada a su evento')
  await page.getByRole('dialog', { name: 'Pedro Futuro' }).getByRole('button', { name: 'Cerrar' }).click()

  // Marco: instalado y sin pagar → "Por cobrar", con el WhatsApp de cobro.
  await expect(fila('Marco Prueba').getByRole('link', { name: 'Cobrar a Marco Prueba por WhatsApp' })).toBeVisible()
  const cobro = decodeURIComponent(await fila('Marco Prueba').getByRole('link', { name: 'Cobrar a Marco Prueba por WhatsApp' }).getAttribute('href'))
  expect(cobro).toMatch(/Saldo a pagar: \$226\.100/)
  // Paga el total desde la celda "Pagado".
  await fila('Marco Prueba').getByRole('button', { name: /^Pago de Marco Prueba/ }).click()
  await page.getByRole('menuitem', { name: /Pagó el total/ }).click()
  await expect(fila('Marco Prueba').getByRole('button', { name: 'Pago de Marco Prueba: Sí' })).toBeVisible()
  await expect(fila('Marco Prueba').getByRole('link', { name: /Cobrar a Marco/ })).toHaveCount(0)

  // ── Detalle: despacho ──
  await fila('Camila Ejemplo').getByRole('button', { name: 'Camila Ejemplo', exact: true }).click()
  const detalle = page.getByRole('dialog', { name: 'Camila Ejemplo' })
  await detalle.getByLabel('Despacho').fill('50000')
  await detalle.getByRole('button', { name: 'Guardar montos' }).click()
  await expect(fila('Camila Ejemplo')).toContainText('$297.500') // 250.000 neto + IVA
  await page.screenshot({ path: path.join(evidence, '03-detalle.png') })
  await detalle.getByRole('button', { name: 'Cerrar' }).click()

  // ── Nueva instalación y cancelar ──
  await page.getByRole('button', { name: '+ Nueva instalación' }).click()
  const nueva = page.getByTestId('nueva-instalacion')
  await nueva.getByLabel('Nombre del cliente').fill('Rosa Nueva')
  await nueva.getByLabel('Fecha').fill('2027-03-15')
  await nueva.getByRole('button', { name: 'Agregar' }).click()
  await expect(planilla.getByRole('button', { name: 'Rosa Nueva', exact: true })).toBeVisible()
  const rosa = await venta('Rosa Nueva')
  expect(rosa.instalacion.eventId).toBeTruthy()
  await fila('Rosa Nueva').getByRole('button', { name: 'Cancelar Rosa Nueva' }).click()
  await expect(planilla.getByRole('button', { name: 'Rosa Nueva', exact: true })).toHaveCount(0)
  const cancelada = await venta('Rosa Nueva')
  expect([cancelada.status, cancelada.motivoRechazo]).toEqual(['rechazada', 'Canceló'])
  expect((await api('eventos-local')).eventos[rosa.instalacion.eventId]).toBeUndefined()

  // Importar de nuevo no duplica.
  await page.getByRole('button', { name: 'Importar Excel' }).click()
  await page.getByLabel('Archivo Excel').setInputFiles(EXCEL)
  await expect(reporte).toContainText('0ventas nuevas')
  await expect(reporte).toContainText('6ya estaban')
  await reporte.getByRole('button', { name: 'Cancelar', exact: true }).click()

  // ── Celular: tarjetas ──
  const movil = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await movil.goto(base + '/admin')
  await movil.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await movil.getByRole('button', { name: 'Ingresar' }).click()
  await movil.getByRole('navigation').getByRole('button', { name: 'Instal.' }).click()
  await movil.getByRole('tab', { name: 'Todo' }).click()
  await expect(movil.getByTestId('fila-planilla').first()).toBeVisible()
  expect(await movil.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await movil.screenshot({ path: path.join(evidence, '04-celular.png') })

  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true }))
} finally { await browser.close() }

// Prueba E2E: pagos, regenerar PDF con el 3D, aviso de choque de horario y la vista Calendario.
// Contra el entorno local (start-native.mjs), con datos de ejemplo limpios.
//   node scripts/local-dev/verify-calendario.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { ahoraEnZona, sumarDias } from '../../netlify/functions/lib/horarios.mjs'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const PASSWORD = process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo'
const evidence = path.resolve('docs/evidence/2026-10-14-calendario')
mkdirSync(evidence, { recursive: true })
const manana = sumarDias(ahoraEnZona().fecha, 1)
const bodega = {
  projectName: 'Bodega Marta', units: 'cm',
  room: { backWallCm: 300, leftWallCm: 220, rightWallCm: 220, heightCm: 250, door: { wall: 'front', fromLeftCornerCm: 110, toRightCornerCm: 110, widthCm: 80 } },
  shelving: { layout: 'manual', heightCm: 200, depthCm: 48, runs: [{ id: 'A1', wall: 'back', startCm: 0, lengthCm: 243, heightCm: 200, depthCm: 48 }] },
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  const shot = name => page.screenshot({ path: path.join(evidence, name), fullPage: true })
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = (ruta, opts = {}) => page.request.fetch(base + '/.netlify/functions/' + ruta, { ...opts, headers: { Authorization: 'Bearer ' + token } })

  const marta = await (await api('save-quote', { method: 'POST', data: {
    crear: true, nombre: 'Marta Díaz Fuentes', email: 'marta@example.cl', telefono: '9 7777 8888', direccion: 'Av. Grecia 1500',
    subtotal: 110000, iva: 20900, total: 130900, repisas: [{ largo: 2.43, prof: .48, alto: 2, niveles: 4, unidades: 1, valor: 110000 }], adicionales: {}, proyecto3d: bodega,
  } })).json()

  const agendar = async (nombre, inicio, fin) => {
    await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
    await page.getByRole('button', { name: /^Por confirmar *\d/ }).click()
    await page.getByText(nombre).click()
    await page.getByRole('button', { name: 'Agendar instalación' }).click()
    await page.getByLabel('Día de la instalación').fill(manana)
    await page.getByLabel('Hora de inicio').fill(inicio)
    await page.getByLabel('Hora de término').fill(fin)
  }

  // Ignacio mañana de 10 a 13; Marta de 12 a 15 se cruza y lo avisa antes de agendar.
  await agendar('Ignacio Vera Salas', '10:00', '13:00')
  await page.getByRole('button', { name: 'Agendar instalación' }).last().click()
  await expect(page.getByTestId('instalacion-agendada')).toBeVisible()
  await agendar('Marta Díaz Fuentes', '12:00', '15:00')
  await expect(page.getByTestId('agenda-del-dia')).toContainText('Se cruza con: 10:00–13:00 Ignacio Vera Salas')
  await page.getByLabel('Cantidad de Retiro de basura').fill('1')
  await shot('01-choque-de-horario.png')
  await page.getByRole('button', { name: 'Agendar instalación' }).last().click()
  const tarjetaMarta = page.locator('#cot-' + marta.cotNum)
  await expect(tarjetaMarta.getByTestId('instalacion-agendada')).toBeVisible()

  // El total cambio (retiro de basura): sugiere regenerar el PDF y lo regenera con el 3D.
  await expect(tarjetaMarta.getByText(/El total cambió con los servicios agregados/)).toBeVisible()
  await tarjetaMarta.getByRole('button', { name: 'Regenerar PDF' }).click()
  await expect(tarjetaMarta.getByText('✓ PDF actualizado · ver')).toBeVisible({ timeout: 90000 })
  const conPdf = (await (await api('get-quotes?cotNum=' + marta.cotNum)).json()).quote
  expect(conPdf.pdfUrl).toContain('/.netlify/functions/local-pdf?id=')
  const pdf = Buffer.from(await (await page.request.get(conPdf.pdfUrl)).body())
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
  expect(pdf.length).toBeGreaterThan(200000) // con las dos vistas 3D adentro

  // Abono del 50%: barra, saldo y etiqueta en la tarjeta.
  const pagos = tarjetaMarta.getByTestId('pagos')
  await pagos.getByRole('button', { name: 'Registrar pago' }).click()
  await pagos.getByRole('button', { name: /Abono 50%/ }).click()
  await pagos.getByLabel('Nota del pago').fill('Transferencia BCI')
  await pagos.getByRole('button', { name: 'Guardar pago' }).click()
  const total = Number(conPdf.total), mitad = Math.round(total / 2)
  await expect(pagos).toContainText('saldo $' + (total - mitad).toLocaleString('es-CL'))
  await expect(tarjetaMarta.getByText('Abono 50%')).toBeVisible()
  await shot('02-pago-y-pdf.png')

  // ── Calendario ──
  await page.getByRole('navigation').getByRole('button', { name: 'Calendario', exact: true }).click()
  await expect(page.getByText(/Recordatorios de mañana/)).toBeVisible()
  const recordatorios = page.getByRole('link', { name: 'Recordar por WhatsApp' })
  await expect(recordatorios).toHaveCount(2)
  expect(decodeURIComponent(await recordatorios.last().getAttribute('href'))).toMatch(/Le recordamos que mañana.*vamos a instalar sus repisas/s)
  const columna = page.locator(`[data-dia="${manana}"]`)
  await expect(columna.getByRole('button', { name: /Ignacio Vera Salas/ })).toBeVisible()
  await expect(columna.getByRole('button', { name: /Marta Díaz Fuentes/ })).toBeVisible()
  // Se cruzan: quedan lado a lado.
  const [ancho1, ancho2] = await Promise.all([/Ignacio/, /Marta/].map(n => columna.getByRole('button', { name: n }).evaluate(b => b.getBoundingClientRect().width)))
  const anchoColumna = await columna.evaluate(c => c.getBoundingClientRect().width)
  expect(ancho1 + ancho2).toBeLessThanOrEqual(anchoColumna)
  await shot('03-semana.png')

  await page.getByRole('tab', { name: 'Mes' }).click()
  await expect(page.getByRole('button', { name: /12:00 Marta Díaz Fuentes/ })).toBeVisible()
  await shot('04-mes.png')
  await page.getByRole('tab', { name: 'Semana' }).click()

  // Detalle: saldo, WhatsApp y salto a la cotizacion.
  await columna.getByRole('button', { name: /Marta Díaz Fuentes/ }).click()
  const detalle = page.getByRole('dialog', { name: 'Marta Díaz Fuentes' })
  await expect(detalle).toContainText('Av. Grecia 1500')
  await expect(detalle).toContainText('Saldo $')
  await expect(detalle.getByRole('link', { name: 'Recordatorio por WhatsApp' })).toHaveAttribute('href', /wa\.me\/56977778888/)
  // Solo lo visible: la captura de pagina completa achica la ventana a 1x1 un instante, el panel
  // pasa al diseño de celular y el detalle abierto se cierra.
  await page.screenshot({ path: path.join(evidence, '05-detalle.png') })
  await detalle.getByRole('button', { name: 'Ver cotización y pagos' }).click()
  await expect(page.locator('#cot-' + marta.cotNum).getByTestId('pagos')).toBeVisible()

  // Celular: la vista por defecto es Agenda.
  const movil = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await movil.goto(base + '/admin')
  await movil.locator('input[type=password]').fill(PASSWORD)
  await movil.getByRole('button', { name: 'Ingresar' }).click()
  await movil.getByRole('navigation').getByRole('button', { name: 'Agenda', exact: true }).click()
  await expect(movil.getByRole('tab', { name: 'Agenda' })).toHaveAttribute('aria-selected', 'true')
  await expect(movil.getByRole('button', { name: /Marta Díaz Fuentes/ }).first()).toBeVisible()
  await movil.screenshot({ path: path.join(evidence, '06-agenda-movil.png'), fullPage: true })

  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, manana, evidence }))
} finally { await browser.close() }

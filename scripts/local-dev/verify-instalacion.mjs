// Prueba E2E: agendar la instalacion desde Cotizaciones, con servicios agregados despues,
// invitacion por correo y aviso por WhatsApp. Contra el entorno local (start-native.mjs):
// los eventos van a un calendario falso en scripts/local-dev/data.json.
//   node scripts/local-dev/verify-instalacion.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { ahoraEnZona, sumarDias } from '../../netlify/functions/lib/horarios.mjs'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const PASSWORD = process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo'
const evidence = path.resolve('docs/evidence/2026-10-14-instalacion')
mkdirSync(evidence, { recursive: true })
const fecha = sumarDias(ahoraEnZona().fecha, 3)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = (ruta, opts = {}) => page.request.fetch(base + '/.netlify/functions/' + ruta, { ...opts, headers: { Authorization: 'Bearer ' + token } })

  // Una cotizacion sin correo, para probar la invitacion posterior.
  const creada = await (await api('save-quote', { method: 'POST', data: {
    crear: true, nombre: 'Pedro Sin Correo Rojas', telefono: '9 8765 4321', direccion: 'Calle Uno 456',
    subtotal: 110000, iva: 20900, total: 130900, repisas: [{ largo: 2.43, prof: .48, alto: 2, niveles: 4, unidades: 1, valor: 110000 }], adicionales: {},
  } })).json()

  // ── Agendar a Ignacio (cotizacion de ejemplo con correo), sumando cajas que pidio despues ──
  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await page.getByText('Ignacio Vera Salas').click()
  await page.getByRole('button', { name: 'Agendar instalación' }).click()
  await page.getByLabel('Cantidad de Cajas organizadoras').fill('2')
  await page.getByLabel('Precio de Cajas organizadoras').fill('12000')
  // 140.000 de repisas + 24.000 de cajas, mas IVA.
  await expect(page.getByTestId('total-instalacion')).toHaveText('$195.160')
  await page.getByLabel('Día de la instalación').fill(fecha)
  await page.getByLabel('Hora de inicio').fill('10:00')
  await page.getByLabel('Hora de término').fill('13:30')
  await expect(page.getByText(/10:00 a 13:30 · 3 h 30 min/)).toBeVisible()
  await expect(page.getByLabel('Correo del cliente')).toHaveValue('ignacio.vera@example.cl')
  await page.screenshot({ path: path.join(evidence, '01-agendar.png'), fullPage: true })
  await page.getByRole('button', { name: 'Agendar instalación' }).last().click()

  // Queda en Confirmadas con el resumen y el aviso de WhatsApp listo.
  const resumen = page.getByTestId('instalacion-agendada')
  await expect(resumen).toContainText('10:00 a 13:30')
  await expect(resumen).toContainText('Invitación enviada a ignacio.vera@example.cl')
  const whatsapp = await resumen.getByRole('link', { name: 'Avisar por WhatsApp' }).getAttribute('href')
  expect(whatsapp).toMatch(/^https:\/\/wa\.me\/56944556677\?text=/)
  const mensaje = decodeURIComponent(whatsapp.split('text=')[1])
  expect(mensaje).toMatch(/Su hora ya está agendada/)
  expect(mensaje).toMatch(/De 10:00 a 13:30 hrs \(duración aprox\. 3 h 30 min\)/)
  expect(mensaje).toMatch(/retraso máximo de 1 hora, pero intentaremos llegar puntual/)
  await page.screenshot({ path: path.join(evidence, '02-agendada.png'), fullPage: true })

  const { quote } = await (await api('get-quotes?cotNum=1477')).json()
  expect(quote.status).toBe('confirmada')
  expect(Number(quote.total)).toBe(195160)
  expect(quote.adicionales.qty_cajas).toBe(2)
  expect(quote.instalacion).toMatchObject({ fecha, inicio: '10:00', fin: '13:30', invitado: 'ignacio.vera@example.cl' })
  const { eventos } = await (await api('eventos-local')).json()
  const evento = eventos[quote.instalacion.eventId]
  expect(evento.summary).toBe('Instalación - Ignacio Vera Salas')
  expect(evento.start).toEqual({ dateTime: `${fecha}T10:00:00`, timeZone: 'America/Santiago' })
  expect(evento.attendees).toEqual([{ email: 'ignacio.vera@example.cl' }])

  // ── Pedro no tiene correo: se agenda igual y se invita despues ──
  await page.getByRole('button', { name: /^Por confirmar *\d/ }).click()
  await page.getByText('Pedro Sin Correo Rojas').click()
  await page.getByRole('button', { name: 'Agendar instalación' }).click()
  await page.getByLabel('Día de la instalación').fill(fecha)
  await page.getByLabel('Hora de inicio').fill('15:00')
  await page.getByLabel('Hora de término').fill('17:00')
  await expect(page.getByText('Sin correo: puedes invitarlo después de agendar')).toBeVisible()
  await page.getByRole('button', { name: 'Agendar instalación' }).last().click()
  const resumenPedro = page.getByTestId('instalacion-agendada').filter({ hasText: '15:00 a 17:00' })
  await expect(resumenPedro).toContainText('Sin invitación por correo')
  await resumenPedro.getByLabel('Correo para invitar').fill('pedro@example.cl')
  await resumenPedro.getByRole('button', { name: 'Invitar por correo' }).click()
  await expect(resumenPedro).toContainText('Invitación enviada a pedro@example.cl')
  const pedro = (await (await api('get-quotes?cotNum=' + creada.cotNum)).json()).quote
  expect(pedro.email).toBe('pedro@example.cl')
  const eventosPedro = (await (await api('eventos-local')).json()).eventos
  expect(eventosPedro[pedro.instalacion.eventId].attendees).toEqual([{ email: 'pedro@example.cl' }])
  await page.screenshot({ path: path.join(evidence, '03-invitado-despues.png'), fullPage: true })

  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, fecha, evidence }))
} finally { await browser.close() }

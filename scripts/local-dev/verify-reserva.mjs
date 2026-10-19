// Prueba E2E del link de la cotizacion: el cliente ve los bloques libres, reserva y paga.
// - Transferencia: avisa, Don Maxi la confirma en el panel, se agenda y se le confirma.
// - Mercado Pago (simulado en el backend local): al aprobarse, se agenda sola.
// Contra el entorno local (start-native.mjs), con datos limpios y la reserva activa:
//   RESERVA_ACTIVA=1 node scripts/local-dev/start-native.mjs
//   node scripts/local-dev/verify-reserva.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ahoraEnZona, diaSemana, sumarDias } from '../../netlify/functions/lib/horarios.mjs'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const PASSWORD = process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo'
const evidence = path.resolve('docs/evidence/2026-10-15-reserva')
mkdirSync(evidence, { recursive: true })
const pesos = n => '$' + n.toLocaleString('es-CL')
const habil = d => { while ([0, 6].includes(diaSemana(d))) d = sumarDias(d, 1); return d }
const dia1 = habil(sumarDias(ahoraEnZona().fecha, 1))
const dia2 = habil(sumarDias(dia1, 1))
const correosDir = path.resolve('scripts/local-dev/correos')
// Asuntos de los .eml que deja el backend local (vienen en base64, como los manda Gmail).
const correos = () => { try { return readdirSync(correosDir).sort().map(f => readFileSync(path.join(correosDir, f), 'utf8').match(/Subject: =\?UTF-8\?B\?(.+?)\?=/)?.[1]).filter(Boolean).map(b => Buffer.from(b, 'base64').toString('utf8')) } catch { return [] } }

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const admin = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  const errors = []; admin.on('pageerror', e => errors.push(e.stack || e.message))
  await admin.goto(base + '/admin')
  await admin.locator('input[type=password]').fill(PASSWORD)
  await admin.getByRole('button', { name: 'Ingresar' }).click()
  await expect(admin.getByRole('navigation')).toBeVisible()
  const token = await admin.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = async (ruta, data) => (await admin.request.fetch(base + '/.netlify/functions/' + ruta, { method: data ? 'POST' : 'GET', data, headers: { Authorization: 'Bearer ' + token } })).json()
  const crear = nombre => api('save-quote', { crear: true, nombre, email: nombre.split(' ')[0].toLowerCase() + '@example.cl', telefono: '9 5555 1234', direccion: 'Los Leones 200',
    subtotal: 200000, iva: 38000, total: 238000, repisas: [{ largo: 2.43, prof: .48, alto: 2, niveles: 4, unidades: 1, valor: 200000 }], adicionales: {} })
  const correosAntes = correos().length

  // Otra instalacion ocupa la mañana del primer dia habil.
  const otra = await crear('Pedro Otro')
  await api('instalacion', { accion: 'agendar', cotNum: otra.cotNum, fecha: dia1, inicio: '10:00', fin: '13:00', adicionales: {}, invitar: false })

  // ── Cliente 1: transferencia ──
  const rocio = await crear('Rocío Fuentes')
  expect(rocio.linkPago).toMatch(new RegExp(`/reserva\\?c=${rocio.cotNum}&t=`))
  const cel = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  cel.on('pageerror', e => errors.push(e.stack || e.message))
  await cel.goto(rocio.linkPago)
  await expect(cel.getByRole('heading', { name: /Hola Rocío/ })).toBeVisible()
  const fila1 = cel.locator(`[data-dia="${dia1}"]`)
  await expect(fila1.getByRole('button', { name: /10:00 a 13:00 \(ocupado\)/ })).toBeDisabled()
  await cel.screenshot({ path: path.join(evidence, '01-elegir-dia.png'), fullPage: true })
  await fila1.getByRole('button', { name: /13:00 a 16:00$/ }).click()
  await cel.getByRole('button', { name: 'Continuar' }).click()
  await expect(cel.getByRole('button', { name: /Transferencia.*Ahorra 10%/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(cel.getByRole('button', { name: /Transferencia/ })).toContainText(pesos(214200))
  await expect(cel.getByRole('button', { name: /Mercado Pago/ })).toContainText(pesos(238000))
  await cel.getByRole('button', { name: /Abono 50% ahora/ }).click()
  await cel.screenshot({ path: path.join(evidence, '02-como-pagar.png'), fullPage: true })
  await cel.getByRole('button', { name: 'Ver datos para transferir' }).click()
  await expect(cel.locator('.rsv-monto-transferir')).toHaveText(pesos(107100))
  await cel.screenshot({ path: path.join(evidence, '03-datos-transferencia.png'), fullPage: true })
  await cel.getByRole('button', { name: 'Ya hice la transferencia' }).click()
  await expect(cel.getByRole('heading', { name: 'Estamos verificando tu transferencia' })).toBeVisible()
  await cel.screenshot({ path: path.join(evidence, '04-verificando.png'), fullPage: true })
  const nuevos = correos().slice(correosAntes).join('\n')
  expect(nuevos).toMatch(/Transferencia por verificar/)

  // ── Don Maxi la confirma en el panel ──
  await admin.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await expect(admin.getByRole('button', { name: /Transferencias por verificar/ })).toBeVisible()
  await admin.getByRole('button', { name: /Transferencias por verificar/ }).click()
  await admin.getByText('Rocío Fuentes').click()
  const tarjeta = admin.locator('#cot-' + rocio.cotNum)
  const panel = tarjeta.getByTestId('transferencia-por-verificar')
  await expect(panel).toContainText(pesos(107100))
  await admin.screenshot({ path: path.join(evidence, '05-panel-verificar.png'), fullPage: true })
  await panel.getByRole('button', { name: /Recibí la transferencia: confirmar y agendar/ }).click()
  await expect(tarjeta.getByText(/Transferencia confirmada e instalación agendada/)).toBeVisible()
  await tarjeta.getByRole('button', { name: '📋 Copiar mensaje de agendamiento' }).click()
  expect(await tarjeta.getByTestId('mensaje-copiado').inputValue()).toMatch(/Su hora ya está agendada.*Recibimos su pago de \$107\.100 \(saldo de \$107\.100 al terminar\)/s)
  await admin.screenshot({ path: path.join(evidence, '06-confirmada.png'), fullPage: true })
  const q1 = (await api('get-quotes?cotNum=' + rocio.cotNum)).quote
  expect([q1.status, q1.adicionales.descuento_pct, Number(q1.total), q1.reserva]).toEqual(['confirmada', 10, 214200, null])
  expect(q1.pagos.map(p => [p.monto, p.medio])).toEqual([[107100, 'Transferencia']])
  expect([q1.instalacion.fecha, q1.instalacion.inicio, q1.instalacion.fin]).toEqual([dia1, '13:00', '16:00'])
  expect(correos().slice(correosAntes).join('\n')).toMatch(/¡Tu instalación está confirmada!/)
  // El cliente ve su reserva confirmada.
  await cel.reload()
  await expect(cel.getByRole('heading', { name: 'Tu instalación' })).toBeVisible()

  // ── Cliente 2: Mercado Pago, se agenda sola ──
  const ana = await crear('Ana Torres')
  await cel.goto(ana.linkPago)
  await expect(cel.locator(`[data-dia="${dia1}"]`).getByRole('button', { name: /13:00 a 16:00 \(ocupado\)/ })).toBeDisabled()
  // Si el dia cae la semana siguiente, se avanza como lo haria el cliente.
  for (let i = 0; i < 2 && !(await cel.locator(`[data-dia="${dia2}"]`).count()); i++) await cel.getByRole('button', { name: 'Semana siguiente' }).click()
  await cel.locator(`[data-dia="${dia2}"]`).getByRole('button', { name: /10:00 a 13:00$/ }).click()
  await cel.getByRole('button', { name: 'Continuar' }).click()
  await cel.getByRole('button', { name: /Mercado Pago/ }).click()
  await cel.getByRole('button', { name: `Pagar ${pesos(238000)} con Mercado Pago` }).click()
  await expect(cel.getByText('Mercado Pago · simulado')).toBeVisible()
  await cel.getByRole('button', { name: 'Pagar (simulado)' }).click()
  await expect(cel.getByRole('heading', { name: '¡Todo listo!' })).toBeVisible({ timeout: 20000 })
  await cel.screenshot({ path: path.join(evidence, '07-mp-listo.png'), fullPage: true })
  const q2 = (await api('get-quotes?cotNum=' + ana.cotNum)).quote
  expect([q2.instalacion.fecha, q2.instalacion.inicio, q2.reserva, q2.pagos[0].medio]).toEqual([dia2, '10:00', null, 'Mercado Pago'])

  // Los links antiguos /pagar llevan a la reserva.
  await cel.goto(rocio.linkPago.replace('/reserva?', '/pagar?'))
  await expect(cel).toHaveURL(/\/reserva\?c=/)

  // La tarjeta ordenada: siguiente paso y secciones.
  const luis = await crear('Luis Nuevo')
  await admin.getByRole('button', { name: 'Actualizar' }).click()
  await admin.getByRole('button', { name: /^Por confirmar/ }).click()
  await admin.getByText('Luis Nuevo').click()
  const paso = admin.locator('#cot-' + luis.cotNum).getByTestId('siguiente-paso')
  await expect(paso).toContainText('Mándale la cotización con su link')
  await expect(paso.getByRole('link', { name: 'Enviar por WhatsApp' })).toHaveAttribute('href', /reserva%3Fc%3D/)
  await admin.screenshot({ path: path.join(evidence, '08a-por-confirmar.png'), fullPage: true })
  await admin.getByRole('button', { name: /^Confirmadas/ }).click()
  await expect(admin.getByText('Rocío Fuentes')).toBeVisible()
  await admin.getByText('Rocío Fuentes').click()
  await expect(tarjeta.getByTestId('siguiente-paso')).toContainText('Saldo por cobrar')
  await admin.screenshot({ path: path.join(evidence, '08-tarjeta-ordenada.png'), fullPage: true })

  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, dia1, dia2, evidence }))
} finally { await browser.close() }

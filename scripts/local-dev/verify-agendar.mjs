// Prueba E2E del link para agendar (/agendar): el cliente suma un servicio, elige una hora que
// calza, agenda y ve la pantalla de cierre; al volver a entrar ve su hora y puede cambiarla.
// El panel muestra el link junto al de pago y se envian los dos correos.
// Contra el entorno local (start-native.mjs), con datos limpios.
//   node scripts/local-dev/verify-agendar.mjs
import { chromium, devices, expect } from '@playwright/test'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ahoraEnZona, sumarDias, diaSemana } from '../../netlify/functions/lib/horarios.mjs'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve('docs/evidence/2026-10-20-agendar')
mkdirSync(evidence, { recursive: true })
const correosDir = path.resolve('scripts/local-dev/correos')
const asuntos = () => { try { return readdirSync(correosDir).sort().map(f => readFileSync(path.join(correosDir, f), 'utf8').match(/Subject: =\?UTF-8\?B\?(.+?)\?=/)?.[1]).filter(Boolean).map(b => Buffer.from(b, 'base64').toString('utf8')) } catch { return [] } }

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const admin = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  const errors = []; admin.on('pageerror', e => errors.push(e.stack || e.message))
  await admin.goto(base + '/admin')
  await admin.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await admin.getByRole('button', { name: 'Ingresar' }).click()
  await expect(admin.getByRole('navigation')).toBeVisible()
  const token = await admin.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = async (ruta, body) => (await admin.request[body ? 'post' : 'get'](base + '/.netlify/functions/' + ruta, { headers: { Authorization: 'Bearer ' + token }, ...(body ? { data: body } : {}) })).json()

  // Una cotizacion por confirmar de $200.000 netos (2 h 30 min de instalacion).
  const { siguiente } = await api('get-quotes')
  const guardada = await api('save-quote', { crear: true, cotNum: siguiente, nombre: 'Paula Agenda', email: 'paula@example.cl', telefono: '9 5555 4444', direccion: 'Los Leones 123', status: 'por confirmar', repisas: [{ largo: 2.43, prof: 0.48, alto: 2, niveles: 4, unidades: 1, valor: 200000 }], adicionales: {}, subtotal: 200000, iva: 38000, total: 238000 })
  expect(guardada.ok).toBe(true)
  expect(guardada.linkAgenda).toMatch(new RegExp(`/agendar\\?c=${guardada.cotNum}&t=`))
  // El link de pago sigue siendo el fijo de Mercado Pago.
  expect(guardada.linkPago).toBe('https://link.mercadopago.cl/repisasdonmaxi')

  // En Cotizaciones esta junto al de pago.
  await admin.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await admin.getByText('Paula Agenda').first().click()
  await expect(admin.getByRole('button', { name: '📅 Copiar link para agendar' }).first()).toBeVisible()
  await expect(admin.getByRole('button', { name: 'Copiar link de pago' }).first()).toBeVisible()

  // El cliente, en el celular.
  const cel = await browser.newPage({ ...devices['Pixel 5'] })
  cel.on('pageerror', e => errors.push(e.stack || e.message))
  const enlace = new URL(guardada.linkAgenda); enlace.host = new URL(base).host; enlace.protocol = new URL(base).protocol
  await cel.goto(enlace.toString())
  await expect(cel.getByRole('heading', { name: /agenda tu instalación/ })).toBeVisible()
  await expect(cel.getByTestId('agenda-duracion')).toContainText('2 h 30 min')
  await expect(cel.getByTestId('agenda-total')).toContainText('$238.000')
  // Suma retiro y orden: +$40.000 neto y la instalacion pasa a 3 h.
  await cel.getByRole('checkbox', { name: 'Retiro y orden de artículos' }).check()
  await expect(cel.getByTestId('agenda-total')).toContainText('$285.600')
  await expect(cel.getByTestId('agenda-duracion')).toContainText('3 h')
  // Solo horas pegadas: un dia libre ofrece 10:00 y 13:00 (termina a las 16:00).
  const primerDia = cel.getByTestId('dia-agenda').first()
  await expect(primerDia.getByRole('button')).toHaveText(['10:00a 13:00', '13:00a 16:00'])
  await cel.screenshot({ path: path.join(evidence, '01-elegir.png'), fullPage: true })
  await primerDia.getByRole('button').first().click()
  const antes = asuntos().length
  await cel.getByRole('button', { name: 'Agendar instalación' }).click()
  const listo = cel.getByTestId('agenda-lista')
  await expect(listo).toContainText('De 10:00 a 13:00 hrs')
  await expect(listo).toContainText('Te enviamos un correo')
  await expect(listo).toContainText('Te escribiremos por WhatsApp para confirmar')
  await expect(listo).toContainText('El pago es una vez terminada la instalación')
  await cel.screenshot({ path: path.join(evidence, '02-listo.png'), fullPage: true })

  const q = (await api('get-quotes?cotNum=' + guardada.cotNum)).quote
  expect([q.status, q.adicionales.qty_retiro_orden, Number(q.total), q.instalacion.inicio, q.instalacion.fin, q.instalacion.agendadaPorCliente]).toEqual(['confirmada', 1, 285600, '10:00', '13:00', true])
  const nuevos = asuntos().slice(antes).join('\n')
  expect(nuevos).toMatch(/Tu instalación quedó agendada/)
  expect(nuevos).toMatch(/📅 Agendó: Paula Agenda/)

  // Al volver a entrar ve su hora. Si faltan 48 h o mas, puede cambiarla.
  await cel.goto(enlace.toString())
  const actual = cel.getByTestId('agenda-actual')
  await expect(actual).toContainText('De 10:00 a 13:00 hrs')
  const hoy = ahoraEnZona().fecha
  const lejos = q.instalacion.fecha >= sumarDias(hoy, 3)
  if (lejos) {
    await actual.getByRole('button', { name: 'Cambiar día u hora' }).click()
    await expect(cel.getByRole('heading', { name: 'Cambia tu día u hora' })).toBeVisible()
    await cel.getByRole('button', { name: 'Mantener mi hora actual' }).click()
  } else {
    await expect(actual).toContainText('Faltan menos de 48 horas')
  }
  await cel.screenshot({ path: path.join(evidence, '03-estado.png'), fullPage: true })
  expect(diaSemana(q.instalacion.fecha)).toBeGreaterThan(0)
  expect(diaSemana(q.instalacion.fecha)).toBeLessThan(6)
  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, fecha: q.instalacion.fecha }))
} finally { await browser.close() }

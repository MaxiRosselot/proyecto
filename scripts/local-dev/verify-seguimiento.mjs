// Prueba E2E del seguimiento y los avisos de Telegram (con el Telegram simulado de server.mjs):
// cotizacion creada / confirmada, visita agendada, el resumen de las 20:00 (instalaciones de mañana
// con su mensaje y boton de WhatsApp, cotizaciones sin respuesta y correos de seguimiento), la
// antiguedad en Cotizaciones y la tarjeta "Avisos por Telegram" del Inicio.
// Contra el entorno local (start-native.mjs), con datos limpios.
//   node scripts/local-dev/verify-seguimiento.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { ahoraEnZona, sumarDias } from '../../netlify/functions/lib/horarios.mjs'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
const apiLocal = 'http://127.0.0.1:' + (process.env.LOCAL_API_PORT || 8899)
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve('docs/evidence/2026-10-23-seguimiento')
mkdirSync(evidence, { recursive: true })
const correosDir = path.resolve('scripts/local-dev/correos')
const correos = () => { try { return readdirSync(correosDir).map(f => path.join(correosDir, f)).sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs) } catch { return [] } }
const asunto = f => { const m = readFileSync(f, 'utf8').match(/Subject: (?:=\?UTF-8\?B\?(.+?)\?=|(.+))/); return m?.[1] ? Buffer.from(m[1], 'base64').toString('utf8') : m?.[2] }
const telegram = async () => (await (await fetch(apiLocal + '/telegram-mock/mensajes')).json()).mensajes
await fetch(apiLocal + '/telegram-mock/mensajes', { method: 'DELETE' })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = async (ruta, body, query = '') => (await page.request[body ? 'post' : 'get'](base + '/.netlify/functions/' + ruta + query, { headers: { Authorization: 'Bearer ' + token }, ...(body ? { data: body } : {}) })).json()
  const crear = async (nombre, extra = {}) => {
    const { siguiente } = await api('get-quotes')
    const r = await api('save-quote', { crear: true, cotNum: siguiente, nombre, email: `${nombre.split(' ')[0].toLowerCase()}@example.cl`, telefono: '9 1234 5678', direccion: 'Av. Grecia 1500', status: 'por confirmar', repisas: [{ largo: 2.43, prof: 0.48, alto: 2, niveles: 4, unidades: 1, valor: 200000 }], adicionales: {}, subtotal: 200000, iva: 38000, total: 238000, ...extra })
    expect(r.ok).toBe(true)
    return r.cotNum
  }

  // Avisos al momento.
  const sinRespuesta = await crear('Paula Seguimiento')
  const confirmar = await crear('Rodrigo Confirma')
  expect((await api('save-quote', { cotNum: confirmar, status: 'confirmada' })).ok).toBe(true)
  const hoy = ahoraEnZona().fecha
  const { dias } = await (await page.request.get(base + '/.netlify/functions/horarios')).json()
  const visita = await (await page.request.post(base + '/.netlify/functions/create_event', { data: { nombre: 'Ana', apellido: 'Visita', email: 'ana@example.cl', celular: '9 8765 4321', direccion: 'Los Leones 123', fechaISO: dias[0].fecha, horaHHmm: dias[0].horas.at(-1), note: 'Bodega en L' } })).json()
  expect(visita.ok).toBe(true)
  let mensajes = await telegram()
  expect(mensajes.map(m => m.texto.split('\n')[0])).toEqual(['🆕 Cotización creada', '🆕 Cotización creada', '✅ Cotización confirmada', '📏 Visita agendada'])
  expect(mensajes[0].texto).toContain(`Paula Seguimiento · N° ${sinRespuesta}`)
  expect(mensajes[3].texto).toMatch(/Ana Visita\n🕐 .* hrs\n📍 Los Leones 123\n📞 9 8765 4321\n💬 Bodega en L/)

  // El resumen de las 20:00, tres dias despues: instalacion "de mañana" con su mensaje y la cotizacion sin respuesta.
  const dia = sumarDias(hoy, 3)
  const instalar = await crear('Marta Instala', { status: 'confirmada', adicionales: { qty_retiro_orden: 1, precio_retiro_orden: 40000 }, instalacion: { fecha: sumarDias(dia, 1), inicio: '10:00', fin: '12:30' } })
  await fetch(apiLocal + '/telegram-mock/mensajes', { method: 'DELETE' })
  const antes = correos().length
  const r = await api('seguimiento-diario', {}, '?hoy=' + dia)
  expect(r.ok).toBe(true)
  expect(r.correos).toBe(1)
  mensajes = await telegram()
  expect(mensajes[0].texto).toMatch(/🔧 Mañana, .*: 1 instalación\.\n• 10:00–12:30 · Marta Instala/)
  expect(mensajes[1].texto).toMatch(/^¡Hola Marta! 👋 .*confirmar su instalación de mañana .* a las 10:00 hrs en Av\. Grecia 1500/)
  expect(mensajes[1].texto).toContain('contrató el retiro y orden')
  expect(mensajes[1].texto).toContain('maestro Felipe Chacón, +56 9 7468 8362')
  expect(mensajes[1].botones[0]).toMatchObject({ text: 'Abrir WhatsApp de Marta' })
  expect(mensajes[1].botones[0].url).toMatch(/^https:\/\/wa\.me\/56912345678\?text=/)
  expect(mensajes[2].texto).toContain('⏰ Cotizaciones sin respuesta (1)')
  expect(mensajes[2].texto).toContain(`Paula Seguimiento · N° ${sinRespuesta} · hace 3 días · le mandé recordatorio`)
  expect(correos().slice(antes).map(asunto)).toEqual([`¿Pudiste revisar tu cotización N° ${sinRespuesta}? — Repisas Don Maxi`])
  expect(String(instalar)).not.toBe('')

  // Cotizaciones: cuanto hace que se envio, para priorizar.
  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await expect(page.getByTestId('antiguedad').first()).toContainText('Enviada hoy')
  await page.getByRole('button', { name: /Más nuevas primero/ }).click()
  await expect(page.getByRole('button', { name: /Más antiguas primero/ })).toBeVisible()
  await page.screenshot({ path: path.join(evidence, 'cotizaciones.png') })

  // Inicio: la tarjeta del bot.
  await page.getByRole('navigation').getByRole('button', { name: 'Inicio', exact: true }).click()
  const tarjeta = page.getByTestId('avisos-telegram')
  await expect(tarjeta).toContainText('Conectado')
  await expect(tarjeta).toContainText('Maxi Local')
  await tarjeta.getByRole('button', { name: 'Enviar prueba' }).click()
  await expect(tarjeta.getByRole('status')).toContainText('Mensaje de prueba enviado')
  expect((await telegram()).at(-1).texto).toContain('desde ahora te aviso aquí')
  await tarjeta.getByRole('button', { name: 'Enviar el resumen de las 20:00 ahora' }).click()
  await expect(tarjeta.getByRole('status')).toContainText(/✅ Listo: \d+ avisos por Telegram/)
  await tarjeta.scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(evidence, 'inicio-telegram.png') })

  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true }))
} finally { await browser.close() }

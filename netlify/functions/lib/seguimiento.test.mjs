import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diasDesde, ejecutarSeguimiento, planSeguimiento } from './seguimiento.mjs'
import { atenderTelegramAdmin, avisar, configTelegram, enviarTelegram } from './telegram.mjs'
import { avisarGuardado } from './avisos.mjs'

const ms = iso => Date.parse(iso)
const cot = (cotNum, extra) => ({ cotNum, nombre: `Cliente ${cotNum}`, email: `c${cotNum}@example.cl`, telefono: '9 1234 5678', direccion: 'Av. Grecia 1500', status: 'por confirmar', adicionales: {}, ...extra })

test('los dias se cuentan por fecha de Chile, no por horas', () => {
  // Creada a las 23:30 del 20 en Chile (02:30 UTC del 21): el 23 son 3 dias.
  assert.equal(diasDesde(ms('2026-10-21T02:30:00Z'), '2026-10-23'), 3)
  assert.equal(diasDesde(ms('2026-10-20T15:00:00Z'), '2026-10-20'), 0)
  assert.equal(diasDesde(null, '2026-10-20'), null)
})

test('seguimiento: correo a los 3 y 7 dias, aviso a los 3, 7 y 14, y nada a las ya respondidas', () => {
  const hoy = '2026-10-23'
  const cotizaciones = [
    cot(1, { creadoMs: ms('2026-10-20T15:00:00Z') }),                      // 3 dias
    cot(2, { creadoMs: ms('2026-10-16T15:00:00Z') }),                      // 7 dias
    cot(3, { creadoMs: ms('2026-10-09T15:00:00Z') }),                      // 14 dias: solo aviso
    cot(4, { creadoMs: ms('2026-10-21T15:00:00Z') }),                      // 2 dias: nada
    cot(5, { creadoMs: ms('2026-10-20T15:00:00Z'), status: 'confirmada' }), // respondida
    cot(6, { creadoMs: ms('2026-10-20T15:00:00Z'), email: '' }),           // sin correo: solo aviso
  ]
  const plan = planSeguimiento({ cotizaciones, hoy, linkAgenda: n => `https://repisasdonmaxi.cl/agendar?c=${n}` })
  assert.deepEqual(plan.correos.map(c => c.cotNum), [1, 2])
  assert.match(plan.correos[0].correo.asunto, /¿Pudiste revisar tu cotización N° 1\?/)
  assert.match(plan.correos[1].correo.asunto, /sigue disponible/)
  assert.match(plan.correos[0].correo.texto, /agendar\?c=1/)
  assert.deepEqual(plan.sinRespuesta.map(c => [c.cotNum, c.dias, c.correo]), [[3, 14, false], [2, 7, true], [1, 3, true], [6, 3, false]])
})

test('instalaciones de mañana: un mensaje por cada una, con o sin bodega despejada', () => {
  const cotizaciones = [
    cot(10, { status: 'confirmada', instalacion: { fecha: '2026-10-24', inicio: '13:00', fin: '15:30' } }),
    cot(11, { status: 'confirmada', adicionales: { qty_retiro_orden: 1 }, instalacion: { fecha: '2026-10-24', inicio: '10:00', fin: '12:00' } }),
    cot(12, { status: 'confirmada', instalacion: { fecha: '2026-10-25', inicio: '10:00' } }),
    cot(13, { status: 'confirmada', instalacion: { fecha: '2026-10-24', inicio: '16:00', instalada: true } }),
  ]
  const { instalaciones } = planSeguimiento({ cotizaciones, hoy: '2026-10-23' })
  assert.deepEqual(instalaciones.map(i => i.cotNum), [11, 10])
  assert.match(instalaciones[0].mensaje, /mañana sábado 24 de octubre a las 10:00 hrs en Av\. Grecia 1500/)
  assert.match(instalaciones[0].mensaje, /contrató el retiro y orden/)
  assert.match(instalaciones[1].mensaje, /bodega despejada/)
  assert.match(instalaciones[1].mensaje, /maestro Felipe Chacón, \+56 9 7468 8362.*VLZZ79.*No necesitamos corriente/s)
  assert.match(instalaciones[1].whatsapp, /^https:\/\/wa\.me\/56912345678\?text=/)
})

test('ejecutar: correos y Telegram, y un envio que falla no corta el resto', async () => {
  const correos = [], telegram = []
  const cotizaciones = [
    cot(1, { creadoMs: ms('2026-10-20T15:00:00Z') }),
    cot(2, { creadoMs: ms('2026-10-20T15:00:00Z'), email: 'falla@example.cl' }),
    cot(10, { status: 'confirmada', total: 357000, subtotal: 300000, pagos: [{ monto: 100000 }], pdfUrl: 'https://drive/10',
      repisas: [{ largo: 2.43, prof: 0.48, alto: 2, niveles: 4, unidades: 2 }], adicionales: { qty_cajas: 2 },
      instalacion: { fecha: '2026-10-24', inicio: '10:00', fin: '12:30' } }),
  ]
  const r = await ejecutarSeguimiento({
    cotizaciones, hoy: '2026-10-23', linkAgenda: () => '', avisoA: 'maxi@example.cl',
    enviarCorreo: async c => { if (c.para === 'falla@example.cl') throw new Error('no'); correos.push(c) },
    telegram: async (texto, { botones }) => { telegram.push({ texto, botones }); return 1 },
  })
  assert.equal(r.correos, 1)
  assert.equal(r.correosFallidos.length, 1)
  assert.equal(correos[0].responderA, 'maxi@example.cl')
  assert.match(telegram[0].texto, /Mañana, sábado 24 de octubre: 1 instalación/)
  // Detalle con botones y, aparte, el mensaje para copiar.
  assert.match(telegram[1].texto, /^🔧 Mañana 10:00–12:30 hrs\n👤 Cliente 10 · N° 10/)
  assert.match(telegram[1].texto, /• 2 × 243×48×200 cm, 4 niveles/)
  assert.match(telegram[1].texto, /Servicios: Cajas organizadoras × 2/)
  assert.match(telegram[1].texto, /Neto \$300\.000 · Total \$357\.000 con IVA\n💳 Pagado \$100\.000 · Saldo \$257\.000/)
  assert.deepEqual(telegram[1].botones.map(b => b.texto), ['💬 Enviar este mensaje a Cliente', '✅ Confirmación corta', '📍 Ver en Maps', '📄 Ver cotización (PDF)'])
  assert.match(decodeURIComponent(telegram[1].botones[1].url), /Le confirmo su instalación de mañana a las 10:00 hrs en Av\. Grecia 1500 ✅/)
  assert.match(telegram[2].texto, /^¡Hola Cliente!/)
  assert.match(telegram[3].texto.texto, /Cotizaciones sin respuesta \(2\)/)
  assert.equal(telegram[3].texto.botones.length, 2)

  const vacio = []
  await ejecutarSeguimiento({ cotizaciones: [], hoy: '2026-10-23', enviarCorreo: async () => {}, telegram: async t => { vacio.push(t); return 1 } })
  assert.deepEqual(vacio, ['🌙 Mañana, sábado 24 de octubre, no hay instalaciones agendadas.'])
})

test('telegram: sin configurar no hace nada; configurado manda a cada chat con botones', async () => {
  assert.equal(configTelegram({}), null)
  assert.equal(await enviarTelegram('hola', { env: {} }), 0)
  const llamadas = []
  const fetchImpl = async (url, opciones) => { llamadas.push({ url, cuerpo: JSON.parse(opciones.body) }); return { status: 200, json: async () => ({ ok: true, result: {} }) } }
  const env = { TELEGRAM_BOT_TOKEN: 'abc', TELEGRAM_CHAT_ID: '11, 22' }
  assert.equal(await enviarTelegram('hola', { env, fetchImpl, botones: [{ texto: 'WhatsApp', url: 'https://wa.me/1' }] }), 2)
  assert.equal(llamadas[0].url, 'https://api.telegram.org/botabc/sendMessage')
  assert.deepEqual(llamadas.map(l => l.cuerpo.chat_id), ['11', '22'])
  assert.deepEqual(llamadas[0].cuerpo.reply_markup, { inline_keyboard: [[{ text: 'WhatsApp', url: 'https://wa.me/1' }]] })
  // avisar nunca lanza
  const falla = async () => ({ status: 401, json: async () => ({ ok: false, description: 'Unauthorized' }) })
  assert.equal(await avisar('x', { env, fetchImpl: falla }), 0)
})

test('panel: detecta quien le escribio al bot y manda la prueba', async () => {
  const fetchImpl = async url => ({ status: 200, json: async () => (url.endsWith('getUpdates')
    ? { ok: true, result: [{ message: { chat: { id: 555, first_name: 'Maxi', last_name: 'Rosselot' } } }] }
    : { ok: true, result: {} }) })
  assert.deepEqual(await atenderTelegramAdmin('GET', {}, { env: {} }), { ok: true, configurado: false, chats: [], detectados: [] })
  const r = await atenderTelegramAdmin('GET', {}, { env: { TELEGRAM_BOT_TOKEN: 'abc' }, fetchImpl })
  assert.deepEqual(r.detectados, [{ id: '555', nombre: 'Maxi Rosselot' }])
  assert.match((await atenderTelegramAdmin('POST', { accion: 'probar' }, { env: { TELEGRAM_BOT_TOKEN: 'abc' }, fetchImpl })).error, /TELEGRAM_CHAT_ID/)
  assert.deepEqual(await atenderTelegramAdmin('POST', { accion: 'probar' }, { env: { TELEGRAM_BOT_TOKEN: 'abc', TELEGRAM_CHAT_ID: '555' }, fetchImpl }), { ok: true, enviados: 1 })
})

test('avisos del panel: cotizacion nueva y cambio a confirmada o rechazada', async () => {
  const textos = []
  const env = { TELEGRAM_BOT_TOKEN: 'abc', TELEGRAM_CHAT_ID: '1' }
  const fetchImpl = async (_u, o) => { textos.push(JSON.parse(o.body).text); return { status: 200, json: async () => ({ ok: true }) } }
  const op = { env, fetchImpl }
  await avisarGuardado({ crear: true, nombre: 'Ana', total: 238000 }, { respuesta: { ok: true, cotNum: '1500' } }, op)
  await avisarGuardado({ cotNum: 1500, status: 'confirmada' }, { respuesta: { ok: true }, antes: { cotNum: 1500, nombre: 'Ana', status: 'por confirmar', total: 238000 } }, op)
  await avisarGuardado({ cotNum: 1500, status: 'rechazada', motivoRechazo: 'Precio' }, { respuesta: { ok: true }, antes: { cotNum: 1500, nombre: 'Ana', status: 'por confirmar' } }, op)
  await avisarGuardado({ cotNum: 1500, notas: 'x' }, { respuesta: { ok: true }, antes: { cotNum: 1500, status: 'confirmada' } }, op)
  assert.equal(textos.length, 3)
  assert.match(textos[0], /🆕 Cotización creada\n👤 Ana · N° 1500\n➕ Servicios: ninguno\n💰 Total \$238\.000 con IVA/)
  assert.match(textos[1], /✅ Cotización confirmada/)
  assert.match(textos[2], /❌ Cotización rechazada[\s\S]*Motivo: Precio/)
})

// Prueba E2E del bot de Telegram (con el Telegram simulado de server.mjs): activar el menu desde el
// panel, /hoy, registrar un pago con botones, el maestro manda una foto y Maxi la publica, el maestro
// marca terminada, un chat desconocido, el secreto del webhook y las fichas de las 07:00.
// Deja una captura de la conversacion (como se ve en Telegram) en docs/evidence.
// Contra el entorno local (start-native.mjs), con datos limpios.
//   node scripts/local-dev/verify-bot.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { ahoraEnZona } from '../../netlify/functions/lib/horarios.mjs'
import { secretoWebhook } from '../../netlify/functions/lib/bot.mjs'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
const apiLocal = 'http://127.0.0.1:' + (process.env.LOCAL_API_PORT || 8899)
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve('docs/evidence/2026-10-24-bot')
mkdirSync(evidence, { recursive: true })
const ADMIN = 1001, MAESTRO = 2002
const telegram = async () => (await (await fetch(apiLocal + '/telegram-mock/mensajes')).json()).mensajes
const limpiar = () => fetch(apiLocal + '/telegram-mock/mensajes', { method: 'DELETE' })
let idUpdate = 1
const bot = (update, secreto = secretoWebhook('local-simulado')) => fetch(apiLocal + '/.netlify/functions/telegram-bot', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secreto }, body: JSON.stringify({ update_id: idUpdate++, ...update }),
})
const escribe = (chat, text, extra = {}) => bot({ message: { message_id: idUpdate, chat: { id: chat }, from: { first_name: chat === MAESTRO ? 'Felipe' : 'Maxi' }, text, ...extra } })
const aprieta = (chat, data, extra = {}) => bot({ callback_query: { id: 'cb' + idUpdate, data, message: { message_id: 900, chat: { id: chat }, text: '…', ...extra } } })
const conversacion = []
const anotar = async (quien, texto) => { conversacion.push({ quien, texto }); for (const m of await telegram()) if (m.metodo !== 'answerCallbackQuery') conversacion.push({ bot: true, chat: m.chat, ...m }); await limpiar() }

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = async (ruta, body) => (await page.request[body ? 'post' : 'get'](base + '/.netlify/functions/' + ruta, { headers: { Authorization: 'Bearer ' + token }, ...(body ? { data: body } : {}) })).json()
  const cotizacion = async cotNum => (await api('get-quotes')).quotes.find(q => String(q.cotNum) === String(cotNum))

  // Una instalacion hoy, sin pagos.
  const hoy = ahoraEnZona().fecha
  const { siguiente } = await api('get-quotes')
  const r = await api('save-quote', { crear: true, cotNum: siguiente, nombre: 'Carla Bot', email: 'carla@example.cl', telefono: '9 1234 5678', direccion: 'Av. Grecia 1500, Ñuñoa', status: 'confirmada',
    repisas: [{ largo: 2.43, prof: 0.48, alto: 2, niveles: 4, unidades: 2, valor: 200000 }], adicionales: { qty_retiro_basura: 1, precio_retiro_basura: 30000 }, subtotal: 430000, iva: 81700, total: 511700,
    instalacion: { fecha: hoy, inicio: '10:00', fin: '13:00' } })
  expect(r.ok).toBe(true)
  const N = r.cotNum
  await limpiar()

  // Panel: activar el menu del bot.
  const tarjeta = page.getByTestId('avisos-telegram')
  await expect(tarjeta.getByText('Apagado')).toBeVisible()
  await tarjeta.getByRole('button', { name: 'Activar menú del bot' }).click()
  await expect(tarjeta.getByRole('status')).toContainText('Menú activado')
  await expect(tarjeta.getByText('Activo', { exact: true })).toBeVisible()
  await expect(tarjeta.getByText(/Maestro:.*conectado \(2002\)/)).toBeVisible()
  await tarjeta.screenshot({ path: path.join(evidence, '01-panel-bot.png') })
  expect((await telegram()).find(m => m.chat === String(ADMIN))?.texto).toMatch(/Menú del bot activado/)
  await limpiar()

  // Sin el secreto, nada.
  expect((await bot({ message: { chat: { id: ADMIN }, text: '/hoy' } }, 'otro')).status).toBe(401)

  // Maxi: /hoy.
  await escribe(ADMIN, '/hoy')
  let m = (await telegram()).filter(x => x.metodo !== 'answerCallbackQuery').at(-1)
  expect(m.texto).toContain(`10:00–13:00 · Carla Bot · N° ${N} · Ñuñoa · saldo $511.700`)
  expect(m.botones[0].callback_data).toBe(`v|${N}`)
  await anotar('Maxi', '/hoy')

  // Ficha → registrar pago: abono 50% por transferencia.
  await aprieta(ADMIN, `v|${N}`)
  m = (await telegram()).filter(x => x.metodo !== 'answerCallbackQuery').at(-1)
  expect(m.botones.map(x => x.text)).toEqual(expect.arrayContaining(['✅ Marcar instalada', '💳 Registrar pago', '🔁 Cambiar día u hora']))
  await anotar('Maxi', `🔧 10:00 Carla · N° ${N}`)
  await aprieta(ADMIN, `p|${N}`)
  await anotar('Maxi', '💳 Registrar pago')
  await aprieta(ADMIN, `pm|${N}|255850`)
  await anotar('Maxi', 'Abono 50% $255.850')
  await aprieta(ADMIN, `pg|${N}|255850|0`)
  m = (await telegram()).find(x => x.metodo === 'answerCallbackQuery')
  expect(m.aviso).toBe('💳 Pago registrado')
  await anotar('Maxi', 'Transferencia')
  expect((await cotizacion(N)).pagos.map(p => [p.monto, p.medio])).toEqual([[255850, 'Transferencia']])

  // Maestro: sus fichas, una foto (va sola a la unica instalacion de hoy) y Maxi la publica.
  await escribe(MAESTRO, '/hoy')
  const fichas = (await telegram()).filter(x => x.chat === String(MAESTRO))
  expect(fichas[0].texto).toMatch(/Buenos días Felipe\. Hoy, .*: 1 instalación/)
  expect(fichas[1].texto).toContain('💵 Cobrar al terminar: $255.850')
  expect(fichas[1].texto).not.toMatch(/Total|Neto/)
  await anotar('Felipe', '/hoy')
  await escribe(MAESTRO, undefined, { photo: [{ file_id: 'foto-chica' }, { file_id: 'foto-bodega' }] })
  const alMaestro = (await telegram()).find(x => x.chat === String(MAESTRO))
  const aMaxi = (await telegram()).find(x => x.metodo === 'sendPhoto')
  expect(alMaestro.texto).toBe(`📸 Guardada en N° ${N} · Carla Bot`)
  expect(aMaxi.chat).toBe(String(ADMIN))
  await anotar('Felipe', '📷 (foto)')
  const publicar = aMaxi.botones[0].callback_data
  expect(publicar).toMatch(/^w\|fotoventa-/)
  await aprieta(ADMIN, publicar, { text: undefined, photo: [{}] })
  expect((await telegram()).find(x => x.metodo === 'answerCallbackQuery').aviso).toBe('🌐 Publicada en la galería')
  await anotar('Maxi', '🌐 Publicar en la web')
  const sitio = await (await page.request.get(base + '/.netlify/functions/sitio')).json()
  expect(JSON.stringify(sitio)).toContain(`Bodega N° ${N}`)

  // Maestro: terminada → Maxi recibe cobrar saldo y pedir reseña.
  await aprieta(MAESTRO, `t|${N}`)
  const aviso = (await telegram()).find(x => x.chat === String(ADMIN))
  expect(aviso.texto).toMatch(/terminó la instalación[\s\S]*Saldo por cobrar: \$255\.850/)
  expect(aviso.botones.map(x => x.text)).toEqual(['💬 Cobrar saldo $255.850', '⭐ Pedir reseña en Google', '💳 Registrar pago'])
  await anotar('Felipe', '✅ Terminada')
  expect((await cotizacion(N)).instalacion.instalada).toBe(true)

  // Un desconocido.
  await escribe(5555, '/start')
  const desconocido = await telegram()
  expect(desconocido[0].texto).toContain('Tu número de chat es 5555')
  expect(desconocido[1].texto).toContain('TELEGRAM_MAESTRO_CHAT_ID')
  await limpiar()

  // Ruta de visitas: dos clientes del mismo rango (con coordenadas, como las deja el autocompletado).
  const { dias: diasVisita } = await (await page.request.get(base + '/.netlify/functions/visitas-rangos')).json()
  const diaRuta = diasVisita[0], rangoRuta = diaRuta.rangos[0]
  for (const [nombre, direccion, comuna, lat, lng] of [['Pedro', 'Concha y Toro 100', 'Puente Alto', -33.6117, -70.5758], ['Lucía', 'Vicuña Mackenna 7000', 'La Florida', -33.5227, -70.5986]]) {
    const v = await (await page.request.post(base + '/.netlify/functions/create_event', { data: { nombre, apellido: 'Ruta', email: `${nombre.toLowerCase()}@example.cl`, celular: '9 2222 3333', direccion, comuna, lat, lng, fechaISO: diaRuta.fecha, rango: rangoRuta.desde } })).json()
    expect(v.ok).toBe(true)
  }
  await limpiar()
  await escribe(ADMIN, '/ruta')
  m = (await telegram()).filter(x => x.metodo !== 'answerCallbackQuery').at(-1)
  const botonDia = m.botones.find(x => x.callback_data === `rv|${diaRuta.fecha.replaceAll('-', '')}`)
  expect(botonDia).toBeTruthy()
  await anotar('Maxi', '/ruta')
  await aprieta(ADMIN, botonDia.callback_data)
  m = (await telegram()).filter(x => x.metodo !== 'answerCallbackQuery').at(-1)
  expect(m.texto).toMatch(new RegExp(`1\\. ${rangoRuta.desde} · (Pedro|Lucía) Ruta[\\s\\S]*2\\. \\d\\d:\\d\\d · (Pedro|Lucía) Ruta[^\\n]*\\(🚗 \\d+ min\\)`))
  expect(m.botones[0].url).toMatch(/google\.com\/maps\/dir/)
  await anotar('Maxi', botonDia.text)
  await aprieta(ADMIN, `rf|${diaRuta.fecha.replaceAll('-', '')}`)
  expect((await telegram()).find(x => x.metodo === 'answerCallbackQuery').aviso).toBe('📌 Horas fijadas en el calendario')
  await anotar('Maxi', '📌 Fijar horas en el calendario')
  const visitasRuta = (await api('get-visits')).visits.filter(v => /Ruta/.test(v.nombre))
  expect(visitasRuta.every(v => new Date(v.end) - new Date(v.start) === 15 * 60000)).toBe(true)

  // Panel: fichas de hoy a mano.
  await tarjeta.getByRole('button', { name: 'Enviar las fichas de hoy' }).click()
  await expect(tarjeta.getByRole('status')).toContainText('✅ Listo: 3 mensajes')

  // La conversacion, como se ve en Telegram.
  const vista = await browser.newPage({ viewport: { width: 460, height: 900 } })
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  await vista.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#cfe0c9;font:14px/1.4 system-ui,sans-serif;padding:14px}
    .yo{margin:6px 0 6px auto;max-width:75%;background:#e1fec6;border-radius:12px;padding:7px 10px;width:fit-content}
    .bot{margin:6px auto 6px 0;max-width:85%;background:#fff;border-radius:12px;padding:8px 10px;white-space:pre-wrap;box-shadow:0 1px 1px #0002}
    .quien{font-size:11px;color:#2a7;font-weight:700;margin-bottom:2px}
    .btns{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.btns span{flex:1 1 45%;background:#7fa6c74d;color:#245;border-radius:8px;padding:6px;text-align:center;font-size:12px;font-weight:600}
  </style>${conversacion.map(c => c.bot
    ? `<div class="bot"><div class="quien">Don Maxi bot → ${c.chat === String(ADMIN) ? 'Maxi' : 'Felipe'}${c.metodo === 'sendPhoto' ? ' · 📷 foto' : ''}</div>${esc(c.texto)}${c.botones.length ? `<div class="btns">${c.botones.map(x => `<span>${esc(x.text)}</span>`).join('')}</div>` : ''}</div>`
    : `<div class="yo"><div class="quien">${c.quien}</div>${esc(c.texto)}</div>`).join('')}`)
  await vista.screenshot({ path: path.join(evidence, '02-conversacion.png'), fullPage: true })

  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, cotNum: N, evidence }))
} finally { await browser.close() }

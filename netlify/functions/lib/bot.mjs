// El bot de Telegram de Don Maxi: menus y acciones para Maxi (admin) y el maestro.
//   · admin (TELEGRAM_CHAT_ID): hoy / mañana / semana, visitas, disponibilidad, materiales, por
//     cobrar, sin respuesta y buscar cliente; en cada instalacion: marcar instalada, registrar pago
//     y cambiar dia/hora (elige dia → hora → confirma, y mueve el evento del calendario).
//   · maestro (TELEGRAM_MAESTRO_CHAT_ID): las fichas del dia (direccion, repisas, servicios y saldo
//     a cobrar), fotos de la instalacion (quedan en Drive por venta y Maxi las publica en la web con
//     un boton) y "✅ Terminada".
//   · cualquier otro chat: el bot le dice su numero (para agregarlo) y avisa a Maxi.
// Sin estado guardado: lo que el bot necesita recordar viaja en los botones (callback_data, maximo
// 64 bytes) o en el texto del mensaje al que se responde (montos y busquedas).
// Sin Google: todo lo de afuera llega en deps (ver bot-servicios.mjs y scripts/local-dev/server.mjs).
import { createHash } from 'node:crypto'
import { MAESTRO, MARCA } from './marca.mjs'
import { linkWhatsapp } from './mensajes.mjs'
import { MEDIOS_PAGO, resumenPagos } from './pagos-resumen.mjs'
import { HORARIO_INSTALACIONES, aHHMM, aMinutos, ahoraEnZona, rangosDelDia, sumarDias } from './horarios.mjs'
import { disponibilidadAgenda, duracionInstalacionMin, duracionTexto, horasDelDia, ocupadosAgenda } from './agenda-horas.mjs'
import { avisoSinRespuesta, confirmacionCortaInstalacion, fichaCotizacion, lineasRepisas, serviciosDe } from './telegram.mjs'
import { diasDesde } from './seguimiento.mjs'
import { comunaDe } from './zonas.mjs'
import { linksRuta, planificarRuta } from './ruta-visitas.mjs'
import { textoMateriales, tituloDia, ventasPorInstalar } from '../../../src/admin/materiales.js'

export const pesos = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const lista = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean)
const primer = n => String(n || '').trim().split(/\s+/)[0] || ''
const hola = n => `¡Hola${primer(n) ? ' ' + primer(n) : ''}! 👋`
const normalizar = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const diaCorto = f => { const [y, m, d] = f.split('-').map(Number); return `${DIAS_CORTOS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}` }
const compacta = f => f.replaceAll('-', '')                               // 2026-10-31 → 20261031
const expandir = f => `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}`
const horaCompacta = h => h.replace(':', '')                              // 10:00 → 1000
const horaExpandir = h => `${h.slice(0, 2)}:${h.slice(2, 4)}`
const mapa = dir => `https://maps.google.com/?q=${encodeURIComponent(dir)}`
const waze = dir => `https://waze.com/ul?q=${encodeURIComponent(dir)}&navigate=yes`

export function rolesTelegram(env = process.env) {
  return { admins: lista(env.TELEGRAM_CHAT_ID), maestros: lista(env.TELEGRAM_MAESTRO_CHAT_ID) }
}

// Telegram manda este secreto en cada llamada al webhook (X-Telegram-Bot-Api-Secret-Token). Sale
// del token del bot: no hay que configurar otra variable, y quien no tiene el token no lo adivina.
export const secretoWebhook = token => createHash('sha256').update('donmaxi-webhook:' + token).digest('hex').slice(0, 48)

export const COMANDOS_ADMIN = [
  ['menu', 'Menú principal'], ['hoy', 'Instalaciones y visitas de hoy'], ['manana', 'Lo de mañana'], ['semana', 'Los próximos 7 días'],
  ['visitas', 'Visitas de la semana'], ['ruta', 'Ruta de las visitas de un día'], ['disponibilidad', 'Horas libres para instalar'], ['materiales', 'Materiales de la semana'],
  ['cobrar', 'Saldos por cobrar'], ['pendientes', 'Cotizaciones sin respuesta'], ['buscar', 'Buscar un cliente'],
]
export const COMANDOS_MAESTRO = [['hoy', 'Mis instalaciones de hoy'], ['manana', 'Las de mañana'], ['fotos', 'Cómo mandar fotos']]

// ---------- Botones ----------
const b = (text, callback_data) => ({ text, callback_data })
const u = (text, url) => ({ text, url })
const teclado = filas => ({ inline_keyboard: filas.filter(f => f?.length) })
const enFilas = (botones, n) => botones.reduce((filas, x, i) => (i % n ? filas.at(-1).push(x) : filas.push([x]), filas), [])
const MENU = [b('⬅️ Menú', 'm')]

// ---------- Datos ----------
const activa = q => q.status !== 'rechazada' && !q.instalacion?.cancelada
export const instalacionesDelDia = (quotes, fecha) => quotes
  .filter(q => activa(q) && q.instalacion?.fecha === fecha)
  .sort((a, b) => String(a.instalacion.inicio || '').localeCompare(String(b.instalacion.inicio || '')))
const visitasDe = eventos => eventos.filter(e => e.tipo === 'visita' && e.estado !== 'cancelada' && e.activa !== false)
  .sort((a, b) => (a.fecha + a.inicio).localeCompare(b.fecha + b.inicio))
const saldoDe = q => resumenPagos(q.total, q.pagos || []).saldo
const lugar = q => comunaDe(q.direccion) || q.direccion || ''
const horario = i => `${i.inicio || '¿?'}${i.fin ? '–' + i.fin : ''}`
const buscarQ = (quotes, cotNum) => quotes.find(q => String(q.cotNum) === String(cotNum))

export function buscarClientes(quotes, texto) {
  const t = normalizar(texto).trim()
  if (!t) return []
  const digitos = t.replace(/\D/g, '')
  const num = t.replace(/^n\s*[°º]?\s*/, '')
  return quotes.filter(q =>
    String(q.cotNum) === num ||
    (digitos.length >= 6 && String(q.telefono || '').replace(/\D/g, '').includes(digitos)) ||
    (t.length >= 2 && !/^\d+$/.test(t) && normalizar(q.nombre).includes(t)) ||
    (t.length >= 4 && !/^\d+$/.test(t) && normalizar(q.direccion).includes(t)),
  ).sort((a, b) => Number(b.cotNum) - Number(a.cotNum)).slice(0, 8)
}

// ---------- Mensajes al cliente (botones de WhatsApp) ----------
export function mensajeCobroSaldo(q, saldo, linkPago = '') {
  return `${hola(q.nombre)} ¡Gracias por confiar en Repisas Don Maxi! Su instalación quedó lista ✅\n\nEl saldo pendiente es de ${pesos(saldo)}. Puede transferir a:\n${MARCA.razonSocial} · RUT ${MARCA.rut}\n${MARCA.banco} · Cta. ${MARCA.tipoCuenta} ${MARCA.numeroCuenta}\n${MARCA.correo}${linkPago ? `\n\nO pagar con tarjeta aquí: ${linkPago}` : ''}\n\n¡Muchas gracias! 🙏`
}
export function mensajeResena(q) {
  return `${hola(q.nombre)} ¡Gracias por elegir Repisas Don Maxi! 😊 Si quedó contento con sus repisas, nos ayudaría muchísimo con una reseña en Google (toma 1 minuto): ${MARCA.googleResenas} ⭐🙏`
}

// Despues de instalar: cobrar el saldo, pedir la reseña y registrar el pago.
export function postInstalacion(q, { linkPago = '' } = {}) {
  const saldo = saldoDe(q)
  return {
    texto: [`✅ Instalada · N° ${q.cotNum} · ${q.nombre || ''}`, saldo > 0 ? `💵 Saldo por cobrar: ${pesos(saldo)}` : '💳 Está pagada completa 🙌', '', 'Mándale al cliente:'].join('\n'),
    filas: [
      ...(q.telefono && saldo > 0 ? [[u(`💬 Cobrar saldo ${pesos(saldo)}`, linkWhatsapp(q.telefono, mensajeCobroSaldo(q, saldo, linkPago)))]] : []),
      ...(q.telefono ? [[u('⭐ Pedir reseña en Google', linkWhatsapp(q.telefono, mensajeResena(q)))]] : []),
      ...(saldo > 0 ? [[b('💳 Registrar pago', `p|${q.cotNum}`)]] : []),
    ],
  }
}

// ---------- Vistas del admin ----------
export function vistaDia(fecha, { quotes, eventos, hoy }) {
  const inst = instalacionesDelDia(quotes, fecha)
  const visitas = visitasDe(eventos).filter(v => v.fecha === fecha)
  const titulo = fecha === hoy ? `Hoy, ${tituloDia(fecha).toLowerCase()}` : fecha === sumarDias(hoy, 1) ? `Mañana, ${tituloDia(fecha).toLowerCase()}` : tituloDia(fecha)
  const lineas = [`📅 ${titulo}`, '']
  lineas.push(inst.length ? `🔧 Instalaciones (${inst.length}):` : '🔧 Sin instalaciones.')
  for (const q of inst) {
    const saldo = saldoDe(q)
    lineas.push(`${q.instalacion.instalada ? '✅' : '•'} ${horario(q.instalacion)} · ${q.nombre} · N° ${q.cotNum}${lugar(q) ? ` · ${lugar(q)}` : ''}${saldo > 0 ? ` · saldo ${pesos(saldo)}` : ''}`)
  }
  lineas.push('', visitas.length ? `📏 Visitas (${visitas.length}):` : '📏 Sin visitas.')
  for (const v of visitas) lineas.push(`• ${v.horario || v.inicio} · ${v.cliente}${v.ubicacion ? ` · ${comunaDe(v.ubicacion) || v.ubicacion}` : ''}${v.telefono ? ` · ${v.telefono}` : ''}`)
  const otro = fecha === hoy ? b('Mañana ➡️', 'd|1') : b('⬅️ Hoy', 'd|0')
  return { texto: lineas.join('\n'), filas: [...inst.map(q => [b(`🔧 ${q.instalacion.inicio || ''} ${primer(q.nombre)} · N° ${q.cotNum}`, `v|${q.cotNum}`)]), [otro, ...MENU]] }
}

export function vistaSemana({ quotes, eventos, hoy }) {
  const lineas = ['🗓 Próximos 7 días', '']
  const botones = []
  for (let i = 0; i < 7; i++) {
    const fecha = sumarDias(hoy, i)
    const inst = instalacionesDelDia(quotes, fecha)
    const visitas = visitasDe(eventos).filter(v => v.fecha === fecha)
    if (!inst.length && !visitas.length) continue
    lineas.push(`${tituloDia(fecha)}`)
    for (const q of inst) {
      lineas.push(`  🔧 ${horario(q.instalacion)} · ${q.nombre} · N° ${q.cotNum}${lugar(q) ? ` · ${lugar(q)}` : ''}`)
      botones.push(b(`${diaCorto(fecha)} · ${primer(q.nombre)}`, `v|${q.cotNum}`))
    }
    if (visitas.length) lineas.push(`  📏 ${visitas.length} ${visitas.length === 1 ? 'visita' : 'visitas'}: ${visitas.map(v => `${v.horario || v.inicio} ${primer(v.cliente)}${comunaDe(v.ubicacion) ? ` (${comunaDe(v.ubicacion)})` : ''}`).join(', ')}`)
    lineas.push('')
  }
  if (lineas.length === 2) lineas.push('Nada agendado esta semana.')
  return { texto: lineas.join('\n').trim(), filas: [...enFilas(botones.slice(0, 12), 2), MENU] }
}

export function vistaVisitas({ eventos, hoy }) {
  const visitas = visitasDe(eventos).filter(v => v.fecha >= hoy && v.fecha <= sumarDias(hoy, 7))
  if (!visitas.length) return { texto: '📏 No hay visitas agendadas en los próximos 7 días.', filas: [MENU] }
  const lineas = [`📏 Visitas de los próximos 7 días (${visitas.length})`]
  let dia = ''
  for (const v of visitas) {
    if (v.fecha !== dia) { dia = v.fecha; lineas.push('', tituloDia(dia)) }
    lineas.push(`• ${v.horario || v.inicio} · ${v.cliente}${v.ubicacion ? ` · ${v.ubicacion}` : ''}${v.telefono ? ` · ${v.telefono}` : ''}`)
  }
  return { texto: lineas.join('\n'), filas: [MENU] }
}

export function vistaFicha(q, { hoy } = {}) {
  const i = q.instalacion || {}
  const saldo = saldoDe(q)
  const estado = i.instalada ? '✅ Instalada' : i.fecha ? (i.fecha < hoy ? '⚠️ Ya pasó la fecha y no está marcada como instalada' : '📅 Por instalar') : q.status === 'por confirmar' ? '⏳ Por confirmar' : `Estado: ${q.status}`
  return {
    texto: `${fichaCotizacion(q)}\n${estado}${i.nota ? `\n📝 ${i.nota}` : ''}`,
    filas: [
      [...(i.fecha && !i.instalada ? [b('✅ Marcar instalada', `i|${q.cotNum}`)] : []), ...(saldo > 0 ? [b('💳 Registrar pago', `p|${q.cotNum}`)] : [])],
      ...(activa(q) && q.status !== 'por confirmar' && !i.instalada ? [[b(i.fecha ? '🔁 Cambiar día u hora' : '📅 Agendar instalación', `r|${q.cotNum}`)]] : []),
      [...(q.telefono ? [u('💬 WhatsApp', linkWhatsapp(q.telefono, `${hola(q.nombre)} Le escribo de Repisas Don Maxi.`))] : []), ...(q.direccion ? [u('📍 Maps', mapa(q.direccion))] : [])],
      ...(q.pdfUrl ? [[u('📄 Cotización (PDF)', q.pdfUrl)]] : []),
      MENU,
    ],
  }
}

export function vistaPorCobrar({ quotes, hoy }) {
  const con = quotes.filter(q => activa(q) && q.status === 'confirmada' && Number(q.total) > 0 && saldoDe(q) > 0)
  const hechas = con.filter(q => q.instalacion?.instalada || (q.instalacion?.fecha && q.instalacion.fecha < hoy))
    .sort((a, b) => String(a.instalacion?.fecha || '').localeCompare(String(b.instalacion?.fecha || '')))
  const porHacer = con.filter(q => !hechas.includes(q)).sort((a, b) => String(a.instalacion?.fecha || '9').localeCompare(String(b.instalacion?.fecha || '9')))
  const suma = l => pesos(l.reduce((s, q) => s + saldoDe(q), 0))
  const linea = q => `• ${q.nombre} · N° ${q.cotNum} · ${pesos(saldoDe(q))}${q.instalacion?.fecha ? ` · ${diaCorto(q.instalacion.fecha)}` : ''}`
  const lineas = ['💰 Por cobrar', '',
    `Ya instaladas (${hechas.length}) · ${suma(hechas)}`, ...(hechas.length ? hechas.map(linea) : ['• Nada pendiente 🙌']), '',
    `Por instalar (${porHacer.length}) · ${suma(porHacer)}`, ...porHacer.slice(0, 15).map(linea),
    ...(porHacer.length > 15 ? [`… y ${porHacer.length - 15} más`] : [])]
  return { texto: lineas.join('\n'), filas: [...enFilas(hechas.slice(0, 10).map(q => b(`💳 ${primer(q.nombre)} ${pesos(saldoDe(q))}`, `v|${q.cotNum}`)), 2), MENU] }
}

export function vistaSinRespuesta({ quotes, hoy }) {
  const pendientes = quotes.filter(q => q.status === 'por confirmar')
    .map(q => ({ cotNum: q.cotNum, nombre: q.nombre, telefono: q.telefono, total: q.total, dias: diasDesde(q.creadoMs, hoy) }))
    .filter(c => c.dias != null && c.dias >= 2 && c.dias <= 45).sort((a, b) => a.dias - b.dias).slice(0, 12)
  if (!pendientes.length) return { texto: '⏰ No hay cotizaciones esperando respuesta (de 2 a 45 días). 🙌', filas: [MENU] }
  const aviso = avisoSinRespuesta(pendientes)
  return { texto: aviso.texto, filas: [...aviso.botones.map(x => [u(x.texto, x.url)]), MENU] }
}

export function vistaDisponibilidad({ ocupados, ahora, horarioInst }) {
  const lineas = ['🕐 Horas libres para instalar', '']
  for (const [min, nombre] of [[120, 'Trabajos de 2 h'], [180, 'Trabajos de 3 h'], [240, 'Trabajos de 4 h']]) {
    const dias = disponibilidadAgenda(ocupados, min, ahora, horarioInst).slice(0, 6)
    lineas.push(`${nombre}:`, ...(dias.length ? dias.map(d => `• ${diaCorto(d.fecha)}: ${d.horas.map(h => h.inicio).join(', ')}`) : ['• Sin horas en las próximas semanas']), '')
  }
  return { texto: lineas.join('\n').trim(), filas: [MENU] }
}

export function menuAdmin() {
  return {
    texto: '👋 Hola Maxi, ¿qué necesitas?',
    filas: [
      [b('📅 Hoy', 'd|0'), b('📅 Mañana', 'd|1'), b('🗓 Semana', 's')],
      [b('📏 Visitas', 'vi'), b('🗺 Ruta de visitas', 'ru')],
      [b('🕐 Disponibilidad', 'h')],
      [b('💰 Por cobrar', 'c'), b('⏰ Sin respuesta', 'n')],
      [b('🪵 Materiales', 'mt'), b('🔎 Buscar cliente', 'q')],
      [b('👷 Vista del maestro (hoy)', 'mh|0')],
    ],
  }
}

// ---------- Maestro ----------
export function menuMaestro() {
  return {
    texto: `👋 Hola ${primer(MAESTRO.nombre)}, ¿qué necesitas?`,
    filas: [[b('📋 Hoy', 'mh|0'), b('📋 Mañana', 'mh|1')], [b('📸 ¿Cómo mando fotos?', 'mf')]],
  }
}
export const AYUDA_FOTOS = '📸 Fotos de la instalación\n\nMándame las fotos aquí mismo (como foto, no como archivo). Si hoy hay una sola instalación, quedan guardadas en esa venta. Si hay más de una, te pregunto de cuál es cada foto, o escribe el N° de la cotización en el texto de la foto.\n\nQuedan en el Drive de Don Maxi y Maxi elige cuáles van a la web. Ojo: que no salgan caras ni la patente de autos 🙏'

// La ficha del maestro: donde, que lleva, que cobrar. Sin el detalle de precios.
export function fichaMaestro(q) {
  const i = q.instalacion || {}
  const saldo = saldoDe(q)
  const repisas = lineasRepisas(q.repisas)
  const servicios = serviciosDe(q.adicionales)
  return {
    texto: [
      `🔧 ${horario(i)} hrs · N° ${q.cotNum}${i.instalada ? ' · ✅ terminada' : ''}`,
      `👤 ${q.nombre || 'Sin nombre'}${q.telefono ? ` · ${q.telefono}` : ''}`,
      ...(q.direccion ? [`📍 ${q.direccion}`] : []),
      ...(repisas.length ? ['🪵 Repisas:', ...repisas.map(l => `   • ${l}`)] : []),
      `➕ Servicios: ${servicios.length ? servicios.join(', ') : 'ninguno'}`,
      Number(q.total) > 0 ? (saldo > 0 ? `💵 Cobrar al terminar: ${pesos(saldo)}` : '💳 Ya está pagada') : '',
      ...(i.nota ? [`📝 ${i.nota}`] : []),
    ].filter(Boolean).join('\n'),
    filas: [
      [...(q.direccion ? [u('📍 Maps', mapa(q.direccion)), u('🚗 Waze', waze(q.direccion))] : [])],
      ...(q.telefono ? [[u('💬 Avisar que voy en camino', linkWhatsapp(q.telefono, `${hola(q.nombre)} Soy ${primer(MAESTRO.nombre)}, de Repisas Don Maxi. Voy en camino a su instalación 🚗`))]] : []),
      ...(i.instalada ? [] : [[b('✅ Terminada', `t|${q.cotNum}`)]]),
    ],
  }
}

// Las fichas de un dia para el maestro: saludo con el resumen y los materiales, y una por instalacion.
export function fichasDelDia(quotes, fecha, hoy) {
  const inst = instalacionesDelDia(quotes, fecha)
  const cuando = fecha === hoy ? 'Hoy' : fecha === sumarDias(hoy, 1) ? 'Mañana' : tituloDia(fecha)
  if (!inst.length) return [{ texto: `🙌 ${cuando} (${tituloDia(fecha).toLowerCase()}) no hay instalaciones agendadas.`, filas: [] }]
  // Del texto de materiales, solo el total (lo que viene despues de "🧮 Total").
  const materiales = (textoMateriales(ventasPorInstalar(inst.map(q => ({ ...q, instalacion: { ...q.instalacion, instalada: false } })), fecha, fecha))
    .replace(/\*/g, '').split(/🧮[^\n]*\n/)[1] || '').split('\n').filter(Boolean)
  const saludo = [
    `${fecha === hoy ? '☀️ Buenos días' : '👋 Hola'} ${primer(MAESTRO.nombre)}. ${cuando}, ${tituloDia(fecha).toLowerCase()}: ${inst.length} ${inst.length === 1 ? 'instalación' : 'instalaciones'}.`,
    ...inst.map(q => `• ${horario(q.instalacion)} · ${q.nombre}${lugar(q) ? ` · ${lugar(q)}` : ''}`),
    ...(materiales.length ? ['', '🪵 Materiales:', ...materiales] : []),
    '', '📸 Al terminar cada una, mándame fotos y aprieta ✅ Terminada.',
  ].join('\n')
  return [{ texto: saludo, filas: [] }, ...inst.map(fichaMaestro)]
}

// ---------- Reagendar ----------
function duracionDe(q) {
  const i = q.instalacion || {}
  if (i.inicio && i.fin && aMinutos(i.fin) > aMinutos(i.inicio)) return aMinutos(i.fin) - aMinutos(i.inicio)
  return duracionInstalacionMin(q, q.adicionales || {})
}

// ---------- El webhook ----------
// update: lo que manda Telegram. deps: { tg(metodo, cuerpo), roles, ahora?, listar(), leerEventos(desde, hasta),
//   leerHorario(), actualizarFila(cotNum, cambios), registrarPago(datos), bajarArchivo(fileId),
//   guardarFoto({ cotizacion, datos, tipo, nombre }), leerFoto(id), publicarFoto({ datos, tipo, titulo }),
//   linkPago(cotNum) }
export async function atenderUpdate(update, deps) {
  const cb = update.callback_query
  const msg = cb?.message || update.message
  if (!msg?.chat) return
  const chatId = String(msg.chat.id)
  const rol = deps.roles.admins.includes(chatId) ? 'admin' : deps.roles.maestros.includes(chatId) ? 'maestro' : null
  const ctx = { chatId, rol, cb, msg, deps, toast: '' }
  try {
    if (!rol) return await desconocido(ctx, update.message)
    if (cb) return await alBoton(ctx, String(cb.data || ''))
    return await alMensaje(ctx, update.message)
  } catch (e) {
    console.error('bot:', e)
    ctx.toast = '⚠️ No se pudo'
    await enviar(ctx, `⚠️ No pude hacerlo: ${e?.message || e}`).catch(() => {})
  } finally {
    if (cb) await deps.tg('answerCallbackQuery', { callback_query_id: cb.id, ...(ctx.toast ? { text: ctx.toast } : {}) }).catch(() => {})
  }
}

const datosHoy = deps => {
  const ahora = new Date(deps.ahora ?? Date.now())
  return { ahora, hoy: ahoraEnZona(ahora).fecha }
}

function enviar(ctx, texto, filas = [], extra = {}) {
  return ctx.deps.tg('sendMessage', { chat_id: ctx.chatId, text: String(texto).slice(0, 4000), disable_web_page_preview: true, ...(filas.length ? { reply_markup: teclado(filas) } : {}), ...extra })
}
// Al apretar un boton, la respuesta reemplaza el mensaje (navegar sin llenar el chat).
async function mostrar(ctx, { texto, filas = [] }) {
  if (ctx.cb && ctx.cb.message?.text) {
    try {
      return await ctx.deps.tg('editMessageText', { chat_id: ctx.chatId, message_id: ctx.cb.message.message_id, text: String(texto).slice(0, 4000), disable_web_page_preview: true, reply_markup: teclado(filas) })
    } catch (e) { if (/not modified/i.test(e.message)) return } // mismo contenido: nada que hacer
  }
  return enviar(ctx, texto, filas)
}
const avisarAdmins = (ctx, texto, filas = []) => Promise.all(ctx.deps.roles.admins.map(chat_id =>
  ctx.deps.tg('sendMessage', { chat_id, text: texto, disable_web_page_preview: true, ...(filas.length ? { reply_markup: teclado(filas) } : {}) }).catch(e => console.warn('bot: aviso a admin', e.message))))
const avisarMaestros = (ctx, texto) => Promise.all(ctx.deps.roles.maestros.map(chat_id =>
  ctx.deps.tg('sendMessage', { chat_id, text: texto, disable_web_page_preview: true }).catch(e => console.warn('bot: aviso a maestro', e.message))))

async function desconocido(ctx, mensaje) {
  if (!mensaje) return
  await enviar(ctx, `Hola 👋 Este es el bot privado de Repisas Don Maxi.\n\nTu número de chat es ${ctx.chatId}. Pásaselo a Maxi para que te dé acceso.`)
  if (/^\/start/.test(mensaje.text || '')) {
    const nombre = [mensaje.from?.first_name, mensaje.from?.last_name].filter(Boolean).join(' ') || mensaje.chat.title || 'Alguien'
    await avisarAdmins(ctx, `👋 ${nombre} le escribió al bot (chat ${ctx.chatId}).\n\nSi es el maestro, agrega ${ctx.chatId} en Netlify como TELEGRAM_MAESTRO_CHAT_ID y vuelve a publicar el sitio. Si es otro admin, súmalo a TELEGRAM_CHAT_ID separado por coma.`)
  }
}

async function cotizaciones(ctx) { return ctx.deps.listar() }
async function eventosDesde(ctx, hoy, dias) { return ctx.deps.leerEventos(hoy, sumarDias(hoy, dias)) }

async function alMensaje(ctx, m) {
  const texto = String(m.text || m.caption || '').trim()
  const foto = m.photo?.at(-1) || (/^image\//.test(m.document?.mime_type || '') ? m.document : null)
  if (foto) return fotoRecibida(ctx, m, foto)
  const comando = texto.match(/^\/(\w+)/)?.[1]?.toLowerCase()

  if (ctx.rol === 'maestro') {
    if (comando === 'hoy' || comando === 'manana') return mandarFichas(ctx, comando === 'hoy' ? 0 : 1)
    if (comando === 'fotos') return enviar(ctx, AYUDA_FOTOS)
    const menu = menuMaestro()
    return enviar(ctx, comando ? menu.texto : `${menu.texto}\n\n(Para guardar fotos, mándalas como foto.)`, menu.filas)
  }

  // Respuesta a una pregunta del bot (monto de un pago o busqueda).
  const pregunta = m.reply_to_message?.text || ''
  const pagoDe = pregunta.match(/^💳 Monto del pago · N° (\d+)/)
  if (pagoDe) {
    const monto = Number(texto.replace(/\D/g, ''))
    if (!monto) return enviar(ctx, 'Escribe solo el monto, por ejemplo 150000.')
    return elegirMedio(ctx, pagoDe[1], monto)
  }
  if (/^🔎 Buscar cliente/.test(pregunta)) return buscar(ctx, texto)

  switch (comando) {
    case 'start': case 'menu': return mostrar(ctx, menuAdmin())
    case 'hoy': return alBoton(ctx, 'd|0')
    case 'manana': return alBoton(ctx, 'd|1')
    case 'semana': return alBoton(ctx, 's')
    case 'visitas': return alBoton(ctx, 'vi')
    case 'ruta': return alBoton(ctx, 'ru')
    case 'disponibilidad': return alBoton(ctx, 'h')
    case 'materiales': return alBoton(ctx, 'mt')
    case 'cobrar': return alBoton(ctx, 'c')
    case 'pendientes': return alBoton(ctx, 'n')
    case 'buscar': return alBoton(ctx, 'q')
  }
  if (comando) return mostrar(ctx, menuAdmin())
  // Texto suelto: buscar cliente (nombre, N° o telefono).
  return buscar(ctx, texto)
}

async function buscar(ctx, texto) {
  const encontrados = buscarClientes(await cotizaciones(ctx), texto)
  if (!encontrados.length) return enviar(ctx, `🔎 No encontré "${texto.slice(0, 40)}". Prueba con el nombre, el N° de cotización o el teléfono.`, [MENU])
  if (encontrados.length === 1) return mostrar(ctx, vistaFicha(encontrados[0], datosHoy(ctx.deps)))
  return enviar(ctx, `🔎 Encontré ${encontrados.length}:`, [...encontrados.map(q => [b(`N° ${q.cotNum} · ${q.nombre} · ${q.instalacion?.instalada ? 'instalada' : q.status}`.slice(0, 60), `v|${q.cotNum}`)]), MENU])
}

async function mandarFichas(ctx, enDias) {
  const { hoy } = datosHoy(ctx.deps)
  for (const f of fichasDelDia(await cotizaciones(ctx), sumarDias(hoy, enDias), hoy)) await enviar(ctx, f.texto, f.filas)
}

async function alBoton(ctx, data) {
  const [accion, ...args] = data.split('|')
  const { deps } = ctx
  const { ahora, hoy } = datosHoy(deps)
  const maestroPuede = ['mh', 'mf', 't', 'f']
  if (ctx.rol !== 'admin' && !maestroPuede.includes(accion)) { ctx.toast = 'Solo Maxi puede hacer esto'; return }

  switch (accion) {
    case 'm': return mostrar(ctx, menuAdmin())
    case 'd': {
      const fecha = sumarDias(hoy, Number(args[0]) || 0)
      const [quotes, eventos] = await Promise.all([cotizaciones(ctx), deps.leerEventos(fecha, fecha)])
      return mostrar(ctx, vistaDia(fecha, { quotes, eventos, hoy }))
    }
    case 's': {
      const [quotes, eventos] = await Promise.all([cotizaciones(ctx), eventosDesde(ctx, hoy, 6)])
      return mostrar(ctx, vistaSemana({ quotes, eventos, hoy }))
    }
    case 'vi': return mostrar(ctx, vistaVisitas({ eventos: await eventosDesde(ctx, hoy, 7), hoy }))

    // Ruta de visitas: elegir dia → orden y horas → fijarlas en el calendario.
    case 'ru': {
      const visitas = visitasDe(await eventosDesde(ctx, hoy, 14))
      const dias = [...new Set(visitas.map(v => v.fecha))].sort()
      if (!dias.length) return mostrar(ctx, { texto: '🗺 No hay visitas agendadas en las próximas 2 semanas.', filas: [MENU] })
      const cuantas = f => visitas.filter(v => v.fecha === f).length
      return mostrar(ctx, { texto: '🗺 ¿La ruta de qué día?', filas: [...enFilas(dias.map(f => b(`${diaCorto(f)} · ${cuantas(f)}`, `rv|${compacta(f)}`)), 3), MENU] })
    }
    case 'rv': case 'rf': {
      const fecha = expandir(args[0])
      const ruta = await rutaDelDia(ctx, fecha)
      if (accion === 'rf') {
        for (const p of ruta.paradas) await deps.fijarHoraVisita({ visitId: p.id, fecha, hora: p.llegada })
        ruta.paradas.forEach(p => { p.horaFija = p.llegada })
        ctx.toast = '📌 Horas fijadas en el calendario'
      }
      return mostrar(ctx, vistaRuta(fecha, ruta))
    }
    case 'c': return mostrar(ctx, vistaPorCobrar({ quotes: await cotizaciones(ctx), hoy }))
    case 'n': return mostrar(ctx, vistaSinRespuesta({ quotes: await cotizaciones(ctx), hoy }))
    case 'mt': {
      const ventas = ventasPorInstalar(await cotizaciones(ctx), hoy, sumarDias(hoy, 7))
      return mostrar(ctx, { texto: textoMateriales(ventas).replace(/\*/g, ''), filas: [MENU] })
    }
    case 'h': {
      const horarioInst = deps.leerHorario ? await deps.leerHorario() : HORARIO_INSTALACIONES
      const [quotes, eventos] = await Promise.all([cotizaciones(ctx), eventosDesde(ctx, hoy, (horarioInst.semanas || 4) * 7)])
      return mostrar(ctx, vistaDisponibilidad({ ocupados: ocupadosAgenda({ eventos, cotizaciones: quotes }), ahora, horarioInst }))
    }
    case 'q': return enviar(ctx, '🔎 Buscar cliente: escribe el nombre, el N° de cotización o el teléfono.', [], { reply_markup: { force_reply: true, input_field_placeholder: 'Nombre, N° o teléfono' } })
    case 'v': {
      const q = buscarQ(await cotizaciones(ctx), args[0])
      if (!q) return enviar(ctx, `No encontré la cotización N° ${args[0]}.`)
      return mostrar(ctx, vistaFicha(q, { hoy }))
    }

    // Marcar instalada (admin) o terminada (maestro).
    case 'i': case 't': {
      const { cotizacion: q } = await deps.actualizarFila(args[0], { instalada: true })
      const post = postInstalacion(q, { linkPago: deps.linkPago?.(q.cotNum) || '' })
      if (accion === 't' && ctx.rol === 'maestro') {
        ctx.toast = '✅ ¡Gracias!'
        await mostrar(ctx, { ...fichaMaestro(q), texto: `${fichaMaestro(q).texto}\n\n✅ ¡Gracias! Quedó terminada. No olvides mandar las fotos 📸` })
        return avisarAdmins(ctx, `🎉 ${primer(MAESTRO.nombre)} terminó la instalación\n\n${post.texto}`, post.filas)
      }
      ctx.toast = '✅ Marcada instalada'
      return mostrar(ctx, post)
    }

    // Pagos: cuanto → medio → registrado.
    case 'p': {
      const q = buscarQ(await cotizaciones(ctx), args[0])
      const saldo = q ? saldoDe(q) : 0
      if (!q || saldo <= 0) { ctx.toast = 'No tiene saldo pendiente'; return }
      const sinPagos = !(q.pagos || []).length
      return mostrar(ctx, {
        texto: `💳 Pago de N° ${q.cotNum} · ${q.nombre}\nTotal ${pesos(q.total)} · saldo ${pesos(saldo)}\n\n¿Cuánto pagó?`,
        filas: [[b(`Todo el saldo ${pesos(saldo)}`, `pm|${q.cotNum}|${saldo}`)], ...(sinPagos && saldo >= 2000 ? [[b(`Abono 50% ${pesos(Math.round(saldo / 2))}`, `pm|${q.cotNum}|${Math.round(saldo / 2)}`)]] : []),
          [b('✏️ Otro monto', `po|${q.cotNum}`)], [b('⬅️ Volver', `v|${q.cotNum}`)]],
      })
    }
    case 'po': return enviar(ctx, `💳 Monto del pago · N° ${args[0]}\nEscribe solo el número (por ejemplo 150000):`, [], { reply_markup: { force_reply: true, input_field_placeholder: 'Monto en pesos' } })
    case 'pm': return elegirMedio(ctx, args[0], Number(args[1]))
    case 'pg': {
      const monto = Number(args[1]), medio = MEDIOS_PAGO[Number(args[2])]
      const { resumen } = await deps.registrarPago({ cotNum: args[0], monto, medio, fecha: hoy, nota: 'Registrado desde Telegram' })
      ctx.toast = '💳 Pago registrado'
      return mostrar(ctx, { texto: `✅ Pago registrado · N° ${args[0]}\n${pesos(monto)} por ${medio}\n${resumen.saldo > 0 ? `Saldo pendiente: ${pesos(resumen.saldo)}` : 'Quedó pagada completa 🙌'}`, filas: [[b('📋 Ver ficha', `v|${args[0]}`)], MENU] })
    }

    // Reagendar: dia → hora → confirmar.
    case 'r': {
      const quotes = await cotizaciones(ctx)
      const q = buscarQ(quotes, args[0])
      if (!q) return enviar(ctx, `No encontré la cotización N° ${args[0]}.`)
      const horarioInst = deps.leerHorario ? await deps.leerHorario() : HORARIO_INSTALACIONES
      const eventos = await eventosDesde(ctx, hoy, (horarioInst.semanas || 4) * 7)
      const ocupados = ocupadosAgenda({ eventos, cotizaciones: quotes, excepto: { cotNum: q.cotNum, eventId: q.instalacion?.eventId } })
      const min = duracionDe(q)
      const dias = disponibilidadAgenda(ocupados, min, ahora, horarioInst).slice(0, 15)
      const actual = q.instalacion?.fecha ? `Ahora: ${tituloDia(q.instalacion.fecha)}, ${horario(q.instalacion)}\n` : ''
      return mostrar(ctx, {
        texto: `🔁 N° ${q.cotNum} · ${q.nombre}\n${actual}Dura ${duracionTexto(min)}. Elige el día:${dias.length ? '' : '\n\nNo hay días libres en el horario de instalaciones.'}`,
        filas: [...enFilas(dias.map(d => b(diaCorto(d.fecha), `rd|${q.cotNum}|${compacta(d.fecha)}`)), 3), [b('⬅️ Volver', `v|${q.cotNum}`)]],
      })
    }
    case 'rd': {
      const quotes = await cotizaciones(ctx)
      const q = buscarQ(quotes, args[0])
      const fecha = expandir(args[1])
      const horarioInst = deps.leerHorario ? await deps.leerHorario() : HORARIO_INSTALACIONES
      const ocupados = ocupadosAgenda({ eventos: await deps.leerEventos(fecha, fecha), cotizaciones: quotes, excepto: { cotNum: q.cotNum, eventId: q.instalacion?.eventId } })
      const min = duracionDe(q)
      const horas = horasDelDia(ocupados[fecha] || [], min, rangosDelDia(horarioInst, fecha))
      return mostrar(ctx, {
        texto: `🔁 N° ${q.cotNum} · ${q.nombre}\n${tituloDia(fecha)} · dura ${duracionTexto(min)}. ¿A qué hora?`,
        filas: [...enFilas(horas.map(h => b(`${h.inicio}–${h.fin}`, `rh|${q.cotNum}|${args[1]}|${horaCompacta(h.inicio)}`)), 2), [b('⬅️ Otro día', `r|${q.cotNum}`)]],
      })
    }
    case 'rh': {
      const q = buscarQ(await cotizaciones(ctx), args[0])
      const fecha = expandir(args[1]), inicio = horaExpandir(args[2]), fin = aHHMM(aMinutos(inicio) + duracionDe(q))
      return mostrar(ctx, {
        texto: `🔁 ¿Mover la instalación de ${q.nombre} (N° ${q.cotNum})?\n\n${q.instalacion?.fecha ? `Antes: ${tituloDia(q.instalacion.fecha)}, ${horario(q.instalacion)}\n` : ''}Ahora: ${tituloDia(fecha)}, ${inicio}–${fin}\n\nSe mueve también el evento del calendario.`,
        filas: [[b('✅ Sí, mover', `rc|${q.cotNum}|${args[1]}|${args[2]}`), b('❌ No', `v|${q.cotNum}`)]],
      })
    }
    case 'rc': {
      const q0 = buscarQ(await cotizaciones(ctx), args[0])
      const fecha = expandir(args[1]), inicio = horaExpandir(args[2]), fin = aHHMM(aMinutos(inicio) + duracionDe(q0))
      const { cotizacion: q } = await deps.actualizarFila(args[0], { fecha, inicio, fin })
      ctx.toast = '🔁 Reagendada'
      if (q0.instalacion?.fecha) await avisarMaestros(ctx, `🔁 Cambio de agenda: ${q.nombre} (N° ${q.cotNum}) pasó a ${tituloDia(fecha).toLowerCase()}, ${inicio}–${fin}.`)
      return mostrar(ctx, {
        texto: `✅ Listo: ${q.nombre} (N° ${q.cotNum}) quedó para el ${tituloDia(fecha).toLowerCase()}, ${inicio}–${fin}.\nEl calendario ya está al día.`,
        filas: [...(q.telefono ? [[u('💬 Avisarle al cliente', linkWhatsapp(q.telefono, confirmacionCortaInstalacion(q, { fecha, inicio, fin })))]] : []), [b('📋 Ver ficha', `v|${q.cotNum}`)], MENU],
      })
    }

    // Maestro.
    case 'mh': return mandarFichas(ctx, Number(args[0]) || 0)
    case 'mf': return enviar(ctx, AYUDA_FOTOS)
    case 'f': {
      const original = ctx.cb.message?.reply_to_message
      const foto = original?.photo?.at(-1) || original?.document
      if (!foto) { ctx.toast = 'No encontré la foto: mándala de nuevo'; return }
      const q = buscarQ(await cotizaciones(ctx), args[0])
      await guardarFoto(ctx, q, original, foto)
      return deps.tg('editMessageText', { chat_id: ctx.chatId, message_id: ctx.cb.message.message_id, text: `📸 Guardada en N° ${q.cotNum} · ${q.nombre}` }).catch(() => {})
    }

    // Publicar en la web una foto de instalacion (admin).
    case 'w': {
      const foto = await deps.leerFoto(args[0])
      if (!foto) { ctx.toast = 'No encontré la foto en Drive'; return }
      await deps.publicarFoto(foto)
      ctx.toast = '🌐 Publicada en la galería'
      return deps.tg('editMessageReplyMarkup', { chat_id: ctx.chatId, message_id: ctx.cb.message.message_id, reply_markup: teclado([[u('✅ Publicada · ver galería', `${MARCA.sitio}/fotos`)]]) }).catch(() => {})
    }
  }
  ctx.toast = 'Botón antiguo: abre el menú de nuevo'
}

// Las visitas del dia con coordenadas: las que no tienen se buscan (si hay clave de Google) y se guardan.
async function rutaDelDia(ctx, fecha) {
  const { deps } = ctx
  const visitas = visitasDe(await deps.leerEventos(fecha, fecha)).filter(v => v.fecha === fecha && v.rango)
  for (const v of visitas) {
    if (v.lat != null || !v.ubicacion || !deps.geocodificar) continue
    const punto = await deps.geocodificar(v.ubicacion).catch(() => null)
    if (punto) { Object.assign(v, punto); await deps.guardarCoordenadas?.(v.id, punto).catch(() => {}) }
  }
  return planificarRuta(visitas)
}

export function mensajeHoraVisita(v, fecha) {
  return `${hola(v.cliente)} Le escribo de Repisas Don Maxi por su visita de medición del ${tituloDia(fecha).toLowerCase()}. Según la ruta del día llegaríamos aprox. a las ${v.llegada} hrs (puede variar unos minutos). ¿Le acomoda? 🙏`
}

export function vistaRuta(fecha, { paradas, minutosManejo, sinCoordenadas }) {
  const lineas = [`🗺 Ruta del ${tituloDia(fecha).toLowerCase()} · ${paradas.length} ${paradas.length === 1 ? 'visita' : 'visitas'}`, `🚗 ~${duracionTexto(Math.max(5, minutosManejo)) || '0 min'} de manejo · parte en la primera visita`]
  let rango = ''
  paradas.forEach((p, i) => {
    if (p.rango.desde !== rango) { rango = p.rango.desde; lineas.push('', `${p.rango.desde.slice(0, 2)}–${p.rango.hasta.slice(0, 2)} hrs`) }
    lineas.push(`${i + 1}. ${p.llegada} · ${p.cliente}${comunaDe(p.ubicacion) ? ` · ${comunaDe(p.ubicacion)}` : ''}${p.trasladoMin ? ` (🚗 ${p.trasladoMin} min)` : ''}${p.fueraDeRango ? ' ⚠️' : ''}`)
    if (p.ubicacion) lineas.push(`   📍 ${p.ubicacion}`)
  })
  const fuera = paradas.filter(p => p.fueraDeRango)
  if (fuera.length) lineas.push('', `⚠️ No alcanzan a caber en su rango: ${fuera.map(p => primer(p.cliente)).join(', ')}. Muévelas de rango en Admin → Visitas o avísales.`)
  if (sinCoordenadas) lineas.push('', `ℹ️ ${sinCoordenadas} sin ubicación exacta: se ordenaron por comuna.`)
  const fijadas = paradas.length && paradas.every(p => p.horaFija === p.llegada)
  lineas.push('', fijadas ? '📌 Estas horas ya están en el calendario.' : '📌 Cuando la tengas lista, fija las horas en el calendario y avísale a cada cliente con su botón.')
  return {
    texto: lineas.join('\n'),
    filas: [
      ...linksRuta(paradas).map(l => [u(`🧭 Abrir en Google Maps${paradas.length > 10 ? ` (${l.desde}–${l.hasta})` : ''}`, l.url)]),
      ...enFilas(paradas.filter(p => p.telefono).map(p => u(`💬 ${p.llegada} ${primer(p.cliente)}`, linkWhatsapp(p.telefono, mensajeHoraVisita(p, fecha)))), 2),
      ...(fijadas ? [] : [[b('📌 Fijar horas en el calendario', `rf|${compacta(fecha)}`)]]),
      [b('⬅️ Otro día', 'ru'), ...MENU],
    ],
  }
}

async function elegirMedio(ctx, cotNum, monto) {
  return mostrar(ctx, {
    texto: `💳 N° ${cotNum} · ${pesos(monto)}\n¿Cómo pagó?`,
    filas: [...enFilas(MEDIOS_PAGO.map((m, i) => b(m, `pg|${cotNum}|${monto}|${i}`)), 2), [b('⬅️ Volver', `p|${cotNum}`)]],
  })
}

// Foto del maestro (o de Maxi): ¿de que instalacion es? El N° en el texto, la unica de hoy, o se pregunta.
async function fotoRecibida(ctx, m, foto) {
  const quotes = await cotizaciones(ctx)
  const { hoy } = datosHoy(ctx.deps)
  const numero = String(m.caption || '').match(/\d{3,6}/)?.[0]
  const porNumero = numero && buscarQ(quotes, numero)
  if (porNumero) return guardarFoto(ctx, porNumero, m, foto)
  let candidatas = instalacionesDelDia(quotes, hoy)
  if (!candidatas.length) candidatas = quotes.filter(q => activa(q) && q.instalacion?.fecha >= sumarDias(hoy, -3) && q.instalacion.fecha <= sumarDias(hoy, 1))
  if (candidatas.length === 1) return guardarFoto(ctx, candidatas[0], m, foto)
  if (!candidatas.length) return enviar(ctx, '📸 No encontré instalaciones de estos días. Vuelve a mandar la foto con el N° de la cotización en el texto.', [], { reply_to_message_id: m.message_id })
  return enviar(ctx, '📸 ¿De qué instalación es esta foto?', candidatas.slice(0, 8).map(q => [b(`${q.instalacion.inicio || ''} ${q.nombre} · N° ${q.cotNum}`.trim().slice(0, 60), `f|${q.cotNum}`)]), { reply_to_message_id: m.message_id })
}

async function guardarFoto(ctx, q, m, foto) {
  const { deps } = ctx
  const archivo = await deps.bajarArchivo(foto.file_id)
  const { id, carpetaUrl } = await deps.guardarFoto({ cotizacion: q, datos: archivo.datos, tipo: archivo.tipo, nombre: `N${q.cotNum}-${m.message_id}.${archivo.tipo === 'image/png' ? 'png' : 'jpg'}` })
  if (!ctx.cb) await enviar(ctx, `📸 Guardada en N° ${q.cotNum} · ${q.nombre}`, [], { reply_to_message_id: m.message_id })
  // A Maxi le llega la foto con el boton para publicarla en la web (sin sonar: pueden ser muchas).
  const quien = ctx.rol === 'maestro' ? primer(MAESTRO.nombre) : 'Foto'
  await Promise.all(deps.roles.admins.filter(a => a !== ctx.chatId || ctx.rol === 'admin').map(chat_id => deps.tg('sendPhoto', {
    chat_id, photo: foto.file_id, disable_notification: true,
    caption: `📸 ${quien} · N° ${q.cotNum} · ${q.nombre}${lugar(q) ? ` · ${lugar(q)}` : ''}`,
    reply_markup: teclado([[b('🌐 Publicar en la web', `w|${id}`)], ...(carpetaUrl ? [[u('📁 Carpeta en Drive', carpetaUrl)]] : [])]),
  }).catch(e => console.warn('bot: foto a admin', e.message))))
}

// Para la programada de las 07:00 (bot-manana.mjs) y el boton del panel: fichas al maestro y el dia a Maxi.
export async function enviarMananaDelBot(deps) {
  const { hoy } = datosHoy(deps)
  const [quotes, eventos] = await Promise.all([deps.listar(), deps.leerEventos(hoy, hoy)])
  let enviados = 0
  const dia = vistaDia(hoy, { quotes, eventos, hoy })
  for (const chat_id of deps.roles.admins) {
    await deps.tg('sendMessage', { chat_id, text: `☀️ Buenos días Maxi\n\n${dia.texto}`, disable_web_page_preview: true, reply_markup: teclado(dia.filas) })
    enviados++
  }
  // Mientras no haya maestro conectado, sus fichas le llegan a Maxi (para probarlas).
  const sinMaestro = !deps.roles.maestros.length
  for (const chat_id of sinMaestro ? deps.roles.admins : deps.roles.maestros) {
    if (sinMaestro) await deps.tg('sendMessage', { chat_id, text: '👷 Así le llegarán las fichas al maestro cuando lo conectes:' })
    for (const f of fichasDelDia(quotes, hoy, hoy)) {
      await deps.tg('sendMessage', { chat_id, text: f.texto, disable_web_page_preview: true, ...(f.filas.length ? { reply_markup: teclado(f.filas) } : {}) })
      enviados++
    }
  }
  return { enviados, maestros: deps.roles.maestros.length }
}

// Conecta el bot (boton del panel): Telegram empieza a mandar mensajes y botones al webhook, con
// el secreto, y cada uno ve sus comandos en el menu "/" (Maxi los suyos, el maestro los suyos).
export async function conectarBot({ tg, token, base, roles }) {
  if (!/^https:\/\//.test(base || '')) throw new Error('Falta la dirección pública del sitio (SITE_URL) para conectar el bot.')
  const url = `${base.replace(/\/$/, '')}/.netlify/functions/telegram-bot`
  await tg('setWebhook', { url, secret_token: secretoWebhook(token), allowed_updates: ['message', 'callback_query'], drop_pending_updates: true })
  const comandos = l => l.map(([command, description]) => ({ command, description }))
  await tg('setMyCommands', { commands: [{ command: 'start', description: 'Empezar' }] })
  for (const chat_id of roles.admins) await tg('setMyCommands', { commands: comandos(COMANDOS_ADMIN), scope: { type: 'chat', chat_id } }).catch(() => {})
  for (const chat_id of roles.maestros) await tg('setMyCommands', { commands: comandos(COMANDOS_MAESTRO), scope: { type: 'chat', chat_id } }).catch(() => {})
  for (const chat_id of roles.admins) await tg('sendMessage', { chat_id, text: '🤖 Menú del bot activado. Escribe /menu (o aprieta el botón de abajo) cuando quieras.', reply_markup: teclado(menuAdmin().filas) }).catch(() => {})
  return { url }
}

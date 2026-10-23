// Avisos al bot de Telegram de Don Maxi: todo lo que se mueve en el panel le llega a Maxi al celular.
// Se configura con TELEGRAM_BOT_TOKEN (lo entrega @BotFather) y TELEGRAM_CHAT_ID (uno o varios,
// separados por coma) en Netlify. Sin configurar no hace nada, y un aviso que falla nunca rompe lo
// que lo disparo (una cotizacion se guarda igual aunque Telegram no responda).
import { fechaLarga } from './mensajes.mjs'

const pesos = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const corto = iso => fechaLarga(iso).replace(/,? de \d{4}$/, '')

export function configTelegram(env = process.env) {
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim()
  const chats = String(env.TELEGRAM_CHAT_ID || '').split(',').map(s => s.trim()).filter(Boolean)
  return token ? { token, chats, api: String(env.TELEGRAM_API_URL || 'https://api.telegram.org').replace(/\/$/, '') } : null
}

// Llamada a la API del bot. Con timeout: un aviso no puede dejar colgada la funcion que lo manda.
export async function llamarTelegram(config, metodo, cuerpo, { fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), timeoutMs)
  try {
    const r = await fetchImpl(`${config.api}/bot${config.token}/${metodo}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), signal: control.signal,
    })
    const datos = await r.json().catch(() => ({}))
    if (!datos.ok) throw new Error(datos.description || `Telegram respondio ${r.status}`)
    return datos.result
  } finally { clearTimeout(reloj) }
}

// botones: [{ texto, url }] — van como botones bajo el mensaje (p. ej. "Abrir WhatsApp").
export async function enviarTelegram(texto, { botones = [], env = process.env, fetchImpl } = {}) {
  const config = configTelegram(env)
  if (!config || !config.chats.length) return 0
  const cuerpo = {
    text: String(texto).slice(0, 4000),
    disable_web_page_preview: true,
    ...(botones.length ? { reply_markup: { inline_keyboard: botones.map(b => [{ text: b.texto, url: b.url }]) } } : {}),
  }
  let enviados = 0
  for (const chat_id of config.chats) {
    await llamarTelegram(config, 'sendMessage', { chat_id, ...cuerpo }, { fetchImpl })
    enviados++
  }
  return enviados
}

// Para las funciones del panel: avisa y sigue, pase lo que pase.
export async function avisar(texto, opciones = {}) {
  try { return await enviarTelegram(texto, opciones) }
  catch (e) { console.warn('Aviso de Telegram no enviado:', e.message); return 0 }
}

// ---------- Textos de los avisos ----------
const quien = q => `${q.nombre || 'Sin nombre'}${q.cotNum ? ` · N° ${q.cotNum}` : ''}`
const telefono = q => (q.telefono ? `\n📞 ${q.telefono}` : '')

export function avisoCotizacionCreada(q, { origen = 'panel' } = {}) {
  const titulo = origen === 'web' ? '🌐 Cotización web nueva' : '🆕 Cotización creada'
  return `${titulo}\n${quien(q)}${q.total ? `\n💰 ${pesos(q.total)} con IVA` : ''}${telefono(q)}${q.direccion ? `\n📍 ${q.direccion}` : ''}`
}

export function avisoCambioEstado(q, estado, motivo = '') {
  if (estado === 'confirmada') return `✅ Cotización confirmada\n${quien(q)}${q.total ? `\n💰 ${pesos(q.total)}` : ''}`
  if (estado === 'rechazada') return `❌ Cotización rechazada\n${quien(q)}${motivo ? `\nMotivo: ${motivo}` : ''}`
  return `🔄 Cotización ${estado}\n${quien(q)}`
}

export function avisoVisitaAgendada({ nombre, fecha, hora, direccion, telefono: tel, comentarios }) {
  return `📏 Visita agendada\n${nombre || 'Sin nombre'}\n🕐 ${corto(fecha)} · ${hora} hrs${direccion ? `\n📍 ${direccion}` : ''}${tel ? `\n📞 ${tel}` : ''}${comentarios ? `\n💬 ${String(comentarios).slice(0, 300)}` : ''}`
}

export function avisoInstalacionAgendada(q, inst, { porCliente = false, reagendada = false } = {}) {
  const titulo = reagendada ? '🔁 Instalación reagendada' : porCliente ? '📅 El cliente agendó su instalación' : '📅 Instalación agendada'
  return `${titulo}\n${quien(q)}\n🕐 ${corto(inst.fecha)} · ${inst.inicio}${inst.fin ? `–${inst.fin}` : ''} hrs${q.direccion ? `\n📍 ${q.direccion}` : ''}`
}

export function avisoSolicitudFotos(s, archivos) {
  return `📸 Piden cotizar por fotos\n${s.nombre}${s.comuna ? ` · ${s.comuna}` : ''}\n📞 ${s.telefono}\n${archivos} ${archivos === 1 ? 'archivo' : 'archivos'} en tu Drive${s.medidas ? `\n📐 ${s.medidas}` : ''}`
}

export function avisoContacto(c) {
  return `✉️ Mensaje desde la web\n${c.nombre}${c.telefono ? ` · ${c.telefono}` : ''}${c.email ? ` · ${c.email}` : ''}\n💬 ${String(c.mensaje).slice(0, 500)}`
}

export function avisoPago(q, monto, medio = '') {
  return `💳 Pago recibido${medio ? ` (${medio})` : ''}\n${quien(q)}\n💰 ${pesos(monto)}`
}

export function avisoSinRespuesta(lista) {
  return [`⏰ Cotizaciones sin respuesta (${lista.length})`, ...lista.map(c => `• ${quien(c)} · hace ${c.dias} días${c.correo ? ' · le mandé recordatorio' : ''}`)].join('\n')
}

// ---------- Panel: conectar el bot ----------
// GET: estado y los chats que le escribieron al bot (para copiar el numero a TELEGRAM_CHAT_ID).
// POST { accion: 'probar' }: mensaje de prueba.
export async function atenderTelegramAdmin(metodo, body = {}, { env = process.env, fetchImpl } = {}) {
  const config = configTelegram(env)
  if (!config) return { ok: true, configurado: false, chats: [], detectados: [] }
  if (metodo === 'POST' && body.accion === 'probar') {
    if (!config.chats.length) return { ok: false, error: 'Falta TELEGRAM_CHAT_ID en Netlify: escríbele al bot y copia tu número de chat de la lista.' }
    try {
      await enviarTelegram('✅ Listo: desde ahora te aviso aquí todo lo que pase en el panel de Don Maxi.', { env, fetchImpl })
      return { ok: true, enviados: config.chats.length }
    } catch (e) { return { ok: false, error: 'Telegram no aceptó el mensaje: ' + e.message } }
  }
  try {
    const updates = await llamarTelegram(config, 'getUpdates', { limit: 50 }, { fetchImpl })
    const vistos = new Map()
    for (const u of updates || []) {
      const chat = (u.message || u.edited_message || u.my_chat_member)?.chat
      if (chat) vistos.set(String(chat.id), [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title || chat.username || 'Chat')
    }
    return { ok: true, configurado: true, chats: config.chats, detectados: [...vistos].map(([id, nombre]) => ({ id, nombre })) }
  } catch (e) {
    return { ok: false, configurado: true, chats: config.chats, detectados: [], error: 'No pude hablar con el bot: ' + e.message }
  }
}

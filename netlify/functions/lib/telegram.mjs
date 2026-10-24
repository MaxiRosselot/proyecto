// Avisos al bot de Telegram de Don Maxi: todo lo que se mueve en el panel le llega a Maxi al celular.
// Se configura con TELEGRAM_BOT_TOKEN (lo entrega @BotFather) y TELEGRAM_CHAT_ID (uno o varios,
// separados por coma) en Netlify. Sin configurar no hace nada, y un aviso que falla nunca rompe lo
// que lo disparo (una cotizacion se guarda igual aunque Telegram no responda).
import { SERVICIOS } from './marca.mjs'
import { fechaLarga, linkWhatsapp } from './mensajes.mjs'
import { resumenPagos } from './pagos-resumen.mjs'
import { nombreServicio } from './totales.mjs'

const pesos = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const corto = iso => fechaLarga(iso).replace(/,? de \d{4}$/, '').replace(',', '')

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

// mensaje: el texto, o { texto, botones } (lo que devuelven los avisos de abajo).
// botones: [{ texto, url }] — van como botones bajo el mensaje (WhatsApp al cliente, PDF, Maps).
export async function enviarTelegram(mensaje, { botones: extra = [], env = process.env, fetchImpl } = {}) {
  const config = configTelegram(env)
  if (!config || !config.chats.length) return 0
  const texto = typeof mensaje === 'object' ? mensaje.texto : mensaje
  const botones = [...(typeof mensaje === 'object' ? mensaje.botones || [] : []), ...extra].filter(b => b?.url)
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
export async function avisar(mensaje, opciones = {}) {
  try { return await enviarTelegram(mensaje, opciones) }
  catch (e) { console.warn('Aviso de Telegram no enviado:', e.message); return 0 }
}

// Algo fallo en el servidor (no un dato mal escrito por el cliente): aviso para enterarse antes que
// el cliente. Los errores 4xx (validaciones) no avisan.
export async function alertarError(donde, err, opciones = {}) {
  const estado = Number(err?.estado ?? err?.statusCode ?? err?.response?.status ?? err?.code)
  if (estado >= 400 && estado < 500 && estado !== 429) return 0
  const detalle = String(err?.message || err || 'sin detalle').slice(0, 600)
  return avisar(`🚨 Falló ${donde}\n${detalle}${estado === 429 ? '\n(Google pidió esperar: suele pasar solo)' : ''}`, opciones)
}

// ---------- Ficha de una cotizacion (para los avisos) ----------
const quien = q => `${q.nombre || 'Sin nombre'}${q.cotNum ? ` · N° ${q.cotNum}` : ''}`
const primer = nombre => String(nombre || '').trim().split(/\s+/)[0] || ''
const hola = nombre => `¡Hola${primer(nombre) ? ' ' + primer(nombre) : ''}! 👋`
const cm = m => Math.round((Number(m) || 0) * 100)
const mapa = dir => (dir ? `https://maps.google.com/?q=${encodeURIComponent(dir)}` : '')

// Cada repisa en una linea corta: "2 × 243×48×200 cm, 4 niveles (con colgador)".
export function lineasRepisas(repisas = []) {
  return repisas.map(r => {
    const u = Number(r.unidades ?? r.u ?? 1) || 1
    const pre = u > 1 ? `${u} × ` : ''
    if (r.kind === 'rack' || (!r.largo && !r.l && r.label)) return `${pre}${r.label || 'Repisas'}`
    const n = Number(r.niveles ?? r.n) || 0
    return `${pre}${cm(r.largo ?? r.l)}×${cm(r.prof ?? r.p)}×${cm(r.alto ?? r.a)} cm${n ? `, ${n} niveles` : ''}${r.colgador ? ' (con colgador)' : ''}`
  })
}

export function serviciosDe(adicionales = {}) {
  return SERVICIOS.map(([clave]) => [clave, Number(adicionales[`qty_${clave}`]) || 0]).filter(([, n]) => n > 0)
    .map(([clave, n]) => `${nombreServicio(adicionales, clave)}${n > 1 ? ` × ${n}` : ''}`)
}

// Contacto, repisas, servicios, montos y pagos. Lo que haga falta para decidir sin abrir el panel.
export function fichaCotizacion(q) {
  const repisas = lineasRepisas(q.repisas)
  const servicios = serviciosDe(q.adicionales)
  const total = Number(q.total) || 0
  const pago = total ? resumenPagos(total, q.pagos || []) : null
  return [
    `👤 ${quien(q)}`,
    ...(q.telefono || q.email ? [`📞 ${[q.telefono, q.email].filter(Boolean).join(' · ')}`] : []),
    ...(q.direccion ? [`📍 ${q.direccion}`] : []),
    ...(repisas.length ? [`🪵 Repisas:`, ...repisas.map(l => `   • ${l}`)] : []),
    `➕ Servicios: ${servicios.length ? servicios.join(', ') : 'ninguno'}`,
    ...(total ? [`💰 ${q.subtotal ? `Neto ${pesos(q.subtotal)} · ` : ''}Total ${pesos(total)} con IVA`] : []),
    ...(pago && pago.pagado > 0 ? [`💳 Pagado ${pesos(pago.pagado)} · Saldo ${pesos(pago.saldo)}`] : []),
    ...(q.instalacion?.fecha ? [`🔧 Instalación: ${corto(q.instalacion.fecha)} · ${q.instalacion.inicio}${q.instalacion.fin ? `–${q.instalacion.fin}` : ''} hrs`] : []),
  ].join('\n')
}

// Botones: escribirle al cliente con un mensaje corto ya escrito, ver el PDF y la direccion en Maps.
function botonesCliente(q, mensaje, etiqueta = 'Escribirle por WhatsApp') {
  return [
    ...(q.telefono && mensaje ? [{ texto: `💬 ${etiqueta}`, url: linkWhatsapp(q.telefono, mensaje) }] : []),
    ...(q.pdfUrl ? [{ texto: '📄 Ver cotización (PDF)', url: q.pdfUrl }] : []),
    ...(q.direccion ? [{ texto: '📍 Ver en Maps', url: mapa(q.direccion) }] : []),
  ]
}

// ---------- Avisos ----------
export function avisoCotizacionCreada(q, { origen = 'panel' } = {}) {
  const titulo = origen === 'web' ? '🌐 Cotización web nueva (la armó el cliente)' : '🆕 Cotización creada'
  const corta = origen === 'web'
    ? `${hola(q.nombre)} Le escribo de Repisas Don Maxi. Vi que cotizó sus repisas en nuestra web (N° ${q.cotNum}). ¿Le ayudo con alguna duda o coordinamos la instalación? 🙏`
    : `${hola(q.nombre)} Le escribo de Repisas Don Maxi. Le envié su cotización N° ${q.cotNum}. ¿Pudo revisarla? Cualquier duda me escribe 🙏`
  return { texto: `${titulo}\n${fichaCotizacion(q)}`, botones: botonesCliente(q, corta) }
}

export function avisoCambioEstado(q, estado, motivo = '', { linkAgenda = '' } = {}) {
  if (estado === 'confirmada') {
    const corta = `${hola(q.nombre)} ¡Muchas gracias por confirmar su cotización N° ${q.cotNum}! ✅${q.instalacion?.fecha ? '' : linkAgenda ? ` Puede elegir el día y la hora de la instalación aquí: ${linkAgenda}` : ' ¿Coordinamos el día de la instalación?'}`
    return { texto: `✅ Cotización confirmada\n${fichaCotizacion(q)}`, botones: botonesCliente(q, corta, 'Agradecer y coordinar') }
  }
  if (estado === 'rechazada') return { texto: `❌ Cotización rechazada\n${fichaCotizacion(q)}${motivo ? `\n📝 Motivo: ${motivo}` : ''}`, botones: [] }
  return { texto: `🔄 Cotización ${estado}\n${fichaCotizacion(q)}`, botones: [] }
}

// hasta: con rango (la visita se agenda por rango y la hora exacta sale de la ruta del dia).
export function avisoVisitaAgendada({ nombre, fecha, hora, hasta = '', direccion, telefono, email, comentarios }) {
  const cuando = hasta ? `entre las ${hora} y las ${hasta} hrs` : `a las ${hora} hrs`
  const corta = `${hola(nombre)} Le escribo de Repisas Don Maxi para confirmar su visita de medición del ${corto(fecha).toLowerCase()} ${cuando}${direccion ? ` en ${direccion}` : ''}.${hasta ? ' El día anterior le confirmo la hora exacta de llegada.' : ''} ¿Nos confirma? 🙏`
  const v = { telefono, direccion }
  return {
    texto: [`📏 Visita agendada`, `👤 ${nombre || 'Sin nombre'}`, `🕐 ${corto(fecha)} · ${hasta ? `${hora}–${hasta} hrs (rango)` : `${hora} hrs`}`,
      ...(telefono || email ? [`📞 ${[telefono, email].filter(Boolean).join(' · ')}`] : []),
      ...(direccion ? [`📍 ${direccion}`] : []), ...(comentarios ? [`💬 ${String(comentarios).slice(0, 300)}`] : [])].join('\n'),
    botones: botonesCliente(v, corta, 'Confirmar visita'),
  }
}

// Mensaje corto para confirmar una instalacion por WhatsApp.
export function confirmacionCortaInstalacion(q, inst, { manana = false } = {}) {
  return `${hola(q.nombre)} Le confirmo su instalación ${manana ? 'de mañana' : `del ${corto(inst.fecha).toLowerCase()}`} a las ${inst.inicio} hrs${q.direccion ? ` en ${q.direccion}` : ''} ✅ ¿Nos confirma? 🙏`
}

export function avisoInstalacionAgendada(q, inst, { porCliente = false, reagendada = false } = {}) {
  const titulo = reagendada ? '🔁 Instalación reagendada' : porCliente ? '📅 El cliente agendó su instalación' : '📅 Instalación agendada'
  return {
    texto: `${titulo}\n🕐 ${corto(inst.fecha)} · ${inst.inicio}${inst.fin ? `–${inst.fin}` : ''} hrs\n${fichaCotizacion({ ...q, instalacion: undefined })}`,
    botones: botonesCliente(q, confirmacionCortaInstalacion(q, inst), 'Confirmar instalación'),
  }
}

export function avisoSolicitudFotos(s, archivos) {
  const corta = `${hola(s.nombre)} Le escribo de Repisas Don Maxi. Recibí sus fotos, las reviso y le envío la cotización a su correo 🙏`
  return {
    texto: [`📸 Piden cotizar por fotos`, `👤 ${s.nombre}${s.comuna ? ` · ${s.comuna}` : ''}`, `📞 ${[s.telefono, s.email].filter(Boolean).join(' · ')}`,
      `🗂 ${archivos} ${archivos === 1 ? 'archivo' : 'archivos'} en tu Drive (el link va en el correo)`, ...(s.medidas ? [`📐 ${s.medidas}`] : []),
      ...(s.comentarios ? [`💬 ${String(s.comentarios).slice(0, 300)}`] : [])].join('\n'),
    botones: botonesCliente({ telefono: s.telefono }, corta),
  }
}

export function avisoContacto(c) {
  return {
    texto: `✉️ Mensaje desde la web\n👤 ${c.nombre}\n📞 ${[c.telefono, c.email].filter(Boolean).join(' · ') || '—'}\n💬 ${String(c.mensaje).slice(0, 800)}`,
    botones: botonesCliente({ telefono: c.telefono }, `${hola(c.nombre)} Le escribo de Repisas Don Maxi por su mensaje en la web.`, 'Responder por WhatsApp'),
  }
}

export function avisoPago(q, monto, medio = '') {
  return { texto: `💳 Pago recibido${medio ? ` (${medio})` : ''}: ${pesos(monto)}\n${fichaCotizacion(q)}`, botones: [] }
}

// Cotizaciones sin respuesta, con un boton por cliente para escribirle un seguimiento corto.
export function avisoSinRespuesta(lista) {
  return {
    texto: [`⏰ Cotizaciones sin respuesta (${lista.length})`,
      ...lista.map(c => `• ${quien(c)} · hace ${c.dias} días${c.total ? ` · ${pesos(c.total)}` : ''}${c.correo ? ' · le mandé recordatorio' : ''}`)].join('\n'),
    botones: lista.filter(c => c.telefono).slice(0, 8).map(c => ({
      texto: `💬 ${primer(c.nombre) || 'Cliente'} · N° ${c.cotNum}`,
      url: linkWhatsapp(c.telefono, `${hola(c.nombre)} Le escribo de Repisas Don Maxi. ¿Pudo revisar la cotización N° ${c.cotNum} que le enviamos? Si quiere ajustar algo, me cuenta 🙏`),
    })),
  }
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
  const maestros = String(env.TELEGRAM_MAESTRO_CHAT_ID || '').split(',').map(s => s.trim()).filter(Boolean)
  try {
    // Con el menu del bot activo (webhook), Telegram no deja leer los mensajes con getUpdates: el bot
    // mismo le dice su numero a quien le escribe.
    const info = await llamarTelegram(config, 'getWebhookInfo', {}, { fetchImpl }).catch(() => null)
    if (info?.url) {
      const webhook = { activo: true, pendientes: info.pending_update_count || 0, ...(info.last_error_message ? { ultimoError: info.last_error_message, fechaError: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : '' } : {}) }
      return { ok: true, configurado: true, chats: config.chats, maestros, webhook, detectados: [] }
    }
    const updates = await llamarTelegram(config, 'getUpdates', { limit: 50 }, { fetchImpl })
    const vistos = new Map()
    for (const u of updates || []) {
      const chat = (u.message || u.edited_message || u.my_chat_member)?.chat
      if (chat) vistos.set(String(chat.id), [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title || chat.username || 'Chat')
    }
    return { ok: true, configurado: true, chats: config.chats, maestros, webhook: { activo: false }, detectados: [...vistos].map(([id, nombre]) => ({ id, nombre })) }
  } catch (e) {
    return { ok: false, configurado: true, chats: config.chats, detectados: [], error: 'No pude hablar con el bot: ' + e.message }
  }
}

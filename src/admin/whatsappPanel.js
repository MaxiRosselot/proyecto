// WhatsApp dentro del panel (solo PC): WhatsApp Web en una ventana a la derecha, que el usuario usa a mano.
// WhatsApp Web no se deja meter en otra pagina; la extension de Chrome "extension-whatsapp/" lo permite
// solo para este panel y marca la pagina con data-whatsapp-panel para que sepamos que esta instalada.
// El panel no lee ni envia mensajes: solo deja copiar textos y abrir el chat de un cliente.
import { telefonoWhatsapp } from '../../netlify/functions/lib/mensajes.mjs'

export const URL_WHATSAPP_WEB = 'https://web.whatsapp.com/'
export const EVENTO_PARA_ENVIAR = 'dm:whatsapp-para-enviar'
const CLAVE_ABIERTO = 'dm_whatsapp_abierto'
const CLAVE_ANCHO = 'dm_whatsapp_ancho'
const CLAVE_ZOOM = 'dm_whatsapp_zoom'
export const ANCHO_MIN = 380
export const ANCHO_MAX = 900

export const extensionInstalada = () => Boolean(document.documentElement.dataset.whatsappPanel)

// Abre el chat de ese numero dentro de WhatsApp Web, con el texto escrito (sin enviar: el Enter lo das tu).
export function linkWhatsappWeb(telefono, texto = '') {
  const tel = telefonoWhatsapp(telefono)
  const params = new URLSearchParams()
  if (tel) params.set('phone', tel)
  if (texto) params.set('text', texto)
  return URL_WHATSAPP_WEB + 'send?' + params.toString()
}

// Lee un link de WhatsApp (wa.me, api.whatsapp.com/send, web.whatsapp.com/send) y devuelve
// { telefono, texto }, o null si no es un link de WhatsApp.
export function leerLinkWhatsapp(href) {
  let u
  try { u = new URL(href) } catch { return null }
  const host = u.hostname.replace(/^www\./, '')
  if (host === 'wa.me') return { telefono: u.pathname.replace(/\D/g, ''), texto: u.searchParams.get('text') || '' }
  if ((host === 'api.whatsapp.com' || host === 'web.whatsapp.com') && u.pathname.startsWith('/send'))
    return { telefono: (u.searchParams.get('phone') || '').replace(/\D/g, ''), texto: u.searchParams.get('text') || '' }
  return null
}

// Formato legible de un celular chileno: +56 9 1234 5678.
export function telefonoLegible(telefono) {
  const t = telefonoWhatsapp(telefono)
  const m = t.match(/^56(9)(\d{4})(\d{4})$/)
  return m ? `+56 ${m[1]} ${m[2]} ${m[3]}` : (t ? '+' + t : '')
}

// Busca clientes por nombre, N° de cotizacion, telefono o direccion. Sin texto, no muestra nada.
export function buscarClientes(cotizaciones, texto, max = 8) {
  const normal = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const palabras = normal(texto).split(/\s+/).filter(Boolean)
  if (!palabras.length) return []
  const digitos = String(texto).replace(/\D/g, '')
  return cotizaciones.filter(q => {
    const tel = String(q.telefono || '').replace(/\D/g, '')
    if (digitos.length >= 4 && tel.includes(digitos)) return true
    const todo = normal([q.nombre, q.cotNum, q.direccion, q.comuna, q.email].join(' '))
    return palabras.every(p => todo.includes(p))
  }).slice(0, max)
}

// Ventana abierta o cerrada y su ancho: se recuerdan en este PC.
export const leerAbierto = () => localStorage.getItem(CLAVE_ABIERTO) === '1'
export const guardarAbierto = v => localStorage.setItem(CLAVE_ABIERTO, v ? '1' : '0')
export const leerAncho = () => Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, Number(localStorage.getItem(CLAVE_ANCHO)) || 560))
export const guardarAncho = v => localStorage.setItem(CLAVE_ANCHO, String(Math.round(v)))
// Tamaño de WhatsApp dentro de la ventana: achicarlo deja ver la lista y el chat en poco ancho.
export const ZOOMS = [0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 1]
export const leerZoom = () => { const z = Number(localStorage.getItem(CLAVE_ZOOM)); return ZOOMS.includes(z) ? z : 0.8 }
export const guardarZoom = z => { localStorage.setItem(CLAVE_ZOOM, String(z)); avisar() }

// Un solo WhatsApp Web cargado para todo el panel (dos a la vez se pelean la sesion): el iframe vive
// arriba de todo (MarcoWhatsapp) y se acomoda sobre el "lugar" visible que lo pide (la seccion
// WhatsApp o la ventana de la derecha). Asi no se recarga al cambiar de seccion.
const lugares = new Set()
const oyentes = new Set()
function avisar() { oyentes.forEach(f => f()) }
export function suscribir(fn) { oyentes.add(fn); return () => oyentes.delete(fn) }
export function pedirLugar(el) { lugares.add(el); avisar(); return () => { lugares.delete(el); avisar() } }
// El lugar visible mas reciente (los ocultos miden 0).
export function lugarVisible() {
  for (const el of [...lugares].reverse()) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) return r }
  return null
}
let marco = null
export const registrarMarco = el => { marco = el }
// Abre el chat de ese numero en el WhatsApp del panel, con el texto escrito (sin enviar). Primero le
// pide a la extension (1.2+) que lo abra sin recargar; si no puede (cargando, sin sesion, version
// vieja) o no contesta, recarga WhatsApp con el chat, que tarda unos segundos mas.
let pedidos = 0
let ultimoPedido = 0
export async function abrirChatEnMarco(telefono, texto = '') {
  if (!marco) return
  const turno = ++ultimoPedido // si mientras tanto se pidio otro chat, ese manda
  const ok = await pedirAlMarco({ dm: 'abrir-chat', telefono: telefonoWhatsapp(telefono), texto })
  if (!ok && marco && turno === ultimoPedido) marco.src = linkWhatsappWeb(telefono, texto)
}
// Deja el PDF adjunto en su chat con el texto como comentario, sin enviar (extension 1.5+). Devuelve
// { ok, motivo }. Si no se puede (version vieja, sin sesion), el panel lo descarga para arrastrarlo.
export async function adjuntarEnChat(telefono, { archivo, nombre, texto = '' }) {
  if (!marco) return { ok: false, motivo: 'sin-marco' }
  ++ultimoPedido
  return pedirAlMarco({ dm: 'adjuntar', telefono: telefonoWhatsapp(telefono), archivo, nombre, texto }, 90000, 'adjunto')
}
function pedirAlMarco(mensaje, espera = 1500, respuesta = 'chat') {
  return new Promise(resolver => {
    const id = ++pedidos
    const listo = (ok, motivo = 'sin-respuesta') => { window.removeEventListener('message', oir); clearTimeout(reloj); resolver(respuesta === 'chat' ? ok : { ok, motivo }) }
    const oir = ev => { if (ev.source === marco?.contentWindow && ev.data?.dm === respuesta && ev.data.id === id) listo(Boolean(ev.data.ok), ev.data.motivo || '') }
    const reloj = setTimeout(() => listo(false), espera)
    window.addEventListener('message', oir)
    try { marco.contentWindow.postMessage({ ...mensaje, id }, 'https://web.whatsapp.com') } catch { listo(false) }
  })
}
export function inicioMarco() { if (marco) marco.src = URL_WHATSAPP_WEB }
// Lleva el teclado a WhatsApp (queda donde estaba: normalmente escribiendo en el chat abierto).
export function enfocarMarco() { try { marco?.focus(); marco?.contentWindow?.focus() } catch { /* sin marco */ } }
// Las teclas con Alt apretadas dentro de WhatsApp (la extension 1.3+ las pasa al panel).
export const esMarco = el => Boolean(el) && el === marco
export function oirTeclasDelMarco(fn) { return oirDelMarco('tecla', fn) }
// WhatsApp dijo que ese numero no existe (extension 1.4+).
// El chat que esta abierto en WhatsApp (extension 1.6+): { telefono, titulo } cada vez que cambia.
// Se guarda el ultimo aunque la seccion no este abierta, para que al volver la ficha lo tome.
let ultimoChat = null
if (typeof window !== 'undefined') window.addEventListener('message', ev => {
  if (marco && ev.source === marco.contentWindow && ev.data?.dm === 'chat-abierto') ultimoChat = { telefono: String(ev.data.telefono || ''), titulo: String(ev.data.titulo || '') }
})
export const chatAbiertoAhora = () => ultimoChat
export function oirChatAbierto(fn) { return oirDelMarco('chat-abierto', d => fn({ telefono: String(d.telefono || ''), titulo: String(d.titulo || '') })) }
export function oirSinWhatsapp(fn) { return oirDelMarco('sin-whatsapp', d => fn(String(d.telefono || ''))) }
function oirDelMarco(tipo, fn) {
  const oir = ev => { if (marco && ev.source === marco.contentWindow && ev.data?.dm === tipo) fn(ev.data) }
  window.addEventListener('message', oir)
  return () => window.removeEventListener('message', oir)
}

// Con la ventana abierta, los botones de WhatsApp del panel no abren otra pestaña: dejan el mensaje
// listo (y copiado) en la ventana. Si no esta abierta, se abre WhatsApp como siempre.
let ventanaAbierta = false
export const marcarVentanaAbierta = v => { ventanaAbierta = v }
export function abrirWhatsapp(telefono, texto, cliente = '') {
  if (ventanaAbierta) { window.dispatchEvent(new CustomEvent(EVENTO_PARA_ENVIAR, { detail: { telefono, texto, cliente } })); return }
  window.open(`https://wa.me/${telefonoWhatsapp(telefono)}?text=${encodeURIComponent(texto || '')}`, '_blank')
}
export const ventanaWhatsappAbierta = () => ventanaAbierta

// El link de agendar del cliente: https://<sitio>/agendar?c=<N°>&t=<firma>. Solo agenda (el pago lo
// coordina Don Maxi por WhatsApp, normalmente al terminar). El cliente ve su cotizacion, puede
// agregar servicios adicionales, elige dia y hora y queda agendado (Calendario + Instalaciones).
// Si vuelve a abrir el link ve su hora y puede reagendar hasta 48 h antes.
// Las reglas de horas viven en agenda-horas.mjs. Lo usan la funcion agendar y el backend local.
//
// deps: { almacen, config, calendar, calendarId, leerEventos(desde, hasta), enviarCorreo, avisoA, ahora }
import { ErrorCotizacion, actualizarCotizacion, listarCotizaciones, obtenerCotizacion } from './cotizaciones.mjs'
import {
  SERVICIOS_CLIENTE, disponibilidadAgenda, duracionInstalacionMin, ocupadosAgenda, puedeReagendar, rangoAgendaCliente
} from './agenda-horas.mjs'
import { HORARIO_INSTALACIONES } from './horarios.mjs'
import { agendarInstalacion } from './instalaciones.mjs'
import { SERVICIOS, WHATSAPP } from './marca.mjs'
import { correoAgendaAdmin, correoAgendaCliente } from './mensajes.mjs'
import { firmaValida, linkAgenda } from './mercadopago.mjs'
import { nombreServicio, totalesCotizacion } from './totales.mjs'

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })
const falla = (mensaje, estado = 400) => { throw new ErrorCotizacion(estado, mensaje) }
const primerNombre = n => String(n || '').trim().split(/\s+/)[0] || ''
const correoValido = e => /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]{2,}$/.test(String(e || '').trim())

export { linkAgenda }

function verificar(c, t, config) {
  const cotNum = String(c || '').trim()
  if (!config || !/^\d{1,9}$/.test(cotNum) || !firmaValida(cotNum, t, config.secreto)) return null
  return cotNum
}

export function estadoAgenda(cotizacion) {
  if (!cotizacion || cotizacion.status === 'rechazada') return 'no-disponible'
  if (cotizacion.instalacion?.instalada) return 'instalada'
  return cotizacion.instalacion?.fecha ? 'agendada' : 'por-agendar'
}

// Los servicios que el cliente puede sumar, con su precio y lo que ya tiene.
function serviciosDe(adicionales = {}) {
  return SERVICIOS_CLIENTE.map(([clave, porCantidad]) => {
    const [, nombre, lista, descripcion] = SERVICIOS.find(([c]) => c === clave)
    return {
      clave, porCantidad, descripcion,
      nombre: nombreServicio(adicionales, clave) || nombre,
      precio: Number(adicionales[`precio_${clave}`] ?? lista) || 0,
      cantidad: Number(adicionales[`qty_${clave}`]) || 0,
    }
  })
}

// Los adicionales con lo que eligio el cliente (solo los servicios del link; el resto no se toca).
export function conServiciosElegidos(adicionales = {}, elegidos = {}) {
  const siguiente = { ...adicionales }
  for (const s of serviciosDe(adicionales)) {
    if (!(s.clave in elegidos)) continue
    const n = Math.max(0, Math.min(s.porCantidad ? 20 : 1, Math.round(Number(elegidos[s.clave]) || 0)))
    siguiente[`qty_${s.clave}`] = n
    if (n > 0) siguiente[`precio_${s.clave}`] = s.precio
  }
  return siguiente
}

// El horario de instalaciones (Admin → Horarios → Instalaciones); sin el, lunes a viernes de 10 a 16.
const horarioDe = async deps => (deps.leerHorario ? await deps.leerHorario() : HORARIO_INSTALACIONES)

async function ocupadosPara(cotizacion, deps, horario) {
  const ahora = new Date(deps.ahora ?? Date.now())
  const { desde, hasta } = rangoAgendaCliente(ahora, horario)
  const [eventos, { quotes }] = await Promise.all([deps.leerEventos(desde, hasta), listarCotizaciones(deps.almacen)])
  return ocupadosAgenda({ eventos, cotizaciones: quotes, excepto: { cotNum: cotizacion.cotNum, eventId: cotizacion.instalacion?.eventId } })
}

function vista(cotizacion, ahora) {
  const t = totalesCotizacion(cotizacion.repisas || [], cotizacion.adicionales || {})
  const i = cotizacion.instalacion
  return {
    cotNum: String(cotizacion.cotNum), nombre: primerNombre(cotizacion.nombre), direccion: cotizacion.direccion || '',
    netoRepisas: t.repisas, total: Number(cotizacion.total) || t.total,
    // Para recalcular el total al sumar servicios: lo que no son servicios del link queda fijo.
    adicionales: cotizacion.adicionales || {},
    repisas: (cotizacion.repisas || []).map(r => ({ unidades: Number(r.unidades ?? r.u ?? 1) || 0, valor: Number(r.valor ?? r.v) || 0 })),
    servicios: serviciosDe(cotizacion.adicionales || {}),
    instalacion: i?.fecha ? { fecha: i.fecha, inicio: i.inicio, fin: i.fin } : null,
    puedeReagendar: puedeReagendar(i, ahora),
    // Para dibujar su bodega en isometrica en la pagina (el mismo modelo del PDF).
    proyecto3d: cotizacion.proyecto3d || null,
  }
}

// GET /agendar?c=&t= → estado, su cotizacion y lo ocupado de la agenda (sin nombres).
export async function atenderAgendaGet(params, deps) {
  const cotNum = verificar(params.c, params.t, deps.config)
  if (!cotNum) return json(404, { ok: false, error: 'Link no válido. Revisa que esté completo o pídenos uno nuevo.', whatsapp: WHATSAPP })
  const cotizacion = await obtenerCotizacion(deps.almacen, cotNum)
  const estado = estadoAgenda(cotizacion)
  if (estado === 'no-disponible') return json(404, { ok: false, error: 'Esta cotización ya no está disponible. Escríbenos y te ayudamos.', whatsapp: WHATSAPP })
  const ahora = new Date(deps.ahora ?? Date.now())
  const v = vista(cotizacion, ahora)
  const conAgenda = estado === 'por-agendar' || (estado === 'agendada' && v.puedeReagendar)
  const horario = conAgenda ? await horarioDe(deps) : null
  return json(200, { ok: true, estado, cotizacion: v, horario, ocupados: conAgenda ? await ocupadosPara(cotizacion, deps, horario) : {}, ahora: ahora.toISOString(), whatsapp: WHATSAPP })
}

// POST { c, t, fecha, inicio, servicios: { retiro_orden: 1, cajas: 2, ... } } → agenda o reagenda.
// Lo que el cliente no puede hacer (hora tomada, menos de 48 h) vuelve como respuesta con su motivo.
export async function atenderAgendaPost(body, deps) {
  try { return await agendarPost(body, deps) }
  catch (e) {
    if (e instanceof ErrorCotizacion && e.estado < 500) return json(e.estado, { ok: false, error: e.message, whatsapp: WHATSAPP })
    throw e
  }
}

async function agendarPost(body, deps) {
  const cotNum = verificar(body.c, body.t, deps.config)
  if (!cotNum) return json(404, { ok: false, error: 'Link no válido' })
  const cotizacion = await obtenerCotizacion(deps.almacen, cotNum)
  const estado = estadoAgenda(cotizacion)
  const ahora = new Date(deps.ahora ?? Date.now())
  if (estado === 'no-disponible') falla('Esta cotización ya no está disponible', 404)
  if (estado === 'instalada') falla('Tu instalación ya se realizó. Si necesitas algo más, escríbenos por WhatsApp.', 409)
  const reagendada = estado === 'agendada'
  if (reagendada && !puedeReagendar(cotizacion.instalacion, ahora))
    falla('Faltan menos de 48 horas para tu instalación: para cambiarla escríbenos directamente por WhatsApp.', 409)

  const adicionales = conServiciosElegidos(cotizacion.adicionales || {}, body.servicios || {})
  const duracion = duracionInstalacionMin(cotizacion.repisas || [], adicionales)
  const horario = await horarioDe(deps)
  const dias = disponibilidadAgenda(await ocupadosPara(cotizacion, deps, horario), duracion, ahora, horario)
  const hora = dias.find(d => d.fecha === body.fecha)?.horas.find(h => h.inicio === body.inicio)
  if (!hora) falla('Ese horario ya no está disponible. Elige otro, por favor.', 409)

  const anterior = cotizacion.instalacion?.fecha ? { ...cotizacion.instalacion } : null
  const { instalacion } = await agendarInstalacion(deps.almacen, deps.calendar, deps.calendarId, {
    cotNum, fecha: body.fecha, inicio: hora.inicio, fin: hora.fin, adicionales, email: cotizacion.email, invitar: true,
    notas: reagendada ? 'Reagendada por el cliente desde su link.' : 'Agendada por el cliente desde su link: falta confirmar por WhatsApp.',
  })
  await actualizarCotizacion(deps.almacen, { cotNum, instalacion: { ...instalacion, agendadaPorCliente: true } })
  const guardada = await obtenerCotizacion(deps.almacen, cotNum)

  // Correos al cliente y a Don Maxi. Si uno falla, lo agendado igual queda.
  const link = linkAgenda(cotNum, deps.config)
  const correos = []
  if (correoValido(guardada.email)) correos.push(correoAgendaCliente(guardada, instalacion, { reagendada, linkAgenda: link }))
  if (deps.avisoA) correos.push({ para: deps.avisoA, ...correoAgendaAdmin(guardada, instalacion, { reagendada, anterior, linkPanel: `${deps.config.base}/admin` }) })
  for (const correo of correos) await deps.enviarCorreo?.(correo).catch(e => console.warn('agendar: correo no enviado:', e.message))

  return json(200, { ok: true, estado: 'agendada', reagendada, correoEnviado: correoValido(guardada.email), cotizacion: vista(guardada, ahora) })
}

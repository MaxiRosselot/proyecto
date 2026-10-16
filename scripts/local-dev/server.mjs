// Local-only functions backend for the mini ERP.
// Replaces the Google Calendar / Google Sheets backed Netlify functions with a JSON file on
// disk, so the admin can be exercised locally without touching the client's production data.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { SEED_VISITS, SEED_QUOTES, SEED_INSTALLATIONS, visitToApiShape } from './seed.mjs'
import { TABLA_PRECIOS } from '../../src/admin/preciosRepisas.js'
import { resolvePriceUpdate } from '../../netlify/functions/lib/price-update.mjs'
import { AUTH_HEADERS, requireAdmin } from '../../netlify/functions/lib/admin-auth.mjs'
import {
  actualizarCotizacion, almacenEnMemoria, borrarCotizacion, cotizacionAFila, crearCotizacion,
  listarCotizaciones, obtenerCotizacion, siguienteDisponible,
} from '../../netlify/functions/lib/cotizaciones.mjs'
import {
  DURACION_MIN, aHHMM, ahoraEnZona, diasDisponibles, guardarHorario, horaLocalAUTC, horaPermitida, leerHorario,
} from '../../netlify/functions/lib/horarios.mjs'
import { procesarCotizacionWeb } from '../../netlify/functions/lib/cotizacion-web.mjs'
import { agendarInstalacion, invitarClienteInstalacion } from '../../netlify/functions/lib/instalaciones.mjs'
import { eventoParaVista } from '../../netlify/functions/lib/calendario.mjs'
import { anotarBoleta, borrarPago, registrarPago } from '../../netlify/functions/lib/pagos.mjs'
import { armarCorreo } from '../../netlify/functions/lib/correo.mjs'
import { generateQuotePdf } from '../../netlify/functions/lib/quote-pdf.mjs'
import { configPago, conLinkPago, linkPagoCotizacion } from '../../netlify/functions/lib/mercadopago.mjs'
import { atenderAvisoMercadoPago, atenderReservaGet, atenderReservaPost } from '../../netlify/functions/lib/reserva-cliente.mjs'
import { confirmarTransferenciaYAvisar, rechazarTransferencia } from '../../netlify/functions/lib/reservas-admin.mjs'
import { actualizarFila, cancelarInstalacion, crearInstalacion, enlazarEvento, sincronizarFila, sincronizarVarias } from '../../netlify/functions/lib/planilla.mjs'
import { importarVentas } from '../../netlify/functions/lib/importar-ventas.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = path.join(here, 'data.json')
const PORT = Number(process.env.LOCAL_API_PORT || 8899)
const PUBLIC_URL = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'

// Prices, visits and PDFs are local. Do not load production Google credentials.
// generate-quote busca la plantilla en LAMBDA_TASK_ROOT/netlify/functions; en local es el repo.
process.env.LAMBDA_TASK_ROOT = process.env.LAMBDA_TASK_ROOT || path.join(here, '../..')

// Contraseña de demostración, solo para este backend local. En producción ADMIN_PASSWORD y
// ADMIN_SESSION_SECRET se configuran en Netlify y no tienen valor por defecto.
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'donmaxi-local-demo'
process.env.ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || randomBytes(32).toString('hex')
// Mercado Pago simulado (mpLocal, mas abajo): los links de pago se arman igual que en produccion.
process.env.MP_ACCESS_TOKEN = 'local-simulado'
process.env.PAGO_LINK_SECRET = 'solo-local-links-de-pago'
process.env.SITE_URL = PUBLIC_URL

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) } catch { /* fall through to seed */ }
  }
  const fresh = {
    visits: SEED_VISITS.map(visitToApiShape),
    visitStatuses: Object.fromEntries(SEED_VISITS.map(v => [v.id, v.status])),
    quotes: SEED_QUOTES,
    installations: SEED_INSTALLATIONS,
  }
  saveData(fresh)
  return fresh
}
function saveData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)) }

let db = loadData()
db.precios ||= structuredClone(TABLA_PRECIOS)

// Las cotizaciones se guardan como filas de la hoja, con la misma logica que en produccion
// (lib/cotizaciones.mjs). Un data.json anterior traia objetos sueltos: se convierten una vez.
db.cotizacionesFilas ||= (db.quotes || SEED_QUOTES).map(q => cotizacionAFila(q))
delete db.quotes
const cotizaciones = almacenEnMemoria(db.cotizacionesFilas, filas => { db.cotizacionesFilas = filas; saveData(db) })

// Horarios: la pestaña "Horarios" de la planilla, aca en data.json. Sin filas = horario por defecto.
const horarios = {
  async leerFilas() { return db.horariosFilas ?? null },
  async guardarFilas(filas) { db.horariosFilas = filas; saveData(db) },
}
// Hora de Chile de una visita ya agendada, como la slot_key que guarda create_event.
function slotDeVisita(v) {
  const { fecha, minutos } = ahoraEnZona(new Date(v.start))
  return `${fecha}T${aHHMM(minutos)}`
}
// Calendar falso para las instalaciones: los eventos quedan en data.json (db.eventos).
const calendarLocal = {
  events: {
    async insert({ requestBody }) {
      const id = 'ev-local-' + randomUUID().slice(0, 8)
      db.eventos = { ...(db.eventos || {}), [id]: requestBody }; saveData(db)
      return { data: { id, htmlLink: `${PUBLIC_URL}/#evento-${id}` } }
    },
    async patch({ eventId, requestBody }) {
      db.eventos = { ...(db.eventos || {}), [eventId]: { ...(db.eventos?.[eventId] || {}), ...requestBody } }; saveData(db)
      return { data: { id: eventId, htmlLink: `${PUBLIC_URL}/#evento-${eventId}` } }
    },
    async delete({ eventId }) {
      if (!db.eventos?.[eventId]) throw Object.assign(new Error('Evento no encontrado'), { code: 410 })
      delete db.eventos[eventId]; saveData(db)
    },
  },
}

// Calendario local: las instalaciones guardadas en db.eventos y las visitas de db.visits, con la
// misma forma que entrega Google Calendar, para que la vista use la logica de produccion.
function eventosLocales() {
  const aUTC = fechaHora => { const [fecha, hora] = fechaHora.split('T'); return horaLocalAUTC(fecha, hora.slice(0, 5)).toISOString() }
  const instalaciones = Object.entries(db.eventos || {}).map(([id, ev]) => ({
    ...ev, id, htmlLink: `${PUBLIC_URL}/#evento-${id}`,
    start: { dateTime: aUTC(ev.start.dateTime) }, end: { dateTime: aUTC(ev.end.dateTime) },
  }))
  const visitas = db.visits.map(v => ({
    id: v.id, summary: `Visita — ${v.nombre} (Repisas Don Maxi)`,
    description: `Cliente: ${v.nombre}\nEmail: ${v.email || ''}\nCelular: ${v.celular || ''}\nDirección: ${v.direccion || ''}`,
    start: { dateTime: v.start }, end: { dateTime: v.end }, attendees: v.email ? [{ email: v.email }] : [],
    extendedProperties: { shared: { created_by: 'agendador-netlify', status: db.visitStatuses[v.id] || v.status || '' } },
  }))
  return [...instalaciones, ...visitas]
}

// Mercado Pago falso: la preferencia lleva a un checkout local que "paga" y avisa al webhook,
// igual que el real. Los pagos quedan en data.json (db.mpPagos).
const mpLocal = {
  async crearPreferencia(body) {
    const id = 'pref-' + randomUUID().slice(0, 8)
    db.mpPreferencias = { ...(db.mpPreferencias || {}), [id]: body }; saveData(db)
    return { id, init_point: `${PUBLIC_URL}/.netlify/functions/mp-checkout-local?pref=${id}` }
  },
  async obtenerPago(id) {
    const pago = db.mpPagos?.[id]
    if (!pago) throw Object.assign(new Error('Pago no encontrado en MP'), { estado: 404 })
    return pago
  },
}
async function pagarLocal(prefId) {
  const pref = db.mpPreferencias?.[prefId]
  if (!pref) throw Object.assign(new Error('Preferencia no encontrada'), { status: 404 })
  const id = String(Date.now())
  db.mpPagos = { ...(db.mpPagos || {}), [id]: { id, status: 'approved', transaction_amount: pref.items[0].unit_price, external_reference: pref.external_reference, metadata: pref.metadata, date_approved: new Date().toISOString() } }
  saveData(db)
  await atenderAvisoMercadoPago({ body: { type: 'payment', data: { id } } }, depsReserva())
  return pref.back_urls.success
}

// Lo mismo que netlify/functions/lib/google-servicios.mjs, pero local: planilla y calendario en
// data.json, correos como .eml.
function depsReserva() {
  return {
    almacen: cotizaciones, config: configPago(), mp: mpLocal, calendar: calendarLocal, calendarId: 'repisas@donmaxi.cl',
    leerEventos: async (desde, hasta) => eventosLocales().map(ev => eventoParaVista(ev)).filter(e => e.fecha >= desde && e.fecha <= hasta),
    enviarCorreo: async correo => guardarCorreoLocal(correo), avisoA: 'admin-local@example.com',
  }
}

// Rutas que en produccion no piden sesion: las usa la pagina publica de agendar.
const PUBLICAS = new Set(['admin-login', 'get-availability', 'create_event', 'cotizacion-web', 'pagar', 'mp-checkout-local', 'reserva'])

// Los PDF y correos de las cotizaciones web quedan en disco: nada sale a Google ni a un correo real.
function guardarPdfLocal(bytes) {
  const id = randomUUID()
  fs.mkdirSync(path.join(here, 'pdfs'), { recursive: true })
  fs.writeFileSync(path.join(here, 'pdfs', `${id}.pdf`), bytes)
  return `${PUBLIC_URL}/.netlify/functions/local-pdf?id=${id}`
}
function guardarCorreoLocal(correo) {
  fs.mkdirSync(path.join(here, 'correos'), { recursive: true })
  const archivo = path.join(here, 'correos', `${Date.now()}-${String(correo.para).replace(/[^a-z0-9.@-]/gi, '_')}.eml`)
  fs.writeFileSync(archivo, armarCorreo(correo))
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': AUTH_HEADERS,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
}

function send(res, code, body) { res.writeHead(code, CORS); res.end(JSON.stringify(body)) }

const routes = {
  'upload-pdf': body => {
    const bytes = Buffer.from(body.pdfBase64 || '', 'base64')
    if (bytes.subarray(0, 4).toString() !== '%PDF') throw Object.assign(new Error('PDF inválido'), { status: 400 })
    return { ok: true, local: true, viewUrl: guardarPdfLocal(bytes) }
  },
  'get-precios': () => ({ ok: true, tabla: db.precios, local: true }),
  'update-precio': body => {
    const updated = resolvePriceUpdate(db.precios, body)
    db.precios = db.precios.map(r => r.alto === updated.alto && r.prof === updated.prof && r.desde === updated.desde && r.hasta === updated.hasta ? updated : r)
    saveData(db)
    return { ok: true, fila: updated, local: true }
  },
  'get-visits': () => ({
    ok: true,
    visits: db.visits.map(v => ({ ...v, status: db.visitStatuses[v.id] || v.status || 'agendada' })),
  }),
  'get-quotes': async (_body, params) => {
    if (params.get('siguiente')) return { ok: true, siguiente: await siguienteDisponible(cotizaciones) }
    if (params.get('cotNum')) {
      const quote = await obtenerCotizacion(cotizaciones, params.get('cotNum'))
      return quote ? { ok: true, quote: conLinkPago(quote) } : { status: 404, ok: false, error: 'Cotización no encontrada' }
    }
    const { quotes, siguiente } = await listarCotizaciones(cotizaciones)
    return { ok: true, quotes: quotes.map(q => conLinkPago(q)), siguiente }
  },
  'get-installations': () => ({ ok: true, installations: db.installations }),
  'get-sales': () => ({ ok: true, installations: db.installations }),
  'update-visit-status': (body) => {
    if (!body.visitId || !body.status) return { ok: false, error: 'Faltan parámetros' }
    db.visitStatuses[body.visitId] = body.status
    const visit = db.visits.find(v => v.id === body.visitId)
    if (visit) { visit.status = body.status; if (body.notas !== undefined) visit.notas = body.notas }
    saveData(db)
    return { ok: true }
  },
  'save-quote': async (body) => {
    const { estado, respuesta } = body.crear ? await crearCotizacion(cotizaciones, body) : await actualizarCotizacion(cotizaciones, body)
    return { status: estado, ...respuesta, ...(respuesta.ok ? { linkPago: linkPagoCotizacion(respuesta.cotNum ?? body.cotNum) } : {}) }
  },
  'delete-quote': async (body) => {
    const { estado, respuesta } = await borrarCotizacion(cotizaciones, body.cotNum)
    return { status: estado, ...respuesta }
  },
  // Mismo contrato que netlify/functions/cotizacion-web.mjs
  'cotizacion-web': async (body, _params, method) => {
    if (method === 'GET') return { ok: true, tabla: db.precios }
    const resultado = await procesarCotizacionWeb(body, {
      tabla: db.precios, almacen: cotizaciones, generarPdf: generateQuotePdf,
      subirPdf: async ({ pdfBuffer }) => ({ viewUrl: guardarPdfLocal(pdfBuffer) }),
      enviarCorreo: async correo => guardarCorreoLocal(correo),
      avisoA: 'admin-local@example.com',
      linkPago: cotNum => linkPagoCotizacion(cotNum),
    })
    return { ok: true, ...resultado }
  },
  // Mismo contrato que netlify/functions/instalacion.mjs
  'instalacion': async (body) => {
    const r = body.accion === 'invitar'
      ? await invitarClienteInstalacion(cotizaciones, calendarLocal, 'repisas@donmaxi.cl', body)
      : await agendarInstalacion(cotizaciones, calendarLocal, 'repisas@donmaxi.cl', body)
    return { ok: true, ...r }
  },
  'eventos-local': () => ({ ok: true, eventos: db.eventos || {} }),
  'simular-limite': body => { db.limiteSimulado = Number(body.veces) || 0; return { ok: true } },
  // Solo para pruebas: un evento suelto, como los que creaba el script de la planilla de Maxi.
  'evento-local-suelto': body => {
    const id = 'suelto-' + randomUUID().slice(0, 8)
    db.eventos = { ...(db.eventos || {}), [id]: { summary: body.summary, start: { dateTime: body.inicio }, end: { dateTime: body.fin } } }; saveData(db)
    return { ok: true, id }
  },
  // Mismo contrato que netlify/functions/planilla.mjs
  'planilla': async (body) => {
    const { almacen, calendar, calendarId, leerEventos } = depsReserva()
    if (body.accion === 'actualizar') return { ok: true, ...(await actualizarFila(almacen, calendar, calendarId, body.cotNum, body.cambios, { leerEventos })) }
    if (body.accion === 'enlazar') return { ok: true, ...(await enlazarEvento(almacen, calendar, calendarId, body)) }
    // Solo pruebas: simula la pausa que pide Google (429) las veces indicadas en simular-limite.
    if (body.accion === 'sincronizar' && db.limiteSimulado > 0) { db.limiteSimulado--; return { status: 429, ok: false, limite: true, reintentarEn: 2, error: 'Google pidió una pausa (simulado)' } }
    if (body.accion === 'sincronizar') return { ok: true, ...(await (Array.isArray(body.cotNums) ? sincronizarVarias : sincronizarFila)(almacen, calendar, calendarId, body, { leerEventos })) }
    if (body.accion === 'crear') return { ok: true, ...(await crearInstalacion(almacen, calendar, calendarId, body)) }
    if (body.accion === 'cancelar') return { ok: true, ...(await cancelarInstalacion(almacen, calendar, calendarId, body)) }
    if (body.accion === 'importar') return { ok: true, reporte: await importarVentas(almacen, body.ventas || [], { simular: body.simular === true, hoy: ahoraEnZona().fecha, calendar, calendarId, leerEventos }) }
    return { status: 400, ok: false, error: 'Acción desconocida' }
  },
  // Mismo contrato que netlify/functions/calendario.mjs
  'calendario': async (_body, params) => {
    const desde = params.get('desde'), hasta = params.get('hasta')
    const { quotes } = await listarCotizaciones(cotizaciones)
    const porNumero = new Map(quotes.map(q => [String(q.cotNum), q]))
    const eventos = eventosLocales().map(ev => eventoParaVista(ev, porNumero)).filter(e => e.fecha >= desde && e.fecha <= hasta)
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.minutoInicio - b.minutoInicio)
    return { ok: true, eventos }
  },
  // Mismo contrato que netlify/functions/pagos.mjs
  'pagos': async (body) => ({
    ok: true,
    ...(body.accion === 'borrar' ? await borrarPago(cotizaciones, body)
      : body.accion === 'boleta' ? await anotarBoleta(cotizaciones, body)
      : body.accion === 'confirmar-transferencia' ? await confirmarTransferenciaYAvisar(depsReserva(), body)
      : body.accion === 'rechazar-transferencia' ? await rechazarTransferencia(cotizaciones, body)
      : await registrarPago(cotizaciones, body)),
  }),
  // Mismo contrato que netlify/functions/probar-correo.mjs (el correo queda como .eml)
  'probar-correo': async () => {
    guardarCorreoLocal({ para: 'admin-local@example.com', asunto: 'Prueba de correo — Repisas Don Maxi', texto: 'Prueba local' })
    return { ok: true, para: 'admin-local@example.com', remitente: 'local' }
  },
  // Mismo contrato que netlify/functions/horarios.mjs
  'horarios': async (body, params, method) => {
    if (method === 'POST') {
      const config = await guardarHorario(horarios, body)
      return { ok: true, config, dias: diasDisponibles(config) }
    }
    const config = await leerHorario(horarios)
    return params.get('config') ? { ok: true, config, dias: diasDisponibles(config) } : { ok: true, dias: diasDisponibles(config), duracion: DURACION_MIN }
  },
  // Mismas reglas que get-availability / create_event, con las visitas locales en vez de Calendar.
  'get-availability': async (_body, params) => {
    const date = params.get('date') || ''
    const config = await leerHorario(horarios)
    const tomadas = new Set(db.visits.filter(v => (db.visitStatuses[v.id] || v.status) !== 'cancelada').map(slotDeVisita))
    const availability = Object.fromEntries((params.get('slots') || '').split(',').filter(Boolean)
      .map(h => [h, horaPermitida(config, date, h) && !tomadas.has(`${date}T${h}`)]))
    return { ok: true, date, availability, mode: 'created-only' }
  },
  'create_event': async (body) => {
    const { nombre = '', apellido = '', email, celular = '', direccion = '', fechaISO, horaHHmm, note = '' } = body
    if (!email || !fechaISO || !horaHHmm) return { status: 400, ok: false, error: 'Faltan parámetros' }
    if (!horaPermitida(await leerHorario(horarios), fechaISO, horaHHmm))
      return { status: 400, ok: false, error: 'INVALID_SLOT', message: 'Ese horario no está disponible para agendar. Elige otro.' }
    const slotKey = `${fechaISO}T${horaHHmm}`
    if (db.visits.some(v => slotDeVisita(v) === slotKey)) return { status: 409, ok: false, error: 'SLOT_TAKEN' }
    const start = horaLocalAUTC(fechaISO, horaHHmm)
    const visita = {
      id: `visit-local-${randomUUID().slice(0, 8)}`, summary: `Visita — ${nombre} ${apellido} (Repisas Don Maxi)`,
      start: start.toISOString(), end: new Date(start.getTime() + DURACION_MIN * 60000).toISOString(),
      email, celular, direccion, notas: note, nombre: `${nombre} ${apellido}`.trim(), status: 'agendada', slotKey,
    }
    db.visits.push(visita); db.visitStatuses[visita.id] = 'agendada'; saveData(db)
    return { ok: true, local: true, slotKey }
  },
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end() }

  const url = new URL(req.url, 'http://localhost')
  const name = url.pathname.replace('/.netlify/functions/', '')
  if (!url.pathname.startsWith('/.netlify/functions/')) return send(res, 404, { error: 'Ruta local no encontrada' })

  // Loopback-only mock downloads; random identifiers, no production or cloud storage.
  if (name === 'local-pdf' && req.method === 'GET') {
    const id = url.searchParams.get('id') || ''
    if (!/^[a-f0-9-]{36}$/.test(id)) return send(res, 400, { error: 'ID inválido' })
    const file = path.join(here, 'pdfs', `${id}.pdf`)
    if (!fs.existsSync(file)) return send(res, 404, { error: 'PDF no encontrado' })
    res.writeHead(200, { 'Content-Type': 'application/pdf' })
    return res.end(fs.readFileSync(file))
  }

  // Links antiguos /pagar → /reserva (el handler de produccion) y el checkout simulado de Mercado Pago.
  if (name === 'pagar' && req.method === 'GET') {
    const r = await (await import('../../netlify/functions/pagar.mjs')).handler({ httpMethod: 'GET', queryStringParameters: Object.fromEntries(url.searchParams) })
    res.writeHead(r.statusCode, r.headers); return res.end(r.body)
  }
  if (name === 'mp-checkout-local') {
    const pref = db.mpPreferencias?.[url.searchParams.get('pref')]
    if (!pref) return send(res, 404, { ok: false, error: 'Preferencia no encontrada' })
    if (req.method === 'POST') {
      try { res.writeHead(302, { Location: await pagarLocal(url.searchParams.get('pref')) }); return res.end() }
      catch (e) { console.error('[local-api] checkout failed:', e); return send(res, 500, { ok: false, error: e.message }) }
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    return res.end(`<!doctype html><meta charset="utf-8"><title>Mercado Pago (simulado)</title><body style="font-family:system-ui;padding:32px"><h1>Mercado Pago · simulado</h1><p>${pref.items[0].title}</p><p style="font-size:28px;font-weight:800">$${pref.items[0].unit_price.toLocaleString('es-CL')}</p><form method="post"><button style="font-size:18px;padding:12px 24px">Pagar (simulado)</button></form></body>`)
  }

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  const event = {
    httpMethod: req.method,
    headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), String(v || '')])),
    body: raw,
    queryStringParameters: Object.fromEntries(url.searchParams),
  }

  // El login y la verificacion de sesion son los de produccion.
  // horarios es publico para leer los dias; ver o guardar la configuracion pide sesion.
  const publica = PUBLICAS.has(name) || (name === 'horarios' && req.method === 'GET' && !url.searchParams.get('config'))
  if (!publica) {
    const denied = requireAdmin(event, CORS)
    if (denied) return send(res, denied.statusCode, JSON.parse(denied.body))
  }

  try {
    // Estas rutas corren el handler real de produccion, no una version local.
    const handlerReal = name === 'generate-quote' ? (await import('../../netlify/functions/generate-quote.mjs')).handler
      : name === 'admin-login' ? (await import('../../netlify/functions/admin-login.mjs')).handler
      : null
    if (handlerReal) {
      const result = await handlerReal(event)
      res.writeHead(result.statusCode, { ...CORS, ...(result.headers || {}) })
      // El PDF viaja en base64: Netlify lo decodifica en produccion, aca hay que hacerlo.
      return res.end(result.isBase64Encoded ? Buffer.from(result.body, 'base64') : (result.body || ''))
    }

    // Pagina /reserva del cliente: mismas reglas que netlify/functions/reserva.mjs.
    if (name === 'reserva') {
      try {
        const r = req.method === 'POST' ? await atenderReservaPost(raw ? JSON.parse(raw) : {}, depsReserva()) : await atenderReservaGet(Object.fromEntries(url.searchParams), depsReserva())
        res.writeHead(r.statusCode, { ...CORS, ...r.headers }); return res.end(r.body)
      } catch (e) { if (!(e.estado < 500)) console.error('[local-api] reserva failed:', e); return send(res, e.estado || 500, { ok: false, error: e.message }) }
    }

    const route = routes[name]
    if (!route) return send(res, 404, { ok: false, error: `Sin backend local para ${name}` })
    if (name === 'update-precio' && req.method !== 'POST') return send(res, 405, { error: 'Método no permitido' })
    const body = raw ? JSON.parse(raw) : {}
    const { status = 200, ...result } = await route(body, url.searchParams, req.method)
    return send(res, status, result)
  } catch (error) {
    const status = error.status || error.estado || 500
    if (status >= 500) console.error(`[local-api] ${name} failed:`, error)
    return send(res, status, { ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[local-api] listening on http://127.0.0.1:${PORT}`)
  console.log(`[local-api] visits seeded: ${db.visits.length} (realizadas: ${db.visits.filter(v => (db.visitStatuses[v.id] || v.status) === 'realizada').length})`)
  console.log(`[local-api] quotes: ${db.cotizacionesFilas.length}`)
  console.log(`[local-api] admin password (solo local): ${process.env.ADMIN_PASSWORD}`)
})

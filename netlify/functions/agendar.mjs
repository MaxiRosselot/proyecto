// netlify/functions/agendar.mjs — publico, lo usa la pagina /agendar del cliente (link firmado).
//   GET  ?c=&t=  → estado de su agendamiento, su cotizacion y lo ocupado de la agenda
//   POST { c, t, fecha, inicio, servicios }  → agenda o reagenda (hasta 48 h antes)
// Las reglas viven en lib/agenda-horas.mjs y lib/agenda-cliente.mjs.
import { google } from 'googleapis'
import { atenderAgendaGet, atenderAgendaPost } from './lib/agenda-cliente.mjs'
import { HOJA_HORARIOS_INSTALACIONES, HORARIO_INSTALACIONES, almacenHorariosSheets, leerHorario } from './lib/horarios.mjs'
import { serviciosGoogle } from './lib/google-servicios.mjs'
import { configPago } from './lib/mercadopago.mjs'
import { avisar } from './lib/telegram.mjs'

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })

export async function handler(event) {
  const config = configPago()
  if (!config) return json(503, { ok: false, error: 'El agendamiento en línea no está configurado' })
  try {
    // El horario de instalaciones que se edita en Admin → Horarios → Instalaciones.
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const horarios = almacenHorariosSheets(google.sheets({ version: 'v4', auth }), process.env.GOOGLE_SHEET_ID, HOJA_HORARIOS_INSTALACIONES)
    const deps = { ...serviciosGoogle(), config, avisar, leerHorario: () => leerHorario(horarios, HORARIO_INSTALACIONES) }
    if (event.httpMethod === 'GET') return await atenderAgendaGet(event.queryStringParameters || {}, deps)
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Método no permitido' })
    let body
    try { body = JSON.parse(event.body || '{}') } catch { return json(400, { ok: false, error: 'Solicitud inválida' }) }
    return await atenderAgendaPost(body, deps)
  } catch (err) {
    if (err?.estado && err.estado < 500) return json(err.estado, { ok: false, error: err.message })
    console.error('agendar error:', err)
    return json(500, { ok: false, error: 'No pudimos agendar. Intenta de nuevo en un momento o escríbenos por WhatsApp.' })
  }
}

// netlify/functions/send-reminders.mjs
// Netlify scheduled function — corre cada día a las 10:00 AM Santiago (13:00 UTC)
// netlify.toml: [functions."send-reminders"] schedule = "0 13 * * *"
// Que se manda lo decide lib/recordatorios.mjs; aca solo se lee de Google y se envia.
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { almacenSheets, listarCotizaciones } from './lib/cotizaciones.mjs'
import { eventosEntre } from './lib/calendario.mjs'
import { ahoraEnZona, sumarDias } from './lib/horarios.mjs'
import { enviarCorreoGmail, explicarErrorCorreo } from './lib/correo.mjs'
import { prepararRecordatorios } from './lib/recordatorios.mjs'
import { esProgramada } from './seguimiento-diario.mjs'

const ADMIN_EMAIL = process.env.NOTIFY_EMAIL || 'repisas@donmaxi.cl'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': AUTH_HEADERS,
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }

  // Netlify la invoca con un POST que trae { next_run }; el disparo manual viene con sesion de admin.
  const isScheduled = esProgramada(event)
  const denied = isScheduled ? null : requireAdmin(event, corsHeaders)
  if (denied) return denied

  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const calendar = google.calendar({ version: 'v3', auth })
    const gmail = google.gmail({ version: 'v1', auth })

    const hoy = ahoraEnZona().fecha
    const manana = sumarDias(hoy, 1)
    const cotizaciones = process.env.GOOGLE_SHEET_ID
      ? (await listarCotizaciones(almacenSheets(google.sheets({ version: 'v4', auth }), process.env.GOOGLE_SHEET_ID))).quotes
      : []
    const eventosManana = await eventosEntre(calendar, process.env.CALENDAR_ID, manana, manana, cotizaciones)
    const visitasPasadas = (await eventosEntre(calendar, process.env.CALENDAR_ID, sumarDias(hoy, -14), sumarDias(hoy, -2)))
      .filter(e => e.tipo === 'visita')

    const { correosClientes, resumen } = prepararRecordatorios({ manana, eventosManana, cotizaciones, visitasPasadas })
    const enviados = [], fallidos = []
    const enviar = async correo => {
      try { await enviarCorreoGmail(gmail, correo); enviados.push(correo.para) }
      catch (e) { const { causa } = explicarErrorCorreo(e); fallidos.push({ para: correo.para, causa }); console.warn('recordatorio no enviado:', correo.para, causa) }
    }
    for (const correo of correosClientes) await enviar(correo)
    if (resumen) await enviar({ para: ADMIN_EMAIL, ...resumen })

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, manana, enviados, fallidos }) }
  } catch (err) {
    console.error('send-reminders error:', err)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok: false, error: String(err) }) }
  }
}

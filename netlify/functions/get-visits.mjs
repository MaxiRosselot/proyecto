// netlify/functions/get-visits.mjs
// Devuelve todas las visitas agendadas desde Google Calendar
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { geocodificar } from './lib/geocodificar.mjs'
import { guardarCoordenadas } from './lib/visitas.mjs'
import { visitaDesdeFila } from './lib/importar-calendly.mjs'
import { horaLocalAUTC } from './lib/horarios.mjs'

// Para el mapa: por llamada se ubican a lo mas estas visitas sin coordenadas (quedan guardadas).
const MAX_GEOCODIFICAR = 15

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': AUTH_HEADERS,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders }
  }

  // Auth simple
  const denied = requireAdmin(event, corsHeaders)
  if (denied) return denied

  try {
    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client })
    const sheets   = google.sheets({ version: 'v4', auth: oAuth2Client })

    // Traer eventos desde 3 meses atrás hasta 6 meses adelante
    const now = new Date()
    const timeMin = new Date(now)
    timeMin.setMonth(timeMin.getMonth() - 3)
    const timeMax = new Date(now)
    timeMax.setMonth(timeMax.getMonth() + 6)

    // Leer statuses de Sheets en paralelo
    const [list, sheetRes] = await Promise.all([
      calendar.events.list({
        calendarId: process.env.CALENDAR_ID,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 500,
        sharedExtendedProperty: 'created_by=agendador-netlify',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: 'Visitas!A:N',
      }).catch(() => ({ data: { values: [] } })),
    ])

    // Mapa visitId -> status desde Sheets (columna A=id, H=status)
    const statusMap = {}
    for (const row of (sheetRes.data.values || [])) {
      if (row[0] && row[7]) statusMap[row[0]] = row[7]
    }

    const calendario = (list.data.items || []).map(ev => {
      const desc = ev.description || ''
      const get = (label) => {
        const m = desc.match(new RegExp(`${label}:\\s*(.+)`))
        return m ? m[1].trim() : ''
      }
      return {
        id: ev.id,
        summary: ev.summary || '',
        start: ev.start?.dateTime || ev.start?.date || '',
        end: ev.end?.dateTime || ev.end?.date || '',
        email: get('Email'),
        celular: get('Celular'),
        direccion: get('Dirección'),
        notas: get('Notas') === '(sin notas)' ? '' : get('Notas'),
        slotKey: ev.extendedProperties?.shared?.slot_key || '',
        // Para el mapa: comuna y coordenadas (del autocompletado de /visita o ubicadas despues).
        comuna: ev.extendedProperties?.shared?.comuna || '',
        ...(ev.extendedProperties?.shared?.lat ? { lat: Number(ev.extendedProperties.shared.lat), lng: Number(ev.extendedProperties.shared.lng) } : {}),
        nombre: ev.summary?.match(/Visita — (.+?) \(/)?.[1] || ev.summary || '',
        status: statusMap[ev.id] || 'agendada',
      }
    })

    // Las visitas que viven solo en la hoja (importadas de Calendly: columna Origen), con su fecha y estado.
    const enCalendario = new Set(calendario.map(v => v.id))
    const deLaHoja = (sheetRes.data.values || []).slice(1)
      .filter(f => f[10] && !enCalendario.has(f[0]))
      .map(f => visitaDesdeFila(f, horaLocalAUTC)).filter(Boolean)
    const visits = [...calendario, ...deLaHoja]

    // Con GOOGLE_MAPS_SERVER_KEY se ubican las que no tienen coordenadas (las mas recientes primero).
    if (process.env.GOOGLE_MAPS_SERVER_KEY) {
      const sinUbicar = calendario.filter(v => v.lat == null && (v.direccion || v.comuna)).reverse().slice(0, MAX_GEOCODIFICAR)
      await Promise.all(sinUbicar.map(async v => {
        const punto = await geocodificar(v.direccion || v.comuna).catch(() => null)
        if (!punto) return
        Object.assign(v, punto)
        await guardarCoordenadas(calendar, process.env.CALENDAR_ID, v.id, punto).catch(e => console.warn('get-visits: coordenadas no guardadas', e.message))
      }))
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, visits }),
    }
  } catch (err) {
    console.error('get-visits error:', err)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: String(err) }),
    }
  }
}

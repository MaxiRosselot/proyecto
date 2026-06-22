// netlify/functions/create-installation.mjs
import { google } from 'googleapis'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '2003'
const SHEET_ID       = process.env.GOOGLE_SHEET_ID
const SHEET_NAME     = 'Instalaciones'
const HEADERS = ['Fecha','Hora Inicio','Hora Fin','Cliente','Email','Teléfono','Dirección','N° Cot','Repisas ($)','Adicionales ($)','Total ($)','Notas','Event ID','Creado']

function fmtLocal(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}
function parseLocalDateTime(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [h, min]  = timeStr.split(':').map(Number)
  return new Date(y, m - 1, d, h, min, 0)
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  if (event.headers['x-admin-password'] !== ADMIN_PASSWORD)
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'No autorizado' }) }

  try {
    const {
      nombre, email, telefono, direccion,
      fecha, horaInicio, horaFin,
      notas = '', cotNum = '',
      subtotalRepisas = 0, subtotalAdicionales = 0, total = 0,
    } = JSON.parse(event.body || '{}')

    if (!nombre || !fecha || !horaInicio || !horaFin)
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Faltan parámetros' }) }

    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const calendar = google.calendar({ version: 'v3', auth })
    const sheets   = google.sheets({ version: 'v4', auth })

    const startLocal = parseLocalDateTime(fecha, horaInicio)
    const endLocal   = parseLocalDateTime(fecha, horaFin)
    if (endLocal <= startLocal)
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Hora fin debe ser posterior a hora inicio' }) }

    const tz = 'America/Santiago'
    const summary = `Instalación — ${nombre} (Repisas Don Maxi)`
    const description = [
      `Cliente: ${nombre}`,
      email     ? `Email: ${email}`         : '',
      telefono  ? `Teléfono: ${telefono}`   : '',
      direccion ? `Dirección: ${direccion}` : '',
      cotNum    ? `Cotización N°: ${cotNum}` : '',
      total     ? `Total: $${Number(total).toLocaleString('es-CL')}` : '',
      notas     ? `\nNotas:\n${notas}`      : '',
    ].filter(Boolean).join('\n')

    const attendees = email ? [{ email }] : []

    // Crear evento en Calendar
    const calRes = await calendar.events.insert({
      calendarId: process.env.CALENDAR_ID,
      sendUpdates: attendees.length ? 'all' : 'none',
      requestBody: {
        summary, description,
        start: { dateTime: fmtLocal(startLocal), timeZone: tz },
        end:   { dateTime: fmtLocal(endLocal),   timeZone: tz },
        attendees,
        reminders: { useDefault: true },
        extendedProperties: {
          shared: {
            created_by: 'instalacion-donmaxi',
            cliente:    nombre,
            cot_num:    String(cotNum),
          },
        },
      },
    })

    // Guardar en Sheet
    if (SHEET_ID) {
      // Verificar si la hoja existe; crearla si no
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
      const sheetExists = spreadsheet.data.sheets?.some(s => s.properties?.title === SHEET_NAME)
      if (!sheetExists) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
        })
        await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A1`, valueInputOption: 'RAW', requestBody: { values: [HEADERS] } })
      } else {
        const head = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A1:A1` }).catch(() => ({ data: { values: [] } }))
        if (!head.data.values?.length) {
          await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A1`, valueInputOption: 'RAW', requestBody: { values: [HEADERS] } })
        }
      }
      const createdAt = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })
      const row = [
        fecha, horaInicio, horaFin,
        nombre, email || '', telefono || '', direccion || '',
        String(cotNum),
        String(subtotalRepisas), String(subtotalAdicionales), String(total),
        notas,
        calRes.data.id || '',
        createdAt,
      ]
      await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A1`, valueInputOption: 'RAW', requestBody: { values: [row] } })
    }

    return {
      statusCode: 200, headers: corsHeaders,
      body: JSON.stringify({ ok: true, link: calRes.data.htmlLink, eventId: calRes.data.id }),
    }
  } catch (err) {
    console.error('create-installation error:', err)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok: false, error: String(err) }) }
  }
}

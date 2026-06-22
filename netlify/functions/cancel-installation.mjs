// netlify/functions/cancel-installation.mjs
import { google } from 'googleapis'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '2003'
const SHEET_ID       = process.env.GOOGLE_SHEET_ID
const SHEET_NAME     = 'Instalaciones'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  if (event.headers['x-admin-password'] !== ADMIN_PASSWORD)
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'No autorizado' }) }

  try {
    const { eventId, motivo = '', nombre = '', email = '' } = JSON.parse(event.body || '{}')
    if (!eventId)
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Falta eventId' }) }

    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const calendar = google.calendar({ version: 'v3', auth })
    const sheets   = google.sheets({ version: 'v4', auth })

    // 1. Obtener evento para tener asistentes
    const existing = await calendar.events.get({ calendarId: process.env.CALENDAR_ID, eventId }).catch(() => null)
    const attendees = existing?.data?.attendees || []

    // 2. Eliminar evento de Calendar
    await calendar.events.delete({
      calendarId: process.env.CALENDAR_ID,
      eventId,
      sendUpdates: attendees.length ? 'all' : 'none',
    })

    // 3. Marcar como Cancelada en Sheets
    if (SHEET_ID) {
      // Buscar fila por EventID (columna M = índice 12)
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A:N`,
      }).catch(() => ({ data: { values: [] } }))

      const rows = res.data.values || []
      const rowIndex = rows.findIndex((r, i) => i > 0 && r[12] === eventId)

      if (rowIndex > 0) {
        // Columna O (índice 14) = Estado, Columna P (índice 15) = Motivo cancelación
        // Primero verificar cuántas columnas tiene la hoja — puede necesitar expandir
        const rowNum = rowIndex + 1 // 1-based
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_NAME}!O${rowNum}:P${rowNum}`,
          valueInputOption: 'RAW',
          requestBody: { values: [['Cancelada', motivo]] },
        })
      }
    }

    // 4. Enviar email de cancelación si hay email
    if (email) {
      // Usamos Gmail API
      const gmail = google.gmail({ version: 'v1', auth })
      const fechaStr = existing?.data?.start?.dateTime
        ? new Date(existing.data.start.dateTime).toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long', year:'numeric', timeZone:'America/Santiago' })
        : ''
      const motivoTexto = motivo ? `\n\nMotivo: ${motivo}` : ''
      const bodyText = [
        `Estimado/a ${nombre},`,
        '',
        `Te informamos que la instalación agendada${fechaStr ? ' para el ' + fechaStr : ''} ha sido cancelada.${motivoTexto}`,
        '',
        'Si tienes preguntas, no dudes en contactarnos.',
        '',
        'Saludos,',
        'Repisas Don Maxi',
      ].join('\n')

      const subject = 'Cancelación de instalación — Repisas Don Maxi'
      const raw = btoa(
        `To: ${email}\r\n` +
        `Subject: ${subject}\r\n` +
        `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
        bodyText
      ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

      await gmail.users.messages.send({ userId: 'me', requestBody: { raw } }).catch(e => {
        console.warn('Email warning (non-fatal):', e.message)
      })
    }

    return {
      statusCode: 200, headers: corsHeaders,
      body: JSON.stringify({ ok: true }),
    }
  } catch (err) {
    console.error('cancel-installation error:', err)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok: false, error: String(err) }) }
  }
}

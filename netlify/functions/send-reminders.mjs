// netlify/functions/send-reminders.mjs
// Netlify scheduled function — corre cada día a las 10:00 AM Santiago (13:00 UTC)
// netlify.toml: [functions."send-reminders"] schedule = "0 13 * * *"
import { google } from 'googleapis'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '2003'
const SHEET_ID       = process.env.GOOGLE_SHEET_ID
const ADMIN_EMAIL    = 'repisasdonmaxi@gmail.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function pad(n) { return String(n).padStart(2, '0') }
function localDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}
function fmtHuman(dateStr) {
  try {
    return new Intl.DateTimeFormat('es-CL', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
      .format(new Date(dateStr + 'T12:00:00'))
  } catch { return dateStr }
}

async function sendEmail(gmail, to, subject, body) {
  const raw = btoa(
    `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
  ).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }

  // Permitir disparo manual con password
  const isScheduled = !event.httpMethod || event.httpMethod === 'GET'
  if (!isScheduled && event.headers['x-admin-password'] !== ADMIN_PASSWORD)
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'No autorizado' }) }

  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const calendar = google.calendar({ version: 'v3', auth })
    const sheets   = google.sheets({ version: 'v4', auth })
    const gmail    = google.gmail({ version: 'v1', auth })

    // Mañana en Santiago
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }))
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
    const tomorrowStr = localDateStr(tomorrow)
    const tomorrowStart = new Date(tomorrowStr + 'T00:00:00-04:00')
    const tomorrowEnd   = new Date(tomorrowStr + 'T23:59:59-04:00')

    const sent = []

    // ── 1. RECORDATORIOS DE VISITAS (desde Google Calendar) ────────────────────
    const visitList = await calendar.events.list({
      calendarId: process.env.CALENDAR_ID,
      timeMin: tomorrowStart.toISOString(),
      timeMax: tomorrowEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    })

    const visitasMañana = (visitList.data.items || []).filter(ev =>
      !ev.extendedProperties?.shared?.created_by?.includes('instalacion')
    )
    const instMañana = (visitList.data.items || []).filter(ev =>
      ev.extendedProperties?.shared?.created_by === 'instalacion-donmaxi'
    )

    // Recordatorio al cliente por cada visita
    for (const ev of visitasMañana) {
      const clientEmail = ev.attendees?.[0]?.email
      if (!clientEmail) continue
      const nombre = ev.summary?.replace(' — Repisas Don Maxi','').replace('Visita — ','') || 'Cliente'
      const hora = ev.start?.dateTime
        ? new Intl.DateTimeFormat('es-CL',{hour:'2-digit',minute:'2-digit',timeZone:'America/Santiago'}).format(new Date(ev.start.dateTime))
        : ''
      const dir = ev.location || ''
      await sendEmail(gmail, clientEmail,
        `Recordatorio de visita mañana — Repisas Don Maxi`,
        [
          `Hola ${nombre},`,
          '',
          `Te recordamos que mañana ${fmtHuman(tomorrowStr)} tenemos una visita agendada${hora ? ' a las ' + hora : ''}.`,
          dir ? `Dirección: ${dir}` : '',
          '',
          'Ante cualquier cambio no dudes en contactarnos.',
          '',
          'Saludos,',
          'Repisas Don Maxi',
        ].filter(l => l !== null).join('\n')
      ).catch(e => console.warn('email visita cliente:', e.message))
      sent.push({ tipo: 'visita-cliente', email: clientEmail })
    }

    // Recordatorio al cliente por cada instalación
    for (const ev of instMañana) {
      const clientEmail = ev.attendees?.[0]?.email
      if (!clientEmail) continue
      const nombre = ev.extendedProperties?.shared?.cliente || ''
      const hora = ev.start?.dateTime
        ? new Intl.DateTimeFormat('es-CL',{hour:'2-digit',minute:'2-digit',timeZone:'America/Santiago'}).format(new Date(ev.start.dateTime))
        : ''
      await sendEmail(gmail, clientEmail,
        `Recordatorio de instalación mañana — Repisas Don Maxi`,
        [
          `Hola ${nombre || 'Cliente'},`,
          '',
          `Te recordamos que mañana ${fmtHuman(tomorrowStr)} tenemos la instalación de tus repisas agendada${hora ? ' a las ' + hora : ''}.`,
          '',
          'Por favor asegúrate de que alguien esté en el domicilio para recibirnos.',
          '',
          'Ante cualquier cambio no dudes en contactarnos.',
          '',
          'Saludos,',
          'Repisas Don Maxi',
        ].join('\n')
      ).catch(e => console.warn('email inst cliente:', e.message))
      sent.push({ tipo: 'inst-cliente', email: clientEmail })
    }

    // ── 2. SEGUIMIENTO: cotizaciones sin respuesta hace 3+ días ───────────────
    let cotizacionesSinRespuesta = []
    if (SHEET_ID) {
      const sheetRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Cotizaciones!A:O',
      }).catch(() => ({ data: { values: [] } }))

      const rows = sheetRes.data.values || []
      const hoy = new Date(now); hoy.setHours(0,0,0,0)
      cotizacionesSinRespuesta = rows.slice(1).filter(r => {
        const status  = r[9] || ''
        const creado  = r[14] || ''
        if (status !== 'por confirmar') return false
        if (!creado) return false
        try {
          const creadoDate = new Date(creado)
          const diff = (hoy - creadoDate) / (1000*60*60*24)
          return diff >= 3
        } catch { return false }
      }).map(r => ({ cotNum: r[0], nombre: r[1], email: r[2], dias: Math.floor((hoy - new Date(r[14])) / (1000*60*60*24)) }))
    }

    // ── 3. SEGUIMIENTO: visitas realizadas sin cotización hace 2+ días ─────────
    let visitasSinCotizar = []
    if (SHEET_ID) {
      const sheetRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Cotizaciones!A:O',
      }).catch(() => ({ data: { values: [] } }))
      const cotRows = (sheetRes.data.values || []).slice(1)
      const cotFechas = new Set(cotRows.map(r => r[5]).filter(Boolean)) // fechaVisita

      const visitRes = await calendar.events.list({
        calendarId: process.env.CALENDAR_ID,
        timeMin: new Date(now.getTime() - 14*24*60*60*1000).toISOString(),
        timeMax: new Date(now.getTime() - 2*24*60*60*1000).toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        sharedExtendedProperty: 'status=realizada',
        maxResults: 50,
      })

      // También buscar en extended properties de visitas realizadas (status guardado en Calendar)
      const allVisitRes = await calendar.events.list({
        calendarId: process.env.CALENDAR_ID,
        timeMin: new Date(now.getTime() - 14*24*60*60*1000).toISOString(),
        timeMax: new Date(now.getTime() - 2*24*60*60*1000).toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 100,
      })
      visitasSinCotizar = (allVisitRes.data.items || [])
        .filter(ev => {
          const isVisita = !ev.extendedProperties?.shared?.created_by?.includes('instalacion')
          const isRealizada = ev.extendedProperties?.shared?.status === 'realizada'
          return isVisita && isRealizada
        })
        .filter(ev => {
          const fechaEv = ev.start?.dateTime || ev.start?.date || ''
          return !cotFechas.has(fechaEv.slice(0,10))
        })
        .map(ev => ({
          nombre: ev.summary?.replace(' — Repisas Don Maxi','').replace('Visita — ','') || '',
          fecha: ev.start?.dateTime?.slice(0,10) || ev.start?.date || '',
          dias: Math.floor((now - new Date(ev.start?.dateTime || ev.start?.date)) / (1000*60*60*24)),
        }))
    }

    // ── 4. RESUMEN AL ADMIN ────────────────────────────────────────────────────
    const lineas = [
      `=== RESUMEN DEL DÍA — ${fmtHuman(tomorrowStr).toUpperCase()} ===`,
      '',
    ]

    if (visitasMañana.length > 0) {
      lineas.push(`📅 VISITAS MAÑANA (${visitasMañana.length}):`)
      visitasMañana.forEach(ev => {
        const hora = ev.start?.dateTime
          ? new Intl.DateTimeFormat('es-CL',{hour:'2-digit',minute:'2-digit',timeZone:'America/Santiago'}).format(new Date(ev.start.dateTime))
          : '?'
        lineas.push(`  • ${hora} — ${ev.summary?.replace(' — Repisas Don Maxi','')}`)
      })
      lineas.push('')
    }

    if (instMañana.length > 0) {
      lineas.push(`🔧 INSTALACIONES MAÑANA (${instMañana.length}):`)
      instMañana.forEach(ev => {
        const hora = ev.start?.dateTime
          ? new Intl.DateTimeFormat('es-CL',{hour:'2-digit',minute:'2-digit',timeZone:'America/Santiago'}).format(new Date(ev.start.dateTime))
          : '?'
        lineas.push(`  • ${hora} — ${ev.extendedProperties?.shared?.cliente || ev.summary?.replace(' — Repisas Don Maxi','')}`)
      })
      lineas.push('')
    }

    if (cotizacionesSinRespuesta.length > 0) {
      lineas.push(`⏰ COTIZACIONES SIN RESPUESTA (${cotizacionesSinRespuesta.length}):`)
      cotizacionesSinRespuesta.forEach(c => {
        lineas.push(`  • N°${c.cotNum} — ${c.nombre} (${c.dias} días sin respuesta)`)
      })
      lineas.push('')
    }

    if (visitasSinCotizar.length > 0) {
      lineas.push(`📋 VISITAS SIN COTIZAR (${visitasSinCotizar.length}):`)
      visitasSinCotizar.forEach(v => {
        lineas.push(`  • ${v.nombre} — visita el ${v.fecha} (${v.dias} días sin cotización)`)
      })
      lineas.push('')
    }

    if (visitasMañana.length === 0 && instMañana.length === 0 && cotizacionesSinRespuesta.length === 0 && visitasSinCotizar.length === 0) {
      lineas.push('Sin actividad pendiente para mañana.')
    }

    const tieneAlgo = visitasMañana.length + instMañana.length + cotizacionesSinRespuesta.length + visitasSinCotizar.length > 0
    if (tieneAlgo) {
      await sendEmail(gmail, ADMIN_EMAIL,
        `Resumen Don Maxi — ${fmtHuman(tomorrowStr)}`,
        lineas.join('\n')
      ).catch(e => console.warn('email admin resumen:', e.message))
      sent.push({ tipo: 'admin-resumen', email: ADMIN_EMAIL })
    }

    return {
      statusCode: 200, headers: corsHeaders,
      body: JSON.stringify({ ok: true, sent, tomorrowStr }),
    }
  } catch (err) {
    console.error('send-reminders error:', err)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok: false, error: String(err) }) }
  }
}

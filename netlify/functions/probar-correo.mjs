// netlify/functions/probar-correo.mjs — admin
// Envia un correo de prueba a NOTIFY_EMAIL (o repisas@donmaxi.cl) y devuelve la causa exacta si Google
// lo rechaza. Sirve para saber por que no salen los correos de las cotizaciones.
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { enviarCorreoGmail, explicarErrorCorreo } from './lib/correo.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': AUTH_HEADERS,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const responder = (statusCode, body) => ({ statusCode, headers: corsHeaders, body: JSON.stringify(body) })

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  const denied = requireAdmin(event, corsHeaders)
  if (denied) return denied
  if (event.httpMethod !== 'POST') return responder(405, { ok: false, error: 'Método no permitido' })

  const para = process.env.NOTIFY_EMAIL || 'repisas@donmaxi.cl'
  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const gmail = google.gmail({ version: 'v1', auth })
    // Desde que cuenta sale: la del token. Si falla, el error de abajo lo explica.
    const remitente = await gmail.users.getProfile({ userId: 'me' }).then(r => r.data.emailAddress).catch(() => '')
    await enviarCorreoGmail(gmail, {
      para,
      asunto: 'Prueba de correo — Repisas Don Maxi',
      texto: 'Si recibes este correo, el envío de cotizaciones y recordatorios funciona.',
    })
    return responder(200, { ok: true, para, remitente })
  } catch (err) {
    const { causa, detalle } = explicarErrorCorreo(err)
    console.error('probar-correo:', causa, detalle)
    return responder(200, { ok: false, para, causa, detalle })
  }
}

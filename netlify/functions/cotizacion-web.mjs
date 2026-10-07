// netlify/functions/cotizacion-web.mjs — publico, lo usa la pagina /cotiza
//   GET  → tabla de precios (la planilla), para mostrar el valor de cada modulo mientras se arma
//   POST → { cliente, modulos, proyecto3d, vistas, sitio } crea la cotizacion y la envia por correo
// Las reglas viven en lib/cotizacion-web.mjs.
import { google } from 'googleapis'
import { generateQuotePdf } from './lib/quote-pdf.mjs'
import { almacenSheets } from './lib/cotizaciones.mjs'
import { ErrorCotizacionWeb, procesarCotizacionWeb } from './lib/cotizacion-web.mjs'
import { enviarCorreoGmail } from './lib/correo.mjs'
import { leerTablaPrecios } from './lib/precios-planilla.mjs'
import { subirPdfCotizacion } from './lib/drive-pdf.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const responder = (statusCode, body, extra = {}) => ({ statusCode, headers: { ...corsHeaders, ...extra }, body: JSON.stringify(body) })

function google_() {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return { sheets: google.sheets({ version: 'v4', auth }), drive: google.drive({ version: 'v3', auth }), gmail: google.gmail({ version: 'v1', auth }) }
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }

  try {
    const { sheets, drive, gmail } = google_()

    if (event.httpMethod === 'GET') {
      const tabla = await leerTablaPrecios(sheets, process.env.PRECIOS_SHEET_ID)
      // Unos minutos de cache bastan: la planilla cambia poco y cada visita no necesita leerla.
      return responder(200, { ok: true, tabla }, { 'Cache-Control': 'public, max-age=300' })
    }
    if (event.httpMethod !== 'POST') return responder(405, { ok: false, error: 'Método no permitido' })
    if (!process.env.GOOGLE_SHEET_ID) return responder(500, { ok: false, error: 'Cotizaciones no configuradas' })
    if ((event.body || '').length > 15e6) return responder(413, { ok: false, error: 'La solicitud es demasiado grande' })

    let body
    try { body = JSON.parse(event.body || '{}') } catch { return responder(400, { ok: false, error: 'Solicitud inválida' }) }

    const resultado = await procesarCotizacionWeb(body, {
      tabla: await leerTablaPrecios(sheets, process.env.PRECIOS_SHEET_ID),
      almacen: almacenSheets(sheets, process.env.GOOGLE_SHEET_ID),
      generarPdf: generateQuotePdf,
      subirPdf: datos => subirPdfCotizacion(drive, datos),
      enviarCorreo: correo => enviarCorreoGmail(gmail, correo),
      avisoA: process.env.NOTIFY_EMAIL || 'repisasdonmaxi@gmail.com',
    })
    return responder(200, { ok: true, ...resultado })
  } catch (err) {
    if (err instanceof ErrorCotizacionWeb || err?.estado) return responder(err.estado, { ok: false, error: err.message })
    console.error('cotizacion-web error:', err)
    return responder(500, { ok: false, error: 'No pudimos procesar la cotización. Intenta de nuevo en un momento.' })
  }
}

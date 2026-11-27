// netlify/functions/contabilidad.mjs — Admin → Contabilidad (solo admin). Ver lib/contabilidad*.mjs.
//   GET ?mes=AAAA-MM                         → movimientos con sugerencias, resumen, costos fijos, Mercado Pago
//   POST { accion: 'subir', pdf (base64), nombre }      → lee la cartola de BCI y agrega lo nuevo
//   POST { accion: 'clasificar', id, categoria?, cotNum?, fijo?, nota?, recordar? }
//   POST { accion: 'aceptar', ids }                      → confirma lo sugerido
//   POST { accion: 'manual', fecha, glosa, monto, categoria? } | { accion: 'borrar', id }
//   POST { accion: 'guardar-fijo', fijo, movimiento? } | { accion: 'borrar-fijo', id }
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { ahoraEnZona } from './lib/horarios.mjs'
import { almacenSheets, listarCotizaciones } from './lib/cotizaciones.mjs'
import { ErrorContabilidad, almacenContabilidadSheets, cambiarContabilidad, leerContabilidad, pagosMercadoPagoDelMes } from './lib/contabilidad-servicio.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': AUTH_HEADERS,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store',
}
const responder = (statusCode, body) => ({ statusCode, headers: corsHeaders, body: JSON.stringify(body) })

async function leerPdf(buffer) {
  const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
  return (await pdfParse(buffer)).text
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  const denied = requireAdmin(event, corsHeaders)
  if (denied) return denied
  const SHEET_ID = process.env.GOOGLE_SHEET_ID
  if (!SHEET_ID) return responder(500, { ok: false, error: 'GOOGLE_SHEET_ID no configurado' })
  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const sheets = google.sheets({ version: 'v4', auth })
    const cotizacionesAlmacen = almacenSheets(sheets, SHEET_ID)
    const fuentes = {
      almacen: almacenContabilidadSheets(sheets, SHEET_ID),
      cotizaciones: async () => (await listarCotizaciones(cotizacionesAlmacen)).quotes,
      pagosMercadoPago: process.env.MP_ACCESS_TOKEN ? pagosMercadoPagoDelMes(process.env.MP_ACCESS_TOKEN) : null,
      leerPdf,
    }
    const hoy = ahoraEnZona().fecha
    if (event.httpMethod === 'GET') {
      const pedido = event.queryStringParameters?.mes
      const mes = /^\d{4}-\d{2}$/.test(pedido || '') ? pedido : hoy.slice(0, 7)
      return responder(200, { ok: true, hoy, ...(await leerContabilidad(fuentes, mes, hoy)) })
    }
    if (event.httpMethod === 'POST') {
      let datos
      try { datos = JSON.parse(event.body || '{}') } catch { return responder(400, { ok: false, error: 'JSON inválido' }) }
      return responder(200, { ok: true, ...(await cambiarContabilidad(fuentes, datos)) })
    }
    return responder(405, { ok: false, error: 'Método no permitido' })
  } catch (err) {
    if (err instanceof ErrorContabilidad) return responder(err.estado, { ok: false, error: err.message })
    console.error('contabilidad error:', err)
    return responder(500, { ok: false, error: 'No se pudo leer o guardar la contabilidad' })
  }
}

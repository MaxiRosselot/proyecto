// netlify/functions/presupuesto-conjunto.mjs — Admin → Cotizaciones → "Juntar cotizaciones".
//   POST { cliente: { nombre, telefono, direccion, email }, bodegas: [{ cotNum, titulo, repisas, adicionales, grafica3d }] }
//   → el PDF (lib/presupuesto-pdf.mjs). Las vistas 3D las dibuja el panel, como en generate-quote.
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { generarPresupuestoPdf } from './lib/presupuesto-pdf.mjs'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': AUTH_HEADERS, 'Access-Control-Allow-Methods': 'POST, OPTIONS' }

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Método no permitido' }) }
  const denied = requireAdmin(event, corsHeaders)
  if (denied) return denied
  let data
  try { data = JSON.parse(event.body || '{}') } catch { return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'JSON inválido' }) } }
  try {
    const { bytes, neto, iva, total, numero } = await generarPresupuestoPdf(data)
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="presupuesto.pdf"', 'x-neto': String(neto), 'x-iva': String(iva), 'x-total': String(total), 'x-numero': encodeURIComponent(numero) },
      body: bytes.toString('base64'),
      isBase64Encoded: true,
    }
  } catch (err) {
    console.error('presupuesto-conjunto error:', err)
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: err.message || String(err) }) }
  }
}

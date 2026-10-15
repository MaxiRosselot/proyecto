// netlify/functions/pagos.mjs — admin
//   POST { accion: 'registrar', cotNum, monto, medio, fecha, nota? }
//   POST { accion: 'borrar', cotNum, id }
//   POST { accion: 'boleta', cotNum, id, boleta }   (N° de la boleta emitida en el SII)
//   POST { accion: 'confirmar-transferencia', cotNum }  → pago, instalacion agendada y correo al cliente
//   POST { accion: 'rechazar-transferencia', cotNum, motivo? } → libera el bloque reservado
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { respuestaDeError } from './lib/cotizaciones.mjs'
import { serviciosGoogle } from './lib/google-servicios.mjs'
import { anotarBoleta, borrarPago, registrarPago } from './lib/pagos.mjs'
import { confirmarTransferenciaYAvisar, rechazarTransferencia } from './lib/reservas-admin.mjs'

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
  try {
    let datos
    try { datos = JSON.parse(event.body || '{}') } catch { return responder(400, { ok: false, error: 'JSON inválido' }) }
    const google = serviciosGoogle()
    const { almacen } = google
    if (datos.accion === 'registrar') return responder(200, { ok: true, ...(await registrarPago(almacen, datos)) })
    if (datos.accion === 'borrar') return responder(200, { ok: true, ...(await borrarPago(almacen, datos)) })
    if (datos.accion === 'boleta') return responder(200, { ok: true, ...(await anotarBoleta(almacen, datos)) })
    if (datos.accion === 'confirmar-transferencia') return responder(200, { ok: true, ...(await confirmarTransferenciaYAvisar(google, datos)) })
    if (datos.accion === 'rechazar-transferencia') return responder(200, { ok: true, ...(await rechazarTransferencia(almacen, datos)) })
    return responder(400, { ok: false, error: 'Acción desconocida' })
  } catch (err) {
    return respuestaDeError(err, corsHeaders)
  }
}

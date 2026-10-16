// netlify/functions/planilla.mjs — admin. La planilla de instalaciones (Admin → Instalaciones).
//   POST { accion: 'actualizar', cotNum, cambios }   nota, documento, instalada, fecha/horas, montos...
//   POST { accion: 'crear', nombre, fecha?, inicio?, fin?, telefono?, direccion?, nota? }
//   POST { accion: 'cancelar', cotNum }
//   POST { accion: 'enlazar', cotNum, eventId }     enlaza la venta con un evento que ya esta en el calendario
//   POST { accion: 'importar', ventas, simular? }     historial desde el Excel (ver lib/importar-ventas.mjs)
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { respuestaDeError } from './lib/cotizaciones.mjs'
import { serviciosGoogle } from './lib/google-servicios.mjs'
import { ahoraEnZona } from './lib/horarios.mjs'
import { importarVentas } from './lib/importar-ventas.mjs'
import { actualizarFila, cancelarInstalacion, crearInstalacion, enlazarEvento } from './lib/planilla.mjs'

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
    const { almacen, calendar, calendarId, leerEventos } = serviciosGoogle()
    if (datos.accion === 'actualizar') return responder(200, { ok: true, ...(await actualizarFila(almacen, calendar, calendarId, datos.cotNum, datos.cambios, { leerEventos })) })
    if (datos.accion === 'enlazar') return responder(200, { ok: true, ...(await enlazarEvento(almacen, calendar, calendarId, datos)) })
    if (datos.accion === 'crear') return responder(200, { ok: true, ...(await crearInstalacion(almacen, calendar, calendarId, datos)) })
    if (datos.accion === 'cancelar') return responder(200, { ok: true, ...(await cancelarInstalacion(almacen, calendar, calendarId, datos)) })
    if (datos.accion === 'importar') {
      if (!Array.isArray(datos.ventas) || datos.ventas.length > 5000) return responder(400, { ok: false, error: 'No llegaron las ventas a importar' })
      const reporte = await importarVentas(almacen, datos.ventas, { simular: datos.simular === true, hoy: ahoraEnZona().fecha, calendar, calendarId, leerEventos })
      return responder(200, { ok: true, reporte })
    }
    return responder(400, { ok: false, error: 'Acción desconocida' })
  } catch (err) {
    return respuestaDeError(err, corsHeaders)
  }
}

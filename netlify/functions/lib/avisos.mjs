// Avisos de Telegram de lo que pasa en el panel. Los usan las funciones de Netlify y el entorno
// local (server.mjs), para que ambos avisen igual. Ver lib/telegram.mjs.
import { avisar, avisoCambioEstado, avisoCotizacionCreada, avisoInstalacionAgendada } from './telegram.mjs'
import { linkAgenda } from './mercadopago.mjs'

// Despues de guardar una cotizacion desde el panel (save-quote): nueva, confirmada o rechazada.
export async function avisarGuardado(datos, resultado, opciones = {}) {
  if (!resultado?.respuesta?.ok) return
  if (datos.crear) return avisar(avisoCotizacionCreada({ ...datos, cotNum: resultado.respuesta.cotNum }), opciones)
  const antes = resultado.antes
  if (antes && datos.status && datos.status !== antes.status && ['confirmada', 'rechazada'].includes(datos.status)) {
    const q = { ...antes, ...datos }
    return avisar(avisoCambioEstado(q, datos.status, datos.motivoRechazo, { linkAgenda: linkAgenda(q.cotNum) }), opciones)
  }
}

// Despues de agendar una instalacion desde el panel (instalacion.mjs).
export async function avisarInstalacionAgendada(cotizacion, instalacion, opciones = {}) {
  if (!cotizacion || !instalacion?.fecha) return
  const aviso = avisoInstalacionAgendada(cotizacion, instalacion, { reagendada: Boolean(cotizacion.instalacion?.fecha) })
  return avisar(cotizacion.status !== 'confirmada' ? { ...aviso, texto: `✅ Confirmada · ${aviso.texto}` } : aviso, opciones)
}

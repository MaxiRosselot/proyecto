// Lo que hace el panel con una transferencia avisada por el cliente. Separado de reservas.mjs
// porque ademas manda el correo de confirmacion. google: { almacen, calendar, calendarId, enviarCorreo }.
import { correoReservaConfirmada } from './mensajes.mjs'
import { resumenPagos } from './pagos-resumen.mjs'
import { confirmarTransferencia, rechazarTransferencia } from './reservas.mjs'

export { rechazarTransferencia }

const correoValido = e => /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]{2,}$/.test(String(e || '').trim())

export async function confirmarTransferenciaYAvisar({ almacen, calendar, calendarId, enviarCorreo }, { cotNum }, ahora = Date.now()) {
  const { cotizacion, instalacion } = await confirmarTransferencia(almacen, calendar, calendarId, { cotNum }, ahora)
  let correo = 'sin correo'
  if (instalacion && correoValido(cotizacion.email)) {
    try { await enviarCorreo(correoReservaConfirmada(cotizacion, instalacion, resumenPagos(cotizacion.total, cotizacion.pagos))); correo = 'enviado' }
    catch (e) { console.warn('Confirmación de reserva no enviada:', e.message); correo = 'falló' }
  }
  return { cotizacion, instalacion, correo }
}

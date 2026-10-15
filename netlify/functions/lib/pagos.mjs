// Pagos de una cotizacion: abonos y saldo. Se guardan en la columna S de Cotizaciones.
import { ErrorCotizacion, actualizarCotizacion, obtenerCotizacion } from './cotizaciones.mjs'
import { MEDIOS_PAGO, resumenPagos } from './pagos-resumen.mjs'

export { MEDIOS_PAGO, resumenPagos }

const ISO = /^\d{4}-\d{2}-\d{2}$/
const falla = (ErrorCotizacion, mensaje, estado = 400) => { throw new ErrorCotizacion(estado, mensaje) }

export async function registrarPago(almacen, { cotNum, monto, medio, fecha, nota = '' }, ahora = new Date()) {
  const cotizacion = await obtenerCotizacion(almacen, cotNum)
  if (!cotizacion) falla(ErrorCotizacion, 'Cotización no encontrada', 404)
  const valor = Number(monto)
  if (!Number.isInteger(valor) || valor <= 0) falla(ErrorCotizacion, 'El monto debe ser un número entero mayor que 0')
  const { saldo } = resumenPagos(cotizacion.total, cotizacion.pagos)
  if (valor > saldo) falla(ErrorCotizacion, `El monto supera el saldo pendiente (${'$' + saldo.toLocaleString('es-CL')})`)
  if (!MEDIOS_PAGO.includes(medio)) falla(ErrorCotizacion, 'Elige el medio de pago')
  if (!ISO.test(fecha || '')) falla(ErrorCotizacion, 'Indica la fecha del pago')
  const pago = { id: `p${ahora.getTime().toString(36)}`, fecha, monto: valor, medio, nota: String(nota).trim().slice(0, 200), registrado: ahora.toISOString() }
  const pagos = [...(cotizacion.pagos || []), pago]
  await actualizarCotizacion(almacen, { cotNum: cotizacion.cotNum, pagos })
  return { pagos, resumen: resumenPagos(cotizacion.total, pagos) }
}

// La boleta se emite a mano en el SII: aca se anota su numero en el pago (vacio la quita).
export async function anotarBoleta(almacen, { cotNum, id, boleta }) {
  const cotizacion = await obtenerCotizacion(almacen, cotNum)
  if (!cotizacion) falla(ErrorCotizacion, 'Cotización no encontrada', 404)
  const folio = String(boleta ?? '').trim()
  if (folio && !/^[0-9A-Za-z-]{1,20}$/.test(folio)) falla(ErrorCotizacion, 'El N° de boleta solo puede tener números y letras')
  if (!(cotizacion.pagos || []).some(p => p.id === id)) falla(ErrorCotizacion, 'Pago no encontrado', 404)
  const pagos = cotizacion.pagos.map(p => {
    if (p.id !== id) return p
    const { boleta: _, ...resto } = p
    return folio ? { ...resto, boleta: folio } : resto
  })
  await actualizarCotizacion(almacen, { cotNum: cotizacion.cotNum, pagos })
  return { pagos, resumen: resumenPagos(cotizacion.total, pagos) }
}

export async function borrarPago(almacen, { cotNum, id }) {
  const cotizacion = await obtenerCotizacion(almacen, cotNum)
  if (!cotizacion) falla(ErrorCotizacion, 'Cotización no encontrada', 404)
  const pagos = (cotizacion.pagos || []).filter(p => p.id !== id)
  if (pagos.length === (cotizacion.pagos || []).length) falla(ErrorCotizacion, 'Pago no encontrado', 404)
  await actualizarCotizacion(almacen, { cotNum: cotizacion.cotNum, pagos })
  return { pagos, resumen: resumenPagos(cotizacion.total, pagos) }
}

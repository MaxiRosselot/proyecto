// Totales de una cotizacion, igual que en el PDF: repisas + servicios contratados, IVA 19%.
// Sin dependencias de Node: lo usan el servidor y el panel admin.
import { SERVICIOS } from './marca.mjs'

export function totalesCotizacion(repisas = [], adicionales = {}) {
  const totalRepisas = repisas.reduce((s, r) => s + (Number(r.unidades ?? 1) || 0) * (Number(r.valor) || 0), 0)
  const totalAdicionales = SERVICIOS.reduce((s, [clave, , lista]) =>
    s + (Number(adicionales[`qty_${clave}`]) || 0) * (Number(adicionales[`precio_${clave}`] ?? lista) || 0), 0)
  const subtotal = totalRepisas + totalAdicionales
  const iva = Math.round(subtotal * 0.19)
  return { repisas: totalRepisas, adicionales: totalAdicionales, subtotal, iva, total: subtotal + iva }
}

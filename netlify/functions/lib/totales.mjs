// Totales de una cotizacion, igual que en el PDF: repisas + servicios contratados, menos el
// descuento si lo tiene, IVA 19%. Sin dependencias de Node: lo usan el servidor y el panel admin.
//
// El descuento y los nombres editados de los servicios viajan dentro de "adicionales"
// (descuento_pct, nombre_<clave>), junto a cantidades y precios: asi llegan solos al PDF,
// a la planilla y al reabrir la cotizacion.
import { SERVICIOS } from './marca.mjs'

export const DESCUENTO_MAX = 50

export function porcentajeDescuento(adicionales = {}) {
  const n = Math.round(Number(adicionales?.descuento_pct) || 0)
  return Math.min(DESCUENTO_MAX, Math.max(0, n))
}

// El nombre con que sale el servicio en la cotizacion: el editado, o el de lista.
export function nombreServicio(adicionales = {}, clave) {
  const lista = SERVICIOS.find(([c]) => c === clave)?.[1] || clave
  const propio = String(adicionales?.[`nombre_${clave}`] ?? '').trim().slice(0, 60)
  return propio || lista
}

export function totalesCotizacion(repisas = [], adicionales = {}) {
  const totalRepisas = repisas.reduce((s, r) => s + (Number(r.unidades ?? r.u ?? 1) || 0) * (Number(r.valor ?? r.v) || 0), 0)
  const totalAdicionales = SERVICIOS.reduce((s, [clave, , lista]) =>
    s + (Number(adicionales[`qty_${clave}`]) || 0) * (Number(adicionales[`precio_${clave}`] ?? lista) || 0), 0)
  const bruto = totalRepisas + totalAdicionales
  const descuentoPct = porcentajeDescuento(adicionales)
  const descuento = Math.round(bruto * descuentoPct / 100)
  const subtotal = bruto - descuento
  const iva = Math.round(subtotal * 0.19)
  return { repisas: totalRepisas, adicionales: totalAdicionales, bruto, descuentoPct, descuento, subtotal, iva, total: subtotal + iva }
}

// Numeros del dashboard de Instalaciones: cuanto entra por mes, por servicio y por tipo de trabajo.
// Sin dependencias de Node: lo usan el panel admin y las pruebas.
import { SERVICIOS } from './marca.mjs'
import { resumenPagos } from './pagos-resumen.mjs'

export const CONCEPTOS = [['repisas', 'Repisas'], ...SERVICIOS.map(([clave, nombre]) => [clave, nombre])]
export const TIPOS_TRABAJO = [
  ['solo_repisas', 'Solo repisas'],
  ['con_retiro_orden', 'Repisas + retiro y orden'],
  ['con_otros', 'Repisas + otros servicios'],
]
const IVA = 0.19

// Neto de cada concepto de una cotizacion. Si el subtotal guardado no calza con la suma (precio
// editado a mano), la diferencia queda como "ajuste" para que los totales siempre cuadren.
export function desglose(cotizacion) {
  const adicionales = cotizacion.instalacion?.adicionales || cotizacion.adicionales || {}
  const neto = { repisas: (cotizacion.repisas || []).reduce((s, r) => s + (Number(r.unidades ?? 1) || 0) * (Number(r.valor) || 0), 0) }
  for (const [clave, , lista] of SERVICIOS) {
    neto[clave] = (Number(adicionales[`qty_${clave}`]) || 0) * (Number(adicionales[`precio_${clave}`] ?? lista) || 0)
  }
  const suma = Object.values(neto).reduce((a, b) => a + b, 0)
  const subtotal = Number(cotizacion.subtotal) || suma
  neto.ajuste = subtotal - suma
  return { neto, subtotal, total: Number(cotizacion.total) || Math.round(subtotal * (1 + IVA)) }
}

export function tipoTrabajo(neto) {
  if (neto.retiro_orden > 0) return 'con_retiro_orden'
  return SERVICIOS.some(([clave]) => neto[clave] > 0) ? 'con_otros' : 'solo_repisas'
}

const sumarMeses = (mes, n) => {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
export { sumarMeses }

// Instalaciones agendadas (de cotizaciones no rechazadas), cada una con su desglose y pagos.
export function instalacionesDe(cotizaciones, hoy) {
  return cotizaciones
    .filter(c => c.instalacion?.fecha && c.status !== 'rechazada')
    .map(c => {
      const { neto, subtotal, total } = desglose(c)
      const pago = resumenPagos(total, c.pagos)
      return {
        cotNum: c.cotNum, cliente: c.nombre, direccion: c.direccion, telefono: c.telefono,
        fecha: c.instalacion.fecha, inicio: c.instalacion.inicio, fin: c.instalacion.fin,
        realizada: c.instalacion.fecha < hoy, neto, subtotal, iva: total - subtotal, total,
        tipo: tipoTrabajo(neto), pagado: pago.pagado, saldo: pago.saldo, estadoPago: pago.estado,
      }
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.inicio || '').localeCompare(b.inicio || ''))
}

const sumar = (lista, campo) => lista.reduce((s, i) => s + (typeof campo === 'function' ? campo(i) : i[campo]), 0)

// Todo lo del mes elegido ("2026-10"): totales, por concepto, por tipo, por semana y la tendencia.
export function resumenMes(cotizaciones, mes, hoy, { mesesTendencia = 6 } = {}) {
  const todas = instalacionesDe(cotizaciones, hoy)
  const delMes = todas.filter(i => i.fecha.startsWith(mes))
  const anterior = todas.filter(i => i.fecha.startsWith(sumarMeses(mes, -1)))

  const totales = {
    cantidad: delMes.length,
    realizadas: delMes.filter(i => i.realizada).length,
    neto: sumar(delMes, 'subtotal'), iva: sumar(delMes, 'iva'), total: sumar(delMes, 'total'),
    realizado: sumar(delMes.filter(i => i.realizada), 'total'),
    agendado: sumar(delMes.filter(i => !i.realizada), 'total'),
    realizadoNeto: sumar(delMes.filter(i => i.realizada), 'subtotal'),
    agendadoNeto: sumar(delMes.filter(i => !i.realizada), 'subtotal'),
    cobrado: sumar(delMes, 'pagado'), porCobrar: sumar(delMes, 'saldo'),
    porCobrarRealizadas: sumar(delMes.filter(i => i.realizada), 'saldo'),
  }
  totales.ticketPromedio = delMes.length ? Math.round(totales.total / delMes.length) : 0
  totales.ticketPromedioNeto = delMes.length ? Math.round(totales.neto / delMes.length) : 0
  const totalAnterior = sumar(anterior, 'total')
  totales.mesAnterior = totalAnterior
  totales.variacion = totalAnterior ? Math.round((totales.total - totalAnterior) * 100 / totalAnterior) : null

  const conceptos = [...CONCEPTOS, ['ajuste', 'Ajustes de precio']]
    .map(([clave, nombre]) => {
      const neto = sumar(delMes, i => i.neto[clave] || 0)
      return { clave, nombre, neto, total: Math.round(neto * (1 + IVA)), cantidad: delMes.filter(i => i.neto[clave]).length }
    })
    .filter(c => c.clave !== 'ajuste' || c.neto !== 0)
  const tipos = TIPOS_TRABAJO.map(([clave, nombre]) => {
    const grupo = delMes.filter(i => i.tipo === clave)
    return { clave, nombre, cantidad: grupo.length, neto: sumar(grupo, 'subtotal'), total: sumar(grupo, 'total') }
  })

  // Semanas del mes por dia 1-7, 8-14...; asi siempre son 4 o 5 barras comparables.
  const semanas = [0, 1, 2, 3, 4].map(n => {
    const desde = n * 7 + 1, hasta = n === 4 ? 31 : n * 7 + 7
    const grupo = delMes.filter(i => { const d = Number(i.fecha.slice(8, 10)); return d >= desde && d <= hasta })
    return { nombre: `${desde}–${n === 4 ? 'fin' : hasta}`, cantidad: grupo.length, total: sumar(grupo, 'total'), neto: sumar(grupo, 'subtotal') }
  }).filter((s, n) => n < 4 || s.cantidad)

  const tendencia = Array.from({ length: mesesTendencia }, (_, k) => sumarMeses(mes, k - mesesTendencia + 1)).map(m => {
    const grupo = todas.filter(i => i.fecha.startsWith(m))
    return { mes: m, cantidad: grupo.length, total: sumar(grupo, 'total'), neto: sumar(grupo, 'subtotal') }
  })

  return { mes, totales, conceptos, tipos, semanas, tendencia, instalaciones: delMes }
}

// Resumen de pagos de una cotizacion. Sin dependencias de Node: lo usan el servidor y el panel admin.
export const MEDIOS_PAGO = ['Transferencia', 'Mercado Pago', 'Efectivo', 'Débito o crédito']

export function resumenPagos(total, pagos = []) {
  const totalNum = Math.round(Number(total) || 0)
  const pagado = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0)
  const saldo = Math.max(0, totalNum - pagado)
  const estado = pagado <= 0 ? 'sin pago' : saldo === 0 ? 'pagada' : 'abono'
  return { total: totalNum, pagado, saldo, estado, porcentaje: totalNum ? Math.min(100, Math.round(pagado * 100 / totalNum)) : 0 }
}

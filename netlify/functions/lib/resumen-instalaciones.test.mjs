import test from 'node:test'
import assert from 'node:assert/strict'
import { desglose, resumenMes, sumarMeses, tipoTrabajo } from './resumen-instalaciones.mjs'

const cot = (cotNum, fecha, { repisas = 100000, adicionales = {}, pagos = [], status = 'confirmada', subtotal } = {}) => {
  const extra = Object.keys(adicionales).filter(k => k.startsWith('qty_')).reduce((s, k) => s + adicionales[k] * adicionales['precio_' + k.slice(4)], 0)
  const sub = subtotal ?? repisas + extra
  return {
    cotNum, nombre: 'Cliente ' + cotNum, status, pagos,
    repisas: [{ unidades: 1, valor: repisas }], adicionales,
    subtotal: sub, total: Math.round(sub * 1.19),
    instalacion: fecha ? { fecha, inicio: '10:00', fin: '13:00', adicionales } : null,
  }
}

test('desglose separa repisas y servicios, y deja la diferencia como ajuste', () => {
  const c = cot(1, '2026-10-02', { adicionales: { qty_retiro_orden: 1, precio_retiro_orden: 40000, qty_cajas: 2, precio_cajas: 15000 } })
  const d = desglose(c)
  assert.equal(d.neto.repisas, 100000)
  assert.equal(d.neto.retiro_orden, 40000)
  assert.equal(d.neto.cajas, 30000)
  assert.equal(d.neto.ajuste, 0)
  assert.equal(desglose({ ...c, subtotal: 160000 }).neto.ajuste, -10000)
})

test('tipo de trabajo: retiro y orden manda sobre los otros servicios', () => {
  assert.equal(tipoTrabajo({ repisas: 1, retiro_orden: 0, retiro_basura: 0, cajas: 0, bici: 0 }), 'solo_repisas')
  assert.equal(tipoTrabajo({ repisas: 1, retiro_orden: 0, retiro_basura: 30000, cajas: 0, bici: 0 }), 'con_otros')
  assert.equal(tipoTrabajo({ repisas: 1, retiro_orden: 40000, retiro_basura: 30000, cajas: 0, bici: 0 }), 'con_retiro_orden')
})

test('resumen del mes: totales, cobrado, conceptos, tipos y comparacion con el mes anterior', () => {
  const cotizaciones = [
    cot(1, '2026-10-02', { pagos: [{ monto: 119000 }] }),
    cot(2, '2026-10-20', { adicionales: { qty_retiro_orden: 1, precio_retiro_orden: 40000 }, pagos: [{ monto: 50000 }] }),
    cot(3, '2026-09-15'),
    cot(4, '2026-10-05', { status: 'rechazada' }),
    cot(5, null),
  ]
  const r = resumenMes(cotizaciones, '2026-10', '2026-10-14')
  assert.equal(r.totales.cantidad, 2)
  assert.equal(r.totales.realizadas, 1)
  assert.equal(r.totales.neto, 240000)
  assert.equal(r.totales.total, 119000 + 166600)
  assert.equal(r.totales.realizado, 119000)
  assert.equal(r.totales.agendado, 166600)
  assert.equal(r.totales.cobrado, 169000)
  assert.equal(r.totales.porCobrar, 116600)
  assert.equal(r.totales.porCobrarRealizadas, 0)
  assert.equal(r.totales.mesAnterior, 119000)
  assert.equal(r.totales.variacion, 140)
  assert.deepEqual(r.conceptos.filter(c => c.neto).map(c => [c.clave, c.neto]), [['repisas', 200000], ['retiro_orden', 40000]])
  assert.deepEqual(r.tipos.map(t => [t.clave, t.cantidad]), [['solo_repisas', 1], ['con_retiro_orden', 1], ['con_otros', 0]])
  assert.deepEqual(r.semanas.map(s => s.cantidad), [1, 0, 1, 0])
  assert.deepEqual(r.tendencia.map(t => t.mes), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
  assert.equal(r.tendencia.at(-2).cantidad, 1)
})

test('sumarMeses cruza el cambio de año', () => {
  assert.equal(sumarMeses('2026-01', -1), '2025-12')
  assert.equal(sumarMeses('2026-12', 1), '2027-01')
})

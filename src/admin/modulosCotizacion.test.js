import test from 'node:test'
import assert from 'node:assert/strict'
import { filasDeModulos, filaDesdeProducto, productoCotizacion } from './modulosCotizacion.js'
const rack = {sourceModuleId:'r1',kind:'rack',modelId:'rack-1x3',label:'Rack 3 cajas',lengthCm:61.4644,depthCm:65.3213,heightCm:133.2,levels:3,units:1}
test('rack pricing is manual, survives synchronization, and resets when changing model',()=>{
  const [row]=filasDeModulos([rack],[],[])
  assert.equal(row.v,0)
  assert.equal(filasDeModulos([rack],[{...row,v:120000}],[])[0].v,120000)
  assert.equal(filasDeModulos([{...rack,modelId:'rack-2x3'}],[{...row,v:120000}],[])[0].v,0)
  assert.deepEqual(filasDeModulos([], [row], []),[])
  assert.equal(productoCotizacion(row).label,rack.label)
  assert.equal(productoCotizacion(row).kind,'rack')
})
test('una fila guardada vuelve igual al reabrir la cotizacion', () => {
  const [row] = filasDeModulos([rack], [], [])
  const conPrecio = { ...row, v: 120000 }
  const reabierta = filaDesdeProducto(JSON.parse(JSON.stringify(productoCotizacion(conPrecio))), 0)
  assert.deepEqual(reabierta, conPrecio)
  // Al volver a sincronizar con el 3D el rack conserva el precio que se le habia puesto.
  assert.equal(filasDeModulos([rack], [reabierta], [])[0].v, 120000)
  assert.deepEqual(filaDesdeProducto({ l: 2, p: 0.48, a: 2, n: 4, u: 1, v: 9 }, 3), { id: 'guardada-3', sourceModuleId: undefined, kind: 'shelf', modelId: undefined, label: undefined, l: 2, p: 0.48, a: 2, n: 4, u: 1, v: 9 })
})

test('los laterales extra de la esquina suman $10.000 neto cada uno y viajan a la cotizacion', () => {
  const modulo = { sourceModuleId: 'fondo', lengthCm: 225, depthCm: 48, heightCm: 200, levels: 4, units: 1 }
  const [base] = filasDeModulos([modulo], [], undefined)
  const [conExtra] = filasDeModulos([{ ...modulo, lateralesExtra: 2 }], [base], undefined)
  assert.equal(conExtra.v - base.v, 20000)
  assert.equal(productoCotizacion(conExtra).lateralesExtra, 2)
  assert.equal(filaDesdeProducto(productoCotizacion(conExtra), 0).lateralesExtra, 2)
})

// Datos inventados: el repo es público, nunca poner movimientos reales aquí.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  conSugerencias, estadoFijos, fusionarMovimientos, glosaBase, nombreCalza, normalizarGlosa, pareceFijo,
  parsearCartolaBci, reglaAprendida, remitente, resumenMercadoPago, resumenMes,
} from './contabilidad.mjs'

// Así sale el texto de la cartola mensual con pdf-parse: glosas partidas en líneas, N° de documento
// pegado al nombre, encabezados de página en medio y el resumen al final.
const CARTOLA = `CARTOLA DE CUENTA CORRIENTE
PERIODO30-09-2026 al 30-10-2026
01/10/2026OF CENTRATRANSFER DE A.PEREZ SOTO306036399750  100.000 1.100.000
01/10/2026OF CENTRA
TRASPASO FONDOS OTRO BANCO
EN LINEA
1478206337 50.000  1.050.000
02/10/2026UGCA AUTCOPEC ASISTIDO 113300113300 20.000  1.030.000
FECHASUCURSALDESCRIPCION
N° DE
DOCUMENTO
Y ABONOSSALDO DIARIO

03/10/2026OF CENTRATransfer a BODEGAS SPA910513167  30.000 1.000.000
Resumen del Periodo
Periodo
30-09-2026 al 30-
10-2026
1.000.000-100.000  +  100.000 =1.000.000
`

const MOVIMIENTOS = `Movimientos desde Última Cartola
Fecha: 05/11/2026
Saldo Contable$1.105.000
Saldo Última Cartola$1.000.000
Movimientos Cuenta Corriente
FechaDescripciónSerial DocumentoCargo ($)Abono ($)
02/11/2026
TRASPASO FONDOS OTRO BANCO EN
LINEA
-50.000
03/11/2026  TRANSFER DE DON MAXI SPA150.000
04/11/2026  IMPERIAL MAPOCHO 805714-5.000
05/11/2026  TRANSFER DE N.ROJAS1
05/11/2026  TRANSFER DE N.ROJAS1
05/11/2026  Abono Trf Desde Otro Banco en Linea9.999
`

test('lee la cartola mensual y deduce cargo o abono del saldo', () => {
  const r = parsearCartolaBci(CARTOLA)
  assert.equal(r.formato, 'cartola')
  assert.deepEqual(r.errores, [])
  assert.deepEqual(r.movimientos.map(m => m.monto), [100000, -50000, -20000, -30000])
  assert.equal(r.cuadra, true)
  assert.equal(normalizarGlosa(r.movimientos[0].glosa), 'TRANSFER DE A.PEREZ SOTO')
  assert.equal(normalizarGlosa(r.movimientos[2].glosa), 'COPEC ASISTIDO')
  assert.equal(r.fechaSaldo, '2026-10-30')
})

test('lee "movimientos desde última cartola" con el monto pegado a la glosa', () => {
  const r = parsearCartolaBci(MOVIMIENTOS)
  assert.equal(r.formato, 'movimientos')
  assert.deepEqual(r.movimientos.map(m => m.monto), [-50000, 150000, -5000, 1, 1, 9999])
  assert.equal(r.movimientos[1].glosa, 'TRANSFER DE DON MAXI SPA')
  assert.equal(r.cuadra, false) // 1.000.000 + 105.001 ≠ 1.105.000
  assert.equal(r.saldoFinal, 1105000)
})

test('subir dos veces no duplica, pero dos movimientos iguales el mismo día cuentan dos', () => {
  const leidos = parsearCartolaBci(MOVIMIENTOS).movimientos
  const a = fusionarMovimientos([], leidos)
  assert.equal(a.nuevos.length, 6)
  const b = fusionarMovimientos(a.todos, leidos)
  assert.equal(b.nuevos.length, 0)
  // misma glosa con y sin N° de documento: es el mismo movimiento
  assert.equal(glosaBase('UGCA AUT COPEC ASISTIDO 113300 113300'), glosaBase('COPEC ASISTIDO 113300'))
})

test('reconoce al remitente aunque el banco corte el nombre', () => {
  assert.deepEqual(remitente('TRANSFER DE C.FUENTES T'), { texto: 'C.FUENTES T', inicial: 'C', palabras: ['FUENTES', 'T'] })
  assert.ok(nombreCalza(remitente('TRANSFER DE C.FUENTES T'), 'Camila Fuentes Torres'))
  assert.ok(!nombreCalza(remitente('TRANSFER DE C.FUENTES T'), 'Pedro Fuentes'))
  assert.ok(nombreCalza(remitente('TRANSFER DE FERNANDO ANDR'), 'Fernando Andrés Pérez'))
  assert.ok(nombreCalza(remitente('Abono Terceros 11111111-1 M.ARAYA HER'), 'María Araya Hernández'))
  assert.ok(nombreCalza(remitente('TRANSFER DE A.DE LA FUENT'), 'Ana de la Fuente'))
})

test('sugiere cotización, regla y costo fijo; lo confirmado manda', () => {
  const movs = fusionarMovimientos([], [
    { fecha: '2026-11-03', glosa: 'TRANSFER DE C.FUENTES T', monto: 119000 },
    { fecha: '2026-11-04', glosa: 'TRANSFER DE R.LOPEZ M', monto: 50000 },
    { fecha: '2026-11-05', glosa: 'IMPERIAL MAPOCHO 1', monto: -5000 },
    { fecha: '2026-11-06', glosa: 'TRASPASO FONDOS OTRO BANCO EN LINEA', monto: -438000 },
    { fecha: '2026-11-07', glosa: 'TRASPASO FONDOS OTRO BANCO EN LINEA', monto: -77000 },
  ]).todos
  movs[2].categoria = 'herramientas'
  const cotizaciones = [
    { cotNum: '1500', nombre: 'Camila Fuentes', total: 238000, pagos: [] },
    { cotNum: '1501', nombre: 'Rosa López', total: 90000, pagos: [{ id: 'p1', fecha: '2026-11-03', monto: 50000, medio: 'Transferencia' }] },
  ]
  const fijos = [{ id: 'f1', nombre: 'Bodega', categoria: 'bodega', monto: 440000, dia: 7 }]
  const reglas = [reglaAprendida(movs[4], 'ayudas')]
  const s = conSugerencias(movs, { cotizaciones, fijos, reglas })
  assert.equal(s[0].sugerencia.cotNum, '1500') // 50 % de la cotización, sin registrar
  assert.equal(s[0].sugerencia.registrado, false)
  assert.equal(s[1].sugerencia.cotNum, '1501')
  assert.equal(s[1].sugerencia.registrado, true)
  assert.equal(s[2].categoriaFinal, 'herramientas')
  assert.equal(s[2].confirmado, true)
  assert.equal(s[3].sugerencia.fijo, 'f1')
  assert.equal(s[3].categoriaFinal, 'bodega')
  assert.equal(s[4].categoriaFinal, 'ayudas') // regla aprendida por monto exacto

  const estado = estadoFijos(fijos, s, '2026-11', '2026-11-20')
  assert.equal(estado[0].estado, 'pagado?')
  assert.equal(estadoFijos(fijos, [], '2026-11', '2026-11-20')[0].estado, 'vencido')
  assert.equal(estadoFijos(fijos, [], '2026-11', '2026-11-05')[0].estado, 'por vencer')
})

test('resultado del mes: con datos de MP el retiro al banco no se cuenta dos veces', () => {
  const movs = conSugerencias(fusionarMovimientos([], [
    { fecha: '2026-11-03', glosa: 'TRANSFER DE DON MAXI SPA', monto: 95000 },
    { fecha: '2026-11-04', glosa: 'COPEC 1', monto: -11900 },
  ]).todos)
  const mp = resumenMercadoPago([{ id: 1, status: 'approved', transaction_amount: 100000, fee_details: [{ amount: 5000 }], transaction_details: { net_received_amount: 95000 } }])
  assert.deepEqual([mp.bruto, mp.comision, mp.neto], [100000, 5000, 95000])
  assert.deepEqual(resumenMes(movs, '2026-11', { mp }).conIva, { ingresos: 100000, gastos: 16900, resultado: 83100 })
  assert.deepEqual(resumenMes(movs, '2026-11').conIva, { ingresos: 95000, gastos: 11900, resultado: 83100 })
  assert.equal(resumenMes(movs, '2026-11').sinIva.gastos, 10000)
})

test('detecta cargos que se repiten cada mes', () => {
  const movs = conSugerencias(fusionarMovimientos([], [
    { fecha: '2026-10-13', glosa: 'TRASPASO FONDOS OTRO BANCO EN LINEA 1', monto: -312450 },
    { fecha: '2026-11-13', glosa: 'TRASPASO FONDOS OTRO BANCO EN LINEA 2', monto: -312450 },
    { fecha: '2026-11-14', glosa: 'TRASPASO FONDOS OTRO BANCO EN LINEA 3', monto: -10000 },
  ]).todos)
  const p = pareceFijo(movs)
  assert.equal(p.length, 1)
  assert.equal(p[0].monto, 312450)
  assert.equal(p[0].dia, 13)
})

test('el costo fijo se liga al cargo de monto más parecido, no al primero del mes', () => {
  const movs = fusionarMovimientos([], [
    { fecha: '2026-11-09', glosa: 'TRASPASO FONDOS OTRO BANCO EN LINEA', monto: -315000 },
    { fecha: '2026-11-13', glosa: 'TRASPASO FONDOS OTRO BANCO EN LINEA', monto: -312450 },
  ]).todos
  const s = conSugerencias(movs, { fijos: [{ id: 'f1', nombre: 'Cuota', monto: 312450, dia: 12 }] })
  assert.equal(s[0].sugerencia.fijo, '')
  assert.equal(s[1].sugerencia.fijo, 'f1')
})

test('con el nombre completo de la app de BCI se encuentra al cliente y se recuerda a la persona', async () => {
  const { nombresCalzan, conciliarClientes } = await import('./contabilidad.mjs')
  assert.ok(nombresCalzan('Pablo Andrés Rojas Mena', 'Pablo Rojas'))
  assert.ok(nombresCalzan('Pablo Rojas', 'Pablo Andrés Rojas Mena'))
  assert.ok(!nombresCalzan('Pablo Rojas', 'Pedro Rojas'))
  const movs = fusionarMovimientos([], [
    { fecha: '2026-11-24', glosa: 'TRANSFER DE P.ROJAS ME', monto: 72000 },
    { fecha: '2026-11-25', glosa: 'TRASPASO FONDOS OTRO BANCO EN LINEA', monto: -100000 },
    { fecha: '2026-11-26', glosa: 'TRASPASO FONDOS OTRO BANCO EN LINEA', monto: -35000 },
  ]).todos
  movs[0].contraparte = 'De Pablo Andrés Rojas Mena'
  movs[1].contraparte = 'A Juan Dueño'
  movs[2].contraparte = 'A Juan Dueño'
  const cots = [
    { cotNum: '1600', nombre: 'Pablo Rojas', total: 144000, pagos: [] },
    { cotNum: '1601', nombre: 'Ana Soto', total: 50000, pagos: [{ id: 'p', fecha: '2026-11-10', monto: 50000, medio: 'Transferencia' }] },
  ]
  const reglas = [reglaAprendida(movs[1], 'retiro-maxi')]
  const s = conSugerencias(movs, { cotizaciones: cots, reglas })
  assert.equal(s[0].sugerencia.cotNum, '1600') // 50 % de 144.000
  assert.equal(s[2].categoriaFinal, 'retiro-maxi') // misma persona, otro monto
  const c = conciliarClientes(s, cots, '2026-11')
  assert.deepEqual(c.filas.map(f => [f.cotNum, f.estado]), [['1601', 'no llegó al banco'], ['1600', 'pago sin registrar']])
})

test('lo del banco en línea se junta con la cartola: no se repite y le agrega el nombre completo', async () => {
  const { movimientosDeBancoEnLinea, saldosEncadenan } = await import('./contabilidad.mjs')
  const cartola = fusionarMovimientos([], [
    { fecha: '2026-11-25', glosa: 'TRASPASO FONDOS OTRO BANCO EN LINEA', monto: -100000 },
    { fecha: '2026-11-25', glosa: 'TRANSFER DE P.ROJAS ME', monto: 72000 },
  ]).todos
  // Como lo manda la extensión: lo más nuevo arriba, fecha de operación y fecha contable.
  const web = movimientosDeBancoEnLinea([
    { fecha: '26/11/26', fechaContable: '26/11/26', descripcion: 'Compra con tarjeta de débito en imperial', monto: -5000, saldo: 967000 },
    { fecha: '24/11/26', fechaContable: '25/11/26', descripcion: 'Transferencia enviada a Juan  Dueño', monto: -100000, saldo: 972000 },
    { fecha: '24/11/26', fechaContable: '25/11/26', descripcion: 'Transferencia recibida de Pablo Andrés Rojas Mena', monto: 72000, saldo: 1072000 },
  ])
  assert.equal(web[1].fecha, '2026-11-25')
  assert.equal(web[1].contraparte, 'A Juan Dueño')
  assert.equal(saldosEncadenan(web), true)
  assert.equal(saldosEncadenan([web[0], web[2]]), false)
  const r = fusionarMovimientos(cartola, [...web].reverse(), { origen: 'web' })
  assert.equal(r.nuevos.length, 1) // solo la compra del 26
  assert.equal(r.enriquecidos, 2)
  assert.equal(r.todos.find(m => m.monto === 72000).contraparte, 'De Pablo Andrés Rojas Mena')
  // y una cartola subida después tampoco repite lo que vino del banco en línea
  assert.equal(fusionarMovimientos(r.todos, [{ fecha: '2026-11-26', glosa: 'IMPERIAL MAPOCHO 1', monto: -5000 }]).nuevos.length, 0)
  const s = conSugerencias(r.todos)
  assert.equal(s.find(m => m.monto === -5000).categoriaFinal, 'materiales')
})

test('BCI en línea escribe los días sin cero ("4/11/26")', async () => {
  const { movimientosDeBancoEnLinea } = await import('./contabilidad.mjs')
  const [m] = movimientosDeBancoEnLinea([{ fecha: '4/11/26', fechaContable: '5/11/26', descripcion: 'Transferencia enviada a Juan Pérez', monto: -5770, saldo: 1306294 }])
  assert.equal(m.fecha, '2026-11-05')
  assert.equal(m.fechaOperacion, '2026-11-04')
})

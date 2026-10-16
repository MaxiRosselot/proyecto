import test from 'node:test'
import assert from 'node:assert/strict'
import { almacenEnMemoria, crearCotizacion, listarCotizaciones, obtenerCotizacion } from './cotizaciones.mjs'
import { actualizarFila, cancelarInstalacion, crearInstalacion, enlazarEvento } from './planilla.mjs'
import { cotizacionDesdeVenta, encontrarEncabezado, importarVentas, mismoNombre, ventasDesdeHojas } from './importar-ventas.mjs'
import { normalizarDocumento, sugerirDocumento } from './documentos.mjs'
import { totalesCotizacion } from './totales.mjs'

function calendarFalso() {
  const eventos = new Map(), llamadas = []
  let n = 0
  return {
    eventos, llamadas,
    events: {
      async insert({ requestBody }) { const id = `ev${++n}`; eventos.set(id, requestBody); llamadas.push(['insert', id]); return { data: { id, htmlLink: 'https://cal/' + id } } },
      async patch({ eventId, requestBody }) { eventos.set(eventId, { ...eventos.get(eventId), ...requestBody }); llamadas.push(['patch', eventId]); return { data: { id: eventId } } },
      async delete({ eventId }) { if (!eventos.has(eventId)) throw Object.assign(new Error('gone'), { code: 410 }); eventos.delete(eventId); llamadas.push(['delete', eventId]) },
    },
  }
}

// ── Documento ──
test('codigos de documento: se normalizan como los escribe Maxi', () => {
  assert.equal(normalizarDocumento('b'), 'B')
  assert.equal(normalizarDocumento('B/M'), 'M/B')
  assert.equal(normalizarDocumento('F/M'), 'M/F')
  assert.equal(normalizarDocumento('W-B'), 'W/B')
  assert.equal(normalizarDocumento(' f* '), 'F*')
  assert.equal(normalizarDocumento('-'), '')
  assert.equal(normalizarDocumento('SI'), '')
  assert.equal(sugerirDocumento([{ medio: 'Transferencia' }]), 'B*')
  assert.equal(sugerirDocumento([{ medio: 'Mercado Pago' }]), 'M')
  assert.equal(sugerirDocumento([{ medio: 'Mercado Pago' }, { medio: 'Transferencia' }]), 'M/B*')
})

// ── Importar ──
const ENERO = {
  nombre: 'VENTAS ENERO',
  filas: [
    ['', '', '', '', '', '', '', '', 'MONTO NETO'],
    ['REALIZADO', 'DÍA', 'NOMBRE', 'FECHA', 'HORA INICIO', 'HORA FIN', 'B/F/W', 'PAGADO', 'REPISAS', 'RETIRO', 'SOPORTE', 'ESCOMBROS', 'NETO TOTAL', 'MONTO BRUTO'],
    [false, 'MARTES', 'LUIS ARENAS', '2025-01-14', '14:00', '16:00', 'W', 'SI', 170000, 0, 0, 0, 170000, 202300],
    [false, 'SÁBADO', 'CAMILA', '2025-01-18', '14:00', '16:00', 'B', 'SI', 140000, 30000, 0, 30000, 200000, 238000],
    [false, '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ],
  pintadas: [false, false, true, true, false],
}
const AÑO = {
  nombre: 'VENTAS 2026',
  // Otras columnas, otro orden y un resumen a la derecha que repite "PAGADO".
  filas: [
    ['', false, '', '', '', '', '', '', '', 'MONTO NETO'],
    ['DÍA', false, 'NOMBRE', 'FECHA', 'HORA INICIO', 'HORA FIN', '', 'B/F/W', 'PAGADO', 'REPISAS', 'RETIRO', 'SOPORTE', 'ESCOMBROS', 'DESPACHO', 'RACKS', 'NETO TOTAL', 'MONTO BRUTO', '', 'CLIENTES', 'TOTAL', 'PAGADO'],
    ['CAJAS PENDIENTES', false, 'IMBERG OJEDA', '2026-09-16', '13:00', '16:00', '', 'B', 'NO', '$300.000', 40000, 0, 0, 0, 100000, 440000, 523600, '', 79, 1, 2],
    ['', false, 'DIEGO ORTIZ', '2026-10-20', '13:00', '16:00', '', '', '', 0, 0, 0, 0, 0, 0, 0, 0],
    ['VALPARAISO', false, 'VALENTINA SPOERER', '', '', '', '', 'b/m', 'SI', 140000, 0, 0, 0, 225000, 0, 365000, 434350],
  ],
  pintadas: [false, false, true, false, true],
}
const BANCO = { nombre: 'ENERO 2025', filas: [['', 1050667], ['FECHA', 'MOVIMIENTO', 'TIPO', 'MONTO'], ['2025-01-01', 'VENTA WEBPAY', 'ABONO', 99585]] }

test('lee cada hoja de ventas por el nombre de sus columnas e ignora las del banco', () => {
  assert.equal(encontrarEncabezado(BANCO.filas), null)
  const { ventas, hojasLeidas, hojasIgnoradas } = ventasDesdeHojas([ENERO, AÑO, BANCO])
  assert.deepEqual(hojasIgnoradas, ['ENERO 2025'])
  assert.deepEqual(hojasLeidas.map(h => [h.nombre, h.ventas]), [['VENTAS ENERO', 2], ['VENTAS 2026', 3]])
  const [luis, camila, imberg, diego, valentina] = ventas
  assert.deepEqual([luis.nombre, luis.fecha, luis.inicio, luis.documento, luis.pagado, luis.instalada, luis.nota], ['Luis Arenas', '2025-01-14', '14:00', 'W', true, true, ''])
  assert.deepEqual([camila.retiro_orden, camila.retiro_basura, camila.neto], [30000, 30000, 200000])
  assert.deepEqual([imberg.nota, imberg.pagado, imberg.repisas, imberg.racks, imberg.neto], ['CAJAS PENDIENTES', false, 300000, 100000, 440000])
  assert.equal(diego.instalada, false)
  assert.deepEqual([valentina.fecha, valentina.documento, valentina.despacho, valentina.nota], ['', 'M/B', 225000, 'VALPARAISO'])
})

test('cada venta pasa a ser una venta confirmada con sus montos, instalacion y pago', () => {
  const { ventas } = ventasDesdeHojas([ENERO, AÑO])
  const camila = cotizacionDesdeVenta(ventas[1], 12)
  assert.equal(camila.status, 'confirmada')
  assert.deepEqual([camila.subtotal, camila.total, camila.iva], [200000, 238000, 38000])
  assert.deepEqual(camila.adicionales, { qty_retiro_orden: 1, precio_retiro_orden: 30000, qty_retiro_basura: 1, precio_retiro_basura: 30000 })
  assert.equal(totalesCotizacion(camila.repisas, camila.adicionales).subtotal, 200000)
  assert.deepEqual(camila.pagos.map(p => [p.monto, p.medio]), [[238000, 'Transferencia']])
  assert.deepEqual(camila.instalacion, { fecha: '2025-01-18', inicio: '14:00', fin: '16:00', instalada: true, nota: '', documento: 'B', origen: 'excel', excel: 'CAMILA|2025-01-18|200000' })
  const imberg = cotizacionDesdeVenta(ventas[2], 13)
  assert.deepEqual(imberg.repisas.map(r => [r.label, r.valor]), [['Repisas', 300000], ['Racks', 100000]])
  assert.deepEqual(imberg.pagos, [])
  const valentina = cotizacionDesdeVenta(ventas[4], 14)
  assert.equal(valentina.adicionales.despacho, 225000)
  assert.equal(valentina.pagos[0].medio, 'Mercado Pago y transferencia')
})

test('importar: numeros bajo el inicial, no duplica, completa lo que ya existe y enlaza el calendario', async () => {
  const almacen = almacenEnMemoria()
  // Ya en el panel: Imberg (agendada desde el cotizador, sin documento) y una cotizacion nueva.
  await crearCotizacion(almacen, { crear: true, cotNum: 1500, nombre: 'Imberg Ojeda Soto', status: 'confirmada', instalacion: { fecha: '2026-09-16', inicio: '13:00', fin: '16:00' } })
  const calendar = calendarFalso()
  calendar.eventos.set('script1', { summary: 'DIEGO ORTIZ' })
  const { ventas } = ventasDesdeHojas([ENERO, AÑO])
  const leerEventos = async () => [{ id: 'script1', tipo: 'otro', fecha: '2026-10-20', titulo: 'DIEGO ORTIZ', link: 'https://cal/script1' }]

  const simulado = await importarVentas(almacen, ventas, { simular: true, hoy: '2026-10-16' })
  assert.deepEqual([simulado.nuevas, simulado.existentes, simulado.completadas, simulado.sinFecha, simulado.proximas], [4, 1, 1, 1, 1])
  assert.equal((await listarCotizaciones(almacen)).quotes.length, 1)

  const r = await importarVentas(almacen, ventas, { hoy: '2026-10-16', calendar, calendarId: 'cal', leerEventos })
  assert.deepEqual([r.nuevas, r.enlazadas, r.sinEvento], [4, 1, []])
  const { quotes } = await listarCotizaciones(almacen)
  assert.deepEqual(quotes.map(q => Number(q.cotNum)).sort((a, b) => a - b), [1, 2, 3, 4, 1500])
  assert.equal((await obtenerCotizacion(almacen, 1500)).instalacion.documento, 'B')
  assert.equal((await obtenerCotizacion(almacen, 1500)).instalacion.nota, 'CAJAS PENDIENTES')
  const diego = quotes.find(q => q.nombre === 'Diego Ortiz')
  assert.equal(diego.instalacion.eventId, 'script1')
  assert.equal(calendar.eventos.get('script1').extendedProperties.shared.cot_num, String(diego.cotNum))
  // La primera por fecha recibe el N° 1.
  assert.equal(quotes.find(q => q.nombre === 'Luis Arenas').cotNum, '1')

  // Aunque en el panel se le cambie la fecha (o se cancele), reimportar el mismo Excel no la duplica.
  await actualizarFila(almacen, null, 'cal', diego.cotNum, { fecha: '2026-10-27' })
  const otraVez = await importarVentas(almacen, ventas, { hoy: '2026-10-16', calendar, calendarId: 'cal', leerEventos })
  assert.deepEqual([otraVez.nuevas, otraVez.existentes], [0, 5])
})

test('mismo cliente aunque el nombre venga corto o con tildes', () => {
  assert.ok(mismoNombre('SERGIO', 'Sergio Ruiz Tagle'))
  assert.ok(mismoNombre('JOSÉ URZÚA', 'Jose Urzua'))
  assert.ok(!mismoNombre('Sergio', 'Sebastián'))
})

// ── Planilla ──
test('editar una fila: nota, documento, instalada, montos y el evento se mueve con la fecha', async () => {
  const almacen = almacenEnMemoria(), calendar = calendarFalso()
  const { cotizacion } = await crearInstalacion(almacen, calendar, 'cal', { nombre: 'Andrea Paz', fecha: '2026-10-24', inicio: '16:00', fin: '18:00' })
  assert.equal(cotizacion.status, 'confirmada')
  assert.equal(cotizacion.instalacion.eventId, 'ev1')
  assert.equal(calendar.eventos.get('ev1').summary, 'Instalación - Andrea Paz')

  // Aun sin montos: se le ponen al instalar, con un retiro de basura y despacho.
  const sinMontos = await actualizarFila(almacen, calendar, 'cal', cotizacion.cotNum, { adicionales: { qty_retiro_basura: 1, precio_retiro_basura: 30000, despacho: 50000 } })
  assert.equal(Number(sinMontos.cotizacion.subtotal), 80000)
  assert.equal(Number(sinMontos.cotizacion.total), 95200)

  const r = await actualizarFila(almacen, calendar, 'cal', cotizacion.cotNum, { nota: 'Fabricar repisa especial', documento: 'b*', instalada: true, fecha: '2026-10-25' })
  assert.deepEqual([r.cotizacion.instalacion.nota, r.cotizacion.instalacion.documento, r.cotizacion.instalacion.instalada], ['Fabricar repisa especial', 'B*', true])
  assert.equal(calendar.eventos.get('ev1').start.dateTime, '2026-10-25T16:00:00')
  assert.deepEqual(calendar.llamadas.map(l => l[0]), ['insert', 'patch'])

  // Sin cambiar fecha ni nombre, el calendario no se toca.
  await actualizarFila(almacen, calendar, 'cal', cotizacion.cotNum, { nota: 'otra' })
  assert.equal(calendar.llamadas.length, 2)
  await assert.rejects(actualizarFila(almacen, calendar, 'cal', cotizacion.cotNum, { inicio: '18:00', fin: '16:00' }), /término debe ser después/)
})

test('una fila del Excel sin evento enlazado: al cambiarle la hora mueve el evento del script, no crea otro', async () => {
  const almacen = almacenEnMemoria(), calendar = calendarFalso()
  await crearCotizacion(almacen, { crear: true, cotNum: 7, nombre: 'Carlos Belmar', status: 'confirmada', instalacion: { fecha: '2026-10-17', inicio: '10:00', fin: '13:00', origen: 'excel' } })
  calendar.eventos.set('script9', { summary: 'CARLOS BELMAR repisas bodega' })
  const leerEventos = async desde => (desde === '2026-10-17' ? [{ id: 'script9', tipo: 'otro', fecha: '2026-10-17', titulo: 'CARLOS BELMAR repisas bodega' }] : [])
  const r = await actualizarFila(almacen, calendar, 'cal', 7, { fin: '11:00' }, { leerEventos })
  assert.equal(r.cotizacion.instalacion.eventId, 'script9')
  assert.deepEqual(calendar.llamadas.map(l => l[0]), ['patch'])
  assert.equal(calendar.eventos.get('script9').end.dateTime, '2026-10-17T11:00:00')
  assert.equal(calendar.eventos.get('script9').extendedProperties.shared.cot_num, '7')
})

test('enlazar a mano: el evento elegido pasa a la hora de la fila', async () => {
  const almacen = almacenEnMemoria(), calendar = calendarFalso()
  await crearCotizacion(almacen, { crear: true, cotNum: 8, nombre: 'Vivian', status: 'confirmada', instalacion: { fecha: '2026-10-16', inicio: '14:00', fin: '16:00' } })
  calendar.eventos.set('otro1', { summary: 'Bodega Providencia' })
  const r = await enlazarEvento(almacen, calendar, 'cal', { cotNum: 8, eventId: 'otro1' })
  assert.equal(r.cotizacion.instalacion.eventId, 'otro1')
  assert.equal(calendar.eventos.get('otro1').start.dateTime, '2026-10-16T14:00:00')
  assert.equal((await obtenerCotizacion(almacen, 8)).instalacion.eventId, 'otro1')
})

test('cancelar: queda rechazada con motivo y se borra el evento', async () => {
  const almacen = almacenEnMemoria(), calendar = calendarFalso()
  const { cotizacion } = await crearInstalacion(almacen, calendar, 'cal', { nombre: 'Ximena Correa', fecha: '2026-10-24', inicio: '10:00', fin: '13:00' })
  await cancelarInstalacion(almacen, calendar, 'cal', { cotNum: cotizacion.cotNum })
  const q = await obtenerCotizacion(almacen, cotizacion.cotNum)
  assert.deepEqual([q.status, q.motivoRechazo, calendar.eventos.size], ['rechazada', 'Canceló', 0])
})

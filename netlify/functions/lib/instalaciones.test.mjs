import test from 'node:test'
import assert from 'node:assert/strict'
import { almacenEnMemoria, crearCotizacion, obtenerCotizacion } from './cotizaciones.mjs'
import { agendarInstalacion, duracionTexto, invitarClienteInstalacion, totalesCotizacion } from './instalaciones.mjs'

// Calendar falso: guarda lo que se le pide.
function calendarFalso() {
  const eventos = new Map(), llamadas = []
  let n = 0
  return {
    eventos, llamadas,
    events: {
      async insert({ calendarId, sendUpdates, requestBody }) {
        const id = `ev${++n}`; eventos.set(id, { ...requestBody }); llamadas.push({ tipo: 'insert', calendarId, sendUpdates, id })
        return { data: { id, htmlLink: `https://calendar.example/${id}` } }
      },
      async patch({ eventId, sendUpdates, requestBody }) {
        eventos.set(eventId, { ...eventos.get(eventId), ...requestBody }); llamadas.push({ tipo: 'patch', sendUpdates, id: eventId })
        return { data: { id: eventId, htmlLink: `https://calendar.example/${eventId}` } }
      },
    },
  }
}

async function cotizacion(datos = {}) {
  const almacen = almacenEnMemoria()
  await crearCotizacion(almacen, {
    crear: true, nombre: 'Ana María Pérez Soto', email: 'ana@example.cl', telefono: '+56 9 1234 5678', direccion: 'Los Aromos 123, Ñuñoa',
    subtotal: 200000, iva: 38000, total: 238000,
    repisas: [{ largo: 2.43, prof: .48, alto: 2, niveles: 4, unidades: 1, valor: 110000 }, { largo: 1.57, prof: .48, alto: 2, niveles: 4, unidades: 1, valor: 90000 }],
    adicionales: {}, ...datos,
  })
  return almacen
}
const agenda = { cotNum: 1421, fecha: '2026-10-20', inicio: '10:00', fin: '13:30' }

test('agenda la instalacion en el calendario, invita al cliente y confirma la cotizacion', async () => {
  const almacen = await cotizacion(), calendar = calendarFalso()
  const r = await agendarInstalacion(almacen, calendar, 'repisas@donmaxi.cl', { ...agenda, adicionales: { qty_cajas: 4, precio_cajas: 12000 } })

  const ev = calendar.eventos.get(r.instalacion.eventId)
  assert.equal(ev.summary, 'Instalación - Ana María Pérez Soto')
  assert.deepEqual(ev.start, { dateTime: '2026-10-20T10:00:00', timeZone: 'America/Santiago' })
  assert.deepEqual(ev.end, { dateTime: '2026-10-20T13:30:00', timeZone: 'America/Santiago' })
  assert.deepEqual(ev.attendees, [{ email: 'ana@example.cl' }])
  assert.equal(ev.location, 'Los Aromos 123, Ñuñoa')
  assert.match(ev.description, /Cajas organizadoras × 4 \(\$12\.000 c\/u\)/)
  assert.equal(ev.extendedProperties.shared.created_by, 'instalacion-donmaxi')
  assert.deepEqual(calendar.llamadas.map(l => [l.tipo, l.calendarId, l.sendUpdates]), [['insert', 'repisas@donmaxi.cl', 'all']])

  // El servicio agregado despues de enviar la cotizacion suma al total: 200.000 + 48.000 + IVA.
  const guardada = await obtenerCotizacion(almacen, 1421)
  assert.equal(guardada.status, 'confirmada')
  assert.equal(Number(guardada.total), 295120)
  assert.equal(guardada.adicionales.qty_cajas, 4)
  assert.deepEqual({ ...guardada.instalacion, agendadaEn: undefined }, { ...r.instalacion, agendadaEn: undefined })
  assert.equal(guardada.instalacion.invitado, 'ana@example.cl')
})

test('sin correo agenda igual, sin invitar; despues se puede invitar', async () => {
  const almacen = await cotizacion({ email: '' }), calendar = calendarFalso()
  const r = await agendarInstalacion(almacen, calendar, 'cal', { ...agenda, adicionales: {} })
  assert.deepEqual(calendar.eventos.get(r.instalacion.eventId).attendees, [])
  assert.equal(calendar.llamadas[0].sendUpdates, 'none')
  assert.equal(r.instalacion.invitado, '')

  await invitarClienteInstalacion(almacen, calendar, 'cal', { cotNum: 1421, email: 'Nuevo@Example.cl' })
  assert.deepEqual(calendar.eventos.get(r.instalacion.eventId).attendees, [{ email: 'nuevo@example.cl' }])
  assert.equal(calendar.llamadas.at(-1).sendUpdates, 'all')
  const guardada = await obtenerCotizacion(almacen, 1421)
  assert.equal(guardada.email, 'nuevo@example.cl')
  assert.equal(guardada.instalacion.invitado, 'nuevo@example.cl')
})

test('volver a agendar mueve el mismo evento en vez de crear otro', async () => {
  const almacen = await cotizacion(), calendar = calendarFalso()
  const primera = await agendarInstalacion(almacen, calendar, 'cal', { ...agenda, adicionales: {} })
  const segunda = await agendarInstalacion(almacen, calendar, 'cal', { ...agenda, fecha: '2026-10-22', inicio: '15:00', fin: '17:00', adicionales: {} })
  assert.equal(segunda.instalacion.eventId, primera.instalacion.eventId)
  assert.equal(calendar.eventos.size, 1)
  assert.equal(calendar.eventos.get(primera.instalacion.eventId).start.dateTime, '2026-10-22T15:00:00')
  assert.equal((await obtenerCotizacion(almacen, 1421)).instalacion.fecha, '2026-10-22')
})

test('valida horario, correo y servicios', async () => {
  const almacen = await cotizacion(), calendar = calendarFalso()
  await assert.rejects(agendarInstalacion(almacen, calendar, 'cal', { ...agenda, fin: '09:00', adicionales: {} }), /después de la de inicio/)
  await assert.rejects(agendarInstalacion(almacen, calendar, 'cal', { ...agenda, fecha: '', adicionales: {} }), /fecha/)
  await assert.rejects(agendarInstalacion(almacen, calendar, 'cal', { ...agenda, email: 'no-es-correo', adicionales: {} }), /correo/)
  await assert.rejects(agendarInstalacion(almacen, calendar, 'cal', { ...agenda, adicionales: { qty_cajas: -1 } }), /cantidad/)
  await assert.rejects(agendarInstalacion(almacen, calendar, 'cal', { ...agenda, cotNum: 9999, adicionales: {} }), { estado: 404 })
  assert.equal(calendar.eventos.size, 0)
})

test('totales y duracion como en el PDF', () => {
  assert.deepEqual(totalesCotizacion([{ unidades: 2, valor: 100000 }], { qty_bici: 1 }), { repisas: 200000, adicionales: 20000, despacho: 0, bruto: 220000, descuentoPct: 0, descuento: 0, subtotal: 220000, iva: 41800, total: 261800 })
  assert.equal(duracionTexto('10:00', '13:30'), '3 h 30 min')
  assert.equal(duracionTexto('10:00', '12:00'), '2 h')
  assert.equal(duracionTexto('10:00', '10:45'), '45 min')
})

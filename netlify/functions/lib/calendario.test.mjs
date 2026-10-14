import test from 'node:test'
import assert from 'node:assert/strict'
import { eventoParaVista, eventosEntre, rangoUTC, tipoEvento } from './calendario.mjs'

const instalacion = {
  id: 'i1', summary: 'Instalación - Ana Pérez', htmlLink: 'https://cal/i1', location: 'Los Aromos 123',
  start: { dateTime: '2026-10-17T10:00:00-03:00' }, end: { dateTime: '2026-10-17T13:30:00-03:00' },
  attendees: [{ email: 'ana@example.cl' }],
  extendedProperties: { shared: { created_by: 'instalacion-donmaxi', cliente: 'Ana Pérez', cot_num: '1421' } },
}
const visita = {
  id: 'v1', summary: 'Visita — Pedro Soto (Repisas Don Maxi)',
  description: 'Cliente: Pedro Soto\nEmail: p@x.cl\nCelular: +56 9 1111 2222\nDirección: Calle 1',
  start: { dateTime: '2026-10-18T13:00:00Z' }, end: { dateTime: '2026-10-18T13:15:00Z' },
  extendedProperties: { shared: { created_by: 'agendador-netlify', slot_key: '2026-10-18T10:00' } },
}
const personal = { id: 'o1', summary: 'Dentista', start: { date: '2026-10-19' }, end: { date: '2026-10-20' } }

test('clasifica y arma cada evento con lo que necesita la vista', () => {
  assert.deepEqual([instalacion, visita, personal].map(tipoEvento), ['instalacion', 'visita', 'otro'])
  const cot = { cotNum: '1421', nombre: 'Ana Pérez', telefono: '+56 9 5555 6666', direccion: 'Los Aromos 123', total: 238000, pagos: [{ monto: 119000 }] }
  const i = eventoParaVista(instalacion, new Map([['1421', cot]]))
  assert.equal(i.cliente, 'Ana Pérez')
  assert.deepEqual([i.fecha, i.inicio, i.fin, i.minutoInicio, i.minutoFin], ['2026-10-17', '10:00', '13:30', 600, 810])
  assert.equal(i.telefono, '+56 9 5555 6666')
  assert.deepEqual(i.pago, { total: 238000, pagado: 119000, saldo: 119000, estado: 'abono', porcentaje: 50 })

  const v = eventoParaVista(visita)
  assert.deepEqual([v.cliente, v.telefono, v.ubicacion, v.fecha, v.inicio], ['Pedro Soto', '+56 9 1111 2222', 'Calle 1', '2026-10-18', '10:00'])

  const o = eventoParaVista(personal)
  assert.equal(o.todoElDia, true)
  assert.equal(o.fecha, '2026-10-19')
})

test('pide al calendario el rango de dias de Chile y todas las paginas', async () => {
  assert.deepEqual(rangoUTC('2026-10-17', '2026-10-18'), { timeMin: '2026-10-17T03:00:00.000Z', timeMax: '2026-10-19T03:00:00.000Z' })
  const pedidos = []
  const calendar = { events: { async list(p) {
    pedidos.push(p)
    return p.pageToken ? { data: { items: [visita, { ...personal, status: 'cancelled' }] } } : { data: { items: [instalacion], nextPageToken: 'dos' } }
  } } }
  const eventos = await eventosEntre(calendar, 'cal', '2026-10-17', '2026-10-18')
  assert.deepEqual(eventos.map(e => e.id), ['i1', 'v1'])
  assert.equal(pedidos.length, 2)
  assert.equal(pedidos[0].singleEvents, true)
})

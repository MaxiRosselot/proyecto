import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificar, enQueVa, mensajesPara, rellenar } from './moduloWhatsapp.js'

const hoy = '2026-11-25'
const creada = dia => Date.parse(dia + 'T15:00:00Z')
const qs = [
  { cotNum: '1', nombre: 'Ana Soto', status: 'por confirmar', creadoMs: creada('2026-11-20') },
  { cotNum: '2', nombre: 'Beto', status: 'por confirmar', creadoMs: creada('2026-11-25') },
  { cotNum: '3', nombre: 'Caro', status: 'por confirmar', creadoMs: creada('2026-11-01'), seguimiento: { preguntas: ['2026-11-10'], esperarHasta: '2027-01-05' } },
  { cotNum: '4', nombre: 'Dani', status: 'confirmada', creadoMs: creada('2026-11-02') },
  { cotNum: '5', nombre: 'Eli', status: 'confirmada', creadoMs: creada('2026-11-03'), instalacion: { fecha: '2026-11-28', inicio: '10:00', fin: '13:00' } },
  { cotNum: '6', nombre: 'Fede', status: 'confirmada', creadoMs: creada('2026-11-04'), instalacion: { fecha: '2026-11-26', inicio: '13:00', fin: '15:00' } },
  { cotNum: '7', nombre: 'Excel', status: 'confirmada', instalacion: { origen: 'excel', fecha: '2026-12-01', inicio: '10:00' } },
]

test('clasifica a los clientes en sus filtros', () => {
  const c = clasificar(qs, hoy)
  const n = l => l.map(q => q.cotNum)
  assert.deepEqual(n(c.toca), ['1'])
  assert.deepEqual(n(c.porconfirmar), ['2', '1', '3'])
  assert.deepEqual(n(c.esperando), ['3'])
  assert.deepEqual(n(c.agendar), ['4'])
  assert.deepEqual(n(c.proximas), ['6', '5'])
  assert.equal(c.todos.length, 6)
})

test('dice en que va cada cliente', () => {
  assert.deepEqual(enQueVa(qs[0], hoy), { texto: 'Toca preguntar · sin preguntar', tono: 'ambar' })
  assert.equal(enQueVa(qs[2], hoy).texto, 'Esperando hasta mar, 5 ene')
  assert.equal(enQueVa(qs[3], hoy).tono, 'ambar')
  assert.match(enQueVa(qs[4], hoy).texto, /^Instala .* · 10:00$/)
})

test('los mensajes dependen de en que va el cliente', () => {
  const ids = q => mensajesPara({ ...q, linkAgenda: 'https://x/agendar' }, hoy).map(m => m.id)
  assert.deepEqual(ids(qs[0]), ['sin-respuesta', 'sigue-disponible', 'ajustes', 'pospuso', 'cotizacion'])
  assert.deepEqual(ids(qs[3]), ['cotizacion'])
  assert.deepEqual(ids(qs[4]), ['agendada', 'confirmar', 'vispera'])
  const conManana = mensajesPara(qs[5], hoy, { eventoManana: { tipo: 'instalacion', cliente: 'Fede', fecha: '2026-11-26', inicio: '13:00', fin: '15:00' } })
  assert.equal(conManana[0].id, 'recordatorio')
})

test('rellena los mensajes rapidos', () => {
  const q = { nombre: 'Ana Soto', cotNum: '1500', total: 119000, linkAgenda: 'https://a', linkPago: 'https://p' }
  assert.equal(rellenar('Hola {nombre}, la N° {cotizacion} es {total}. Agenda: {agendar} Paga: {pagar}', q), 'Hola Ana, la N° 1500 es $119.000. Agenda: https://a Paga: https://p')
  assert.equal(rellenar('Hola {nombre}, ¿cómo estás?'), 'Hola, ¿cómo estás?')
  assert.equal(rellenar('{nombre}, ¿me mandas fotos?'), '¿me mandas fotos?')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { horasParaReagendar, liberarHoraVisita, reagendarVisita } from './visitas.mjs'

// Sabados de 10:00 a 11:00 (horas 10:00 y 10:30), dos semanas.
const horario = { semanal: { 6: [{ desde: '10:00', hasta: '11:00' }] }, fechas: {}, semanas: 2 }
const ahora = new Date('2026-10-16T12:00:00-03:00') // viernes

function calendarFalso(eventos) {
  const patches = []
  return {
    patches,
    events: {
      list: async () => ({ data: { items: eventos } }),
      get: async ({ eventId }) => ({ data: structuredClone(eventos.find(e => e.id === eventId)) }),
      patch: async ({ eventId, requestBody, sendUpdates }) => {
        patches.push({ eventId, requestBody, sendUpdates })
        Object.assign(eventos.find(e => e.id === eventId), requestBody)
        return { data: {} }
      },
    },
  }
}
const visita = (id, slot) => ({
  id, description: `Cliente: X\nSlot: ${slot.replace('T', ' ')} (15min)`,
  start: { dateTime: slot + ':00-03:00' }, end: { dateTime: slot.replace(/:(\d\d)$/, (_, m) => ':' + String(Number(m) + 15).padStart(2, '0')) + ':00-03:00' },
  extendedProperties: { shared: { slot_key: slot, created_by: 'agendador-netlify' } },
})

test('reagendar ofrece solo las horas del horario que no tomo otra visita', async () => {
  const cal = calendarFalso([visita('a', '2026-10-17T10:00')])
  const dias = await horasParaReagendar(cal, 'cal', horario, ahora)
  assert.deepEqual(dias, [{ fecha: '2026-10-17', horas: ['10:30'] }, { fecha: '2026-10-24', horas: ['10:00', '10:30'] }])
})

test('reagendar mueve el evento, mantiene la duracion y avisa al cliente', async () => {
  const cal = calendarFalso([visita('a', '2026-10-17T10:00'), visita('b', '2026-10-17T10:30')])
  const r = await reagendarVisita(cal, 'cal', horario, { visitId: 'a', fecha: '2026-10-24', hora: '10:30' }, ahora)
  assert.equal(r.slotKey, '2026-10-24T10:30')
  const [p] = cal.patches
  assert.equal(p.sendUpdates, 'all')
  assert.equal(new Date(p.requestBody.start.dateTime).toISOString(), new Date('2026-10-24T10:30:00-03:00').toISOString())
  assert.equal(new Date(p.requestBody.end.dateTime) - new Date(p.requestBody.start.dateTime), 15 * 60000)
  assert.equal(p.requestBody.extendedProperties.shared.slot_key, '2026-10-24T10:30')
  assert.equal(p.requestBody.extendedProperties.shared.created_by, 'agendador-netlify')
  assert.match(p.requestBody.description, /Slot: 2026-10-24 10:30/)
  // A una hora ya tomada o fuera del horario, no.
  await assert.rejects(reagendarVisita(cal, 'cal', horario, { visitId: 'a', fecha: '2026-10-17', hora: '10:30' }, ahora), /ya la tomó otra visita/)
  await assert.rejects(reagendarVisita(cal, 'cal', horario, { visitId: 'a', fecha: '2026-10-24', hora: '15:00' }, ahora), /no está disponible/)
})

test('cancelar deja la hora libre para otro cliente', async () => {
  const cal = calendarFalso([visita('a', '2026-10-17T10:00')])
  assert.deepEqual(await liberarHoraVisita(cal, 'cal', 'a'), { liberada: true })
  assert.equal(cal.patches[0].requestBody.extendedProperties.shared.slot_key, '')
  assert.equal(cal.patches[0].sendUpdates, 'none')
  assert.deepEqual((await horasParaReagendar(cal, 'cal', horario, ahora))[0], { fecha: '2026-10-17', horas: ['10:00', '10:30'] })
})

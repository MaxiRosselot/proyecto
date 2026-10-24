import test from 'node:test'
import assert from 'node:assert/strict'
import { fijarHoraVisita, horasParaReagendar, liberarHoraVisita, reagendarVisita, visitaParaCupo } from './visitas.mjs'
import { diasConRangos, estadoRango, rangosVisitaDelDia, validarHorario } from './horarios.mjs'

// Sabados de 8:00 a 14:00 (rangos 8–11 y 11–14), cupo 2, dos semanas.
const horario = { semanal: { 6: [{ desde: '08:00', hasta: '14:00' }] }, fechas: {}, semanas: 2, cupo: 2 }
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
// Una visita con rango (como las crea /visita ahora) o con hora exacta (las antiguas).
const conRango = (id, fecha, desde, hasta) => ({
  id, description: `Cliente: X\nSlot: ${fecha} ${desde}-${hasta}`,
  start: { dateTime: `${fecha}T${desde}:00-03:00` }, end: { dateTime: `${fecha}T${hasta}:00-03:00` },
  extendedProperties: { shared: { slot_key: `${fecha}R${desde}`, rango: `${desde}-${hasta}`, created_by: 'agendador-netlify' } },
})
const exacta = (id, fecha, hora) => ({
  id, description: `Slot: ${fecha} ${hora} (15min)`, start: { dateTime: `${fecha}T${hora}:00-03:00` }, end: { dateTime: `${fecha}T${hora}:15-03:00` },
  extendedProperties: { shared: { slot_key: `${fecha}T${hora}`, created_by: 'agendador-netlify' } },
})

test('rangos: se ofrecen los que caen al menos 1 h en el horario y con cupo', () => {
  assert.deepEqual(rangosVisitaDelDia(horario, '2026-10-17', ahora).map(r => r.desde), ['08:00', '11:00'])
  // Abierto de 10 a 13: 8–11 tiene solo 1 h (sirve), 11–14 tiene 2 h, 14–17 nada.
  assert.deepEqual(rangosVisitaDelDia({ ...horario, semanal: { 6: [{ desde: '10:00', hasta: '13:00' }] } }, '2026-10-17', ahora).map(r => r.desde), ['08:00', '11:00'])
  // Hoy a las 12:00: 8–11 ya paso; 11–14 todavia (queda 1 h despues de la anticipacion de 1 h). A las 12:30, ya no.
  const sabado = new Date('2026-10-17T12:00:00-03:00')
  assert.deepEqual(rangosVisitaDelDia(horario, '2026-10-17', sabado).map(r => r.desde), ['11:00'])
  assert.deepEqual(rangosVisitaDelDia(horario, '2026-10-17', new Date('2026-10-17T12:30:00-03:00')), [])
  const dias = diasConRangos(horario, [{ fecha: '2026-10-17', rango: '08:00' }, { fecha: '2026-10-17', rango: '08:00' }, { fecha: '2026-10-17', rango: '11:00' }], ahora)
  assert.deepEqual(dias[0], { fecha: '2026-10-17', rangos: [{ desde: '11:00', hasta: '14:00', libres: 1 }] })
  assert.equal(estadoRango(horario, [{ fecha: '2026-10-17', rango: '08:00' }, { fecha: '2026-10-17', rango: '08:00' }], '2026-10-17', '08:00', ahora), 'lleno')
  assert.equal(estadoRango(horario, [], '2026-10-17', '14:00', ahora), 'fuera')
  assert.equal(estadoRango(horario, [], '2026-10-17', '11:00', ahora), 'ok')
  assert.equal(validarHorario({ semanal: {}, semanas: 2 }, '2026-10-16').cupo, 6)
  assert.throws(() => validarHorario({ semanal: {}, semanas: 2, cupo: 0 }, '2026-10-16'), /cupo/)
})

test('las visitas antiguas con hora exacta ocupan cupo en su rango; las canceladas no', () => {
  assert.deepEqual(visitaParaCupo(exacta('a', '2026-10-17', '12:30')), { id: 'a', fecha: '2026-10-17', rango: '11:00' })
  assert.deepEqual(visitaParaCupo(conRango('b', '2026-10-17', '08:00', '11:00')), { id: 'b', fecha: '2026-10-17', rango: '08:00' })
  const cancelada = conRango('c', '2026-10-17', '08:00', '11:00'); cancelada.extendedProperties.shared.slot_key = ''
  assert.equal(visitaParaCupo(cancelada), null)
})

test('reagendar ofrece rangos con cupo y mueve la visita a todo el rango', async () => {
  const cal = calendarFalso([conRango('a', '2026-10-17', '08:00', '11:00'), conRango('b', '2026-10-17', '11:00', '14:00'), exacta('c', '2026-10-17', '11:30')])
  const dias = await horasParaReagendar(cal, 'cal', horario, ahora, { excepto: 'a' })
  assert.deepEqual(dias[0], { fecha: '2026-10-17', rangos: [{ desde: '08:00', hasta: '11:00', libres: 2 }] })
  await assert.rejects(reagendarVisita(cal, 'cal', horario, { visitId: 'a', fecha: '2026-10-17', hora: '11:00' }, ahora), /ya tiene 2 visitas/)
  await assert.rejects(reagendarVisita(cal, 'cal', horario, { visitId: 'a', fecha: '2026-10-17', hora: '15:00' }, ahora), /no está disponible/)
  const r = await reagendarVisita(cal, 'cal', horario, { visitId: 'a', fecha: '2026-10-24', hora: '11:00' }, ahora)
  assert.equal(r.slotKey, '2026-10-24R11:00')
  const [p] = cal.patches
  assert.equal(p.sendUpdates, 'all')
  assert.equal(new Date(p.requestBody.start.dateTime).toISOString(), new Date('2026-10-24T11:00:00-03:00').toISOString())
  assert.equal(new Date(p.requestBody.end.dateTime).toISOString(), new Date('2026-10-24T14:00:00-03:00').toISOString())
  assert.equal(p.requestBody.extendedProperties.shared.rango, '11:00-14:00')
  assert.match(p.requestBody.description, /Slot: 2026-10-24 11:00-14:00/)
})

test('fijar la hora de la ruta: el evento dura la visita y conserva su rango', async () => {
  const cal = calendarFalso([exacta('c', '2026-10-17', '12:30')])
  await fijarHoraVisita(cal, 'cal', { visitId: 'c', fecha: '2026-10-17', hora: '11:20' })
  const [p] = cal.patches
  assert.equal(p.sendUpdates, 'none')
  assert.equal(new Date(p.requestBody.end.dateTime) - new Date(p.requestBody.start.dateTime), 15 * 60000)
  assert.deepEqual([p.requestBody.extendedProperties.shared.rango, p.requestBody.extendedProperties.shared.hora_ruta], ['11:00-14:00', '11:20'])
})

test('cancelar deja el cupo libre para otro cliente', async () => {
  const cal = calendarFalso([conRango('a', '2026-10-17', '08:00', '11:00'), conRango('b', '2026-10-17', '08:00', '11:00')])
  assert.equal((await horasParaReagendar(cal, 'cal', horario, ahora))[0].rangos[0].desde, '11:00')
  assert.deepEqual(await liberarHoraVisita(cal, 'cal', 'a'), { liberada: true })
  assert.equal(cal.patches[0].requestBody.extendedProperties.shared.slot_key, '')
  assert.deepEqual((await horasParaReagendar(cal, 'cal', horario, ahora))[0].rangos.map(r => [r.desde, r.libres]), [['08:00', 1], ['11:00', 2]])
})

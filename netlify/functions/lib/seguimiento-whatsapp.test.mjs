import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoSeguimiento, mensajePregunta, quitarPregunta, quitarRespuesta, registrarPregunta, registrarRespuesta } from './seguimiento-whatsapp.mjs'

const creada = dia => Date.parse(dia + 'T15:00:00Z')
const q = (extra = {}) => ({ cotNum: '1700', nombre: 'Carmen Pérez', status: 'por confirmar', creadoMs: creada('2026-11-10'), ...extra })

test('seguimiento whatsapp: anotar preguntas (una por dia) y la respuesta', () => {
  let s = registrarPregunta(null, '2026-11-12')
  s = registrarPregunta(s, '2026-11-12')
  s = registrarPregunta(s, '2026-11-15')
  assert.deepEqual(s, { preguntas: ['2026-11-12', '2026-11-15'] })
  assert.deepEqual(registrarRespuesta(s, '2026-11-16'), { preguntas: ['2026-11-12', '2026-11-15'], respondio: '2026-11-16' })
})

test('seguimiento whatsapp: a quien le toca preguntar', () => {
  // Nunca preguntado: desde los 2 dias de enviada.
  assert.equal(estadoSeguimiento(q({ creadoMs: creada('2026-11-21') }), '2026-11-22').tocaPreguntar, false)
  assert.equal(estadoSeguimiento(q(), '2026-11-22').tocaPreguntar, true)
  // Preguntado hace 2 dias: todavia no; a los 3, si.
  const preguntado = q({ seguimiento: { preguntas: ['2026-11-12', '2026-11-20'] } })
  assert.deepEqual(estadoSeguimiento(preguntado, '2026-11-22'), { veces: 2, ultima: '2026-11-20', diasDesdeUltima: 2, respondio: null, tocaPreguntar: false })
  assert.equal(estadoSeguimiento(preguntado, '2026-11-23').tocaPreguntar, true)
  // Respondio despues de la ultima pregunta: no toca; si se le vuelve a preguntar despues, cuenta de nuevo.
  assert.equal(estadoSeguimiento(q({ seguimiento: { preguntas: ['2026-11-12'], respondio: '2026-11-13' } }), '2026-11-22').tocaPreguntar, false)
  assert.equal(estadoSeguimiento(q({ seguimiento: { preguntas: ['2026-11-12', '2026-11-18'], respondio: '2026-11-13' } }), '2026-11-22').respondio, null)
  // Confirmadas o rechazadas: nunca.
  assert.equal(estadoSeguimiento(q({ status: 'confirmada' }), '2026-11-22').tocaPreguntar, false)
})

test('seguimiento whatsapp: anotar con fecha atrasada y corregir', () => {
  // Respondio el 20; se anota una pregunta del 18 que no estaba: la respuesta sigue valiendo.
  const s = registrarPregunta({ preguntas: ['2026-11-15'], respondio: '2026-11-20' }, '2026-11-18')
  assert.deepEqual(s, { preguntas: ['2026-11-15', '2026-11-18'], respondio: '2026-11-20' })
  // Una pregunta nueva despues de la respuesta la deja atras.
  assert.deepEqual(registrarPregunta(s, '2026-11-24'), { preguntas: ['2026-11-15', '2026-11-18', '2026-11-24'] })
  assert.deepEqual(quitarPregunta(s, '2026-11-15'), { preguntas: ['2026-11-18'], respondio: '2026-11-20' })
  assert.deepEqual(quitarRespuesta(s), { preguntas: ['2026-11-15', '2026-11-18'] })
})

test('seguimiento whatsapp: el mensaje usa el primer nombre y el numero', () => {
  assert.match(mensajePregunta(q()), /^Hola Carmen, ¿alcanzaste a ver la cotización N° 1700/)
})

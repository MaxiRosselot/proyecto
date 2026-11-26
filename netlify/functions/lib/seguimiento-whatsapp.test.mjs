import test from 'node:test'
import assert from 'node:assert/strict'
import { marcarYaCompro, anotarBitacora, esperarHasta, estadoSeguimiento, haySeguimiento, mensajePregunta, mensajesSeguimiento, quitarDeBitacora, quitarPregunta, quitarRespuesta, registrarPregunta, registrarRespuesta } from './seguimiento-whatsapp.mjs'

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
  assert.deepEqual(estadoSeguimiento(preguntado, '2026-11-22'), { veces: 2, ultima: '2026-11-20', diasDesdeUltima: 2, respondio: null, tocaPreguntar: false, esperando: null, yaCompro: null })
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

test('seguimiento whatsapp: esperar hasta una fecha (el cliente pospuso)', () => {
  const s = esperarHasta({ preguntas: ['2026-11-12'], respondio: '2026-11-13' }, '2027-01-05')
  assert.deepEqual(s, { preguntas: ['2026-11-12'], respondio: '2026-11-13', esperarHasta: '2027-01-05' })
  // Mientras espera no toca preguntar, aunque hayan pasado los dias.
  const e = estadoSeguimiento(q({ seguimiento: { preguntas: ['2026-11-12'], esperarHasta: '2027-01-05' } }), '2026-12-20')
  assert.equal(e.tocaPreguntar, false); assert.equal(e.esperando, '2027-01-05')
  // Llegada la fecha toca preguntar, aunque haya respondido antes.
  assert.equal(estadoSeguimiento(q({ seguimiento: s }), '2027-01-05').tocaPreguntar, true)
  assert.equal(estadoSeguimiento(q({ seguimiento: s }), '2027-01-05').esperando, null)
  // Preguntar ese dia termina la espera; quitar la espera la borra.
  assert.deepEqual(registrarPregunta(s, '2027-01-05'), { preguntas: ['2026-11-12', '2027-01-05'] })
  assert.equal(registrarPregunta(s, '2026-12-01').esperarHasta, '2027-01-05')
  assert.deepEqual(esperarHasta(s, ''), { preguntas: ['2026-11-12'], respondio: '2026-11-13' })
})

test('seguimiento whatsapp: la bitacora se conserva al anotar preguntas', () => {
  let s = anotarBitacora(null, '2026-11-20', '  Pidió 5 niveles  ')
  s = anotarBitacora(s, '2026-11-21', '')
  assert.deepEqual(s, { preguntas: [], bitacora: [{ fecha: '2026-11-20', texto: 'Pidió 5 niveles' }] })
  assert.equal(haySeguimiento(s), true)
  s = registrarRespuesta(registrarPregunta(s, '2026-11-22'), '2026-11-23')
  assert.deepEqual(s.bitacora, [{ fecha: '2026-11-20', texto: 'Pidió 5 niveles' }])
  assert.deepEqual(quitarDeBitacora({ preguntas: [], bitacora: s.bitacora }, 0), { preguntas: [] })
  assert.equal(haySeguimiento({ preguntas: [] }), false)
})

test('seguimiento whatsapp: mensajes a elegir', () => {
  const m = mensajesSeguimiento(q())
  assert.deepEqual(m.map(x => x.id), ['sin-respuesta', 'sigue-disponible', 'ajustes', 'pospuso'])
  assert.ok(m.every(x => x.texto.includes('N° 1700') && x.texto.startsWith('Hola Carmen')))
})

test('seguimiento whatsapp: no se pregunta por cotizaciones de clientes que ya compraron con otra', () => {
  const qs = marcarYaCompro([
    q({ cotNum: '10', telefono: '+56 9 1111 2222' }),
    { cotNum: '11', nombre: 'Carmen P', telefono: '911112222', status: 'confirmada', creadoMs: creada('2026-11-12') },
    q({ cotNum: '20', nombre: 'Luis Rojas Díaz', telefono: '' }),
    { cotNum: '21', nombre: 'luis rojas', status: 'confirmada', instalacion: { origen: 'excel', fecha: '2026-11-20' } },
    q({ cotNum: '30', nombre: 'Ana Soto', telefono: '933334444' }),
    { cotNum: '31', nombre: 'Ana Soto', telefono: '933334444', status: 'confirmada', creadoMs: creada('2025-03-01'), instalacion: { fecha: '2025-03-10' } },
    q({ cotNum: '40', nombre: 'Ana Soto', telefono: '955556666' }),
    q({ cotNum: '50', nombre: 'Oscar Gutierrez', telefono: '977778888' }),
    { cotNum: '51', nombre: 'Óscar Gutiérrez ', telefono: '966667777', status: 'confirmada', creadoMs: creada('2026-11-15') },
    q({ cotNum: '60', nombre: 'Javier Pino', telefono: '922223333' }),
    { cotNum: '61', nombre: 'Javier Pino', telefono: '922223333', status: 'rechazada', instalacion: { fecha: '2026-11-25' } },
  ])
  const por = n => qs.find(x => x.cotNum === n)
  assert.deepEqual(por('10').yaCompro, { cotNum: '11', fecha: '2026-11-12' })
  assert.equal(por('20').yaCompro.cotNum, '21') // sin celular: por nombre
  assert.equal(por('30').yaCompro, undefined) // compró antes de esta cotizacion: es un pedido nuevo
  assert.equal(por('40').yaCompro, undefined) // mismo nombre, pero esa compra es anterior
  assert.equal(por('50').yaCompro.cotNum, '51') // mismo nombre y apellido con otro celular
  assert.equal(por('60').yaCompro, undefined) // rechazada aunque tenga fecha: no es compra
  assert.equal(estadoSeguimiento(por('10'), '2026-11-22').tocaPreguntar, false)
  assert.equal(estadoSeguimiento(por('30'), '2026-11-22').tocaPreguntar, true)
})

test('seguimiento whatsapp: numero sin WhatsApp no sale en "toca preguntar" hasta que se corrija', async () => {
  const { marcarSinWhatsapp, quitarSinWhatsapp, sinWhatsapp } = await import('./seguimiento-whatsapp.mjs')
  const base = q({ cotNum: '70', telefono: '+56 9 6531 7634' })
  const marcada = { ...base, seguimiento: marcarSinWhatsapp(base.seguimiento, base.telefono, '2026-11-26') }
  assert.deepEqual(marcada.seguimiento.sinWhatsapp, { fecha: '2026-11-26', tel: '65317634' })
  assert.equal(haySeguimiento(marcada.seguimiento), true)
  assert.equal(sinWhatsapp(marcada), true)
  assert.equal(estadoSeguimiento(marcada, '2026-11-26').tocaPreguntar, false)
  assert.equal(sinWhatsapp({ ...marcada, telefono: '+56 9 6531 7635' }), false) // corrigio el numero
  assert.equal(sinWhatsapp({ ...marcada, seguimiento: quitarSinWhatsapp(marcada.seguimiento) }), false)
})

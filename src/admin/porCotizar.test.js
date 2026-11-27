import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NOTA_WEB, armarPorCotizar, diasEsperando, mensajePedirDatosInstagram } from './porCotizar.js'
import { NOTA_WEB as NOTA_SERVIDOR } from '../../netlify/functions/lib/cotizacion-web.mjs'

const hoy = '2026-11-27'
const ahoraMs = Date.parse('2026-11-27T15:00:00Z')
const creada = dia => Date.parse(dia + 'T15:00:00Z')

test('la nota de la cotización web es la misma que pone el servidor', () => {
  assert.equal(NOTA_WEB, NOTA_SERVIDOR)
})

test('junta anotadas, carpetas, visitas realizadas y cotizaciones web', () => {
  const { pendientes, hechas } = armarPorCotizar({
    hoy, ahoraMs,
    anotadas: [
      { id: 'pc1', origen: 'whatsapp', ref: '', creado: '2026-11-25', nombre: 'Ana', telefono: '+56911111111', estado: 'pendiente' },
      { id: 'pc2', origen: 'instagram', ref: '', creado: '2026-11-26', nombre: '', instagram: 'beto', estado: 'pendiente' },
      { id: 'pc3', origen: 'correo', ref: 'carpeta2', creado: '2026-11-20', estado: 'descartada' },
    ],
    carpetas: [
      { origen: 'correo', ref: 'carpeta1', creado: '2026-11-22', nombre: 'Caro', telefono: '+56922222222' },
      { origen: 'correo', ref: 'carpeta2', creado: '2026-11-20', nombre: 'Spam' },
    ],
    visitas: [
      { id: 'v1', status: 'realizada', start: '2026-11-24T14:00:00-03:00', nombre: 'Dani', celular: '933333333' },
      { id: 'v2', status: 'realizada_cotizada', start: '2026-11-23T14:00:00-03:00', nombre: 'Eli' },
      { id: 'v3', status: 'pendiente', start: '2026-11-28T14:00:00-03:00', nombre: 'Fede' },
    ],
    cotizaciones: [
      { cotNum: '1800', notas: NOTA_WEB, status: 'por confirmar', creadoMs: creada('2026-11-26'), nombre: 'Gabi', telefono: '944444444' },
      { cotNum: '1700', notas: NOTA_WEB, status: 'por confirmar', creadoMs: creada('2026-10-01'), nombre: 'Vieja' },
      { cotNum: '1801', notas: NOTA_WEB, status: 'confirmada', creadoMs: creada('2026-11-26'), nombre: 'Ya compró' },
    ],
  })
  assert.deepEqual(pendientes.map(p => p.clave), ['correo:carpeta1', 'visita:v1', 'a:pc1', 'a:pc2', 'web:1800'])
  assert.equal(pendientes[0].dias, 5)
  assert.deepEqual(hechas.map(h => h.clave), ['correo:carpeta2'])
})

test('queda cotizada sola si después se cotizó a ese celular', () => {
  const { pendientes, hechas } = armarPorCotizar({
    hoy, ahoraMs,
    anotadas: [
      { id: 'pc1', origen: 'whatsapp', creado: '2026-11-25', nombre: 'Ana', telefono: '9 1111 1111', estado: 'pendiente' },
      { id: 'pc2', origen: 'whatsapp', creado: '2026-11-25', nombre: 'Beto', telefono: '922222222', estado: 'pendiente' },
    ],
    cotizaciones: [
      { cotNum: '1900', telefono: '+56911111111', creadoMs: creada('2026-11-26') },
      { cotNum: '1500', telefono: '+56922222222', creadoMs: creada('2026-10-01') }, // antes de que llegara: no cuenta
      { cotNum: '1950', notas: NOTA_WEB, status: 'por confirmar', telefono: '+56933333333', creadoMs: creada('2026-11-25') },
      { cotNum: '1960', telefono: '+56933333333', creadoMs: creada('2026-11-26') }, // la rehizo a mano
    ],
  })
  assert.deepEqual(pendientes.map(p => p.clave), ['a:pc2'])
  const ana = hechas.find(h => h.clave === 'a:pc1')
  assert.equal(ana.cotNum, '1900')
  assert.equal(ana.sola, true)
  assert.equal(hechas.find(h => h.clave === 'web:1950').cotNum, '1960')
})

test('la cotización web no se marca hecha por sí misma', () => {
  const { pendientes } = armarPorCotizar({ hoy, ahoraMs, cotizaciones: [{ cotNum: '1950', notas: NOTA_WEB, status: 'por confirmar', telefono: '+56933333333', creadoMs: creada('2026-11-25') }] })
  assert.equal(pendientes.length, 1)
})

test('días esperando y mensaje de Instagram', () => {
  assert.equal(diasEsperando('2026-11-20', hoy), 7)
  assert.equal(diasEsperando('', hoy), 0)
  assert.match(mensajePedirDatosInstagram({ nombre: 'Ana María' }), /^¡Hola Ana!/)
})

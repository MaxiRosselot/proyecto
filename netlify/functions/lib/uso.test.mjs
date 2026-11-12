import test from 'node:test'
import assert from 'node:assert/strict'
import { atenderUso, eventoAFila, limpiarEventos, resumirUso } from './uso.mjs'

test('uso: descarta lo que no calza y limpia textos', () => {
  const e = limpiarEventos([
    { dia: '2026-11-11', disp: 'cel', tipo: 'click', seccion: 'instalaciones', etiqueta: '  + Nueva   instalación ', veces: 2, bajada: 900 },
    { dia: 'ayer', tipo: 'click', seccion: 'x', etiqueta: 'y', veces: 1 },
    { dia: '2026-11-11', tipo: 'otro', seccion: 'x', etiqueta: 'y', veces: 1 },
    { dia: '2026-11-11', tipo: 'click', seccion: 'x', etiqueta: '', veces: 1 },
  ])
  assert.deepEqual(e, [{ dia: '2026-11-11', disp: 'cel', tipo: 'click', seccion: 'instalaciones', etiqueta: '+ Nueva instalación', veces: 2, bajada: 900 }])
  assert.deepEqual(limpiarEventos('nada'), [])
})

test('uso: resume secciones, botones (con lo que hubo que bajar) y los que nunca se tocan', () => {
  const filas = [
    ['2026-11-01', 'cel', 'seccion', 'instalaciones', '(abrir)', 3, 0],
    ['2026-11-02', 'pc', 'seccion', 'instalaciones', '(abrir)', 1, 0],
    ['2026-11-01', 'cel', 'seccion', 'web', '(abrir)', 1, 0],
    ['2026-11-01', 'cel', 'click', 'instalaciones', 'Mapa', 2, 2000],
    ['2026-11-03', 'pc', 'click', 'instalaciones', 'Mapa', 2, 0],
    ['2026-11-01', 'pc', 'click', 'web', 'Subir foto', 1, 0],
    ['2026-11-01', 'pc', 'visto', 'instalaciones', 'Mapa', 1, 0],
    ['2026-11-01', 'pc', 'visto', 'instalaciones', 'Importar Excel', 1, 0],
    ['2026-10-01', 'pc', 'click', 'web', 'Viejo', 5, 0],
  ]
  const r = resumirUso(filas, '2026-11-01')
  assert.equal(r.desde, '2026-11-01')
  assert.equal(r.hasta, '2026-11-03')
  assert.deepEqual(r.secciones[0], { seccion: 'instalaciones', veces: 4, cel: 3, pc: 1 })
  assert.deepEqual(r.acciones[0], { seccion: 'instalaciones', etiqueta: 'Mapa', veces: 4, cel: 2, pc: 2, bajadaPromedio: 500, ultimo: '2026-11-03' })
  assert.ok(!r.acciones.some((a) => a.etiqueta === 'Viejo'))
  assert.deepEqual(r.sinUso, [{ seccion: 'instalaciones', etiqueta: 'Importar Excel' }])
})

test('uso: anota y luego resume', async () => {
  const filas = []
  const almacen = { leerFilas: async () => filas, agregarFilas: async (f) => { filas.push(...f) } }
  const post = await atenderUso({ httpMethod: 'POST', body: JSON.stringify({ eventos: [{ dia: '2026-11-11', tipo: 'click', seccion: 'inicio', etiqueta: 'Actualizar', veces: 1 }] }) }, almacen)
  assert.deepEqual(post.cuerpo, { ok: true, anotados: 1 })
  assert.deepEqual(filas, [eventoAFila({ dia: '2026-11-11', disp: 'pc', tipo: 'click', seccion: 'inicio', etiqueta: 'Actualizar', veces: 1, bajada: 0 })])
  const get = await atenderUso({ httpMethod: 'GET', queryStringParameters: {} }, almacen)
  assert.equal(get.cuerpo.acciones[0].etiqueta, 'Actualizar')
})

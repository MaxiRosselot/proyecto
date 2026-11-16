import test from 'node:test'
import assert from 'node:assert/strict'
import { PENDIENTES_INICIALES, cambiarPendientes, filaAPendiente, listarPendientes, pendienteAFila } from './pendientes.mjs'

const almacenMemoria = () => {
  let filas = null
  return { leerFilas: async () => filas && filas.map(f => [...f]), guardarFilas: async f => { filas = f } }
}

test('pendientes: la primera vez se llenan con los iniciales; la fila ida y vuelta queda igual', async () => {
  const a = almacenMemoria()
  const lista = await listarPendientes(a, '2026-11-16')
  assert.equal(lista.length, PENDIENTES_INICIALES.length)
  assert.deepEqual(filaAPendiente(pendienteAFila(lista[0]), '2026-11-16'), lista[0])
  assert.equal((await listarPendientes(a, '2026-11-17')).length, PENDIENTES_INICIALES.length)
})

test('pendientes: crear, cambiar estado con nota, editar y borrar', async () => {
  const a = almacenMemoria()
  await listarPendientes(a, '2026-11-16')
  const { pendiente: nuevo } = await cambiarPendientes(a, { accion: 'guardar', pendiente: { titulo: '  Probar algo ', area: 'Panel', estado: 'raro' } }, '2026-11-17')
  assert.equal(nuevo.titulo, 'Probar algo')
  assert.equal(nuevo.estado, 'por-hacer')
  assert.match(nuevo.id, /^p\d+$/)
  const { pendiente: conNota } = await cambiarPendientes(a, { accion: 'nota', id: nuevo.id, texto: 'Empezado', estado: 'en-curso' }, '2026-11-18')
  assert.equal(conNota.estado, 'en-curso')
  assert.deepEqual(conNota.bitacora.map(n => n.texto), ['Estado: Por hacer → En curso', 'Empezado'])
  assert.equal(conNota.actualizado, '2026-11-18')
  const { pendiente: editado } = await cambiarPendientes(a, { accion: 'guardar', pendiente: { id: nuevo.id, titulo: 'Otro título', estado: 'hecho' } }, '2026-11-19')
  assert.equal(editado.titulo, 'Otro título')
  assert.equal(editado.creado, '2026-11-17')
  assert.equal(editado.bitacora.at(-1).texto, 'Estado: En curso → Hecho')
  const { pendientes } = await cambiarPendientes(a, { accion: 'borrar', id: nuevo.id }, '2026-11-19')
  assert.ok(!pendientes.some(p => p.id === nuevo.id))
  await assert.rejects(cambiarPendientes(a, { accion: 'guardar', pendiente: { titulo: ' ' } }, '2026-11-19'), e => e.estado === 400)
  await assert.rejects(cambiarPendientes(a, { accion: 'nota', id: 'nada', texto: 'x' }, '2026-11-19'), e => e.estado === 404)
})

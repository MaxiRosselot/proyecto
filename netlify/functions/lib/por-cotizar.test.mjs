import test from 'node:test'
import assert from 'node:assert/strict'
import { almacenPorCotizarMemoria, cambiarPorCotizar, carpetaAPendiente, listarPorCotizar, usuarioInstagram } from './por-cotizar.mjs'

const hoy = '2026-11-27'

test('anotar una de WhatsApp y otra de Instagram', async () => {
  const almacen = almacenPorCotizarMemoria()
  assert.deepEqual(await listarPorCotizar(almacen, hoy), [])
  const a = await cambiarPorCotizar(almacen, { accion: 'anotar', item: { origen: 'whatsapp', nombre: 'Ana', telefono: '+56 9 1234 5678', detalle: '2,4 x 0,5' } }, hoy)
  assert.equal(a.item.id, 'pc1')
  assert.equal(a.item.estado, 'pendiente')
  assert.equal(a.item.creado, hoy)
  const b = await cambiarPorCotizar(almacen, { accion: 'anotar', item: { origen: 'instagram', instagram: 'https://www.instagram.com/beto.bodega/?hl=es' } }, hoy)
  assert.equal(b.item.instagram, 'beto.bodega')
  assert.equal(b.item.id, 'pc2')
  assert.equal(almacen.filas.length, 2)
})

test('no anota algo vacío ni orígenes automáticos a mano', async () => {
  const almacen = almacenPorCotizarMemoria()
  await assert.rejects(cambiarPorCotizar(almacen, { accion: 'anotar', item: { origen: 'whatsapp' } }, hoy), /al menos/)
  const r = await cambiarPorCotizar(almacen, { accion: 'anotar', item: { origen: 'visita', nombre: 'X' } }, hoy)
  assert.equal(r.item.origen, 'otro')
})

test('el mismo celular pendiente se completa en vez de duplicarse', async () => {
  const almacen = almacenPorCotizarMemoria()
  await cambiarPorCotizar(almacen, { accion: 'anotar', item: { origen: 'whatsapp', telefono: '912345678', detalle: 'bodega 2 m' } }, hoy)
  const r = await cambiarPorCotizar(almacen, { accion: 'anotar', item: { origen: 'whatsapp', nombre: 'Ana', telefono: '+56912345678', detalle: 'mandó fotos' } }, hoy)
  assert.equal(r.item.yaEstaba, true)
  assert.equal(r.item.nombre, 'Ana')
  assert.equal(r.item.detalle, 'bodega 2 m\nmandó fotos')
  assert.equal(r.anotadas.length, 1)
})

test('marcar estado: anotada a mano y una automática por ref', async () => {
  const almacen = almacenPorCotizarMemoria()
  await cambiarPorCotizar(almacen, { accion: 'anotar', item: { origen: 'whatsapp', nombre: 'Ana' } }, hoy)
  const r = await cambiarPorCotizar(almacen, { accion: 'estado', id: 'pc1', estado: 'cotizada', cotNum: 1700 }, hoy)
  assert.equal(r.item.cotNum, '1700')
  const c = await cambiarPorCotizar(almacen, { accion: 'estado', origen: 'correo', ref: 'carpetaABC123', estado: 'descartada', nombre: 'Caro', creado: '2026-11-20' }, hoy)
  assert.equal(c.item.id, 'pc2')
  assert.equal(c.item.creado, '2026-11-20')
  const d = await cambiarPorCotizar(almacen, { accion: 'estado', origen: 'correo', ref: 'carpetaABC123', estado: 'pendiente' }, hoy)
  assert.equal(d.item.id, 'pc2')
  assert.equal(d.anotadas.length, 2)
  await assert.rejects(cambiarPorCotizar(almacen, { accion: 'estado', origen: 'whatsapp', ref: 'x', estado: 'cotizada' }, hoy), /de dónde/)
  await assert.rejects(cambiarPorCotizar(almacen, { accion: 'estado', id: 'pc1', estado: 'rara' }, hoy), /Estado/)
})

test('editar y borrar', async () => {
  const almacen = almacenPorCotizarMemoria()
  await cambiarPorCotizar(almacen, { accion: 'anotar', item: { origen: 'instagram', instagram: '@beto' } }, hoy)
  const e = await cambiarPorCotizar(almacen, { accion: 'editar', id: 'pc1', item: { telefono: '987654321', nombre: 'Beto' } }, '2026-11-28')
  assert.equal(e.item.telefono, '987654321')
  assert.equal(e.item.origen, 'instagram')
  assert.equal(e.item.creado, hoy)
  assert.equal(e.item.actualizado, '2026-11-28')
  const b = await cambiarPorCotizar(almacen, { accion: 'borrar', id: 'pc1' }, hoy)
  assert.equal(b.anotadas.length, 0)
})

test('carpeta de fotos de la web como pendiente', () => {
  const p = carpetaAPendiente({ id: 'abc', name: '2026-11-20 Caro Díaz', createdTime: '2026-11-20T15:00:00Z', webViewLink: 'https://drive/x',
    description: JSON.stringify({ nombre: 'Caro Díaz', email: 'c@x.cl', telefono: '+56911112222', comuna: 'Ñuñoa', medidas: '3 x 1', comentarios: 'bodega' }) })
  assert.deepEqual(p, { origen: 'correo', ref: 'abc', creado: '2026-11-20', nombre: 'Caro Díaz', telefono: '+56911112222', email: 'c@x.cl', direccion: 'Ñuñoa', detalle: 'Medidas: 3 x 1\nbodega', link: 'https://drive/x', archivos: 0 })
})

test('usuario de Instagram', () => {
  assert.equal(usuarioInstagram('@ana.r'), 'ana.r')
  assert.equal(usuarioInstagram('https://instagram.com/ana_b/'), 'ana_b')
})

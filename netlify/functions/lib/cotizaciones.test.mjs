import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LIMITE_CELDA, NUMERO_INICIAL, actualizarCotizacion, almacenEnMemoria, borrarCotizacion, codificarProyecto,
  cotizacionAFila, crearCotizacion, creadoEnMs, decodificarProyecto, listarCotizaciones, obtenerCotizacion,
} from './cotizaciones.mjs'

// Dos bodegas distintas: cada cotizacion tiene que volver con la suya.
const bodega = (nombre, fondo) => ({
  projectName: nombre, units: 'cm',
  room: { backWallCm: fondo, leftWallCm: 240, rightWallCm: 240, heightCm: 250, door: { wall: 'front', fromLeftCornerCm: 80, toRightCornerCm: fondo - 160, widthCm: 80 } },
  shelving: { layout: 'manual', heightCm: 200, depthCm: 48, runs: [{ id: 'A', wall: 'back', startCm: 0, lengthCm: fondo - 60, heightCm: 200, depthCm: 48 }] },
})
const repisa = largo => ({ largo, prof: 0.48, alto: 2, niveles: 4, unidades: 1, valor: 110000, kind: 'shelf' })
const datos = (nombre, extra = {}) => ({ crear: true, nombre, email: `${nombre}@example.cl`, subtotal: 110000, iva: 20900, total: 130900, repisas: [repisa(2.43)], adicionales: { qty_cajas: 0 }, ...extra })

test('la primera cotizacion parte en el numero inicial y las siguientes son correlativas', async () => {
  const almacen = almacenEnMemoria()
  const a = await crearCotizacion(almacen, datos('ana'))
  const b = await crearCotizacion(almacen, datos('beto'))
  assert.equal(a.estado, 201)
  assert.equal(a.respuesta.cotNum, String(NUMERO_INICIAL))
  assert.equal(b.respuesta.cotNum, String(NUMERO_INICIAL + 1))
  // Sigue desde el mayor, aunque haya huecos o filas escritas a mano.
  const conHuecos = almacenEnMemoria([cotizacionAFila({ cotNum: 1500, nombre: 'x' }), cotizacionAFila({ cotNum: 1490, nombre: 'y' }), ['', '']])
  assert.equal((await crearCotizacion(conHuecos, datos('z'))).respuesta.cotNum, '1501')
})

test('nunca pisa una cotizacion existente', async () => {
  const almacen = almacenEnMemoria()
  await crearCotizacion(almacen, datos('ana', { cotNum: 1430 }))
  const choque = await crearCotizacion(almacen, datos('beto', { cotNum: 1430 }))
  assert.equal(choque.estado, 409)
  assert.equal(choque.respuesta.siguiente, 1431)
  assert.equal(almacen.filas.length, 1)
  assert.equal((await obtenerCotizacion(almacen, 1430)).nombre, 'ana')
})

test('si dos cotizadores toman el mismo numero a la vez, el segundo se retira y pide otro', async () => {
  const base = almacenEnMemoria()
  // Simula que otro cotizador escribio el 1421 entre nuestra lectura y nuestra escritura.
  const carrera = { ...base, async agregar(valores) {
    await base.agregar(cotizacionAFila({ cotNum: valores[0], nombre: 'el otro', creado: '05-10-2026, 9:00:00 a. m.' }))
    return base.agregar(valores)
  } }
  const r = await crearCotizacion(carrera, datos('yo', { cotNum: 1421 }))
  assert.equal(r.estado, 409)
  assert.equal(r.respuesta.siguiente, 1422)
  assert.deepEqual(base.filas.map(f => f[1]), ['el otro'])
})

test('cada cotizacion se guarda y se reabre con su propio modelo 3D', async () => {
  const almacen = almacenEnMemoria()
  const p1 = bodega('Bodega Ana', 300), p2 = bodega('Bodega Beto', 420)
  await crearCotizacion(almacen, datos('ana', { proyecto3d: p1 }))
  await crearCotizacion(almacen, datos('beto', { proyecto3d: p2, repisas: [repisa(2.43), repisa(1.2)] }))
  await crearCotizacion(almacen, datos('carla'))

  assert.deepEqual((await obtenerCotizacion(almacen, 1421)).proyecto3d, p1)
  assert.deepEqual((await obtenerCotizacion(almacen, 1422)).proyecto3d, p2)
  assert.equal((await obtenerCotizacion(almacen, 1422)).repisas.length, 2)
  assert.equal((await obtenerCotizacion(almacen, 1423)).proyecto3d, null)

  // La lista no arrastra los modelos, solo avisa cual lo tiene.
  const { quotes } = await listarCotizaciones(almacen)
  assert.ok(quotes.every(q => !('proyecto3d' in q)))
  assert.deepEqual(Object.fromEntries(quotes.map(q => [q.nombre, q.tieneProyecto3d])), { ana: true, beto: true, carla: false })
})

test('cambiar el estado desde la lista no borra el modelo 3D ni la fecha de creacion', async () => {
  const almacen = almacenEnMemoria()
  const p1 = bodega('Bodega Ana', 300)
  await crearCotizacion(almacen, datos('ana', { proyecto3d: p1 }), new Date('2026-10-01T15:00:00Z'))
  const enLista = (await listarCotizaciones(almacen)).quotes[0]
  // Cotizaciones.jsx manda la fila tal como la recibio, sin proyecto3d.
  await actualizarCotizacion(almacen, { ...enLista, status: 'confirmada', creado: 'otra fecha' })
  const despues = await obtenerCotizacion(almacen, 1421)
  assert.equal(despues.status, 'confirmada')
  assert.deepEqual(despues.proyecto3d, p1)
  assert.equal(despues.creado, enLista.creado)

  // Regenerar desde el cotizador si reemplaza el modelo.
  const p1b = bodega('Bodega Ana v2', 360)
  await actualizarCotizacion(almacen, { cotNum: 1421, proyecto3d: p1b, pdfUrl: 'https://drive/x' })
  assert.deepEqual((await obtenerCotizacion(almacen, 1421)).proyecto3d, p1b)
  assert.equal((await obtenerCotizacion(almacen, 1421)).status, 'confirmada')
})

test('actualizar o borrar una cotizacion que no existe falla en vez de crearla', async () => {
  const almacen = almacenEnMemoria()
  await assert.rejects(actualizarCotizacion(almacen, { cotNum: 1999, nombre: 'x' }), { estado: 404 })
  await assert.rejects(borrarCotizacion(almacen, 1999), { estado: 404 })
  await assert.rejects(crearCotizacion(almacen, datos('')), { estado: 400 })
  assert.equal(almacen.filas.length, 0)
})

test('detecta si la planilla devuelve algo distinto de lo guardado', async () => {
  const base = almacenEnMemoria()
  const truncada = { ...base, async leerFila(n) { const f = await base.leerFila(n); f[16] = ''; return f } }
  await assert.rejects(crearCotizacion(truncada, datos('ana', { proyecto3d: bodega('B', 300) })), { estado: 500 })
})

test('modelos grandes se comprimen para caber en una celda', () => {
  const grande = { ...bodega('Grande', 300), obstacles: Array.from({ length: 900 }, (_, i) => ({ id: `obs-${i}`, xCm: i, yCm: i, widthCm: 10, depthCm: 10, heightCm: 10 })) }
  const texto = codificarProyecto(grande)
  assert.ok(JSON.stringify(grande).length > LIMITE_CELDA)
  assert.ok(texto.startsWith('gz:') && texto.length <= LIMITE_CELDA)
  assert.deepEqual(decodificarProyecto(texto), grande)
  assert.deepEqual(decodificarProyecto(codificarProyecto(bodega('Chica', 300))), bodega('Chica', 300))
})

test('lee la fecha de creacion como la escribe Chile', () => {
  assert.equal(creadoEnMs('05-10-2026, 1:23:45 p. m.'), Date.UTC(2026, 9, 5, 16, 23, 45))
  assert.equal(creadoEnMs('05-10-2026, 12:03:45 a. m.'), Date.UTC(2026, 9, 5, 3, 3, 45))
  assert.equal(creadoEnMs('5-10-2026 13:23'), Date.UTC(2026, 9, 5, 16, 23, 0))
  assert.equal(creadoEnMs('2026-10-05T16:23:45.000Z'), Date.UTC(2026, 9, 5, 16, 23, 45))
  assert.equal(creadoEnMs(''), null)
  assert.equal(creadoEnMs('cualquier cosa'), null)
})

test('la lista sale con las mas nuevas arriba', async () => {
  const fila = (cotNum, creado) => cotizacionAFila({ cotNum, nombre: `n${cotNum}`, creado })
  const almacen = almacenEnMemoria([
    fila(1421, '28-09-2026, 4:10:00 p. m.'),
    fila(1424, '13-10-2026, 9:00:00 a. m.'), // dia > 12: new Date() la daba por invalida
    fila(1422, '05-10-2026, 11:30:00 a. m.'),
    fila(1423, '05-10-2026, 2:15:00 p. m.'),
    fila(1420, ''),
  ])
  const { quotes, siguiente } = await listarCotizaciones(almacen)
  assert.deepEqual(quotes.map(q => q.cotNum), ['1424', '1423', '1422', '1421', '1420'])
  assert.equal(siguiente, 1425)
})

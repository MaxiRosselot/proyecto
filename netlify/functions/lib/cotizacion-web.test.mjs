import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_POR_CORREO, NOTA_WEB, filasConPrecio, procesarCotizacionWeb, validarSolicitud } from './cotizacion-web.mjs'
import { almacenEnMemoria, obtenerCotizacion } from './cotizaciones.mjs'
import { armarCorreo } from './correo.mjs'
import { generateQuotePdf } from './quote-pdf.mjs'
import { TABLA_PRECIOS } from '../../../src/admin/preciosRepisas.js'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const solicitud = (cambios = {}) => ({
  cliente: { nombre: 'Ana Pérez', email: 'Ana@Example.com', telefono: '+56 9 1234 5678', direccion: 'Los Aromos 123' },
  modulos: [
    { largoCm: 243, profundidadCm: 48, altoCm: 200, niveles: 4, colgador: false, neto: 1 },
    { largoCm: 157, profundidadCm: 48, altoCm: 200, niveles: 2, colgador: true },
  ],
  proyecto3d: { projectName: 'Mi bodega', room: { backWallCm: 400 } },
  vistas: { isometric: PNG, top: PNG },
  sitio: '',
  ...cambios,
})

function entorno(almacen = almacenEnMemoria()) {
  const correos = [], subidos = []
  return {
    correos, subidos, almacen,
    deps: {
      tabla: TABLA_PRECIOS, almacen,
      generarPdf: data => generateQuotePdf(data, { functionsDir: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') }),
      subirPdf: async d => { subidos.push(d); return { viewUrl: `https://drive.example/${d.cotNum}` } },
      enviarCorreo: async c => { correos.push(c) },
      avisoA: 'admin@example.com',
      ahora: new Date('2026-10-07T15:00:00Z'),
    },
  }
}

test('el precio sale de la planilla, no de lo que mande el navegador', () => {
  const filas = filasConPrecio(validarSolicitud(solicitud()).modulos, TABLA_PRECIOS)
  // 243 x 48 x 200 = 110.000 y 157 x 48 x 200 = 90.000 en la tabla de respaldo.
  assert.deepEqual(filas.map(f => f.valor), [110000, 90000])
  assert.deepEqual(filas.map(f => f.colgador), [false, true])
  assert.equal(filas[1].label, 'Con colgador')
})

test('valida los datos del cliente y las medidas', () => {
  assert.throws(() => validarSolicitud(solicitud({ sitio: 'http://spam' })), { estado: 400 })
  assert.throws(() => validarSolicitud(solicitud({ cliente: { nombre: 'Ana', email: 'no-es-correo', telefono: '912345678' } })), /correo/)
  assert.throws(() => validarSolicitud(solicitud({ cliente: { nombre: 'Ana', email: 'a@b.cl', telefono: '12' } })), /teléfono/)
  assert.throws(() => validarSolicitud(solicitud({ modulos: [] })), /repisas/)
  assert.throws(() => validarSolicitud(solicitud({ modulos: [{ largoCm: 300, profundidadCm: 48, altoCm: 200, niveles: 4 }] })), /medidas/)
  assert.throws(() => validarSolicitud(solicitud({ modulos: [{ largoCm: 100, profundidadCm: 50, altoCm: 200, niveles: 4 }] })), /medidas/)
  assert.throws(() => validarSolicitud(solicitud({ vistas: { isometric: 'x', top: PNG } })), /vista/)
  assert.equal(validarSolicitud(solicitud()).cliente.email, 'ana@example.com')
})

test('crea la cotizacion con su modelo, sube el PDF y la envia al cliente con copia', async () => {
  const { deps, correos, subidos, almacen } = entorno()
  const r = await procesarCotizacionWeb(solicitud(), deps)
  assert.equal(r.cotNum, '1421')
  assert.equal(r.total, 238000)
  assert.equal(r.correoEnviado, true)

  const guardada = await obtenerCotizacion(almacen, 1421)
  assert.equal(guardada.status, 'por confirmar')
  assert.equal(guardada.notas, NOTA_WEB)
  assert.deepEqual(guardada.proyecto3d, solicitud().proyecto3d)
  assert.equal(guardada.pdfUrl, 'https://drive.example/1421')
  assert.equal(Number(guardada.total), 238000)

  assert.equal(subidos[0].pdfBuffer.subarray(0, 4).toString(), '%PDF')
  assert.deepEqual(correos.map(c => c.para), ['ana@example.com', 'admin@example.com'])
  assert.match(correos[0].asunto, /N° 1421/)
  assert.match(correos[0].texto, /\$238\.000/)
  // Empuja a cerrar: oferta de 48 h, link de pago y WhatsApp; nada de agendar visita.
  assert.match(correos[0].texto, /10% de descuento/)
  assert.match(correos[0].texto, /link\.mercadopago\.cl/)
  assert.match(correos[0].texto, /wa\.me\/56951020367\?text=/)
  assert.doesNotMatch(correos[0].texto, /visita/i)
  assert.equal(r.oferta.hasta, '2026-10-09T15:00:00.000Z')
  assert.equal(r.pago.link, 'https://link.mercadopago.cl/repisasdonmaxi')
  assert.equal(correos[0].adjuntos[0].nombre, 'Cotizacion 1421 - Repisas Don Maxi.pdf')
  assert.equal(correos[1].responderA, 'ana@example.com')
})

test('si el correo falla la cotizacion igual queda guardada', async () => {
  const { deps, almacen } = entorno()
  const r = await procesarCotizacionWeb(solicitud(), { ...deps, enviarCorreo: async () => { throw new Error('sin cuota') } })
  assert.equal(r.correoEnviado, false)
  assert.ok(await obtenerCotizacion(almacen, r.cotNum))
})

test('frena muchas cotizaciones seguidas desde el mismo correo', async () => {
  const { deps } = entorno()
  for (let i = 0; i < MAX_POR_CORREO; i++) await procesarCotizacionWeb(solicitud(), deps)
  await assert.rejects(procesarCotizacionWeb(solicitud(), deps), { estado: 429 })
  // Otro correo sigue pudiendo.
  await procesarCotizacionWeb(solicitud({ cliente: { nombre: 'Beto', email: 'beto@example.com', telefono: '912345678' } }), deps)
})

test('el correo lleva el PDF adjunto y no deja inyectar encabezados', () => {
  const raw = armarCorreo({ para: 'a@b.cl\r\nBcc: x@y.cl', asunto: 'Cotización N° 1', texto: 'hola', adjuntos: [{ nombre: 'c.pdf', tipo: 'application/pdf', contenido: Buffer.from('%PDF-1.7') }] })
  assert.ok(!/\r\nBcc:/.test(raw))
  assert.match(raw, /Subject: =\?UTF-8\?B\?/)
  assert.match(raw, /Content-Disposition: attachment; filename="c.pdf"/)
})

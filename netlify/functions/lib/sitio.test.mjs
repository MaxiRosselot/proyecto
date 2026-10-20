import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  almacenFotosMemoria, almacenSolicitudesMemoria, correoContacto, editarFotosWeb, fotosPorSeccion, iniciarSolicitudFotos,
  subirFotoWeb, subirTrozoSolicitud, terminarSolicitudFotos, validarContacto, whatsappDe,
} from './sitio.mjs'

const jpg = Buffer.alloc(1000, 7).toString('base64')

test('las fotos del sitio se ordenan por seccion y las tarjetas de cotizar guardan solo una', async () => {
  const a = almacenFotosMemoria()
  const p1 = await subirFotoWeb(a, { seccion: 'portada', datos: jpg, titulo: 'Bodega en L' })
  const p2 = await subirFotoWeb(a, { seccion: 'portada', datos: jpg })
  await subirFotoWeb(a, { seccion: 'galeria', datos: jpg, categoria: 'bicicletas' })
  await subirFotoWeb(a, { seccion: 'galeria', datos: jpg, categoria: 'inventada' })
  await subirFotoWeb(a, { seccion: 'cotizar-auto', datos: jpg })
  const ultima = await subirFotoWeb(a, { seccion: 'cotizar-auto', datos: jpg })
  let s = fotosPorSeccion(await a.listar())
  assert.deepEqual(s.portada.map(f => f.id), [p1.id, p2.id])
  assert.equal(s.portada[0].titulo, 'Bodega en L')
  assert.match(s.portada[0].url, /^\/\.netlify\/functions\/foto\?id=/)
  assert.deepEqual(s.galeria.map(f => f.categoria), ['bicicletas', ''])
  assert.deepEqual(s['cotizar-auto'].map(f => f.id), [ultima.id])

  await editarFotosWeb(a, { accion: 'ordenar', seccion: 'portada', ids: [p2.id, p1.id] })
  await editarFotosWeb(a, { accion: 'editar', id: p2.id, titulo: 'Con barra' })
  s = fotosPorSeccion(await a.listar())
  assert.deepEqual(s.portada.map(f => [f.id, f.titulo]), [[p2.id, 'Con barra'], [p1.id, 'Bodega en L']])
  await editarFotosWeb(a, { accion: 'borrar', id: p1.id })
  assert.equal(fotosPorSeccion(await a.listar()).portada.length, 1)
})

test('una foto del sitio se rechaza si la seccion o el formato no sirven', async () => {
  const a = almacenFotosMemoria()
  await assert.rejects(subirFotoWeb(a, { seccion: 'otra', datos: jpg }), /Sección no válida/)
  await assert.rejects(subirFotoWeb(a, { seccion: 'portada', datos: jpg, tipo: 'image/gif' }), /JPG, PNG o WebP/)
  await assert.rejects(subirFotoWeb(a, { seccion: 'portada', datos: '' }), /Falta la foto/)
})

test('el contacto pide nombre, un medio para responder y el mensaje; el honeypot lo bota', () => {
  assert.throws(() => validarContacto({ nombre: 'Ana', email: 'ana@x.cl', mensaje: 'Hola, consulta', website: 'spam.com' }), /inválida/)
  assert.throws(() => validarContacto({ nombre: '', email: 'ana@x.cl', mensaje: 'Hola' }), /nombre/)
  assert.throws(() => validarContacto({ nombre: 'Ana', mensaje: 'Hola, consulta' }), /correo o un teléfono/)
  assert.throws(() => validarContacto({ nombre: 'Ana', email: 'ana@x.cl', mensaje: '' }), /mensaje/)
  const c = validarContacto({ nombre: ' Ana  Pérez ', telefono: '9 1234 5678', mensaje: '¿Instalan en Maipú?' })
  const correo = correoContacto(c, 'admin@x.cl')
  assert.equal(correo.para, 'admin@x.cl')
  assert.equal(correo.asunto, 'Contacto web: Ana Pérez')
  assert.match(correo.texto, /¿Instalan en Maipú\?/)
  assert.match(correo.texto, /wa\.me\/56912345678/)
  assert.equal(whatsappDe('+56 9 1234 5678'), '56912345678')
})

const solicitud = (extra = {}) => ({
  nombre: 'Paula Rojas', email: 'paula@example.cl', telefono: '9 5555 4444', comuna: 'Ñuñoa', medidas: '2 x 1,5 m', comentarios: 'Bodega con puerta al centro',
  archivos: [{ nombre: 'bodega.jpg', tipo: 'image/jpeg', tamano: 5 }, { nombre: 'video.mov', tipo: 'video/quicktime', tamano: 4 }], ...extra,
})

test('enviar fotos: crea la carpeta, recibe los trozos y avisa una sola vez con los datos guardados', async () => {
  const correos = []
  const deps = { solicitudes: almacenSolicitudesMemoria(), enviarCorreo: async c => correos.push(c), avisoA: 'admin@x.cl' }
  const r = await iniciarSolicitudFotos(deps, solicitud(), new Date('2026-10-20T15:00:00Z'))
  assert.equal(r.subidas.length, 2)
  assert.equal(deps.solicitudes.carpetas.get(r.carpeta).nombre, '2026-10-20 Paula Rojas')
  assert.deepEqual(await subirTrozoSolicitud(deps, { sesion: r.subidas[0].sesion, inicio: 0, total: 5, datos: Buffer.from('fotos').toString('base64') }), { completo: true })
  await assert.rejects(subirTrozoSolicitud(deps, { sesion: r.subidas[1].sesion, inicio: 0, total: 4, datos: Buffer.from('largo').toString('base64') }), /Trozo no válido/)
  await subirTrozoSolicitud(deps, { sesion: r.subidas[1].sesion, inicio: 0, total: 4, datos: Buffer.from('vide').toString('base64') })

  // El navegador no puede cambiar a quien se le escribe: los datos salen de la carpeta.
  const fin = await terminarSolicitudFotos(deps, { carpeta: r.carpeta, email: 'otro@spam.cl' })
  assert.deepEqual(fin, { recibidos: 2, acuse: true })
  assert.deepEqual(correos.map(c => c.para), ['admin@x.cl', 'paula@example.cl'])
  assert.equal(correos[0].responderA, 'paula@example.cl')
  assert.match(correos[0].asunto, /Paula Rojas · Ñuñoa/)
  assert.match(correos[0].texto, /Carpeta en Drive: https:\/\/drive\.google\.com\/drive\/folders\//)
  assert.match(correos[0].texto, /bodega\.jpg/)
  assert.match(correos[0].texto, /Bodega con puerta al centro/)
  assert.match(correos[1].texto, /Recibimos tus fotos/)
  assert.equal((await terminarSolicitudFotos(deps, { carpeta: r.carpeta })).repetida, true)
  assert.equal(correos.length, 2)
})

test('enviar fotos: valida datos y archivos antes de crear nada', async () => {
  const deps = { solicitudes: almacenSolicitudesMemoria(), enviarCorreo: async () => {}, avisoA: 'a@x.cl' }
  await assert.rejects(iniciarSolicitudFotos(deps, solicitud({ email: 'malo' })), /correo/)
  await assert.rejects(iniciarSolicitudFotos(deps, solicitud({ telefono: '12' })), /celular/)
  await assert.rejects(iniciarSolicitudFotos(deps, solicitud({ archivos: [] })), /al menos una foto/)
  await assert.rejects(iniciarSolicitudFotos(deps, solicitud({ archivos: [{ nombre: 'x.pdf', tipo: 'application/pdf', tamano: 3 }] })), /no es una foto ni un video/)
  await assert.rejects(iniciarSolicitudFotos(deps, solicitud({ archivos: [{ nombre: 'x.mp4', tipo: 'video/mp4', tamano: 600e6 }] })), /500 MB/)
  await assert.rejects(iniciarSolicitudFotos(deps, solicitud({ archivos: Array(11).fill({ nombre: 'a.jpg', tipo: 'image/jpeg', tamano: 1 }) })), /hasta 10/)
  await assert.rejects(terminarSolicitudFotos(deps, { carpeta: 'no-existe' }), /No encontramos/)
  assert.equal(deps.solicitudes.carpetas.size, 0)
})

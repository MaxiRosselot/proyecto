// El sitio publico (repisasdonmaxi.cl): las fotos que se suben desde Admin → Web, el formulario de
// contacto y "Envíanos fotos o un video" para cotizar. Las fotos y los archivos de los clientes
// viven en el Drive del negocio; aca estan las reglas, sin Google, para probarlas en memoria.
// Sin imports de Node arriba: el sitio y el panel usan las secciones y categorias de aca.
import { MARCA, WHATSAPP } from './marca.mjs'
import { avisoSolicitudFotos } from './telegram.mjs'

export class ErrorSitio extends Error {
  constructor(message, estado = 400) { super(message); this.estado = estado }
}
const falla = mensaje => { throw new ErrorSitio(mensaje) }

// Donde va cada foto. Las de cotizar son una por tarjeta (se usa la primera).
export const SECCIONES_WEB = {
  portada: { nombre: 'Inicio · destacadas', ayuda: 'Las primeras 6 salen en la portada. La primera es la foto grande.', max: 12 },
  galeria: { nombre: 'Fotos · galería', ayuda: 'La página Fotos completa. Elige la categoría de cada una.', max: 300 },
  'cotizar-foto': { nombre: 'Cotizar · enviar foto o video', ayuda: 'La foto de la tarjeta.', max: 1 },
  'cotizar-auto': { nombre: 'Cotizar · cotización automática', ayuda: 'La foto de la tarjeta.', max: 1 },
  'cotizar-visita': { nombre: 'Cotizar · agendar visita', ayuda: 'La foto de la tarjeta.', max: 1 },
}
export const CATEGORIAS_GALERIA = { bodegas: 'Bodegas', colgador: 'Con barra para colgar', bicicletas: 'Bicicletas', empresas: 'Empresas y contenedores' }

const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const correoValido = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)

// ---------- Fotos del sitio ----------
// Cada foto es un archivo en la carpeta "Web Don Maxi" de Drive; su seccion, orden, titulo y
// categoria van en appProperties. La pagina las pide a /foto?id= (foto.mjs), que solo entrega
// archivos con la marca webDonMaxi.
export const MARCA_FOTO = 'webDonMaxi'
export const urlFoto = id => `/.netlify/functions/foto?id=${encodeURIComponent(id)}`

export function fotosPorSeccion(archivos) {
  const secciones = Object.fromEntries(Object.keys(SECCIONES_WEB).map(s => [s, []]))
  for (const a of archivos) {
    const p = a.appProperties || {}
    if (!secciones[p.seccion]) continue
    secciones[p.seccion].push({ id: a.id, url: urlFoto(a.id), titulo: p.titulo || '', categoria: p.categoria || '', orden: Number(p.orden) || 0 })
  }
  for (const lista of Object.values(secciones)) lista.sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id))
  return secciones
}

export function validarFotoNueva(body) {
  const seccion = String(body.seccion || '')
  if (!SECCIONES_WEB[seccion]) falla('Sección no válida')
  const tipo = String(body.tipo || 'image/jpeg')
  if (!/^image\/(jpeg|png|webp)$/.test(tipo)) falla('La foto debe ser JPG, PNG o WebP')
  const datos = Buffer.from(String(body.datos || ''), 'base64')
  if (datos.length < 200) falla('Falta la foto')
  if (datos.length > 4.5e6) falla('La foto pesa demasiado (máximo 4,5 MB)')
  const categoria = seccion === 'galeria' && CATEGORIAS_GALERIA[body.categoria] ? body.categoria : ''
  return { seccion, tipo, datos, titulo: texto(body.titulo, 80), categoria }
}

export async function subirFotoWeb(almacen, body) {
  const f = validarFotoNueva(body)
  const actuales = fotosPorSeccion(await almacen.listar())[f.seccion]
  if (actuales.length >= SECCIONES_WEB[f.seccion].max && SECCIONES_WEB[f.seccion].max === 1) {
    // Tarjetas de una sola foto: la nueva reemplaza a la anterior.
    for (const vieja of actuales) await almacen.borrar(vieja.id)
  } else if (actuales.length >= SECCIONES_WEB[f.seccion].max) falla(`Esta sección admite hasta ${SECCIONES_WEB[f.seccion].max} fotos`)
  const orden = actuales.length ? Math.max(...actuales.map(a => a.orden)) + 1 : 1
  const id = await almacen.subir({ ...f, orden })
  return { id, url: urlFoto(id) }
}

// Nuevo orden de una seccion (ids en el orden que quedaron) o cambio de titulo/categoria.
export async function editarFotosWeb(almacen, body) {
  if (body.accion === 'borrar') { await almacen.borrar(String(body.id || '')); return }
  if (body.accion === 'ordenar') {
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(String)
    const actuales = new Set(fotosPorSeccion(await almacen.listar())[body.seccion]?.map(f => f.id) || [])
    for (const [i, id] of ids.entries()) if (actuales.has(id)) await almacen.actualizar(id, { orden: String(i + 1) })
    return
  }
  if (body.accion === 'editar') {
    const cambios = { titulo: texto(body.titulo, 80) }
    if (body.categoria !== undefined) cambios.categoria = CATEGORIAS_GALERIA[body.categoria] ? body.categoria : ''
    await almacen.actualizar(String(body.id || ''), cambios)
    return
  }
  falla('Acción no válida')
}

// ---------- Contacto ----------
export function validarContacto(body) {
  if (body.website) falla('Solicitud inválida')  // honeypot: los bots llenan todo
  const c = { nombre: texto(body.nombre, 80), email: texto(body.email, 120).toLowerCase(), telefono: texto(body.telefono, 30), mensaje: String(body.mensaje ?? '').trim().slice(0, 3000) }
  if (!c.nombre) falla('Escribe tu nombre')
  if (!correoValido(c.email) && c.telefono.replace(/\D/g, '').length < 8) falla('Déjanos un correo o un teléfono para responderte')
  if (c.email && !correoValido(c.email)) falla('Revisa tu correo')
  if (c.mensaje.length < 5) falla('Escribe tu mensaje')
  return c
}

export function correoContacto(c, avisoA) {
  return {
    para: avisoA, responderA: correoValido(c.email) ? c.email : undefined,
    asunto: `Contacto web: ${c.nombre}`,
    texto: [`${c.nombre} escribió desde el formulario de contacto de la web.`, '', `Correo: ${c.email || '—'}`, `Teléfono: ${c.telefono || '—'}`, '', c.mensaje, '',
      ...(c.telefono ? [`WhatsApp: https://wa.me/${whatsappDe(c.telefono)}`] : [])].join('\n'),
  }
}

// Celular chileno a formato wa.me (569XXXXXXXX).
export function whatsappDe(telefono) {
  const d = String(telefono || '').replace(/\D/g, '')
  if (d.length === 9 && d.startsWith('9')) return '56' + d
  if (d.length === 8) return '569' + d
  return d
}

// ---------- Enviar fotos o video para cotizar ----------
// 1) iniciar: valida los datos y la lista de archivos, crea la carpeta del cliente en Drive y una
//    subida reanudable por archivo. 2) El navegador manda cada archivo en trozos (subirTrozo).
// 3) terminar: correo al admin con el link de la carpeta y un acuse al cliente.
export const LIMITES_SUBIDA = { archivos: 10, porArchivo: 500e6, total: 1e9, trozo: 3 * 1024 * 1024 }
const TIPOS_SUBIDA = /^(image\/[\w.+-]+|video\/[\w.+-]+)$/

export function validarSolicitudFotos(body) {
  if (body.website) falla('Solicitud inválida')
  const s = {
    nombre: texto(body.nombre, 80), email: texto(body.email, 120).toLowerCase(), telefono: texto(body.telefono, 30),
    comuna: texto(body.comuna, 120), medidas: texto(body.medidas, 300), comentarios: String(body.comentarios ?? '').trim().slice(0, 3000),
  }
  if (!s.nombre) falla('Escribe tu nombre')
  if (!correoValido(s.email)) falla('Revisa tu correo: ahí te enviaremos la cotización')
  if (s.telefono.replace(/\D/g, '').length < 8) falla('Revisa tu celular')
  const archivos = (Array.isArray(body.archivos) ? body.archivos : []).map(a => ({
    nombre: texto(a?.nombre, 120).replace(/[\\/:*?"<>|]/g, '_') || 'archivo', tipo: String(a?.tipo || ''), tamano: Math.floor(Number(a?.tamano) || 0),
  }))
  if (!archivos.length) falla('Agrega al menos una foto o video')
  if (archivos.length > LIMITES_SUBIDA.archivos) falla(`Puedes enviar hasta ${LIMITES_SUBIDA.archivos} archivos`)
  for (const a of archivos) {
    if (!TIPOS_SUBIDA.test(a.tipo)) falla(`"${a.nombre}" no es una foto ni un video`)
    if (a.tamano <= 0) falla(`"${a.nombre}" está vacío`)
    if (a.tamano > LIMITES_SUBIDA.porArchivo) falla(`"${a.nombre}" pesa más de 500 MB`)
  }
  if (archivos.reduce((t, a) => t + a.tamano, 0) > LIMITES_SUBIDA.total) falla('Entre todos los archivos pesan más de 1 GB')
  return { ...s, archivos }
}

export async function iniciarSolicitudFotos(deps, body, ahora = new Date()) {
  const s = validarSolicitudFotos(body)
  const fecha = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
  // Los datos del cliente quedan en la carpeta: el correo final sale de ahi, no del navegador.
  const { archivos, ...datos } = s
  const carpeta = await deps.solicitudes.crearCarpeta(`${fecha} ${s.nombre}`, datos)
  const subidas = []
  for (const a of archivos) subidas.push({ ...a, sesion: await deps.solicitudes.iniciarSubida(carpeta.id, a) })
  return { carpeta: carpeta.id, subidas, trozo: LIMITES_SUBIDA.trozo }
}

// Se avisa una sola vez por carpeta.
export async function terminarSolicitudFotos(deps, body) {
  const carpeta = await deps.solicitudes.carpeta(String(body.carpeta || ''))
  if (!carpeta) falla('No encontramos tus archivos. Intenta de nuevo.')
  if (carpeta.avisada) return { recibidos: 0, acuse: false, repetida: true }
  const recibidos = await deps.solicitudes.archivos(carpeta.id)
  if (!recibidos.length) falla('No alcanzaron a llegar tus archivos. Intenta de nuevo.')
  const s = carpeta.datos
  await deps.solicitudes.marcarAvisada(carpeta.id)
  await deps.enviarCorreo(correoSolicitudAdmin(s, carpeta, recibidos, deps.avisoA))
  await deps.avisar?.(avisoSolicitudFotos(s, recibidos.length))
  let acuse = true
  try { await deps.enviarCorreo(correoSolicitudCliente(s)) } catch (e) { acuse = false; console.warn('Acuse al cliente no enviado:', e.message) }
  return { recibidos: recibidos.length, acuse }
}

const mb = n => (n / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' MB'

export function correoSolicitudAdmin(s, carpeta, recibidos, avisoA) {
  return {
    para: avisoA, responderA: s.email,
    asunto: `📸 Cotizar por fotos: ${s.nombre}${s.comuna ? ' · ' + s.comuna : ''}`,
    texto: [
      `${s.nombre} envió ${recibidos.length} ${recibidos.length === 1 ? 'archivo' : 'archivos'} para que le cotices.`, '',
      `Correo: ${s.email}`, `Celular: ${s.telefono}`, `Comuna / dirección: ${s.comuna || '—'}`, `Medidas aproximadas: ${s.medidas || '—'}`, '',
      'Comentarios:', s.comentarios || '—', '',
      `📁 Carpeta en Drive: ${carpeta.url}`,
      ...recibidos.map(a => `   · ${a.nombre}${a.tamano ? ` (${mb(a.tamano)})` : ''}`), '',
      `WhatsApp: https://wa.me/${whatsappDe(s.telefono)}`,
      'Responde este correo para escribirle directamente.',
    ].join('\n'),
  }
}

export function correoSolicitudCliente(s) {
  const nombre = s.nombre.split(' ')[0]
  return {
    para: s.email, asunto: 'Recibimos tus fotos · Repisas Don Maxi',
    texto: [
      `¡Hola ${nombre}!`, '',
      'Recibimos tus fotos para cotizar tus repisas. Las revisamos y te enviamos la cotización a este correo.',
      'Si nos falta alguna medida, te escribiremos por WhatsApp.', '',
      `¿Dudas? Escríbenos al WhatsApp ${WHATSAPP}.`, '',
      'Repisas Don Maxi', `⭐ ${MARCA.rating} en Google · ${MARCA.resenas} reseñas`,
    ].join('\n'),
  }
}

// ---------- Drive ----------
export async function carpetaPorNombre(drive, nombre, padre) {
  const q = [`name='${nombre.replace(/'/g, "\\'")}'`, "mimeType='application/vnd.google-apps.folder'", 'trashed=false', ...(padre ? [`'${padre}' in parents`] : [])].join(' and ')
  const r = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive' })
  if (r.data.files?.length) return r.data.files[0].id
  const c = await drive.files.create({ requestBody: { name: nombre, mimeType: 'application/vnd.google-apps.folder', ...(padre ? { parents: [padre] } : {}) }, fields: 'id' })
  return c.data.id
}

export const CARPETA_FOTOS_WEB = 'Web Don Maxi'
export const CARPETA_SOLICITUDES = 'Solicitudes web Don Maxi'

export function almacenFotosDrive(drive) {
  return {
    async listar() {
      const archivos = []
      let pageToken
      do {
        const r = await drive.files.list({ q: `appProperties has { key='${MARCA_FOTO}' and value='1' } and trashed=false`, fields: 'nextPageToken,files(id,appProperties)', pageSize: 1000, pageToken, spaces: 'drive' })
        archivos.push(...(r.data.files || [])); pageToken = r.data.nextPageToken
      } while (pageToken)
      return archivos
    },
    async subir({ seccion, tipo, datos, titulo, categoria, orden }) {
      const { Readable } = await import('stream')
      const carpeta = await carpetaPorNombre(drive, CARPETA_FOTOS_WEB)
      const r = await drive.files.create({
        requestBody: { name: `${seccion}-${Date.now()}.${tipo.split('/')[1].replace('jpeg', 'jpg')}`, parents: [carpeta], appProperties: { [MARCA_FOTO]: '1', seccion, titulo, categoria, orden: String(orden) } },
        media: { mimeType: tipo, body: Readable.from(datos) }, fields: 'id',
      })
      return r.data.id
    },
    async borrar(id) { if (await esFotoWeb(drive, id)) await drive.files.update({ fileId: id, requestBody: { trashed: true } }) },
    async actualizar(id, cambios) { if (await esFotoWeb(drive, id)) await drive.files.update({ fileId: id, requestBody: { appProperties: cambios } }) },
    async leer(id) {
      if (!(await esFotoWeb(drive, id))) return null
      const meta = await drive.files.get({ fileId: id, fields: 'mimeType' })
      const r = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'arraybuffer' })
      return { tipo: meta.data.mimeType, datos: Buffer.from(r.data) }
    },
  }
}

async function esFotoWeb(drive, id) {
  if (!/^[\w-]{10,100}$/.test(id)) return false
  try {
    const r = await drive.files.get({ fileId: id, fields: 'appProperties,trashed' })
    return r.data.appProperties?.[MARCA_FOTO] === '1' && !r.data.trashed
  } catch { return false }
}

// Subidas de los clientes: carpeta propia por solicitud y subida reanudable de Drive. El navegador
// no habla con Google: manda cada trozo a sitio.mjs, que lo reenvia a la sesion (sin CORS ni token).
const SESION_DRIVE = /^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?/

export function almacenSolicitudesDrive(drive, auth) {
  return {
    async crearCarpeta(nombre, datos) {
      const raiz = await carpetaPorNombre(drive, CARPETA_SOLICITUDES)
      const r = await drive.files.create({ requestBody: { name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [raiz], appProperties: { solicitudWeb: '1' }, description: JSON.stringify(datos, null, 1) }, fields: 'id' })
      return { id: r.data.id }
    },
    async iniciarSubida(carpetaId, a) {
      const r = await auth.request({
        url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', method: 'POST',
        headers: { 'X-Upload-Content-Type': a.tipo, 'X-Upload-Content-Length': String(a.tamano), 'Content-Type': 'application/json; charset=UTF-8' },
        data: { name: a.nombre, parents: [carpetaId] },
      })
      const sesion = r.headers?.location || r.headers?.get?.('location')
      if (!sesion) throw new ErrorSitio('No se pudo preparar la subida', 502)
      return sesion
    },
    async subirTrozo(sesion, inicio, total, datos) {
      if (!SESION_DRIVE.test(sesion)) falla('Subida no válida')
      const fin = inicio + datos.length - 1
      const r = await fetch(sesion, { method: 'PUT', headers: { 'Content-Range': `bytes ${inicio}-${fin}/${total}`, 'Content-Length': String(datos.length) }, body: datos })
      if (r.status === 308) return { completo: false }
      if (r.ok) return { completo: true }
      throw new ErrorSitio(`La subida falló (${r.status}). Intenta de nuevo.`, 502)
    },
    async carpeta(id) {
      if (!/^[\w-]{10,100}$/.test(id)) return null
      try {
        const r = await drive.files.get({ fileId: id, fields: 'id,appProperties,webViewLink,trashed,description' })
        if (r.data.appProperties?.solicitudWeb !== '1' || r.data.trashed) return null
        return { id, url: r.data.webViewLink || `https://drive.google.com/drive/folders/${id}`, datos: JSON.parse(r.data.description || '{}'), avisada: r.data.appProperties.avisada === '1' }
      } catch { return null }
    },
    async marcarAvisada(id) { await drive.files.update({ fileId: id, requestBody: { appProperties: { avisada: '1' } } }) },
    async archivos(id) {
      const r = await drive.files.list({ q: `'${id}' in parents and trashed=false`, fields: 'files(name,size)', spaces: 'drive' })
      return (r.data.files || []).map(f => ({ nombre: f.name, tamano: Number(f.size) || 0 }))
    },
  }
}

// Valida y reenvia un trozo de archivo (base64) a su sesion de subida.
export async function subirTrozoSolicitud(deps, body) {
  const inicio = Math.floor(Number(body.inicio)), total = Math.floor(Number(body.total))
  const datos = Buffer.from(String(body.datos || ''), 'base64')
  if (!(inicio >= 0) || !(total > 0) || total > LIMITES_SUBIDA.porArchivo || !datos.length || datos.length > LIMITES_SUBIDA.trozo || inicio + datos.length > total) falla('Trozo no válido')
  // Todos los trozos menos el ultimo deben ser multiplos de 256 KB (regla de Drive).
  if (inicio + datos.length < total && datos.length % (256 * 1024)) falla('Trozo no válido')
  return deps.solicitudes.subirTrozo(String(body.sesion || ''), inicio, total, datos)
}

// ---------- Almacenes en memoria (pruebas y entorno local) ----------
export function almacenFotosMemoria(inicial = []) {
  const archivos = new Map(inicial.map(a => [a.id, a]))
  let n = 0
  return {
    archivos,
    async listar() { return [...archivos.values()].map(({ id, appProperties }) => ({ id, appProperties })) },
    async subir({ seccion, tipo, datos, titulo, categoria, orden }) {
      const id = `fotoweb${String(++n).padStart(6, '0')}${Date.now().toString(36)}`
      archivos.set(id, { id, tipo, datos, appProperties: { [MARCA_FOTO]: '1', seccion, titulo, categoria, orden: String(orden) } })
      return id
    },
    async borrar(id) { archivos.delete(id) },
    async actualizar(id, cambios) { const a = archivos.get(id); if (a) a.appProperties = { ...a.appProperties, ...cambios } },
    async leer(id) { const a = archivos.get(id); return a ? { tipo: a.tipo, datos: a.datos } : null },
  }
}

export function almacenSolicitudesMemoria() {
  const carpetas = new Map()
  const sesiones = new Map()
  let n = 0
  return {
    carpetas,
    async crearCarpeta(nombre, datos) { const id = `carpeta${String(++n).padStart(6, '0')}`; carpetas.set(id, { id, nombre, datos, archivos: [] }); return { id } },
    async iniciarSubida(carpetaId, a) { const s = `local-subida-${++n}`; sesiones.set(s, { carpetaId, ...a, partes: [] }); return s },
    async subirTrozo(sesion, inicio, total, datos) {
      const s = sesiones.get(sesion)
      if (!s) falla('Subida no válida')
      s.partes.push(datos)
      const recibido = s.partes.reduce((t, p) => t + p.length, 0)
      if (recibido < total) return { completo: false }
      carpetas.get(s.carpetaId).archivos.push({ nombre: s.nombre, tamano: recibido, datos: Buffer.concat(s.partes) })
      sesiones.delete(sesion)
      return { completo: true }
    },
    async carpeta(id) { const c = carpetas.get(id); return c ? { id, url: `https://drive.google.com/drive/folders/${id}`, datos: c.datos, avisada: Boolean(c.avisada) } : null },
    async marcarAvisada(id) { carpetas.get(id).avisada = true },
    async archivos(id) { return (carpetas.get(id)?.archivos || []).map(({ nombre, tamano }) => ({ nombre, tamano })) },
  }
}

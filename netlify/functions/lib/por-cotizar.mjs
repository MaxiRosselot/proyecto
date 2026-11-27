// Por cotizar: las cotizaciones que hay que hacer, vengan de donde vengan.
//
// Se anotan a mano las que llegan por WhatsApp, Instagram u otro lado (medidas, fotos en el chat).
// Las demas salen solas en el panel (src/admin/porCotizar.js): las fotos o videos que mandan por la
// web (carpetas en Drive), las visitas realizadas sin cotizar y las cotizaciones automaticas de /cotiza.
// De esas solo se guarda una fila cuando se marcan a mano (ya cotizada / no cotizar), con su ref.
//
// Pestaña "Por cotizar" de la planilla, una fila por pendiente; se reescribe entera (son pocas).

export const HOJA_POR_COTIZAR = 'Por cotizar'
export const ENCABEZADOS_POR_COTIZAR = ['Id', 'Origen', 'Ref', 'Creado', 'Nombre', 'Teléfono', 'Instagram', 'Email', 'Dirección', 'Detalle', 'Estado', 'Cotización', 'Actualizado']
export const ORIGENES = ['whatsapp', 'instagram', 'correo', 'visita', 'web', 'otro']
export const ORIGENES_A_MANO = ['whatsapp', 'instagram', 'otro']
export const ESTADOS_POR_COTIZAR = ['pendiente', 'cotizada', 'descartada']

export class ErrorPorCotizar extends Error { constructor(estado, mensaje) { super(mensaje); this.estado = estado } }
const falla = (estado, mensaje) => { throw new ErrorPorCotizar(estado, mensaje) }
const texto = (v, max) => String(v ?? '').trim().slice(0, max)
const fechaValida = f => /^\d{4}-\d{2}-\d{2}$/.test(f || '')
const digitos = s => String(s || '').replace(/\D/g, '')
export const usuarioInstagram = s => texto(s, 80).replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '').trim()

function limpiar(p, hoy) {
  const origen = ORIGENES.includes(p.origen) ? p.origen : 'otro'
  return {
    id: /^pc\d{1,6}$/.test(p.id || '') ? p.id : '',
    origen,
    ref: texto(p.ref, 120),
    creado: fechaValida(p.creado) ? p.creado : hoy,
    nombre: texto(p.nombre, 80),
    telefono: texto(p.telefono, 30),
    instagram: usuarioInstagram(p.instagram),
    email: texto(p.email, 120),
    direccion: texto(p.direccion, 160),
    detalle: texto(p.detalle, 2000),
    estado: ESTADOS_POR_COTIZAR.includes(p.estado) ? p.estado : 'pendiente',
    cotNum: /^\d{1,6}$/.test(String(p.cotNum ?? '')) ? String(p.cotNum) : '',
    actualizado: fechaValida(p.actualizado) ? p.actualizado : (fechaValida(p.creado) ? p.creado : hoy),
  }
}

export const porCotizarAFila = p => [p.id, p.origen, p.ref, p.creado, p.nombre, p.telefono, p.instagram, p.email, p.direccion, p.detalle, p.estado, p.cotNum, p.actualizado]
export const filaAPorCotizar = (f, hoy) => limpiar({
  id: f[0], origen: f[1], ref: f[2], creado: f[3], nombre: f[4], telefono: f[5], instagram: f[6], email: f[7],
  direccion: f[8], detalle: f[9], estado: f[10], cotNum: f[11], actualizado: f[12],
}, hoy)

const siguienteId = lista => 'pc' + (Math.max(0, ...lista.map(p => Number(p.id.slice(2)) || 0)) + 1)

// almacen: { leerFilas() → filas | null (sin pestaña), guardarFilas(filas) }
export async function listarPorCotizar(almacen, hoy) {
  const filas = await almacen.leerFilas()
  return (filas || []).filter(f => f?.[0]).map(f => filaAPorCotizar(f, hoy))
}

// cambios:
//   { accion: 'anotar', item }                  → nueva (WhatsApp, Instagram u otro). Si ya hay una
//                                                 pendiente con el mismo celular o Instagram, se le suma el detalle.
//   { accion: 'editar', id, item }
//   { accion: 'estado', id, estado, cotNum? }    → una anotada a mano
//   { accion: 'estado', origen, ref, estado, cotNum?, nombre?, telefono?, creado? } → una que sale sola (correo, visita, web)
//   { accion: 'borrar', id }
export async function cambiarPorCotizar(almacen, cambios, hoy) {
  const lista = await listarPorCotizar(almacen, hoy)
  let resultado
  if (cambios.accion === 'anotar') {
    const nuevo = limpiar({ ...cambios.item, id: '', ref: '', estado: 'pendiente', cotNum: '', creado: hoy, actualizado: hoy }, hoy)
    if (!ORIGENES_A_MANO.includes(nuevo.origen)) nuevo.origen = 'otro'
    if (!nuevo.nombre && !nuevo.telefono && !nuevo.instagram) falla(400, 'Escribe al menos el nombre, el celular o el Instagram')
    const tel = digitos(nuevo.telefono).slice(-8)
    const igual = lista.find(p => p.estado === 'pendiente' && !p.ref && (
      (tel.length === 8 && digitos(p.telefono).slice(-8) === tel) ||
      (nuevo.instagram && p.instagram.toLowerCase() === nuevo.instagram.toLowerCase())))
    if (igual) {
      // Mismo cliente que ya estaba esperando: se completa la que habia en vez de duplicarla.
      for (const k of ['nombre', 'telefono', 'instagram', 'email', 'direccion']) if (!igual[k] && nuevo[k]) igual[k] = nuevo[k]
      if (nuevo.detalle && !igual.detalle.includes(nuevo.detalle)) igual.detalle = texto([igual.detalle, nuevo.detalle].filter(Boolean).join('\n'), 2000)
      igual.actualizado = hoy
      resultado = { ...igual, yaEstaba: true }
    } else {
      nuevo.id = siguienteId(lista)
      lista.push(nuevo)
      resultado = nuevo
    }
  } else if (cambios.accion === 'editar') {
    const i = lista.findIndex(p => p.id === cambios.id)
    if (i < 0) falla(404, 'Ya no está en la lista')
    const antes = lista[i]
    lista[i] = resultado = limpiar({ ...antes, ...cambios.item, id: antes.id, origen: ORIGENES_A_MANO.includes(cambios.item?.origen) && !antes.ref ? cambios.item.origen : antes.origen, ref: antes.ref, creado: antes.creado, actualizado: hoy }, hoy)
  } else if (cambios.accion === 'estado') {
    if (!ESTADOS_POR_COTIZAR.includes(cambios.estado)) falla(400, 'Estado desconocido')
    let p = cambios.id ? lista.find(x => x.id === cambios.id) : lista.find(x => x.ref && x.origen === cambios.origen && x.ref === String(cambios.ref))
    if (!p && cambios.id) falla(404, 'Ya no está en la lista')
    if (!p) {
      if (!['correo', 'visita', 'web'].includes(cambios.origen) || !texto(cambios.ref, 120)) falla(400, 'Falta de dónde viene')
      p = limpiar({ origen: cambios.origen, ref: cambios.ref, nombre: cambios.nombre, telefono: cambios.telefono, creado: cambios.creado, id: siguienteId(lista) }, hoy)
      lista.push(p)
    }
    p.estado = cambios.estado
    p.cotNum = cambios.estado === 'cotizada' && /^\d{1,6}$/.test(String(cambios.cotNum ?? '')) ? String(cambios.cotNum) : (cambios.estado === 'pendiente' ? '' : p.cotNum)
    p.actualizado = hoy
    resultado = p
  } else if (cambios.accion === 'borrar') {
    const i = lista.findIndex(p => p.id === cambios.id)
    if (i < 0) falla(404, 'Ya no está en la lista')
    lista.splice(i, 1)
  } else falla(400, 'Acción desconocida')
  await almacen.guardarFilas(lista.map(porCotizarAFila))
  return { item: resultado, anotadas: lista }
}

// Una carpeta de "Envíanos fotos o un video" (Drive) como pendiente. Sus datos van en la descripcion.
export function carpetaAPendiente(c) {
  let d = {}
  try { d = JSON.parse(c.description || '{}') } catch { d = {} }
  const detalle = [d.medidas && `Medidas: ${d.medidas}`, d.comentarios].filter(Boolean).join('\n')
  return {
    origen: 'correo', ref: c.id,
    creado: String(c.createdTime || '').slice(0, 10) || (c.name || '').slice(0, 10),
    nombre: d.nombre || String(c.name || '').slice(11), telefono: d.telefono || '', email: d.email || '',
    direccion: d.comuna || '', detalle, link: c.webViewLink || `https://drive.google.com/drive/folders/${c.id}`,
    archivos: Number(c.archivos) || 0,
  }
}

export function almacenPorCotizarSheets(sheets, spreadsheetId) {
  return {
    async leerFilas() {
      try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${HOJA_POR_COTIZAR}'!A2:M` })
        return res.data.values || []
      } catch (e) {
        if (String(e?.message || e).includes('Unable to parse range')) return null
        throw e
      }
    },
    async guardarFilas(filas) {
      const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' })
      if (!meta.data.sheets.some(s => s.properties.title === HOJA_POR_COTIZAR)) {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: HOJA_POR_COTIZAR } } }] } })
      }
      await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${HOJA_POR_COTIZAR}'!A:M` })
      await sheets.spreadsheets.values.update({
        spreadsheetId, range: `'${HOJA_POR_COTIZAR}'!A1`, valueInputOption: 'RAW',
        requestBody: { values: [ENCABEZADOS_POR_COTIZAR, ...filas] },
      })
    },
  }
}

export function almacenPorCotizarMemoria(filas = null) {
  let guardadas = filas
  return {
    get filas() { return guardadas },
    async leerFilas() { return guardadas && guardadas.map(f => [...f]) },
    async guardarFilas(f) { guardadas = f.map(x => [...x]) },
  }
}

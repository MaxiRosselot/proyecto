// Cotizaciones guardadas en la hoja "Cotizaciones" de Google Sheets.
//
// La logica no depende de Google: recibe un "almacen" con leer/agregar/actualizar/borrar filas.
// En produccion es la hoja (almacenSheets); en local y en los tests, un arreglo en memoria.
// Asi lo que se prueba es exactamente lo que corre en Netlify.
import { gzipSync, gunzipSync } from 'node:zlib'

export const HOJA = 'Cotizaciones'
// Primer numero cuando la hoja esta vacia. Es el que usaba el cotizador antes de que el
// correlativo lo llevara el servidor.
export const NUMERO_INICIAL = 1421

// Columnas A-Q. La Q es nueva: el proyecto del configurador 3D con que se armo la cotizacion.
export const ENCABEZADOS = ['N° Cot', 'Nombre', 'Email', 'Teléfono', 'Dirección', 'Fecha Visita', 'Subtotal', 'IVA', 'Total', 'Estado', 'Motivo Rechazo', 'Notas', 'Repisas (JSON)', 'Adicionales (JSON)', 'Creado', 'PDF URL', 'Proyecto 3D']
export const ULTIMA_COLUMNA = 'Q'
const CAMPOS = ['cotNum', 'nombre', 'email', 'telefono', 'direccion', 'fechaVisita', 'subtotal', 'iva', 'total', 'status', 'motivoRechazo', 'notas', 'repisas', 'adicionales', 'creado', 'pdfUrl', 'proyecto3d']
// Lo que se puede cambiar al actualizar. El numero identifica la fila y la fecha de creacion
// es historia: ninguno de los dos se reescribe.
const EDITABLES = CAMPOS.filter(c => c !== 'cotNum' && c !== 'creado')

// Google Sheets no acepta mas de 50.000 caracteres por celda.
export const LIMITE_CELDA = 50000
const PREFIJO_GZIP = 'gz:'

export class ErrorCotizacion extends Error {
  constructor(estado, mensaje) { super(mensaje); this.estado = estado }
}

// ── Proyecto 3D ──────────────────────────────────────────────────────────────

// JSON legible si cabe en la celda; si no, comprimido. Si ni asi cabe se rechaza: guardar la
// cotizacion sin su modelo seria peor que avisar.
export function codificarProyecto(proyecto) {
  if (proyecto === null || proyecto === undefined) return ''
  const json = JSON.stringify(proyecto)
  if (json.length <= LIMITE_CELDA) return json
  const comprimido = PREFIJO_GZIP + gzipSync(json).toString('base64')
  if (comprimido.length <= LIMITE_CELDA) return comprimido
  throw new ErrorCotizacion(413, 'El proyecto 3D es demasiado grande para guardarse en la planilla')
}

export function decodificarProyecto(texto) {
  if (!texto) return null
  const json = texto.startsWith(PREFIJO_GZIP)
    ? gunzipSync(Buffer.from(texto.slice(PREFIJO_GZIP.length), 'base64')).toString('utf8')
    : texto
  return JSON.parse(json)
}

// ── Fechas ───────────────────────────────────────────────────────────────────

// "Creado" se escribe como lo muestra Chile: "05-10-2026, 1:23:45 p. m.". new Date() no lo
// entiende (lo lee como mes-dia o lo da por invalido), y por eso el orden salia mal.
// Tambien acepta la hora en 24 h y fechas ISO. Devuelve milisegundos o null.
export function creadoEnMs(creado) {
  const texto = String(creado || '').trim()
  if (!texto) return null
  const m = texto.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:([ap])\.?\s*m\.?)?)?$/i)
  if (!m) {
    const iso = Date.parse(texto)
    return Number.isFinite(iso) ? iso : null
  }
  const [, dia, mes, anio, hora = '0', minuto = '0', segundo = '0', ampm] = m
  let h = Number(hora)
  if (ampm?.toLowerCase() === 'p' && h < 12) h += 12
  if (ampm?.toLowerCase() === 'a' && h === 12) h = 0
  // Hora de Santiago. Usar siempre -03:00 corre algunas una hora en invierno, pero no cambia
  // el orden entre cotizaciones, que es para lo que se usa.
  return Date.UTC(Number(anio), Number(mes) - 1, Number(dia), h + 3, Number(minuto), Number(segundo))
}

export function fechaCreacionAhora(ahora = new Date()) {
  return ahora.toLocaleString('es-CL', { timeZone: 'America/Santiago' })
}

// Mas nuevas arriba. Sin fecha legible van al final; a igual fecha, el numero mas alto primero.
export function ordenarPorCreacion(cotizaciones) {
  const clave = q => q.creadoMs ?? -Infinity
  return [...cotizaciones].sort((a, b) => (clave(b) - clave(a)) || (Number(b.cotNum) - Number(a.cotNum)))
}

// ── Filas ────────────────────────────────────────────────────────────────────

function jsonOr(texto, porDefecto) {
  try { return texto ? JSON.parse(texto) : porDefecto } catch { return porDefecto }
}

const montoACelda = v => (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v ?? '')

export function filaACotizacion(valores, { conProyecto = false } = {}) {
  const v = i => valores[i] ?? ''
  const cotizacion = {
    cotNum: String(v(0)), nombre: v(1), email: v(2), telefono: v(3), direccion: v(4),
    fechaVisita: v(5), subtotal: v(6), iva: v(7), total: v(8),
    status: v(9) || 'por confirmar', motivoRechazo: v(10), notas: v(11),
    repisas: jsonOr(v(12), []), adicionales: jsonOr(v(13), {}),
    creado: v(14), creadoMs: creadoEnMs(v(14)), pdfUrl: v(15),
    tieneProyecto3d: Boolean(v(16)),
  }
  if (conProyecto) {
    try { cotizacion.proyecto3d = decodificarProyecto(v(16)) }
    catch (e) { console.warn(`Proyecto 3D ilegible en la cotizacion ${cotizacion.cotNum}:`, e.message); cotizacion.proyecto3d = null }
  }
  return cotizacion
}

export function cotizacionAFila(c) {
  return [
    String(c.cotNum), c.nombre || '', c.email || '', c.telefono || '', c.direccion || '',
    c.fechaVisita || '', montoACelda(c.subtotal), montoACelda(c.iva), montoACelda(c.total),
    c.status || 'por confirmar', c.motivoRechazo || '', c.notas || '',
    JSON.stringify(c.repisas || []), JSON.stringify(c.adicionales || {}),
    c.creado || '', c.pdfUrl || '', codificarProyecto(c.proyecto3d),
  ]
}

const numeroDeFila = valores => String(valores?.[0] ?? '').trim()

export function siguienteNumero(filas) {
  let mayor = NUMERO_INICIAL - 1
  for (const { valores } of filas) {
    const n = Number(numeroDeFila(valores))
    if (Number.isSafeInteger(n) && n > mayor) mayor = n
  }
  return mayor + 1
}

function buscar(filas, cotNum) {
  return filas.find(f => numeroDeFila(f.valores) === String(cotNum).trim())
}

function numeroValido(cotNum) {
  const n = Number(cotNum)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

// Relee la fila recien escrita y compara lo que importa. Si la planilla devolviera otra cosa
// (fila equivocada, celda truncada) es mejor fallar ahora que descubrirlo al reabrir.
async function verificarGuardado(almacen, fila, esperada) {
  const leida = await almacen.leerFila(fila)
  const guardada = leida && filaACotizacion(leida, { conProyecto: true })
  const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
  if (!guardada || guardada.cotNum !== String(esperada.cotNum)
    || !igual(guardada.proyecto3d, esperada.proyecto3d)
    || !igual(guardada.repisas, esperada.repisas || [])) {
    throw new ErrorCotizacion(500, `La cotización N° ${esperada.cotNum} no quedó guardada como se envió`)
  }
}

// ── Operaciones ──────────────────────────────────────────────────────────────

export async function listarCotizaciones(almacen) {
  const filas = await almacen.leerFilas()
  const cotizaciones = filas.filter(f => numeroDeFila(f.valores)).map(f => filaACotizacion(f.valores))
  return { quotes: ordenarPorCreacion(cotizaciones), siguiente: siguienteNumero(filas) }
}

export async function obtenerCotizacion(almacen, cotNum) {
  const encontrada = buscar(await almacen.leerFilas(), cotNum)
  return encontrada ? filaACotizacion(encontrada.valores, { conProyecto: true }) : null
}

export async function siguienteDisponible(almacen) {
  return siguienteNumero(await almacen.leerFilas())
}

// Crea una cotizacion nueva. Nunca pisa una existente: si el numero ya esta tomado responde 409
// con el siguiente libre, y el cotizador rehace el PDF con ese numero.
export async function crearCotizacion(almacen, datos, ahora = new Date()) {
  if (!String(datos.nombre || '').trim()) throw new ErrorCotizacion(400, 'Falta el nombre del cliente')
  await almacen.asegurarEncabezado()
  const filas = await almacen.leerFilas()
  const cotNum = datos.cotNum === undefined || datos.cotNum === '' ? siguienteNumero(filas) : numeroValido(datos.cotNum)
  if (!cotNum) throw new ErrorCotizacion(400, 'Número de cotización inválido')
  if (buscar(filas, cotNum))
    return { estado: 409, respuesta: { ok: false, error: `La cotización N° ${cotNum} ya existe`, siguiente: siguienteNumero(filas) } }

  const nueva = { status: 'por confirmar', ...pick(datos, EDITABLES), cotNum, creado: fechaCreacionAhora(ahora) }
  const fila = await almacen.agregar(cotizacionAFila(nueva))

  // Dos cotizadores pueden leer el mismo "siguiente" a la vez. Despues de escribir se mira
  // quien quedo primero con ese numero; el que llego despues borra su fila y pide otro.
  const despues = await almacen.leerFilas()
  const primera = buscar(despues, cotNum)
  if (primera && primera.fila !== fila) {
    await almacen.borrar(fila)
    return { estado: 409, respuesta: { ok: false, error: `La cotización N° ${cotNum} se tomó recién`, siguiente: siguienteNumero(despues) } }
  }

  await verificarGuardado(almacen, fila, nueva)
  return { estado: 201, respuesta: { ok: true, cotNum: String(cotNum), creado: nueva.creado } }
}

// Cambia solo los campos que vienen. Lo que no viene (por ejemplo el proyecto 3D al cambiar el
// estado desde la lista) se conserva tal cual estaba.
export async function actualizarCotizacion(almacen, datos) {
  const cotNum = numeroValido(datos.cotNum)
  if (!cotNum) throw new ErrorCotizacion(400, 'Falta el número de cotización')
  const encontrada = buscar(await almacen.leerFilas(), cotNum)
  if (!encontrada) throw new ErrorCotizacion(404, `La cotización N° ${cotNum} no existe`)

  const actual = filaACotizacion(encontrada.valores, { conProyecto: true })
  const cambios = pick(datos, EDITABLES)
  const nueva = { ...actual, ...cambios, cotNum, creado: actual.creado }
  await almacen.actualizar(encontrada.fila, cotizacionAFila(nueva))
  await verificarGuardado(almacen, encontrada.fila, nueva)
  return { estado: 200, respuesta: { ok: true, cotNum: String(cotNum) } }
}

export async function borrarCotizacion(almacen, cotNum) {
  const encontrada = buscar(await almacen.leerFilas(), cotNum)
  if (!encontrada) throw new ErrorCotizacion(404, 'Cotización no encontrada')
  await almacen.borrar(encontrada.fila)
  return { estado: 200, respuesta: { ok: true } }
}

function pick(datos, campos) {
  return Object.fromEntries(campos.filter(c => datos[c] !== undefined).map(c => [c, datos[c]]))
}

// ── Almacenes ────────────────────────────────────────────────────────────────

// Hoja de Google. Las filas de datos parten en la 2; la 1 son los encabezados.
// Se lee sin formato: los montos llegan como numeros y no como "1.234.000".
export function almacenSheets(sheets, spreadsheetId, hoja = HOJA) {
  const rango = r => `${hoja}!${r}`
  const fila = n => rango(`A${n}:${ULTIMA_COLUMNA}${n}`)
  return {
    async leerFilas() {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: rango(`A2:${ULTIMA_COLUMNA}`), valueRenderOption: 'UNFORMATTED_VALUE' })
      return (res.data.values || []).map((valores, i) => ({ fila: i + 2, valores }))
    },
    async leerFila(n) {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: fila(n), valueRenderOption: 'UNFORMATTED_VALUE' })
      return res.data.values?.[0] || null
    },
    // Crea la fila de titulos si falta, y agrega "Proyecto 3D" a hojas que tenian solo 16.
    async asegurarEncabezado() {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: fila(1) })
      const actuales = res.data.values?.[0] || []
      if (actuales.length >= ENCABEZADOS.length) return
      await sheets.spreadsheets.values.update({ spreadsheetId, range: fila(1), valueInputOption: 'RAW', requestBody: { values: [ENCABEZADOS] } })
    },
    async agregar(valores) {
      const res = await sheets.spreadsheets.values.append({ spreadsheetId, range: rango('A1'), valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: [valores] } })
      const n = Number(String(res.data.updates?.updatedRange || '').match(/!\$?[A-Z]+\$?(\d+)/)?.[1])
      if (!Number.isSafeInteger(n)) throw new Error('La planilla no informó en qué fila quedó la cotización')
      return n
    },
    async actualizar(n, valores) {
      await sheets.spreadsheets.values.update({ spreadsheetId, range: fila(n), valueInputOption: 'RAW', requestBody: { values: [valores] } })
    },
    async borrar(n) {
      const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })
      const sheetId = meta.data.sheets.find(s => s.properties.title === hoja)?.properties.sheetId
      if (sheetId === undefined) throw new ErrorCotizacion(404, 'Hoja no encontrada')
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: n - 1, endIndex: n } } }] },
      })
    },
  }
}

// Mismo contrato sobre un arreglo. Lo usan los tests y el backend local (scripts/local-dev).
// alCambiar recibe las filas cada vez que algo se escribe, para persistirlas si hace falta.
export function almacenEnMemoria(filasIniciales = [], alCambiar = () => {}) {
  const filas = filasIniciales.map(f => [...f])
  const guardar = () => alCambiar(filas)
  return {
    filas,
    async leerFilas() { return filas.map((valores, i) => ({ fila: i + 2, valores: [...valores] })) },
    async leerFila(n) { return filas[n - 2] ? [...filas[n - 2]] : null },
    async asegurarEncabezado() {},
    async agregar(valores) { filas.push([...valores]); guardar(); return filas.length + 1 },
    async actualizar(n, valores) { filas[n - 2] = [...valores]; guardar() },
    async borrar(n) { filas.splice(n - 2, 1); guardar() },
  }
}

// Respuesta HTTP comun para los handlers de Netlify.
export function respuestaDeError(error, corsHeaders) {
  const estado = error instanceof ErrorCotizacion ? error.estado : 500
  if (estado >= 500) console.error('cotizaciones:', error)
  return { statusCode: estado, headers: corsHeaders, body: JSON.stringify({ ok: false, error: error instanceof ErrorCotizacion ? error.message : String(error) }) }
}

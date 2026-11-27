// Lo que hace la función contabilidad (y el servidor local) con el almacén, las cotizaciones y
// Mercado Pago. Los cálculos están en contabilidad.mjs.
import {
  CATEGORIAS, CATEGORIA, ENCABEZADOS_BANCO, HOJA_BANCO, HOJA_CONFIG, agregarRegla, conSugerencias, descuentosDelMes,
  conciliarClientes, estadoFijos, filaAMovimiento, fusionarMovimientos, movimientosDeBancoEnLinea, saldosEncadenan, limpiarFijo, movimientoAFila, pareceFijo, parsearCartolaBci,
  reglaAprendida, resumenMercadoPago, resumenMes,
} from './contabilidad.mjs'
import { totalesCotizacion } from './totales.mjs'

export class ErrorContabilidad extends Error { constructor(estado, mensaje) { super(mensaje); this.estado = estado } }
const falla = (estado, mensaje) => { throw new ErrorContabilidad(estado, mensaje) }

const CONFIG_VACIA = { reglas: [], fijos: [], saldo: null, cargas: [] }

// fuentes: { almacen, cotizaciones: () => Promise<[]>, pagosMercadoPago?: mes => Promise<[]>, leerPdf: buffer => Promise<texto> }
export async function leerContabilidad({ almacen, cotizaciones, pagosMercadoPago }, mes, hoy) {
  const [filas, config, cots] = await Promise.all([almacen.leerMovimientos(), almacen.leerConfig(), cotizaciones()])
  const cfg = { ...CONFIG_VACIA, ...(config || {}) }
  const movimientos = conSugerencias((filas || []).map(filaAMovimiento), { reglas: cfg.reglas, cotizaciones: cots, fijos: cfg.fijos })
  let mp = null, errorMp = ''
  if (pagosMercadoPago) {
    try { mp = resumenMercadoPago(await pagosMercadoPago(mes)) } catch (e) { errorMp = e.message || 'No se pudo leer Mercado Pago' }
  }
  const meses = [...new Set(movimientos.map(m => m.fecha.slice(0, 7)))].sort().reverse()
  const nombres = Object.fromEntries(cots.map(c => [c.cotNum, c.nombre]))
  return {
    mes, meses, categorias: CATEGORIAS, saldo: cfg.saldo, cargas: cfg.cargas.slice(-10),
    movimientos: movimientos.map(m => ({ ...m, nombreCot: m.cotNum ? nombres[m.cotNum] || '' : '' })),
    resumen: resumenMes(movimientos, mes, { mp }),
    fijos: estadoFijos(cfg.fijos, movimientos, mes, hoy),
    pareceFijo: pareceFijo(movimientos, cfg.fijos),
    mp, errorMp, mpConectado: Boolean(pagosMercadoPago),
    descuentos: descuentosDelMes(cots, mes, c => totalesCotizacion(c.repisas || [], c.adicionales || {})),
    reglas: cfg.reglas.length,
    conciliacion: conciliarClientes(movimientos, cots, mes),
    // Para ligar a mano: las cotizaciones que no están rechazadas, lo justo para buscarlas.
    cotizaciones: cots.filter(c => c.status !== 'rechazada').map(c => ({
      cotNum: String(c.cotNum), nombre: c.nombre, total: Math.round(Number(c.total) || 0),
      pagado: (c.pagos || []).reduce((s2, p) => s2 + (Number(p.monto) || 0), 0),
    })),
  }
}

export async function cambiarContabilidad(fuentes, datos, ahora = new Date()) {
  const { almacen } = fuentes
  const config = { ...CONFIG_VACIA, ...((await almacen.leerConfig()) || {}) }
  const movimientos = ((await almacen.leerMovimientos()) || []).map(filaAMovimiento)
  const guardarMovs = lista => almacen.guardarMovimientos(lista.map(movimientoAFila))

  if (datos.accion === 'subir') {
    const b64 = String(datos.pdf || '').replace(/^data:[^,]*,/, '')
    if (!b64) falla(400, 'Falta el PDF')
    const texto = await fuentes.leerPdf(Buffer.from(b64, 'base64'))
    const leido = parsearCartolaBci(texto)
    if (!leido.formato) falla(400, 'Este PDF no parece una cartola de BCI. Sube la cartola o "Movimientos desde última cartola".')
    if (!leido.movimientos.length) falla(400, 'No encontré movimientos en el PDF')
    const { nuevos, todos } = fusionarMovimientos(movimientos, leido.movimientos, { origen: leido.formato === 'cartola' ? 'cartola' : 'movimientos', ahora: ahora.toISOString() })
    if (nuevos.length) await guardarMovs(todos)
    const carga = { en: ahora.toISOString(), archivo: String(datos.nombre || '').slice(0, 80), formato: leido.formato, leidos: leido.movimientos.length, nuevos: nuevos.length, cuadra: leido.cuadra, errores: leido.errores.length }
    const saldo = leido.saldoFinal != null && (!config.saldo || leido.fechaSaldo >= config.saldo.fecha) ? { monto: leido.saldoFinal, fecha: leido.fechaSaldo } : config.saldo
    await almacen.guardarConfig({ ...config, saldo, cargas: [...config.cargas, carga].slice(-50) })
    return { carga, errores: leido.errores.slice(0, 5) }
  }

  // Desde la extensión "Don Maxi: BCI al panel" (Mis Movimientos de BCI en línea).
  if (datos.accion === 'importar-web') {
    const leidos = movimientosDeBancoEnLinea(datos.movimientos)
    if (!leidos.length) falla(400, 'No llegaron movimientos de BCI')
    const cuadra = saldosEncadenan(leidos)
    const { nuevos, enriquecidos, todos } = fusionarMovimientos(movimientos, [...leidos].reverse(), { origen: 'web', ahora: ahora.toISOString() })
    if (nuevos.length || enriquecidos) await guardarMovs(todos)
    const masNuevo = leidos.reduce((x, m) => (!x || m.fecha > x.fecha ? m : x), null)
    const saldo = masNuevo?.saldo != null && (!config.saldo || masNuevo.fecha >= config.saldo.fecha) ? { monto: masNuevo.saldo, fecha: masNuevo.fecha } : config.saldo
    const carga = { en: ahora.toISOString(), archivo: 'BCI en línea (extensión)', formato: 'web', leidos: leidos.length, nuevos: nuevos.length, enriquecidos, cuadra, errores: 0 }
    await almacen.guardarConfig({ ...config, saldo, cargas: [...config.cargas, carga].slice(-50) })
    return { carga }
  }

  if (datos.accion === 'clasificar' || datos.accion === 'aceptar') {
    const cots = datos.accion === 'aceptar' ? await fuentes.cotizaciones() : []
    const sugeridos = datos.accion === 'aceptar' ? conSugerencias(movimientos, { reglas: config.reglas, cotizaciones: cots, fijos: config.fijos }) : []
    const cambios = datos.accion === 'aceptar'
      ? (datos.ids || []).map(id => { const s = sugeridos.find(m => m.id === id)?.sugerencia; return s && { id, categoria: s.categoria || undefined, cotNum: s.cotNum || undefined, fijo: s.fijo || undefined } }).filter(Boolean)
      : [datos]
    let reglas = config.reglas
    for (const c of cambios) {
      const m = movimientos.find(x => x.id === c.id) || falla(404, 'No existe ese movimiento')
      if (c.categoria !== undefined) { if (c.categoria && !CATEGORIA[c.categoria]) falla(400, 'Categoría desconocida'); m.categoria = c.categoria }
      if (c.cotNum !== undefined) m.cotNum = String(c.cotNum || '').replace(/\D/g, '')
      if (c.fijo !== undefined) { if (c.fijo && !config.fijos.some(f => f.id === c.fijo)) falla(400, 'No existe ese costo fijo'); m.fijo = c.fijo }
      if (c.nota !== undefined) m.nota = String(c.nota || '').slice(0, 200)
      if (c.contraparte !== undefined) m.contraparte = String(c.contraparte || '').replace(/\s+/g, ' ').trim().slice(0, 80)
      if (c.recordar && m.categoria) reglas = agregarRegla(reglas, reglaAprendida(m, m.categoria))
    }
    await guardarMovs(movimientos)
    if (reglas !== config.reglas) await almacen.guardarConfig({ ...config, reglas })
    return { cambiados: cambios.length }
  }

  if (datos.accion === 'manual') {
    const fecha = String(datos.fecha || '')
    const monto = Math.round(Number(datos.monto) || 0)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) falla(400, 'Fecha inválida')
    if (!monto) falla(400, 'Escribe el monto (negativo si es un gasto)')
    const glosa = String(datos.glosa || 'Movimiento manual').slice(0, 120)
    const { nuevos, todos } = fusionarMovimientos(movimientos, [{ fecha, glosa, monto }], { origen: 'manual', ahora: ahora.toISOString(), siempreNuevos: true })
    if (datos.categoria && CATEGORIA[datos.categoria]) nuevos[0].categoria = datos.categoria
    await guardarMovs(todos)
    return { movimiento: nuevos[0] }
  }

  if (datos.accion === 'borrar') {
    const m = movimientos.find(x => x.id === datos.id) || falla(404, 'No existe ese movimiento')
    if (m.origen !== 'manual') falla(400, 'Solo se pueden borrar los movimientos anotados a mano')
    await guardarMovs(movimientos.filter(x => x.id !== datos.id))
    return { borrado: datos.id }
  }

  if (datos.accion === 'guardar-fijo') {
    const fijo = limpiarFijo(datos.fijo || {}, config.fijos)
    const fijos = config.fijos.some(f => f.id === fijo.id) ? config.fijos.map(f => (f.id === fijo.id ? fijo : f)) : [...config.fijos, fijo]
    await almacen.guardarConfig({ ...config, fijos })
    // Si se creó desde un pago que ya está en el banco, ese pago queda ligado.
    if (datos.movimiento) {
      const m = movimientos.find(x => x.id === datos.movimiento)
      if (m) { m.fijo = fijo.id; if (fijo.categoria && !m.categoria) m.categoria = fijo.categoria; await guardarMovs(movimientos) }
    }
    return { fijo }
  }

  if (datos.accion === 'borrar-fijo') {
    await almacen.guardarConfig({ ...config, fijos: config.fijos.filter(f => f.id !== datos.id) })
    if (movimientos.some(m => m.fijo === datos.id)) await guardarMovs(movimientos.map(m => (m.fijo === datos.id ? { ...m, fijo: '' } : m)))
    return { borrado: datos.id }
  }

  if (datos.accion === 'olvidar-reglas') {
    await almacen.guardarConfig({ ...config, reglas: [] })
    return { reglas: 0 }
  }

  falla(400, 'Acción desconocida')
}

// Pagos aprobados de Mercado Pago de un mes (hora de Chile), de a 100.
export function pagosMercadoPagoDelMes(token, fetchFn = fetch) {
  return async mes => {
    const [a, m] = mes.split('-').map(Number)
    const fin = new Date(Date.UTC(a, m, 0)).getUTCDate()
    const desde = `${mes}-01T00:00:00.000-03:00`, hasta = `${mes}-${String(fin).padStart(2, '0')}T23:59:59.999-03:00`
    const todos = []
    for (let offset = 0; offset < 1000; offset += 100) {
      const q = new URLSearchParams({ sort: 'date_approved', criteria: 'asc', range: 'date_approved', begin_date: desde, end_date: hasta, status: 'approved', limit: '100', offset: String(offset) })
      const res = await fetchFn(`https://api.mercadopago.com/v1/payments/search?${q}`, { headers: { Authorization: `Bearer ${token}` } })
      const datos = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(`Mercado Pago respondió ${res.status}: ${datos.message || ''}`.trim())
      todos.push(...(datos.results || []))
      if ((datos.results || []).length < 100) break
    }
    return todos
  }
}

// Almacén en la planilla: pestaña "Banco" (un movimiento por fila) y "Contabilidad" (clave | JSON).
export function almacenContabilidadSheets(sheets, spreadsheetId) {
  async function asegurarHoja(titulo) {
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' })
    if (!meta.data.sheets.some(s => s.properties.title === titulo)) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: titulo } } }] } })
    }
  }
  const leer = async rango => {
    try {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: rango, valueRenderOption: 'UNFORMATTED_VALUE' })
      return res.data.values || []
    } catch (e) {
      if (String(e?.message || e).includes('Unable to parse range')) return null
      throw e
    }
  }
  return {
    async leerMovimientos() { return leer(`${HOJA_BANCO}!A2:L`) },
    async guardarMovimientos(filas) {
      await asegurarHoja(HOJA_BANCO)
      await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${HOJA_BANCO}!A:L` })
      await sheets.spreadsheets.values.update({ spreadsheetId, range: `${HOJA_BANCO}!A1`, valueInputOption: 'RAW', requestBody: { values: [ENCABEZADOS_BANCO, ...filas] } })
    },
    async leerConfig() {
      const filas = await leer(`${HOJA_CONFIG}!A1:B20`)
      if (!filas) return null
      const config = {}
      for (const [clave, valor] of filas) { try { if (clave) config[clave] = JSON.parse(valor) } catch { /* fila ilegible: se ignora */ } }
      return config
    },
    async guardarConfig(config) {
      await asegurarHoja(HOJA_CONFIG)
      const filas = Object.entries(config).map(([k, v]) => [k, JSON.stringify(v)])
      await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${HOJA_CONFIG}!A:B` })
      await sheets.spreadsheets.values.update({ spreadsheetId, range: `${HOJA_CONFIG}!A1`, valueInputOption: 'RAW', requestBody: { values: filas } })
    },
  }
}

// Registro de uso del panel: que botones y secciones se usan, en celular o PC, y cuanto hubo que
// bajar para llegar a ellos. Sirve para ir ajustando el panel a como se ocupa de verdad.
// Se guarda en la pestaña "Uso" (una fila por dia, dispositivo, seccion y boton) y se resume al leer.

export const HOJA_USO = 'Uso'
export const ENCABEZADOS_USO = ['Dia', 'Dispositivo', 'Tipo', 'Seccion', 'Etiqueta', 'Veces', 'Bajada total (px)']
const TIPOS = new Set(['click', 'seccion', 'visto'])
const MAX_EVENTOS = 400

const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

// Lo que manda el navegador, limpio: lo que no calza se descarta en silencio.
export function limpiarEventos(eventos) {
  if (!Array.isArray(eventos)) return []
  return eventos.slice(0, MAX_EVENTOS).flatMap((e) => {
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(e?.dia) ? e.dia : null
    const tipo = TIPOS.has(e?.tipo) ? e.tipo : null
    const seccion = texto(e?.seccion, 30)
    const etiqueta = texto(e?.etiqueta, 60)
    const veces = Math.max(0, Math.min(10000, Math.round(Number(e?.veces) || 0)))
    if (!dia || !tipo || !seccion || !etiqueta || !veces) return []
    return [{
      dia, tipo, seccion, etiqueta, veces,
      disp: e?.disp === 'cel' ? 'cel' : 'pc',
      bajada: Math.max(0, Math.min(1e8, Math.round(Number(e?.bajada) || 0))),
    }]
  })
}

export const eventoAFila = (e) => [e.dia, e.disp, e.tipo, e.seccion, e.etiqueta, e.veces, e.bajada]

// Resumen de las filas desde una fecha (incluida): secciones mas abiertas, botones mas usados con
// cuanto hubo que bajar en promedio, y los botones que se vieron pero nunca se tocaron.
export function resumirUso(filas, desde = '') {
  const secciones = new Map(), acciones = new Map(), vistos = new Map()
  let primero = null, ultimo = null
  for (const f of filas || []) {
    const [dia, disp, tipo, seccion, etiqueta] = f
    const veces = Number(f[5]) || 0, bajada = Number(f[6]) || 0
    if (!dia || dia < desde || !veces) continue
    if (!primero || dia < primero) primero = dia
    if (!ultimo || dia > ultimo) ultimo = dia
    const lado = disp === 'cel' ? 'cel' : 'pc'
    if (tipo === 'seccion') {
      const s = secciones.get(seccion) || { seccion, veces: 0, cel: 0, pc: 0 }
      s.veces += veces; s[lado] += veces
      secciones.set(seccion, s)
    } else if (tipo === 'click') {
      const k = seccion + '|' + etiqueta
      const a = acciones.get(k) || { seccion, etiqueta, veces: 0, cel: 0, pc: 0, bajada: 0, ultimo: dia }
      a.veces += veces; a[lado] += veces; a.bajada += bajada
      if (dia > a.ultimo) a.ultimo = dia
      acciones.set(k, a)
    } else if (tipo === 'visto') {
      vistos.set(seccion + '|' + etiqueta, { seccion, etiqueta })
    }
  }
  const lista = [...acciones.values()]
    .map(({ bajada, ...a }) => ({ ...a, bajadaPromedio: Math.round(bajada / a.veces) }))
    .sort((a, b) => b.veces - a.veces || a.etiqueta.localeCompare(b.etiqueta))
  return {
    desde: primero, hasta: ultimo,
    secciones: [...secciones.values()].sort((a, b) => b.veces - a.veces),
    acciones: lista,
    sinUso: [...vistos.entries()].filter(([k]) => !acciones.has(k)).map(([, v]) => v)
      .sort((a, b) => a.seccion.localeCompare(b.seccion) || a.etiqueta.localeCompare(b.etiqueta)),
  }
}

export function almacenUsoSheets(sheets, spreadsheetId) {
  return {
    async leerFilas() {
      try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${HOJA_USO}!A2:G` })
        return res.data.values || []
      } catch (e) {
        if (String(e?.message || e).includes('Unable to parse range')) return []
        throw e
      }
    },
    async agregarFilas(filas) {
      if (!filas.length) return
      const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' })
      if (!meta.data.sheets.some((s) => s.properties.title === HOJA_USO)) {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: HOJA_USO } } }] } })
        await sheets.spreadsheets.values.update({ spreadsheetId, range: `${HOJA_USO}!A1`, valueInputOption: 'RAW', requestBody: { values: [ENCABEZADOS_USO] } })
      }
      await sheets.spreadsheets.values.append({
        spreadsheetId, range: `${HOJA_USO}!A:G`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
        requestBody: { values: filas },
      })
    },
  }
}

// GET ?desde=YYYY-MM-DD → resumen; POST { eventos } → los anota.
export async function atenderUso(event, almacen) {
  if (event.httpMethod === 'POST') {
    let datos
    try { datos = JSON.parse(event.body || '{}') } catch { return { estado: 400, cuerpo: { ok: false, error: 'JSON inválido' } } }
    const eventos = limpiarEventos(datos.eventos)
    await almacen.agregarFilas(eventos.map(eventoAFila))
    return { estado: 200, cuerpo: { ok: true, anotados: eventos.length } }
  }
  if (event.httpMethod === 'GET') {
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(event.queryStringParameters?.desde || '') ? event.queryStringParameters.desde : ''
    return { estado: 200, cuerpo: { ok: true, ...resumirUso(await almacen.leerFilas(), desde) } }
  }
  return { estado: 405, cuerpo: { ok: false, error: 'Método no permitido' } }
}

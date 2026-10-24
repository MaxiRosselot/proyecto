// Tabla de precios de repisas: la hoja "precios" de la planilla principal (GOOGLE_SHEET_ID, la misma
// de Cotizaciones y Visitas). Esa hoja es la fuente de verdad: si suben los precios de la madera, se
// edita ahi y las cotizaciones quedan al dia sin tocar el codigo. La usan get-precios (admin),
// update-precio (admin) y cotizacion-web.
//
// Las columnas se buscan por su encabezado (en cualquier orden): Alto (cm) | Profundidad (cm) |
// Largo desde | Largo hasta | Precio. Puede haber otras (Niveles, Laterales...): se ignoran.
// "Profundidad" es el fondo util (ancho del terciado); la profundidad total de la cotizacion son
// 8 cm mas.
export const HOJA_PRECIOS = 'precios'
export const RANGO_PRECIOS = `'${HOJA_PRECIOS}'!A1:Z`

const COLUMNAS = { alto: /^alt(o|ura)\b/, prof: /^(profundidad|fondo)/, desde: /desde/, hasta: /hasta/, precio: /^(precio|valor)/ }
const NOMBRES = { alto: 'Alto', prof: 'Profundidad', desde: 'Largo desde', hasta: 'Largo hasta', precio: 'Precio' }
const normalizar = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
// 40000, "40000" o "$40.000" (si la celda tiene formato de texto).
const numero = v => (typeof v === 'number' ? v : String(v ?? '').trim() === '' ? NaN : Number(String(v).replace(/[^\d,-]/g, '').replace(',', '.')))
const letra = i => String.fromCharCode(65 + i)

export class ErrorPrecios extends Error {
  constructor(mensaje, status = 500) { super(mensaje); this.status = status }
}

// filas: los valores de la hoja desde A1. Devuelve la tabla con la fila de cada precio (para
// editarlo) y la columna del precio.
export function tablaDesdeFilas(filas = []) {
  const iEncabezado = filas.slice(0, 10).findIndex(f => (f || []).some(c => COLUMNAS.precio.test(normalizar(c))) && (f || []).some(c => COLUMNAS.alto.test(normalizar(c))))
  if (iEncabezado < 0) throw new ErrorPrecios(`La hoja "${HOJA_PRECIOS}" no tiene la fila de títulos (Alto, Profundidad, Largo desde, Largo hasta, Precio).`)
  const encabezado = filas[iEncabezado].map(normalizar)
  const columnas = {}
  for (const [clave, patron] of Object.entries(COLUMNAS)) {
    const i = encabezado.findIndex(c => patron.test(c))
    if (i >= 0) columnas[clave] = i
  }
  const faltan = Object.keys(COLUMNAS).filter(c => columnas[c] == null)
  if (faltan.length) throw new ErrorPrecios(`En la hoja "${HOJA_PRECIOS}" falta la columna: ${faltan.map(c => NOMBRES[c]).join(', ')}.`)
  const tabla = filas.slice(iEncabezado + 1).map((f, i) => ({
    alto: numero(f?.[columnas.alto]), prof: numero(f?.[columnas.prof]), desde: numero(f?.[columnas.desde]),
    hasta: numero(f?.[columnas.hasta]), precio: numero(f?.[columnas.precio]), row: iEncabezado + i + 2,
  })).filter(r => [r.alto, r.prof, r.desde, r.hasta, r.precio].every(Number.isFinite) && r.desde <= r.hasta)
  if (!tabla.length) throw new ErrorPrecios(`La hoja "${HOJA_PRECIOS}" no tiene ninguna fila de precios utilizable.`)
  return { tabla, columnaPrecio: letra(columnas.precio) }
}

export async function leerFilasPrecios(sheets, spreadsheetId) {
  if (!spreadsheetId) throw new ErrorPrecios('Falta GOOGLE_SHEET_ID')
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId, range: RANGO_PRECIOS,
      valueRenderOption: 'UNFORMATTED_VALUE', // con el formato de moneda llegarian como "$40.000"
    })
    return res.data.values || []
  } catch (e) {
    if (/Unable to parse range/i.test(String(e?.message))) throw new ErrorPrecios(`No encuentro la hoja "${HOJA_PRECIOS}" en la planilla principal.`)
    throw e
  }
}

export async function leerTablaPrecios(sheets, spreadsheetId) {
  return tablaDesdeFilas(await leerFilasPrecios(sheets, spreadsheetId)).tabla.map(({ row: _, ...r }) => r)
}

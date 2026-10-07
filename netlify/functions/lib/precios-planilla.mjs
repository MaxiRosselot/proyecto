// Tabla de precios de repisas desde la planilla de Google que mantiene el cliente (PRECIOS_SHEET_ID).
// Esa planilla es la fuente de verdad: si suben los precios de la madera, se edita ahi y las
// cotizaciones quedan al dia sin tocar el codigo. La usan get-precios (admin) y cotizacion-web.
export const RANGO_PRECIOS = "'Tabla de precios'!A2:G"

// Columnas: Alto (cm) | Niveles | Profundidad (cm) | Laterales | Largo desde | Largo hasta | Precio
// "Profundidad" es el fondo util (ancho del terciado); la profundidad total de la cotizacion
// son 8 cm mas. Niveles y Laterales quedan fuera: el primero lo determina el alto y el segundo
// ya viene incluido en el precio.
function filaValida(fila) {
  return fila.every(n => Number.isFinite(n)) && fila[2] <= fila[3]
}

export async function leerTablaPrecios(sheets, spreadsheetId) {
  if (!spreadsheetId) throw new Error('Falta PRECIOS_SHEET_ID')
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGO_PRECIOS,
    valueRenderOption: 'UNFORMATTED_VALUE', // con el formato de moneda llegarian como "$40.000"
  })
  const tabla = (res.data.values || [])
    .map(r => [Number(r[0]), Number(r[2]), Number(r[4]), Number(r[5]), Number(r[6])])
    .filter(filaValida)
    .map(([alto, prof, desde, hasta, precio]) => ({ alto, prof, desde, hasta, precio }))
  if (!tabla.length) throw new Error('La planilla de precios no devolvio ninguna fila utilizable')
  return tabla
}

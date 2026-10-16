// Lee el .xlsx de ventas en el navegador y lo deja como hojas de valores simples para el servidor
// (netlify/functions/lib/leer-ventas.mjs): texto, numero, 'AAAA-MM-DD', 'HH:MM' o booleano, y por
// fila si el nombre esta pintado (en la planilla de Maxi, pintado = instalada).
// SheetJS se carga recien aqui, para no pesar en el resto del panel. Lee el libro de Maxi
// (25 hojas) en un par de segundos; exceljs se demoraba minutos con sus casillas de verificacion.

const dos = n => String(n).padStart(2, '0')

// Excel guarda fechas y horas como fechas: una hora sola cae en 1899.
function simple(celda) {
  if (!celda || celda.t === 'z' || celda.t === 'e') return ''
  const v = celda.v
  if (v instanceof Date) {
    if (v.getUTCFullYear() < 1901) return `${dos(v.getUTCHours())}:${dos(v.getUTCMinutes())}`
    return `${v.getUTCFullYear()}-${dos(v.getUTCMonth() + 1)}-${dos(v.getUTCDate())}`
  }
  return v ?? ''
}

// Pintado = un relleno que no es blanco.
function pintada(celda) {
  const s = celda?.s
  if (!s || !s.patternType || s.patternType === 'none') return false
  const rgb = String(s.fgColor?.rgb || '').toUpperCase().slice(-6)
  return Boolean(rgb) && rgb !== 'FFFFFF'
}

export async function leerExcel(archivo) {
  const XLSX = await import('xlsx')
  const libro = XLSX.read(await archivo.arrayBuffer(), { cellStyles: true, cellDates: true, dense: true, UTC: true })
  return libro.SheetNames
    .filter(nombre => !libro.Workbook?.Sheets?.find(h => h.name === nombre)?.Hidden)
    .map(nombre => {
      const datos = libro.Sheets[nombre]['!data'] || []
      const filas = Array.from({ length: datos.length }, (_, i) => (datos[i] || []).slice(0, 40).map(simple))
      // El nombre esta en la columna con encabezado NOMBRE: se mira si esa celda esta pintada.
      const encabezado = filas.slice(0, 12).findIndex(f => f.some(v => String(v).trim().toUpperCase() === 'NOMBRE'))
      const col = encabezado >= 0 ? filas[encabezado].findIndex(v => String(v).trim().toUpperCase() === 'NOMBRE') : -1
      const pintadas = filas.map((_, i) => (col >= 0 ? pintada(datos[i]?.[col]) : false))
      return { nombre, filas, pintadas }
    })
}

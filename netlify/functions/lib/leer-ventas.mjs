// Lectura de las hojas de ventas del Excel de Maxi, sin dependencias de Node: la usan el navegador
// (para mandar solo las ventas, no el libro entero) y el servidor (lib/importar-ventas.mjs).
// La fila de encabezados es la que tiene NOMBRE y FECHA, y las columnas se reconocen por su nombre
// (con sinonimos): da lo mismo si cambian de lugar, aparecen o desaparecen. Las hojas sin esos
// encabezados (movimientos del banco, resumen anual) se ignoran.
import { normalizarDocumento } from './documentos.mjs'

const sinTildes = s => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
export const normalizar = s => sinTildes(s).toUpperCase().replace(/\s+/g, ' ').trim()

// Columna → nombres con que aparece en las distintas hojas.
const COLUMNAS = {
  nombre: ['NOMBRE', 'CLIENTE'],
  fecha: ['FECHA'],
  inicio: ['HORA INICIO', 'INICIO'],
  fin: ['HORA FIN', 'FIN', 'HORA TERMINO', 'TERMINO'],
  documento: ['B/F/W', 'B/F', 'B/F/M', 'DOCUMENTO', 'DOC'],
  pagado: ['PAGADO', 'PAGO'],
  repisas: ['REPISAS'],
  racks: ['RACKS', 'RACK'],
  retiro_orden: ['RETIRO', 'RETIRO Y ORDEN'],
  retiro_basura: ['ESCOMBROS', 'RETIRO DE BASURA', 'BASURA'],
  bici: ['SOPORTE', 'SOPORTES', 'SOPORTE BICI'],
  cajas: ['CAJAS'],
  despacho: ['DESPACHO'],
  neto: ['NETO TOTAL', 'NETO'],
  bruto: ['MONTO BRUTO', 'BRUTO', 'TOTAL BRUTO'],
  realizado: ['REALIZADO', 'INSTALADA'],
  nota: ['DIA', 'NOTA', 'NOTAS'],
}
const DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO']
const ISO = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^\d{2}:\d{2}$/

// Primer encabezado de cada columna (a la derecha hay resumenes que repiten "PAGADO" o "TOTAL").
function mapaDeColumnas(fila) {
  const mapa = {}
  fila.forEach((valor, i) => {
    const texto = normalizar(valor)
    for (const [campo, nombres] of Object.entries(COLUMNAS)) if (mapa[campo] === undefined && nombres.includes(texto)) mapa[campo] = i
  })
  return mapa
}

export function encontrarEncabezado(filas) {
  for (let i = 0; i < Math.min(filas.length, 12); i++) {
    const mapa = mapaDeColumnas(filas[i] || [])
    if (mapa.nombre !== undefined && mapa.fecha !== undefined && (mapa.repisas !== undefined || mapa.neto !== undefined)) return { fila: i, mapa }
  }
  return null
}

const monto = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : 0
  const n = Number(String(v ?? '').replace(/[$.\s]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n) : 0
}
const fecha = v => (ISO.test(String(v ?? '')) ? String(v) : '')
const hora = v => {
  const t = String(v ?? '').trim()
  if (HHMM.test(t)) return t
  const m = t.match(/^(\d{1,2})[:.](\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''
}
const nombrePropio = s => String(s).trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())

// Una venta por fila con nombre. hojas: [{ nombre, filas: [[valor...]], pintadas: [bool por fila] }]
export function ventasDesdeHojas(hojas) {
  const ventas = [], hojasLeidas = [], hojasIgnoradas = []
  for (const hoja of hojas) {
    const enc = encontrarEncabezado(hoja.filas)
    if (!enc) { hojasIgnoradas.push(hoja.nombre); continue }
    const { mapa } = enc
    const valor = (fila, campo) => (mapa[campo] === undefined ? undefined : fila[mapa[campo]])
    let n = 0
    for (let i = enc.fila + 1; i < hoja.filas.length; i++) {
      const fila = hoja.filas[i] || []
      const nombre = String(valor(fila, 'nombre') ?? '').trim()
      if (!nombre || !/\p{L}/u.test(nombre) || nombre.startsWith('=') || COLUMNAS.nombre.includes(normalizar(nombre))) continue
      const notaCruda = String(valor(fila, 'nota') ?? '').trim()
      const realizado = valor(fila, 'realizado')
      ventas.push({
        hoja: hoja.nombre, filaExcel: i + 1,
        nombre: nombrePropio(nombre),
        fecha: fecha(valor(fila, 'fecha')), inicio: hora(valor(fila, 'inicio')), fin: hora(valor(fila, 'fin')),
        documento: normalizarDocumento(valor(fila, 'documento')),
        pagado: normalizar(valor(fila, 'pagado')) === 'SI',
        instalada: Boolean(hoja.pintadas?.[i]) || realizado === true || normalizar(realizado) === 'SI',
        // La columna "DIA" traia el dia de la semana; en 2026 se usa para notas.
        nota: notaCruda && !DIAS.includes(normalizar(notaCruda)) && /\p{L}|\d/u.test(notaCruda) ? notaCruda.slice(0, 300) : '',
        repisas: monto(valor(fila, 'repisas')), racks: monto(valor(fila, 'racks')),
        retiro_orden: monto(valor(fila, 'retiro_orden')), retiro_basura: monto(valor(fila, 'retiro_basura')),
        bici: monto(valor(fila, 'bici')), cajas: monto(valor(fila, 'cajas')), despacho: monto(valor(fila, 'despacho')),
        neto: valor(fila, 'neto') === undefined ? null : monto(valor(fila, 'neto')),
        bruto: valor(fila, 'bruto') === undefined ? null : monto(valor(fila, 'bruto')),
      })
      n++
    }
    hojasLeidas.push({ nombre: hoja.nombre, ventas: n, columnas: Object.keys(mapa) })
  }
  return { ventas, hojasLeidas, hojasIgnoradas }
}

// Mismo cliente aunque en un lado este "SERGIO" y en el otro "Sergio Ruiz Tagle".
export function mismoNombre(a, b) {
  const x = normalizar(a).split(' ').filter(Boolean), y = normalizar(b).split(' ').filter(Boolean)
  if (!x.length || !y.length) return false
  const [corto, largo] = x.length <= y.length ? [x, y] : [y, x]
  return corto.every(p => largo.includes(p))
}


// Recuento de materiales de las instalaciones que vienen, para comprar terciado y fabricar
// laterales. Mismas reglas que el configurador 3D:
//   · cubierta (terciado): largo × fondo util (la profundidad menos 8 cm de los dos pilares),
//     una por nivel;
//   · laterales: alto × profundidad, 2 por modulo y uno al centro si el modulo mide mas de 110 cm.
// Los racks completos se listan aparte (no se fabrican).
import { filaDesdeProducto } from './modulosCotizacion.js'

export const PILARES_CM = 8
export const LATERAL_CENTRAL_DESDE_CM = 110

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const tituloDia = f => { const [y, m, d] = f.split('-').map(Number); return `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} de ${MESES[m - 1]}` }
const cm = metros => Math.round((Number(metros) || 0) * 100)

function sumar(mapa, clave, n) { mapa.set(clave, (mapa.get(clave) || 0) + n) }

// Lo que lleva una venta. sinMedidas: tiene repisas sin largo/profundidad/alto (p. ej. del Excel).
export function materialesDeVenta(q) {
  const tableros = new Map(), laterales = new Map(), racks = new Map()
  let sinMedidas = !(q.repisas || []).length
  for (const [i, guardada] of (q.repisas || []).entries()) {
    const r = filaDesdeProducto(guardada, i)
    const u = Number(r.u ?? 1) || 0
    if (u <= 0) continue
    if (r.kind === 'rack') { sumar(racks, r.label || 'Rack', u); continue }
    const largo = cm(r.l), prof = cm(r.p), alto = cm(r.a), niveles = Number(r.n) || 0
    if (!(largo > 0 && prof > PILARES_CM && alto > 0 && niveles > 0)) { sinMedidas = true; continue }
    sumar(tableros, `${largo}|${prof - PILARES_CM}`, niveles * u)
    sumar(laterales, `${alto}|${prof}`, (largo > LATERAL_CENTRAL_DESDE_CM ? 3 : 2) * u)
  }
  return { tableros, laterales, racks, sinMedidas }
}

function juntar(lista) {
  const total = { tableros: new Map(), laterales: new Map(), racks: new Map(), sinMedidas: [] }
  for (const { q, m } of lista) {
    for (const k of ['tableros', 'laterales', 'racks']) for (const [clave, n] of m[k]) sumar(total[k], clave, n)
    if (m.sinMedidas) total.sinMedidas.push(q.nombre || `N° ${q.cotNum}`)
  }
  return total
}

const porMedida = mapa => [...mapa].map(([clave, n]) => ({ a: Number(clave.split('|')[0]), b: Number(clave.split('|')[1]), n }))
  .sort((x, y) => y.a - x.a || y.b - x.b)

function lineas(t) {
  const out = []
  if (t.tableros.size) {
    const area = porMedida(t.tableros).reduce((s, x) => s + x.a * x.b * x.n, 0) / 10000
    out.push(`Terciado (cubiertas · largo × fondo): ${area.toLocaleString('es-CL', { maximumFractionDigits: 1 })} m²`)
    for (const x of porMedida(t.tableros)) out.push(`• ${x.n} × ${x.a} × ${x.b} cm`)
  }
  if (t.laterales.size) {
    out.push(`Laterales (alto × profundidad):`)
    for (const x of porMedida(t.laterales)) out.push(`• ${x.n} × ${x.a} × ${x.b} cm`)
  }
  if (t.racks.size) {
    out.push('Racks completos:')
    for (const [nombre, n] of t.racks) out.push(`• ${n} × ${nombre}`)
  }
  if (t.sinMedidas.length) out.push(`⚠️ Sin medidas (revisar a mano): ${t.sinMedidas.join(', ')}`)
  return out
}

// Instalaciones por hacer desde `hoy` (incluido) hasta `hasta` (incluido; null = todas).
export function ventasPorInstalar(quotes, hoy, hasta = null) {
  return quotes
    .filter(q => q.status !== 'rechazada' && q.instalacion?.fecha && !q.instalacion.instalada)
    .filter(q => q.instalacion.fecha >= hoy && (!hasta || q.instalacion.fecha <= hasta))
    .sort((a, b) => a.instalacion.fecha.localeCompare(b.instalacion.fecha) || String(a.instalacion.inicio || '').localeCompare(String(b.instalacion.inicio || '')))
}

// El texto para el maestro: primero por dia (para priorizar) y al final el total.
export function textoMateriales(ventas) {
  if (!ventas.length) return 'No hay instalaciones por hacer en ese período.'
  const dias = []
  for (const q of ventas) {
    if (dias.at(-1)?.fecha !== q.instalacion.fecha) dias.push({ fecha: q.instalacion.fecha, ventas: [] })
    dias.at(-1).ventas.push({ q, m: materialesDeVenta(q) })
  }
  const bloques = dias.map(d => [
    `📅 *${tituloDia(d.fecha)}* · ${d.ventas.map(v => v.q.nombre || `N° ${v.q.cotNum}`).join(', ')}`,
    ...lineas(juntar(d.ventas)),
  ].join('\n'))
  const total = juntar(dias.flatMap(d => d.ventas))
  return [
    '🪵 *Materiales para las próximas instalaciones*',
    '',
    bloques.join('\n\n'),
    '',
    '———',
    `🧮 *Total* (${ventas.length} ${ventas.length === 1 ? 'instalación' : 'instalaciones'})`,
    ...lineas(total),
  ].join('\n')
}

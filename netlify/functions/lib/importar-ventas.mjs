// Importa el historial de ventas desde la planilla Excel de Maxi ("VENTAS ENERO", "VENTAS 2026"...).
//
// El navegador lee el .xlsx y manda cada hoja como filas de valores simples (texto, numero,
// 'AAAA-MM-DD' o 'HH:MM') y si el nombre esta pintado (= instalada). Aca se interpreta:
// - la fila de encabezados es la que tiene NOMBRE y FECHA, y las columnas se reconocen por su
//   nombre (con sinonimos), asi que da lo mismo si cambian de lugar, aparecen o desaparecen;
// - las hojas sin esos encabezados (movimientos del banco, resumen anual) se ignoran;
// - cada venta pasa a ser una cotizacion confirmada con su instalacion, montos y pago.
// Importar dos veces no duplica: se reconoce lo que ya esta por nombre y fecha.
import { ErrorCotizacion, NUMERO_INICIAL, actualizarCotizacion, cotizacionAFila, listarCotizaciones } from './cotizaciones.mjs'
import { MARCA_EVENTO } from './instalaciones.mjs'
import { mismoNombre, normalizar } from './leer-ventas.mjs'
import { totalesCotizacion } from './totales.mjs'

export { encontrarEncabezado, mismoNombre, normalizar, ventasDesdeHojas } from './leer-ventas.mjs'

const medioDe = doc => (/W/.test(doc) ? 'Webpay' : /M/.test(doc) ? (/[BF]/.test(doc) ? 'Mercado Pago y transferencia' : 'Mercado Pago') : 'Transferencia')
// Huella de la fila del Excel: con ella se reconoce aunque despues se le cambie la fecha en el panel.
export const huellaVenta = v => `${normalizar(v.nombre)}|${v.fecha}|${v.neto ?? ''}`
const creadoDe = f => (f ? `${f.slice(8, 10)}-${f.slice(5, 7)}-${f.slice(0, 4)}, 12:00:00` : '')

// La venta como cotizacion confirmada, con su instalacion, montos y (si dice SI) el pago completo.
export function cotizacionDesdeVenta(v, cotNum, ahora = new Date()) {
  const repisas = []
  if (v.repisas || !(v.racks || v.retiro_orden || v.retiro_basura || v.bici || v.cajas || v.despacho)) repisas.push({ label: 'Repisas', unidades: 1, valor: v.repisas, importada: true })
  if (v.racks) repisas.push({ kind: 'rack', label: 'Racks', unidades: 1, valor: v.racks, importada: true })
  const adicionales = {}
  for (const clave of ['retiro_orden', 'retiro_basura', 'bici', 'cajas']) if (v[clave]) Object.assign(adicionales, { [`qty_${clave}`]: 1, [`precio_${clave}`]: v[clave] })
  if (v.despacho) adicionales.despacho = v.despacho
  const t = totalesCotizacion(repisas, adicionales)
  const subtotal = v.neto || t.subtotal
  const total = v.bruto || Math.round(subtotal * 1.19)
  return {
    cotNum, nombre: v.nombre, status: 'confirmada', subtotal, iva: total - subtotal, total,
    repisas, adicionales, notas: `Importado del Excel (${v.hoja})`, creado: creadoDe(v.fecha) || ahora.toLocaleString('es-CL', { timeZone: 'America/Santiago' }),
    pagos: v.pagado && total > 0 ? [{ id: `imp${cotNum}`, fecha: v.fecha, monto: total, medio: medioDe(v.documento), nota: 'Importado del Excel', registrado: ahora.toISOString() }] : [],
    instalacion: { fecha: v.fecha, inicio: v.inicio, fin: v.fin, instalada: v.instalada, nota: v.nota, documento: v.documento, origen: 'excel', excel: huellaVenta(v) },
  }
}

// Numeros libres bajo el inicial: el historial no corre la numeracion de las cotizaciones nuevas.
function numerador(usados) {
  let n = 1
  return () => {
    while (usados.has(n) && n < NUMERO_INICIAL) n++
    if (n >= NUMERO_INICIAL) throw new ErrorCotizacion(409, 'No quedan números libres para el historial')
    usados.add(n)
    return n
  }
}

// Importa (o, con simular, solo cuenta). Lo que ya existe no se duplica: si le falta el documento,
// la nota o la marca de instalada, se le completan. Las instalaciones que vienen (desde hoy) se
// enlazan con el evento que ya tienen en el calendario (el que creaba el script de la planilla),
// para que al moverlas en el panel se mueva ese mismo. No se crean eventos: si no se encuentra,
// se informa (crearlo podria duplicar uno con otro titulo).
export async function importarVentas(almacen, ventas, { simular = false, hoy, calendar, calendarId, leerEventos, ahora = new Date() } = {}) {
  const { quotes } = await listarCotizaciones(almacen)
  const usados = new Set(quotes.map(q => Number(q.cotNum)))
  const siguiente = numerador(usados)
  const ordenadas = [...ventas].sort((a, b) => (a.fecha || '9999').localeCompare(b.fecha || '9999'))
  const reporte = { nuevas: 0, existentes: 0, completadas: 0, sinFecha: 0, proximas: 0, enlazadas: 0, sinEvento: [], neto: 0, bruto: 0, ejemplos: [] }
  const nuevas = [], vistas = []

  const yaEsta = v => quotes.find(q => q.instalacion?.excel === huellaVenta(v)) || quotes.find(q => q.status !== 'rechazada' && mismoNombre(q.nombre, v.nombre) && (v.fecha
    ? q.instalacion?.fecha === v.fecha
    : !q.instalacion?.fecha && q.instalacion?.origen === 'excel' && Math.round(Number(q.subtotal)) === (v.neto || 0)))
  for (const v of ordenadas) {
    if (vistas.some(o => mismoNombre(o.nombre, v.nombre) && o.fecha === v.fecha && o.neto === v.neto)) continue
    vistas.push(v)
    const q = yaEsta(v)
    if (q) {
      reporte.existentes++
      const inst = q.instalacion || {}
      const falta = { ...(!inst.documento && v.documento ? { documento: v.documento } : {}), ...(!inst.nota && v.nota ? { nota: v.nota } : {}), ...(!inst.instalada && v.instalada ? { instalada: true } : {}) }
      if (Object.keys(falta).length) {
        reporte.completadas++
        if (!simular) await actualizarCotizacion(almacen, { cotNum: q.cotNum, instalacion: { ...inst, ...falta } })
      }
      continue
    }
    const c = cotizacionDesdeVenta(v, simular ? 0 : siguiente(), ahora)
    nuevas.push(c)
    reporte.nuevas++; reporte.neto += Number(c.subtotal) || 0; reporte.bruto += Number(c.total) || 0
    if (!v.fecha) reporte.sinFecha++
    if (v.fecha && hoy && v.fecha >= hoy) reporte.proximas++
    if (reporte.ejemplos.length < 6) reporte.ejemplos.push({ nombre: v.nombre, fecha: v.fecha, neto: c.subtotal, documento: v.documento, hoja: v.hoja })
  }
  if (simular || !nuevas.length) return reporte

  // Las proximas: su evento del calendario (el que creaba el script de la planilla) o uno nuevo.
  const proximas = nuevas.filter(c => hoy && c.instalacion.fecha >= hoy && c.instalacion.inicio && c.instalacion.fin)
  if (proximas.length && calendar) {
    const fechas = proximas.map(c => c.instalacion.fecha).sort()
    const eventos = leerEventos ? await leerEventos(fechas[0], fechas.at(-1)) : []
    for (const c of proximas) {
      const ev = eventos.find(e => e.fecha === c.instalacion.fecha && e.tipo !== 'visita' && mismoNombre(c.nombre, String(e.titulo || '').replace(/^instalaci[oó]n\s*[-—:]\s*/i, '')))
      if (ev) {
        await calendar.events.patch({ calendarId, eventId: ev.id, sendUpdates: 'none', requestBody: { extendedProperties: { shared: { created_by: MARCA_EVENTO, cliente: c.nombre, cot_num: String(c.cotNum) } } } })
        Object.assign(c.instalacion, { eventId: ev.id, link: ev.link || '' })
        reporte.enlazadas++
      } else {
        reporte.sinEvento.push(`${c.nombre} (${c.instalacion.fecha})`)
      }
    }
  }
  await almacen.asegurarEncabezado()
  await almacen.agregarVarias(nuevas.map(cotizacionAFila))
  return reporte
}

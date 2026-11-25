// Juntar varias cotizaciones (por ejemplo, varias bodegas de un mismo cliente) en UNA venta normal,
// para agendar el trabajo completo de una vez: con su link para agendar, su duracion (que sale de
// los montos y servicios sumados) y sus pagos. Sin dependencias de Node: la usa el panel.
//
// - Repisas: todas las filas, con "Bodega N · " adelante para saber de cual es cada una.
// - Servicios: cantidades sumadas; si una misma pieza tiene precios distintos, se deja el precio
//   promedio solo si cuadra exacto, y si no, se avisa (no se inventa un monto).
// - Descuento: tiene que ser el mismo en todas (si no, se avisa). El recargo de sabado no se
//   copia: se vuelve a poner solo si el trabajo completo se agenda un sabado.
// - Despacho: se suma. Pagos: se juntan (con la cotizacion de la que vienen en la nota).
// - No se puede juntar una que ya tenga instalacion agendada, este confirmada o rechazada.
import { SERVICIOS } from './marca.mjs'
import { porcentajeDescuento, totalesCotizacion } from './totales.mjs'

const falla = mensaje => { throw Object.assign(new Error(mensaje), { status: 400 }) }

export function juntarEnUnaVenta(cotizaciones, cliente = {}) {
  if (!Array.isArray(cotizaciones) || cotizaciones.length < 2) falla('Elige al menos 2 cotizaciones')
  for (const q of cotizaciones) {
    if (q.status !== 'por confirmar') falla(`La N° ${q.cotNum} no está por confirmar (${q.status}): no se puede juntar`)
    if (q.instalacion?.fecha) falla(`La N° ${q.cotNum} ya tiene instalación agendada: sácale la fecha antes de juntar`)
  }
  const descuentos = [...new Set(cotizaciones.map(q => porcentajeDescuento(q.adicionales)))]
  if (descuentos.length > 1) falla(`Las cotizaciones tienen descuentos distintos (${descuentos.join('%, ')}%): déjalos iguales antes de juntar`)

  const repisas = cotizaciones.flatMap((q, i) => (q.repisas || []).map(r => ({ ...r, label: `Bodega ${i + 1} · ${r.label || (r.kind === 'rack' ? 'Rack' : 'Repisa')}` })))

  const adicionales = {}
  for (const [clave, nombre, lista] of SERVICIOS) {
    const partes = cotizaciones.map(q => ({ qty: Number(q.adicionales?.[`qty_${clave}`]) || 0, precio: Number(q.adicionales?.[`precio_${clave}`] ?? lista) || 0 })).filter(p => p.qty > 0)
    if (!partes.length) continue
    const qty = partes.reduce((s, p) => s + p.qty, 0)
    const monto = partes.reduce((s, p) => s + p.qty * p.precio, 0)
    if (monto % qty) falla(`${nombre}: los precios no cuadran al juntar (${partes.map(p => p.qty + ' × $' + p.precio).join(' + ')}). Déjalos iguales antes de juntar`)
    adicionales[`qty_${clave}`] = qty
    adicionales[`precio_${clave}`] = monto / qty
    const nombres = [...new Set(cotizaciones.map(q => q.adicionales?.[`nombre_${clave}`]).filter(Boolean))]
    if (nombres.length === 1) adicionales[`nombre_${clave}`] = nombres[0]
  }
  const despacho = cotizaciones.reduce((s, q) => s + (Number(q.adicionales?.despacho) || 0), 0)
  if (despacho) adicionales.despacho = despacho
  if (descuentos[0]) adicionales.descuento_pct = descuentos[0]

  const t = totalesCotizacion(repisas, adicionales)
  const pagos = cotizaciones.flatMap(q => (q.pagos || []).map(p => ({ ...p, nota: [p.nota, `de la N° ${q.cotNum}`].filter(Boolean).join(' · ') })))
  const dato = k => String(cliente[k] ?? '').trim() || cotizaciones.map(q => String(q[k] || '').trim()).find(Boolean) || ''
  const numeros = cotizaciones.map(q => q.cotNum)
  return {
    venta: {
      nombre: dato('nombre'), telefono: dato('telefono'), direccion: dato('direccion'), email: dato('email'),
      repisas, adicionales, subtotal: t.subtotal, iva: t.iva, total: t.total,
      ...(pagos.length ? { pagos } : {}),
      status: 'por confirmar',
      notas: `Junta las cotizaciones ${numeros.map(n => 'N° ' + n).join(', ')} (${cotizaciones.length} bodegas).`,
    },
    // Lo que sumaban por separado, sin recargos de sabado: para avisar si el total cambia.
    totalSeparadas: cotizaciones.reduce((s, q) => s + totalesCotizacion(q.repisas || [], { ...(q.adicionales || {}), recargo_pct: 0 }).total, 0),
    motivo: nuevo => `Juntada en la N° ${nuevo} (${numeros.map(n => 'N° ' + n).join(' + ')})`,
  }
}

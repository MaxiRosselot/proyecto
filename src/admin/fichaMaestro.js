// La ficha de cada instalacion para mandarle al maestro por WhatsApp: hora, cliente, direccion,
// terciados y laterales a fabricar, colgador y servicios. La imagen isometrica va aparte (FichaMaestro.jsx).
import { SERVICIOS } from '../../netlify/functions/lib/marca.mjs'
import { nombreServicio } from '../../netlify/functions/lib/totales.mjs'
import { materialesDeVenta, porMedida, tituloDia } from './materiales.js'

export function textoFichaMaestro(q) {
  const inst = q.instalacion || {}
  const m = materialesDeVenta(q)
  const colgador = (q.repisas || []).some(r => r.colgador)
  const adicionales = q.adicionales || {}
  const servicios = SERVICIOS.map(([clave]) => [clave, Number(adicionales[`qty_${clave}`]) || 0]).filter(([, n]) => n > 0)
    .map(([clave, n]) => `${nombreServicio(adicionales, clave)}${n > 1 ? ` × ${n}` : ''}`)
  const hora = inst.inicio ? `${inst.inicio}${inst.fin ? ` a ${inst.fin}` : ''} hrs` : 'hora por confirmar'
  return [
    `👷 *Instalación N° ${q.cotNum}*`,
    `🕐 ${inst.fecha ? `${tituloDia(inst.fecha)} · ` : ''}${hora}`,
    `👤 ${q.nombre || '—'}`,
    `📞 ${q.telefono || '—'}`,
    `📍 ${q.direccion || '—'}${q.direccion ? `\nhttps://maps.google.com/?q=${encodeURIComponent(q.direccion)}` : ''}`,
    '',
    '🪵 *Terciados* (largo × fondo):',
    ...(m.tableros.size ? porMedida(m.tableros).map(x => `• ${x.n} × ${x.a} × ${x.b} cm`) : ['• —']),
    '📏 *Laterales* (alto × profundidad):',
    ...(m.laterales.size ? porMedida(m.laterales).map(x => `• ${x.n} × ${x.a} × ${x.b} cm`) : ['• —']),
    ...(m.racks.size ? ['📦 *Racks completos:*', ...[...m.racks].map(([nombre, n]) => `• ${n} × ${nombre}`)] : []),
    ...(m.sinMedidas ? ['⚠️ Hay repisas sin medidas: revisar la cotización.'] : []),
    '',
    `🧥 Colgador: ${colgador ? 'Sí' : 'No'}`,
    `➕ Servicios adicionales: ${servicios.length ? servicios.join(', ') : 'Ninguno'}`,
  ].join('\n')
}

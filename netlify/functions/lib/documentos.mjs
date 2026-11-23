// Codigo del documento tributario de cada venta, como en la planilla de Maxi (columna "B/F"):
//   B  boleta emitida        B* boleta por emitir (ya transfirio)
//   F  factura emitida       F* factura por emitir (ya transfirio)
//   M  Mercado Pago (la boleta sale automatica)
//   M/B, M/F, M/B*, M/F*  parte por Mercado Pago y parte por transferencia
// Los de antes de 2026 pueden traer W (Webpay), que ya no se usa: se muestran, pero no se ofrecen.
// Sin dependencias de Node: lo usan el panel y el servidor.

export const CODIGOS_DOCUMENTO = ['B', 'B*', 'F', 'F*', 'M', 'M/B', 'M/B*', 'M/F', 'M/F*']

export const porEmitir = codigo => String(codigo || '').includes('*')

// El documento tributario ya emitido, guardado en la instalacion: folio, fecha, monto, detalle,
// por donde se emitio (p. ej. "e-Boleta SII", el portal gratis) y el link al PDF.
export const VIAS_DTE = ['e-Boleta SII', 'Facturación SII', 'Mercado Pago', 'Otro']
export function limpiarDte(dte) {
  if (!dte) return null
  const folio = Math.round(Number(dte.folio))
  if (!Number.isInteger(folio) || folio <= 0) throw Object.assign(new Error('Falta el número (folio) del documento'), { status: 400 })
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(dte.fecha || '') ? dte.fecha : ''
  if (!fecha) throw Object.assign(new Error('Falta la fecha del documento'), { status: 400 })
  const pdf = /^https:\/\/[^\s]+$/.test(String(dte.pdf || '')) ? String(dte.pdf).slice(0, 1500) : ''
  return {
    tipo: dte.tipo === 'factura' ? 'factura' : 'boleta', folio, fecha,
    monto: Math.max(0, Math.round(Number(dte.monto) || 0)),
    detalle: String(dte.detalle || '').trim().slice(0, 80),
    via: String(dte.via || 'Otro').trim().slice(0, 40),
    ...(pdf ? { pdf } : {}),
    ...(dte.receptor ? { receptor: String(dte.receptor).trim().slice(0, 120) } : {}),
  }
}

// El detalle con que sale la boleta: "Repisas de madera para bodega - Nombre" (max 80 en e-Boleta).
export const detalleBoleta = nombre => `Repisas de madera para bodega - ${String(nombre || '').trim().replace(/\s+/g, ' ')}`.slice(0, 80).trim()

// Al emitir el documento: "B*" → "B", "M/F*" → "M/F".
export const emitido = codigo => String(codigo || '').replace(/\*/g, '')

// Normaliza lo escrito a mano: "b/m" → "M/B", "W-B" → "W/B", "-" o "SI" → "".
export function normalizarDocumento(texto) {
  const limpio = String(texto ?? '').toUpperCase().replace(/\s+/g, '').replace(/[-–]/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '')
  if (!limpio || !/[BFMW]/.test(limpio) || /^(SI|NO)$/.test(limpio)) return ''
  const partes = limpio.split('/').filter(Boolean)
  // Mercado Pago (o Webpay) va primero, como en "M/B".
  partes.sort((a, b) => (/^[MW]/.test(b) ? 1 : 0) - (/^[MW]/.test(a) ? 1 : 0))
  return partes.join('/').slice(0, 12)
}

// Lo que corresponderia segun como pago, para cuando aun no se marca a mano.
export function sugerirDocumento(pagos = []) {
  const mp = pagos.some(p => /mercado|webpay/i.test(p.medio || ''))
  const otro = pagos.some(p => !/mercado|webpay/i.test(p.medio || ''))
  if (mp && otro) return 'M/B*'
  if (mp) return 'M'
  if (otro) return 'B*'
  return ''
}

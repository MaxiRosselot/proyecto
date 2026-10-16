// Codigo del documento tributario de cada venta, como en la planilla de Maxi (columna "B/F"):
//   B  boleta emitida        B* boleta por emitir (ya transfirio)
//   F  factura emitida       F* factura por emitir (ya transfirio)
//   M  Mercado Pago (la boleta sale automatica)
//   M/B, M/F, M/B*, M/F*  parte por Mercado Pago y parte por transferencia
// Los de antes de 2026 pueden traer W (Webpay), que ya no se usa: se muestran, pero no se ofrecen.
// Sin dependencias de Node: lo usan el panel y el servidor.

export const CODIGOS_DOCUMENTO = ['B', 'B*', 'F', 'F*', 'M', 'M/B', 'M/B*', 'M/F', 'M/F*']

export const porEmitir = codigo => String(codigo || '').includes('*')

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

// Presupuesto conjunto: varias cotizaciones (bodegas) de un mismo cliente en un solo PDF, con el
// formato de quote-pdf.mjs. Pagina 1: resumen con cada bodega y el total; despues una pagina por
// bodega (vistas, repisas, servicios y su total); y al final servicios, galeria y preguntas
// frecuentes una sola vez. Lo arma Admin → Cotizaciones → "Juntar cotizaciones".
import PDFDocument from 'pdfkit'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CONDICIONES, MARCA, SERVICIOS, VIGENCIA_DIAS } from './marca.mjs'
import { FAQ } from './quote-pdf.mjs'
import { montoDespacho, nombreServicio, totalesCotizacion } from './totales.mjs'

export const MAX_BODEGAS = 6
const C = { accent: '#DB992B', accentInk: '#8F5D0F', ink: '#2E241C', body: '#4A3D2E', sub: '#6B5B47', muted: '#8A7A66', faint: '#9A8B76', card: '#F5F2EC', cardLine: '#ECE6DC', frame: '#E7E1D8', rowLine: '#EDE9E2', amber: '#FBF0DC', amberLine: '#D9A441', amberInk: '#8A5A12', green: '#1F7A4D' }
const L = 42, R = 570, W = R - L, FOOT = 751.8
const F = { serif: 'Lora-Bold', sans: 'Poppins', bold: 'Poppins-Bold' }
const FOOTER_MATERIAL = 'Terciado estructural 18mm y pino cepillado · Instalación sin conexión eléctrica'
const money = v => '$' + Math.round(v).toLocaleString('es-CL')
const metres = v => (Number.isInteger(v) ? String(v) : v.toFixed(2)) + ' m'

function numero(v) {
  const n = Number(v ?? 0)
  if (!Number.isFinite(n) || n < 0 || n > 1e9) throw new Error('El presupuesto contiene un número inválido')
  return n
}
function imagen(src, clave) {
  if (!src) return undefined
  if (typeof src !== 'string' || src.length > 8e6 || !/^data:image\/(png|jpeg);base64,/.test(src)) throw new Error(`Imagen ${clave} inválida`)
  return Buffer.from(src.split(',')[1], 'base64')
}

// Una bodega lista para dibujar: filas de repisas y de servicios contratados, y sus totales (los
// mismos que su cotizacion).
export function prepararBodega(b, i) {
  const ad = b.adicionales || {}
  const repisas = (b.repisas || []).map(r => ({
    kind: r.kind, label: String(r.label || 'Rack completo').slice(0, 90), colgador: r.kind !== 'rack' && r.colgador === true,
    lateralesExtra: r.kind === 'rack' ? 0 : Math.max(0, Math.round(Number(r.lateralesExtra) || 0)),
    largo: numero(r.largo), prof: numero(r.prof), alto: numero(r.alto), niveles: numero(r.niveles), unidades: numero(r.unidades ?? 1), valor: numero(r.valor),
  })).filter(r => r.unidades > 0)
  if (!repisas.length) throw new Error(`La cotización ${b.cotNum || i + 1} no tiene repisas`)
  const servicios = [
    ...SERVICIOS.map(([clave, , lista]) => ({ nombre: nombreServicio(ad, clave), qty: numero(ad[`qty_${clave}`]), precio: numero(ad[`precio_${clave}`] ?? lista) })).filter(s => s.qty > 0),
    ...(montoDespacho(ad) ? [{ nombre: 'Despacho', qty: 1, precio: montoDespacho(ad) }] : []),
  ]
  const t = totalesCotizacion(repisas, ad)
  // (t trae su propio "repisas" = el monto; la lista de filas va despues para no perderla.)
  return {
    ...t, n: i + 1, cotNum: String(b.cotNum ?? '').slice(0, 12), titulo: String(b.titulo || `Bodega ${i + 1}`).slice(0, 60),
    repisas, servicios, vistas: { isometric: imagen(b.grafica3d?.isometric, 'isometric'), top: imagen(b.grafica3d?.top, 'top') },
  }
}

export async function generarPresupuestoPdf(data, { now = new Date(), functionsDir = join(process.env.LAMBDA_TASK_ROOT || process.cwd(), 'netlify/functions') } = {}) {
  const lista = Array.isArray(data.bodegas) ? data.bodegas : []
  if (lista.length < 2) throw new Error('Elige al menos 2 cotizaciones')
  if (lista.length > MAX_BODEGAS) throw new Error(`Máximo ${MAX_BODEGAS} cotizaciones por presupuesto`)
  const bodegas = lista.map(prepararBodega)
  const cliente = Object.fromEntries(['nombre', 'direccion', 'telefono', 'email'].map(k => [k, String(data.cliente?.[k] || '').trim().slice(0, 60) || '-']))
  const neto = bodegas.reduce((s, b) => s + b.subtotal, 0), iva = bodegas.reduce((s, b) => s + b.iva, 0), total = neto + iva
  const numeroPresupuesto = bodegas.length === 2 ? `${bodegas[0].cotNum} y ${bodegas[1].cotNum}` : `${bodegas[0].cotNum} – ${bodegas.at(-1).cotNum}`
  const asset = name => readFileSync(join(functionsDir, 'quote-assets', name))
  const logo = asset('logo.png')
  const vence = new Date(now.getTime() + VIGENCIA_DIAS * 864e5)
  const fecha = d => new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d).filter(p => p.type !== 'literal').map(p => p.value).join('/')
  const venceLargo = vence.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', timeZone: 'America/Santiago' })

  const doc = new PDFDocument({ size: 'LETTER', margin: 0, bufferPages: true, autoFirstPage: false, info: { Title: `Presupuesto ${numeroPresupuesto} - Don Maxi`, Author: 'Don Maxi' } })
  doc.registerFont(F.serif, asset('fonts/Lora-Bold.ttf'))
  doc.registerFont(F.sans, asset('fonts/Poppins-Regular.ttf'))
  doc.registerFont(F.bold, asset('fonts/Poppins-Bold.ttf'))
  const chunks = []
  const completo = new Promise((resolve, reject) => { doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject) })
  const text = (v, x, y, w, size, color = C.body, font = F.sans, opts = {}) => doc.font(font).fontSize(size).fillColor(color).text(String(v ?? ''), x, y, { width: w, lineGap: 0, ...opts })
  const widthOf = (v, size, font = F.sans, opts = {}) => doc.font(font).fontSize(size).widthOfString(String(v ?? ''), opts)
  const LABEL = { characterSpacing: .74 }
  const label = (v, x, y, w = 200, color = C.muted, align = 'left') => text(v.toUpperCase(), x, y, w, 6.75, color, F.bold, { ...LABEL, align, lineBreak: false })
  const rule = (y, color = C.frame, x0 = L, x1 = R) => doc.moveTo(x0, y).lineTo(x1, y).strokeColor(color).lineWidth(.75).stroke()
  const box = (x, y, w, h, fill, stroke, r = 7.5) => { doc.roundedRect(x, y, w, h, r); stroke ? doc.lineWidth(.75).fillAndStroke(fill, stroke) : doc.fill(fill) }
  const fit = (bytes, x, y, w, h) => doc.image(bytes, x, y, { fit: [w, h], align: 'center', valign: 'center' })
  const star = (x, y, s, color) => { const pts = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * .2 : s * .5; return [x + s / 2 + r * Math.cos(a), y + s / 2 + r * Math.sin(a)] }); doc.polygon(...pts).fill(color) }
  const clock = (x, y, s, color) => { doc.circle(x + s / 2, y + s / 2, s * .42).lineWidth(1).stroke(color); doc.moveTo(x + s / 2, y + s * .28).lineTo(x + s / 2, y + s / 2).lineTo(x + s * .68, y + s * .6).lineWidth(1).stroke(color) }
  const arrow = (x, y, s, color) => { doc.moveTo(x, y + s / 2).lineTo(x + s * .8, y + s / 2).moveTo(x + s * .5, y + s * .25).lineTo(x + s * .8, y + s / 2).lineTo(x + s * .5, y + s * .75).lineWidth(1).stroke(color) }
  function withIcon(before, icon, after, x, y, size, color, font, align = 'left', w = W) {
    const s = size * 1.05, pad = size * .28, padBefore = before && !before.endsWith('(') ? pad : 0, iconW = padBefore + s + (after ? pad : 0)
    const tot = widthOf(before, size, font) + iconW + widthOf(after, size, font)
    let cx = align === 'center' ? x + (w - tot) / 2 : align === 'right' ? x + w - tot : x
    if (before) { text(before, cx, y, tot, size, color, font, { lineBreak: false }); cx += widthOf(before, size, font) + padBefore }
    icon(cx, y + size * .08, s, color); cx += s + (after ? pad : 0)
    if (after) text(after, cx, y, tot, size, color, font, { lineBreak: false })
  }
  const footers = []
  function page(footer, title, subtitle, titleSize = 18) {
    doc.addPage(); footers.push(footer)
    if (title === undefined) return
    fit(logo, L, 30, 50.5, 19.5)
    label(`Presupuesto N.º ${numeroPresupuesto}`, 300, 35, R - 300, C.muted, 'right')
    rule(60)
    if (title) text(title, L, 71.2, W, titleSize, C.accentInk, F.serif)
    if (subtitle) text(subtitle, L, 97.3, W, 9.75, C.sub)
  }
  const tablaEncabezado = (y, columnas) => {
    doc.roundedRect(L, y, W, 19.9, 6).fill(C.accent); doc.rect(L, y + 10, W, 9.9).fill(C.accent)
    for (const [t, x, w = 80, align = 'left'] of columnas) label(t, x, y + 5.2, w, C.ink, align)
    return y + 19.9
  }
  const n = bodegas.length
  const ultima = n + 1

  // ── Pagina 1: resumen ──
  page(`${FOOTER_MATERIAL} · Detalle por bodega en págs. 2 a ${ultima}`)
  fit(logo, L, 26.8, 62, 24)
  text(`Presupuesto N.º ${numeroPresupuesto}`, 300, 25.5, R - 300, 12, C.accentInk, F.serif, { align: 'right' })
  text(`Válido hasta ${fecha(vence)}`, 300, 41.6, R - 300, 7.5, C.muted, F.sans, { align: 'right' })
  box(L, 60.4, W, 28.8, C.accent, undefined, 6)
  withIcon('Repisas Don Maxi — N.º 1 en Google (', star, `${MARCA.rating} · ${MARCA.resenas} reseñas)`, L, 68.7, 9.75, C.ink, F.bold, 'center')
  text(`Presupuesto para tus ${n} bodegas`, L, 108, W, 18, C.accentInk, F.serif)
  text(`Un solo presupuesto con los ${n} trabajos. El detalle de cada bodega, con su vista y sus medidas, está en las páginas siguientes.`, L, 134, W, 9.75, C.sub)
  const cli = [['Cliente', cliente.nombre], ['Dirección', cliente.direccion], ['Teléfono', cliente.telefono], ['Correo', cliente.email]]
  let tam = 10.5
  const anchos = s => cli.map(([t, v]) => Math.max(widthOf(t.toUpperCase(), 6.75, F.bold, LABEL), widthOf(v, s, F.bold)))
  while (tam > 7 && anchos(tam).reduce((a, b) => a + b, 0) > W - 3 * 13.5) tam -= .25
  const an = anchos(tam), usado = an.reduce((a, b) => a + b, 0), escala = Math.min(1, (W - 3 * 13.5) / usado), gap = usado * escala < W ? (W - usado * escala) / 3 : 13.5
  let cx = L
  cli.forEach(([t, v], i) => { const w = an[i] * escala; label(t, cx, 168, w + 2); text(v, cx, 180.8, w + 2, tam, C.ink, F.bold, { lineBreak: false, ellipsis: true, height: 14 }); cx += w + gap })
  const tc = { bodega: 52.5, cot: 250, rep: 340, netoEnd: 470, totalEnd: 559.5 }
  let y = tablaEncabezado(214, [['Bodega', tc.bodega, 120], ['Cotización', tc.cot], ['Repisas', tc.rep], ['Neto', tc.netoEnd - 80, 80, 'right'], ['Total con IVA', tc.totalEnd - 100, 100, 'right']])
  const filaH = n > 4 ? 46 : 52
  for (const b of bodegas) {
    if (b.vistas.top) fit(b.vistas.top, tc.bodega - 4, y + 4, 44, filaH - 8)
    text(b.titulo, tc.bodega + 50, y + filaH / 2 - 13, 140, 10.5, C.ink, F.serif, { lineBreak: false, ellipsis: true, height: 14 })
    text(`pág. ${b.n + 1}`, tc.bodega + 50, y + filaH / 2 + 2, 140, 7.5, C.muted)
    text(`N.º ${b.cotNum}`, tc.cot, y + filaH / 2 - 6, 80, 9, C.ink)
    text(String(b.repisas.reduce((s, r) => s + r.unidades, 0)), tc.rep, y + filaH / 2 - 6, 60, 9, C.ink)
    text(money(b.subtotal), tc.netoEnd - 100, y + filaH / 2 - 6, 100, 9, C.ink, F.sans, { align: 'right' })
    text(money(b.total), tc.totalEnd - 100, y + filaH / 2 - 6, 100, 9, C.ink, F.bold, { align: 'right' })
    y += filaH; rule(y, C.rowLine)
  }
  y += 30
  box(L, y, 357, 58.4, C.card, C.cardLine)
  label('Condiciones', 54.8, y + 10.9, 200, C.accentInk)
  text(CONDICIONES, 54.8, y + 24, 320, 8.25, C.body)
  text('Subtotal', 412.5, y, 80, 8.62, C.sub); text(money(neto), 470, y, 100, 8.62, C.sub, F.sans, { align: 'right' })
  text('IVA', 412.5, y + 15, 80, 8.62, C.sub); text(money(iva), 470, y + 15, 100, 8.62, C.sub, F.sans, { align: 'right' })
  box(412.5, y + 31.6, R - 412.5, 26.8, C.accent, undefined, 6)
  text('TOTAL', 421.5, y + 41.8, 60, 7.5, C.ink)
  text(money(total), 450, y + 36.9, 111, 12.75, C.ink, F.serif, { align: 'right' })
  y += 66.7
  box(L, y, W, 32.5, C.amber, C.amberLine)
  withIcon('', clock, `Precio válido por ${VIGENCIA_DIAS} días (hasta el ${venceLargo}) · Las ${n} bodegas se pueden instalar el mismo día`, L, y + 11, 9, C.amberInk, F.bold, 'center')
  y += 40.8
  box(L, y, W, 77.3, C.card, C.cardLine)
  label('Transferencia', 56.2, y + 15.2)
  text(`${MARCA.razonSocial} · ${MARCA.rut}\n${MARCA.banco} Cta. ${MARCA.tipoCuenta} ${MARCA.numeroCuenta}`, 56.2, y + 29.2, 240, 8.62, C.body, F.sans, { lineGap: 1.5 })
  doc.moveTo(306, y + 12).lineTo(306, y + 65).strokeColor(C.frame).lineWidth(.75).stroke()
  label('Link de pago', 319.9, y + 15.2)
  text('Hasta 3 cuotas sin interés.', 319.9, y + 28.8, 230, 8.62, C.body)
  withIcon('Pagar presupuesto', arrow, '', 319.9, y + 45.4, 9.38, C.accentInk, F.bold, 'left', 230)
  doc.link(319.9, y + 44, 120, 14, MARCA.linkPago)

  // ── Una pagina por bodega ──
  const lateral = k => `${k} lateral${k > 1 ? 'es' : ''} extra en la esquina`
  const encabezadoFila = r => r.kind === 'rack' ? `${r.label} · cajas incluidas`
    : r.colgador || r.lateralesExtra ? ['Repisa', r.colgador && 'con colgador', r.lateralesExtra && (r.colgador ? '· ' : 'con ') + lateral(r.lateralesExtra)].filter(Boolean).join(' ') : undefined
  const col = { largo: 52.5, prof: 150.9, alto: 226.5, niveles: 287.1, uds: 355.2, valorEnd: 483.8, totalEnd: 559.5 }
  for (const b of bodegas) {
    const cantidad = b.repisas.reduce((s, r) => s + r.unidades, 0)
    page(`${FOOTER_MATERIAL} · Bodega ${b.n} de ${n} · Cotización N.º ${b.cotNum}`, b.titulo, `Cotización N.º ${b.cotNum} · ${cantidad} ${cantidad === 1 ? 'repisa' : 'repisas'}`)
    // Las vistas se achican si la tabla es larga.
    const altoTabla = b.repisas.reduce((h, r) => h + 23.85 + (encabezadoFila(r) ? 13 : 0), 0) + b.servicios.length * 23.85 + (b.servicios.length ? 16 : 0)
    const imgH = Math.max(170, Math.min(330, 330 - Math.max(0, altoTabla - 170)))
    const top = 128
    if (b.vistas.isometric || b.vistas.top) {
      const plano = b.vistas.top && doc.openImage(b.vistas.top)
      const planW = Math.round(Math.min(230, Math.max(160, plano ? plano.width / plano.height * imgH + 13 : 200)))
      const isoW = 470 - 15 - planW, isoX = (612 - 470) / 2
      for (const [t, img, x, w] of [['Vista isométrica', b.vistas.isometric, isoX, isoW], ['Planta y medidas', b.vistas.top, isoX + isoW + 15, planW]]) {
        label(t, x, top - 13, w, C.muted, 'center')
        box(x, top, w, imgH + 13, '#FFFFFF', C.frame, 10.5)
        if (img) fit(img, x + 6.5, top + 6.5, w - 13, imgH)
        else text('Vista no disponible', x, top + imgH / 2, w, 9, C.faint, F.sans, { align: 'center' })
      }
      y = top + imgH + 32
    } else y = top
    y = tablaEncabezado(y, [['Largo', col.largo, 70], ['Profund.', col.prof, 70], ['Alto', col.alto, 70], ['Niveles', col.niveles, 70], ['Uds.', col.uds, 70], ['Valor', col.valorEnd - 80, 80, 'right'], ['Total', col.totalEnd - 80, 80, 'right']])
    const fila = (celdas, valor, uds, titulo) => {
      if (titulo) { text(titulo, col.largo, y + 5.3, 420, 8.6, C.ink, F.bold); y += 13 }
      celdas.forEach(([v, x, w = 80]) => text(v, x, y + 5.3, w, 9, C.ink, F.sans, { lineBreak: false, ellipsis: true, height: 12 }))
      text(money(valor), col.valorEnd - 100, y + 5.3, 100, 9, C.ink, F.sans, { align: 'right' })
      text(money(valor * uds), col.totalEnd - 100, y + 5.3, 100, 9, C.ink, F.bold, { align: 'right' })
      y += 23.85; rule(y, C.rowLine)
    }
    for (const r of b.repisas) fila([[metres(r.largo), col.largo], [metres(r.prof), col.prof], [metres(r.alto), col.alto], [r.niveles, col.niveles], [r.unidades, col.uds]], r.valor, r.unidades, encabezadoFila(r))
    if (b.servicios.length) {
      doc.rect(L, y, W, 16).fill(C.card); label('Servicios adicionales', col.largo, y + 5.2, 300, C.muted); y += 16; rule(y, C.rowLine)
      for (const s of b.servicios) fila([[s.nombre, col.largo, col.uds - col.largo - 12], [s.qty, col.uds]], s.precio, s.qty)
    }
    y += 20
    const ajustes = [b.descuento && [`Descuento ${b.descuentoPct}%`, '-' + money(b.descuento), C.green], b.recargo && [`Sábado +${b.recargoPct}%`, '+' + money(b.recargo), C.sub]].filter(Boolean)
    if (ajustes.length) {
      text('Subtotal', 412.5, y, 80, 8.62, C.sub); text(money(b.bruto), 470, y, 100, 8.62, C.sub, F.sans, { align: 'right' }); y += 15
      for (const [nom, monto, color] of ajustes) { text(nom, 412.5, y, 80, 8.62, color); text(monto, 470, y, 100, 8.62, color, F.bold, { align: 'right' }); y += 15 }
      text('Neto', 412.5, y, 80, 8.62, C.sub)
    } else text('Subtotal', 412.5, y, 80, 8.62, C.sub)
    text(money(b.subtotal), 470, y, 100, 8.62, C.sub, F.sans, { align: 'right' })
    text('IVA', 412.5, y + 15, 80, 8.62, C.sub); text(money(b.iva), 470, y + 15, 100, 8.62, C.sub, F.sans, { align: 'right' })
    box(412.5, y + 31.6, R - 412.5, 26.8, C.card, C.cardLine, 6)
    text(`TOTAL BODEGA ${b.n}`, 421.5, y + 41.8, 80, 7, C.sub)
    text(money(b.total), 450, y + 36.9, 111, 12.75, C.ink, F.serif, { align: 'right' })
    text('Este monto ya está sumado en el total del presupuesto (pág. 1).', L, y + 41, 340, 8, C.muted)
  }

  // ── Servicios, galeria y preguntas frecuentes ──
  page('Consulta disponibilidad de cada servicio según tu comuna', 'Servicios adicionales', 'Puedes sumarlos a tu presupuesto si los necesitas. Precio neto y total con IVA incluido.')
  SERVICIOS.forEach(([key, title, price, description], i) => {
    const cy = 121.4 + i * 132
    box(L, cy, W, 121.5, C.card, undefined, 9)
    const ty = cy + (121.5 - 32.6 - doc.font(F.sans).fontSize(9).heightOfString(description, { width: 336, lineGap: .45 })) / 2
    text(title, 55.5, ty, 250, 12, C.ink, F.serif)
    text(`neto ${money(price)}`, 291.5, ty + 3.8, 100, 7.88, C.muted, F.sans, { align: 'right' })
    text(money(Math.round(price * 1.19)), 291.5, ty + 14.9, 100, 12.75, C.accentInk, F.serif, { align: 'right' })
    text(description, 55.5, ty + 32.6, 336, 9, C.sub, F.sans, { lineGap: .45 })
    doc.save().roundedRect(406.5, cy + 12, 150, 97.5, 7.5).clip()
    doc.image(asset(`servicio-${key}.jpg`), 406.5, cy + 12, { cover: [150, 97.5], align: 'center', valign: 'center' })
    doc.restore()
  })
  page('Terciado estructural 18mm y pino cepillado 2×2', 'Galería de trabajos', 'Algunos proyectos que hemos instalado.')
  withIcon('Ver portafolio completo', arrow, MARCA.galeriaUrl, 300, 98.3, 9, C.accentInk, F.bold, 'right', R - 300)
  doc.link(330, 97, R - 330, 13, `https://${MARCA.galeriaUrl}`)
  doc.save().roundedRect(63, 124.6, 486, 607.4, 6).clip(); fit(asset('galeria.jpg'), 63, 124.6, 486, 607.4); doc.restore()
  page('¿Otra duda? Escríbenos por WhatsApp', 'Preguntas frecuentes', undefined, 16.5)
  y = 102.9
  for (const [q, a] of FAQ) { text(q, L, y, W, 10.12, C.ink, F.serif); text(a, L, y + 17.4, W, 9, C.sub, F.sans, { lineGap: .45 }); y = doc.y + 9; rule(y, C.rowLine); y += 10.5 }

  const total_paginas = doc.bufferedPageRange().count
  for (let i = 0; i < total_paginas; i++) {
    doc.switchToPage(i); rule(FOOT)
    text(footers[i], L, FOOT + 6, 480, 7.88, C.faint, F.sans, { lineBreak: false })
    text(`${i + 1} de ${total_paginas}`, 500, FOOT + 6, R - 500, 7.88, C.faint, F.sans, { align: 'right', lineBreak: false })
  }
  doc.end()
  return { bytes: await completo, neto, iva, total, paginas: total_paginas, numero: numeroPresupuesto }
}

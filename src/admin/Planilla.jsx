import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { C, apiFetch, fmt, styles } from './utils.js'
import { ahoraEnZona, diaSemana, sumarDias } from '../../netlify/functions/lib/horarios.mjs'
import { SERVICIOS } from '../../netlify/functions/lib/marca.mjs'
import { CODIGOS_DOCUMENTO, porEmitir, sugerirDocumento } from '../../netlify/functions/lib/documentos.mjs'
import { linkWhatsapp, mensajeCobro, mensajeInstalacion } from '../../netlify/functions/lib/mensajes.mjs'
import { resumenPagos } from '../../netlify/functions/lib/pagos-resumen.mjs'
import { DESCUENTO_MAX, nombreServicio, totalesCotizacion } from '../../netlify/functions/lib/totales.mjs'
import { PagosCotizacion } from './PagosCotizacion.jsx'
import ImportarExcel from './ImportarExcel.jsx'

// La central de instalaciones: el Excel de Maxi dentro del panel. Una fila por venta, ordenadas por
// fecha, con lo mismo que la planilla (nota, instalada, fecha y horas, documento, pago, repisas,
// servicios, despacho, neto y bruto) y todo editable en la celda. El calendario se mueve solo.
const API = '/.netlify/functions/planilla'
const SERV = SERVICIOS.map(([clave, nombre]) => ({ clave, nombre }))
const CORTO = { retiro_orden: 'Retiro y orden', retiro_basura: 'Retiro basura', bici: 'Soporte', cajas: 'Cajas' }
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fechaCorta = f => (f ? `${DIAS_CORTOS[diaSemana(f)]} ${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}` : 'Sin fecha')
const tituloMes = m => { const t = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(m + '-15T12:00:00Z')); return t.charAt(0).toUpperCase() + t.slice(1) }
const lunes = f => sumarDias(f, -((diaSemana(f) + 6) % 7))

// Montos de una venta por columna, como en el Excel.
function columnas(q) {
  const a = q.adicionales || {}
  const repisas = (q.repisas || []).reduce((s, r) => s + (Number(r.unidades ?? 1) || 0) * (Number(r.valor) || 0), 0)
  const serv = Object.fromEntries(SERV.map(({ clave }) => [clave, (Number(a[`qty_${clave}`]) || 0) * (Number(a[`precio_${clave}`]) || 0)]))
  return { repisas, ...serv, despacho: Number(a.despacho) || 0, neto: Number(q.subtotal) || 0, bruto: Number(q.total) || 0 }
}
export const filaDe = (q, hoy) => {
  const inst = q.instalacion || {}
  const pago = resumenPagos(q.total, q.pagos)
  return {
    q, inst, pago, montos: columnas(q),
    fecha: inst.fecha || '', instalada: inst.instalada === true,
    atrasada: !inst.instalada && inst.fecha && inst.fecha < hoy,
    porCobrar: inst.instalada === true && pago.saldo > 0,
    documento: inst.documento || '', sugerido: inst.documento ? '' : sugerirDocumento(q.pagos),
  }
}

// ── Celdas editables ─────────────────────────────────────────────────────────

const celdaBase = { width: '100%', border: '1px solid transparent', background: 'transparent', borderRadius: 6, padding: '5px 6px', font: 'inherit', fontSize: 12.5, color: C.text, boxSizing: 'border-box', minWidth: 0 }

// Texto/fecha/hora: se guarda al salir de la celda o con Enter, solo si cambio.
function Celda({ valor, tipo = 'text', alGuardar, etiqueta, placeholder, estilo }) {
  const [v, setV] = useState(valor ?? '')
  useEffect(() => { setV(valor ?? '') }, [valor])
  const guardar = () => { if (String(v) !== String(valor ?? '')) alGuardar(v) }
  return (
    <input type={tipo} value={v} aria-label={etiqueta} placeholder={placeholder} title={tipo === 'text' && v ? String(v) : undefined} onChange={e => setV(e.target.value)} onBlur={guardar}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setV(valor ?? ''); setTimeout(() => e.target.blur()) } }}
      style={{ ...celdaBase, ...estilo }} className="planilla-celda" />
  )
}

// Monto neto: entero sin ceros adelante; al tocarlo se selecciona todo.
function CeldaMonto({ valor, alGuardar, etiqueta, editable = true, onAbrir }) {
  const [v, setV] = useState(String(valor || 0))
  useEffect(() => { setV(String(valor || 0)) }, [valor])
  if (!editable) return <button type="button" onClick={onAbrir} aria-label={etiqueta} title="Tiene varias líneas: se edita en el detalle" style={{ ...celdaBase, textAlign: 'right', cursor: 'pointer', color: valor ? C.text : C.textMuted }}>{fmt(valor)}</button>
  return (
    <input type="text" inputMode="numeric" value={v === '0' ? '' : fmt(Number(v)).replace('$', '')} placeholder="$0" aria-label={etiqueta}
      onFocus={e => e.target.select()}
      onChange={e => setV(String(Number(e.target.value.replace(/\D/g, '')) || 0))}
      onBlur={() => { if (Number(v) !== Number(valor || 0)) alGuardar(Number(v)) }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      style={{ ...celdaBase, textAlign: 'right', color: Number(v) ? C.text : C.textMuted }} className="planilla-celda" />
  )
}

const COLOR_DOC = { B: C.green, F: C.blue, M: '#0EA5E9', W: C.textMuted }
function Documento({ fila, alGuardar }) {
  const actual = fila.documento
  const opciones = CODIGOS_DOCUMENTO.includes(actual) || !actual ? CODIGOS_DOCUMENTO : [actual, ...CODIGOS_DOCUMENTO]
  const color = porEmitir(actual) ? C.red : COLOR_DOC[actual?.[0]] || C.textMuted
  return (
    <select value={actual} aria-label={`Documento de ${fila.q.nombre}`} onChange={e => alGuardar(e.target.value)}
      title={actual ? (porEmitir(actual) ? 'Documento por emitir' : 'Documento') : fila.sugerido ? `Sugerido: ${fila.sugerido}` : 'Sin documento'}
      style={{ ...celdaBase, fontWeight: 800, color: actual ? color : C.textMuted, background: actual ? color + '14' : 'transparent', cursor: 'pointer', padding: '5px 2px', appearance: 'none', textAlign: 'center', fontSize: 12 }}>
      <option value="">{fila.sugerido ? `${fila.sugerido}?` : '—'}</option>
      {opciones.map(c => <option key={c} value={c}>{c}</option>)}
    </select>
  )
}

// Pagado: Sí / 50% / No, y atajos para registrar el pago sin abrir el detalle.
function Pagado({ fila, onRegistrar, onAbrir }) {
  const [abierto, setAbierto] = useState(false)
  const [medio, setMedio] = useState('Transferencia')
  const ref = useRef(null)
  useEffect(() => {
    if (!abierto) return
    const cerrar = e => { if (!ref.current?.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', cerrar); return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])
  const { pago } = fila
  const [texto, color] = !pago.total ? ['—', C.textMuted] : pago.estado === 'pagada' ? ['Sí', C.green] : pago.estado === 'abono' ? [`${pago.porcentaje}%`, C.yellow] : ['No', fila.instalada ? C.red : C.textMuted]
  const mitad = Math.round(pago.total / 2)
  const registrar = async monto => { setAbierto(false); await onRegistrar(monto, medio) }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setAbierto(a => !a)} aria-label={`Pago de ${fila.q.nombre}: ${texto}`} title={pago.total ? `Pagado ${fmt(pago.pagado)} de ${fmt(pago.total)}` : 'Sin monto'}
        style={{ ...celdaBase, fontWeight: 800, color, background: color + '14', cursor: 'pointer', textAlign: 'center' }}>{texto}</button>
      {abierto && (
        <div role="menu" style={{ position: 'absolute', zIndex: 30, top: '100%', left: 0, marginTop: 4, width: 220, padding: 10, borderRadius: 10, background: 'white', boxShadow: '0 10px 30px rgba(0,0,0,.18)', border: '1px solid ' + C.border, display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, color: C.textSub }}>Pagado {fmt(pago.pagado)} de {fmt(pago.total)}</div>
          {pago.saldo > 0 && <>
            <select aria-label="Medio de pago" value={medio} onChange={e => setMedio(e.target.value)} style={{ ...styles.input, padding: '5px 8px', fontSize: 12 }}>
              {['Transferencia', 'Mercado Pago', 'Efectivo', 'Débito o crédito'].map(m => <option key={m}>{m}</option>)}
            </select>
            {!pago.pagado && mitad > 0 && <button type="button" role="menuitem" onClick={() => registrar(mitad)} style={{ ...styles.btnSecondary, fontSize: 12, padding: '6px 10px' }}>Pagó el 50% · {fmt(mitad)}</button>}
            <button type="button" role="menuitem" onClick={() => registrar(pago.saldo)} style={{ ...styles.btnSecondary, fontSize: 12, padding: '6px 10px', borderColor: C.green, color: C.green }}>{pago.pagado ? 'Pagó el saldo' : 'Pagó el total'} · {fmt(pago.saldo)}</button>
          </>}
          <button type="button" role="menuitem" onClick={() => { setAbierto(false); onAbrir() }} style={{ background: 'none', border: 'none', color: C.textSub, fontSize: 12, cursor: 'pointer', textAlign: 'left', padding: 2 }}>Ver pagos →</button>
        </div>
      )}
    </div>
  )
}

function lineasCobro(q) {
  const m = columnas(q)
  return [
    ...(q.repisas || []).filter(r => (Number(r.unidades ?? 1) || 0) > 0 && Number(r.valor) > 0).map(r => ({ nombre: (Number(r.unidades) > 1 ? `${r.unidades} × ` : '') + (r.kind === 'rack' ? r.label || 'Rack' : r.label || 'Repisa'), monto: (Number(r.unidades ?? 1) || 0) * (Number(r.valor) || 0) })),
    ...SERV.filter(s => m[s.clave] > 0).map(s => ({ nombre: nombreServicio(q.adicionales, s.clave), monto: m[s.clave] })),
    ...(m.despacho ? [{ nombre: 'Despacho', monto: m.despacho }] : []),
  ]
}
const linkCobro = q => linkWhatsapp(q.telefono, mensajeCobro({ nombre: q.nombre, fecha: q.instalacion?.fecha }, lineasCobro(q), { subtotal: Number(q.subtotal) || 0, iva: Number(q.iva) || 0, total: Number(q.total) || 0 }, resumenPagos(q.total, q.pagos), q.linkPago && !/mercadopago/.test(q.linkPago) ? q.linkPago : ''))

// ── Detalle de una venta (panel lateral) ─────────────────────────────────────

function Montos({ q, onGuardar }) {
  const [repisas, setRepisas] = useState(() => (q.repisas || []).map(r => ({ ...r, unidades: Number(r.unidades ?? 1) || 0, valor: Number(r.valor) || 0 })))
  const [ad, setAd] = useState(() => ({ ...q.adicionales, ...Object.fromEntries(SERVICIOS.flatMap(([c, , lista]) => [[`qty_${c}`, Number(q.adicionales?.[`qty_${c}`]) || 0], [`precio_${c}`, Number(q.adicionales?.[`precio_${c}`] ?? lista) || 0]])) }))
  const [guardando, setGuardando] = useState(false)
  const t = totalesCotizacion(repisas, ad)
  const num = (v, max = 1e8) => Math.min(max, Number(String(v).replace(/\D/g, '')) || 0)
  const campo = { ...styles.input, padding: '5px 6px', fontSize: 12.5, textAlign: 'center' }
  const fila = (etiqueta, qty, precio, cambiarQty, cambiarPrecio, key) => (
    <React.Fragment key={key}>
      <span style={{ fontSize: 12.5, color: qty ? C.text : C.textMuted }}>{etiqueta}</span>
      <input inputMode="numeric" aria-label={`Cantidad: ${etiqueta}`} value={qty} onFocus={e => e.target.select()} onChange={e => cambiarQty(num(e.target.value, 999))} style={campo} />
      <input inputMode="numeric" aria-label={`Precio: ${etiqueta}`} value={precio} onFocus={e => e.target.select()} onChange={e => cambiarPrecio(num(e.target.value))} style={campo} />
      <span style={{ fontSize: 12.5, textAlign: 'right', fontWeight: 700 }}>{fmt(qty * precio)}</span>
    </React.Fragment>
  )
  async function guardar() {
    setGuardando(true)
    await onGuardar({ repisas: repisas.map(r => ({ unidades: r.unidades, valor: r.valor })), adicionales: ad })
    setGuardando(false)
  }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 54px 88px 80px', gap: '5px 8px', alignItems: 'center' }}>
        {['', 'Cant.', 'Precio', 'Total'].map((h, i) => <span key={i} style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', textAlign: i ? 'center' : 'left' }}>{h}</span>)}
        {repisas.map((r, i) => fila(r.kind === 'rack' ? r.label || 'Rack' : r.largo ? `Repisa ${r.largo}×${r.prof}×${r.alto} m` : r.label || 'Repisas', r.unidades, r.valor,
          v => setRepisas(p => p.map((x, j) => (j === i ? { ...x, unidades: v } : x))), v => setRepisas(p => p.map((x, j) => (j === i ? { ...x, valor: v } : x))), 'r' + i))}
        {SERV.map(({ clave }) => fila(nombreServicio(ad, clave), ad[`qty_${clave}`], ad[`precio_${clave}`], v => setAd(a => ({ ...a, [`qty_${clave}`]: v })), v => setAd(a => ({ ...a, [`precio_${clave}`]: v })), clave))}
        <span style={{ fontSize: 12.5 }}>Despacho</span><span />
        <input inputMode="numeric" aria-label="Despacho" value={ad.despacho || 0} onFocus={e => e.target.select()} onChange={e => setAd(a => ({ ...a, despacho: num(e.target.value) }))} style={campo} />
        <span style={{ fontSize: 12.5, textAlign: 'right', fontWeight: 700 }}>{fmt(ad.despacho || 0)}</span>
        <span style={{ fontSize: 12.5 }}>Descuento %</span><span />
        <input inputMode="numeric" aria-label="Descuento %" value={ad.descuento_pct || 0} onFocus={e => e.target.select()} onChange={e => setAd(({ descuento_pct: _, ...r }) => { const n = num(e.target.value, DESCUENTO_MAX); return n ? { ...r, descuento_pct: n } : r })} style={campo} />
        <span style={{ fontSize: 12.5, textAlign: 'right', color: C.green }}>{t.descuento ? '-' + fmt(t.descuento) : ''}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13 }}>Neto <strong>{fmt(t.subtotal)}</strong> · Bruto <strong style={{ color: C.orangeDark }}>{fmt(t.total)}</strong></span>
        <button onClick={guardar} disabled={guardando} style={{ ...styles.btnPrimary, fontSize: 12, padding: '7px 14px' }}>{guardando ? 'Guardando…' : 'Guardar montos'}</button>
      </div>
    </div>
  )
}

function Detalle({ q, onCerrar, onActualizar, onCambioLocal, onVerCotizacion }) {
  useEffect(() => { const f = e => e.key === 'Escape' && onCerrar(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f) }, [onCerrar])
  const inst = q.instalacion || {}
  const pago = resumenPagos(q.total, q.pagos)
  const titulo = { fontSize: 11, fontWeight: 800, color: C.textMuted, textTransform: 'uppercase', letterSpacing: .8, margin: '16px 0 8px' }
  const boton = { ...styles.btnSecondary, fontSize: 12, padding: '7px 12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }
  return (
    <div role="dialog" aria-modal="true" aria-label={q.nombre} onClick={e => e.target === e.currentTarget && onCerrar()}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(17,24,39,.35)', display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: 'min(480px, 100%)', height: '100%', background: 'white', overflowY: 'auto', padding: 20, paddingTop: 'max(20px, env(safe-area-inset-top))', boxShadow: '-12px 0 40px rgba(0,0,0,.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{q.nombre}</div>
            <div style={{ fontSize: 12.5, color: C.textSub }}>N° {q.cotNum} · {inst.fecha ? `${fechaCorta(inst.fecha)} · ${inst.inicio || ''}–${inst.fin || ''}` : 'Sin fecha'}{inst.origen === 'excel' ? ' · del Excel' : ''}</div>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.textMuted }}>✕</button>
        </div>

        <div style={titulo}>Cliente</div>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 6, alignItems: 'center' }}>
          {[['nombre', 'Nombre'], ['telefono', 'Teléfono'], ['direccion', 'Dirección'], ['email', 'Correo']].map(([campo, etiqueta]) => (
            <React.Fragment key={campo}>
              <span style={{ fontSize: 12, color: C.textMuted }}>{etiqueta}</span>
              <Celda valor={q[campo]} etiqueta={etiqueta} alGuardar={v => onActualizar({ [campo]: v })} estilo={{ border: '1px solid ' + C.border, background: '#FAFAFA' }} />
            </React.Fragment>
          ))}
          <span style={{ fontSize: 12, color: C.textMuted }}>Nota</span>
          <Celda valor={inst.nota} etiqueta="Nota interna" placeholder="Pendientes, fabricar con anticipación…" alGuardar={v => onActualizar({ nota: v })} estilo={{ border: '1px solid ' + C.border, background: '#FAFAFA' }} />
        </div>

        <div style={titulo}>Montos (neto)</div>
        <Montos key={q.subtotal + '-' + q.total} q={q} onGuardar={cambios => onActualizar(cambios)} />

        <div style={titulo}>Pagos</div>
        <PagosCotizacion quote={q} onCambio={onCambioLocal} />

        <div style={titulo}>Acciones</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {pago.saldo > 0 && <a href={linkCobro(q)} target="_blank" rel="noreferrer" style={{ ...boton, background: '#25D366', borderColor: '#25D366', color: 'white' }}>Cobrar por WhatsApp</a>}
          {inst.fecha && <a href={linkWhatsapp(q.telefono, mensajeInstalacion(q, inst, pago))} target="_blank" rel="noreferrer" style={boton}>Confirmar hora por WhatsApp</a>}
          {inst.link && <a href={inst.link} target="_blank" rel="noreferrer" style={boton}>Ver en Calendar</a>}
          {q.pdfUrl && <a href={q.pdfUrl} target="_blank" rel="noreferrer" style={boton}>Ver PDF</a>}
          {onVerCotizacion && inst.origen !== 'excel' && <button onClick={() => onVerCotizacion(q.cotNum)} style={boton}>Ver cotización</button>}
        </div>
      </div>
    </div>
  )
}

// ── Nueva instalacion ────────────────────────────────────────────────────────

function NuevaInstalacion({ onCrear, onCancelar }) {
  const [d, setD] = useState({ nombre: '', telefono: '', fecha: '', inicio: '10:00', fin: '13:00', nota: '' })
  const [error, setError] = useState(''), [guardando, setGuardando] = useState(false)
  const campo = { ...styles.input, padding: '7px 10px', fontSize: 13 }
  async function crear(e) {
    e.preventDefault(); setGuardando(true); setError('')
    try { await onCrear(d) } catch (err) { setError(err.message) } finally { setGuardando(false) }
  }
  return (
    <form onSubmit={crear} data-testid="nueva-instalacion" style={{ ...styles.card, padding: 14, marginBottom: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, alignItems: 'end', border: '1.5px solid ' + C.orange + '55' }}>
      <label style={{ gridColumn: 'span 2' }}><span style={styles.detailLabel}>Nombre</span><input autoFocus required aria-label="Nombre del cliente" value={d.nombre} onChange={e => setD({ ...d, nombre: e.target.value })} style={campo} /></label>
      <label><span style={styles.detailLabel}>Teléfono</span><input aria-label="Teléfono" value={d.telefono} onChange={e => setD({ ...d, telefono: e.target.value })} style={campo} /></label>
      <label><span style={styles.detailLabel}>Fecha</span><input type="date" aria-label="Fecha" value={d.fecha} onChange={e => setD({ ...d, fecha: e.target.value })} style={campo} /></label>
      <label><span style={styles.detailLabel}>Inicio</span><input type="time" aria-label="Inicio" value={d.inicio} onChange={e => setD({ ...d, inicio: e.target.value })} style={campo} /></label>
      <label><span style={styles.detailLabel}>Fin</span><input type="time" aria-label="Fin" value={d.fin} onChange={e => setD({ ...d, fin: e.target.value })} style={campo} /></label>
      <label style={{ gridColumn: 'span 2' }}><span style={styles.detailLabel}>Nota</span><input aria-label="Nota" value={d.nota} onChange={e => setD({ ...d, nota: e.target.value })} style={campo} /></label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={guardando} style={{ ...styles.btnPrimary, fontSize: 12 }}>{guardando ? 'Agregando…' : 'Agregar'}</button>
        <button type="button" onClick={onCancelar} style={{ ...styles.btnSecondary, fontSize: 12 }}>Cancelar</button>
      </div>
      {error && <div style={{ ...styles.errorBox, gridColumn: '1 / -1', marginBottom: 0 }}>{error}</div>}
      <div style={{ gridColumn: '1 / -1', fontSize: 12, color: C.textMuted }}>Con fecha y horas se crea el evento en el calendario. Los montos los completas en la fila cuando los tengas.</div>
    </form>
  )
}

// ── Moverse con el teclado, como en Excel ────────────────────────────────────
// ↑ ↓ cambian de fila y ← → de columna. En un texto, ← → recorren el texto y recien en el borde
// (o con todo seleccionado) saltan de celda. Enter guarda y baja (Shift+Enter sube). Las celdas sin
// nada editable (neto, bruto) y la ✕ de cancelar se saltan.
const EDITABLE = 'input, select, button'
const editableDe = td => (td && !td.hasAttribute('data-sin-teclado') ? td.querySelector(EDITABLE) : null)

function moverConTeclado(e) {
  if (e.altKey || e.ctrlKey || e.metaKey) return
  const el = e.target, td = el.closest?.('td'), tr = td?.parentElement
  const cuerpo = tr?.parentElement
  if (!td || cuerpo?.tagName !== 'TBODY' || el.closest('[role=menu]')) return
  const texto = el.tagName === 'INPUT' && el.type === 'text'
  let df = 0, dc = 0
  if (e.key === 'ArrowUp') df = -1
  else if (e.key === 'ArrowDown') df = 1
  else if (e.key === 'Enter' && el.tagName === 'INPUT' && el.type !== 'checkbox') df = e.shiftKey ? -1 : 1
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const todo = texto && el.selectionStart === 0 && el.selectionEnd === el.value.length
    const enBorde = e.key === 'ArrowLeft' ? el.selectionStart === 0 && el.selectionEnd === 0 : el.selectionEnd === el.value.length
    if (texto && !todo && !enBorde) return
    dc = e.key === 'ArrowLeft' ? -1 : 1
  } else return

  const filas = Array.from(cuerpo.rows)
  let f = filas.indexOf(tr), c = Array.from(tr.cells).indexOf(td), destino = null
  if (df) {
    // Misma columna en la fila de arriba o abajo.
    f += df
    destino = filas[f] && editableDe(filas[f].cells[c])
  } else {
    // La siguiente celda editable de la misma fila.
    for (c += dc; c >= 0 && c < tr.cells.length && !destino; c += dc) destino = editableDe(tr.cells[c])
  }
  e.preventDefault()
  if (!destino) return
  destino.focus()
  if (destino.tagName === 'INPUT' && destino.type === 'text') destino.select()
}

// ── La planilla ──────────────────────────────────────────────────────────────

const FILTROS = [
  ['todas', 'Todas'], ['cobrar', 'Por cobrar'], ['documentos', 'Documentos por emitir'], ['notas', 'Con notas'], ['pendientes', 'Por instalar'], ['sinfecha', 'Sin fecha'],
]
const cumple = (f, filtro) => ({
  todas: true, cobrar: f.porCobrar, documentos: porEmitir(f.documento), notas: Boolean(f.inst.nota), pendientes: !f.instalada && Boolean(f.fecha), sinfecha: !f.fecha,
}[filtro])

export default function PlanillaSection({ onVerCotizacion }) {
  const hoy = ahoraEnZona().fecha
  const [movil, setMovil] = useState(() => window.innerWidth < 900)
  useEffect(() => { const f = () => setMovil(window.innerWidth < 900); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  const [quotes, setQuotes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [periodo, setPeriodo] = useState('mes') // semana | mes | todo
  const [cursor, setCursor] = useState(hoy)
  const [filtro, setFiltro] = useState('todas')
  const [buscar, setBuscar] = useState('')
  const [detalle, setDetalle] = useState(null)
  const [nueva, setNueva] = useState(false)
  const [importar, setImportar] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    try {
      const r = await apiFetch('/.netlify/functions/get-quotes')
      if (!r.ok) throw new Error(r.error || 'No se pudieron leer las ventas')
      setQuotes(r.quotes)
    } catch (e) { setError(e.message) } finally { setCargando(false) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const reemplazar = q => setQuotes(prev => prev.map(x => (String(x.cotNum) === String(q.cotNum) ? { ...x, ...q, linkPago: x.linkPago } : x)))
  async function actualizar(cotNum, cambios) {
    setAviso('')
    try {
      const r = await apiFetch(API, { method: 'POST', body: JSON.stringify({ accion: 'actualizar', cotNum, cambios }) })
      if (!r.ok) throw new Error(r.error || 'No se pudo guardar')
      reemplazar(r.cotizacion)
    } catch (e) { setAviso(e.message); cargar() }
  }
  async function cancelar(q) {
    if (!window.confirm(`¿Cancelar la instalación de ${q.nombre}? Sale de la planilla (queda como "Canceló") y se borra su evento del calendario.`)) return
    const r = await apiFetch(API, { method: 'POST', body: JSON.stringify({ accion: 'cancelar', cotNum: q.cotNum }) })
    if (!r.ok) return setAviso(r.error || 'No se pudo cancelar')
    setQuotes(prev => prev.map(x => (x.cotNum === q.cotNum ? { ...x, status: 'rechazada' } : x)))
  }
  async function registrarPago(q, monto, medio) {
    const r = await apiFetch('/.netlify/functions/pagos', { method: 'POST', body: JSON.stringify({ accion: 'registrar', cotNum: q.cotNum, monto, medio, fecha: hoy, nota: 'Registrado desde la planilla' }) })
    if (!r.ok) return setAviso(r.error || 'No se pudo registrar el pago')
    reemplazar({ cotNum: q.cotNum, pagos: r.pagos })
  }
  async function crear(datos) {
    const r = await apiFetch(API, { method: 'POST', body: JSON.stringify({ accion: 'crear', ...datos }) })
    if (!r.ok) throw new Error(r.error || 'No se pudo agregar')
    setQuotes(prev => [...prev, r.cotizacion]); setNueva(false)
    if (r.cotizacion.instalacion?.fecha) { setPeriodo('mes'); setCursor(r.cotizacion.instalacion.fecha) }
  }

  // Ventas: confirmadas o con instalacion, salvo las canceladas.
  const filas = useMemo(() => quotes.filter(q => q.status !== 'rechazada' && (q.instalacion || q.status === 'confirmada')).map(q => filaDe(q, hoy)), [quotes, hoy])
  const rango = periodo === 'semana' ? [lunes(cursor), sumarDias(lunes(cursor), 6)] : periodo === 'mes' ? [cursor.slice(0, 8) + '01', cursor.slice(0, 8) + '31'] : null
  const bq = buscar.trim().toLowerCase()
  // Estos filtros miran todo el historial: un cobro, un documento o una nota pendiente no se pierden
  // por cambiar de mes.
  const HISTORIAL = ['cobrar', 'documentos', 'notas', 'sinfecha']
  const todoElHistorial = HISTORIAL.includes(filtro)
  const visibles = filas
    .filter(f => (todoElHistorial ? true : rango ? f.fecha && f.fecha >= rango[0] && f.fecha <= rango[1] : true))
    .filter(f => cumple(f, filtro))
    .filter(f => !bq || String(f.q.nombre).toLowerCase().includes(bq) || String(f.inst.nota || '').toLowerCase().includes(bq) || String(f.q.cotNum) === bq)
    .sort((a, b) => (a.fecha || '9999').localeCompare(b.fecha || '9999') || String(a.inst.inicio || '').localeCompare(String(b.inst.inicio || '')))
  const conteo = Object.fromEntries(FILTROS.map(([k]) => [k, filas.filter(f => cumple(f, k) && (HISTORIAL.includes(k) || !rango || (f.fecha && f.fecha >= rango[0] && f.fecha <= rango[1]))).length]))
  const suma = campo => visibles.reduce((s, f) => s + (f.montos[campo] || 0), 0)
  const mover = n => setCursor(c => (periodo === 'semana' ? sumarDias(c, 7 * n) : (() => { const [y, m] = c.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 10) })()))
  const titulo = periodo === 'todo' ? 'Todo el historial' : periodo === 'mes' ? tituloMes(cursor.slice(0, 7)) : `Semana del ${fechaCorta(lunes(cursor))}`
  const segmento = activo => ({ padding: '6px 12px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', background: activo ? 'white' : 'transparent', color: activo ? C.text : C.textSub, boxShadow: activo ? '0 1px 3px rgba(0,0,0,.12)' : 'none' })
  const abierta = detalle && quotes.find(q => String(q.cotNum) === String(detalle))

  const editarMonto = (q, campo, valor) => {
    if (campo === 'repisas') return actualizar(q.cotNum, { repisasTotal: valor })
    if (campo === 'despacho') return actualizar(q.cotNum, { adicionales: { despacho: valor } })
    return actualizar(q.cotNum, { adicionales: { [`qty_${campo}`]: valor ? 1 : 0, [`precio_${campo}`]: valor || Number(q.adicionales?.[`precio_${campo}`]) || 0 } })
  }
  // Un monto se edita en la celda si es una sola linea; si son varias (2 repisas, 3 cajas), en el detalle.
  const unaLinea = (q, campo) => (campo === 'repisas' ? (q.repisas || []).length <= 1 && (Number(q.repisas?.[0]?.unidades ?? 1) || 0) <= 1
    : campo === 'despacho' ? true : (Number(q.adicionales?.[`qty_${campo}`]) || 0) <= 1)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {periodo !== 'todo' && <>
            <button onClick={() => setCursor(hoy)} style={{ ...styles.btnSecondary, padding: '6px 12px', fontSize: 12.5 }}>Hoy</button>
            <button onClick={() => mover(-1)} aria-label="Anterior" style={{ ...styles.btnSecondary, padding: '6px 10px' }}>‹</button>
            <button onClick={() => mover(1)} aria-label="Siguiente" style={{ ...styles.btnSecondary, padding: '6px 10px' }}>›</button>
          </>}
          <h2 style={{ ...styles.sectionTitle, fontSize: movil ? 16 : 19, marginLeft: 4 }}>{titulo}</h2>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: '#EEF0F3' }} role="tablist" aria-label="Período">
            {[['semana', 'Semana'], ['mes', 'Mes'], ['todo', 'Todo']].map(([k, n]) => <button key={k} role="tab" aria-selected={periodo === k} onClick={() => setPeriodo(k)} style={segmento(periodo === k)}>{n}</button>)}
          </div>
          <button onClick={() => setNueva(v => !v)} style={{ ...styles.btnPrimary, fontSize: 12.5, padding: '8px 14px' }}>+ Nueva instalación</button>
          <button onClick={() => setImportar(true)} style={{ ...styles.btnSecondary, fontSize: 12.5 }}>Importar Excel</button>
        </div>
      </div>

      {nueva && <NuevaInstalacion onCrear={crear} onCancelar={() => setNueva(false)} />}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        {FILTROS.map(([k, n]) => (
          <button key={k} onClick={() => setFiltro(k)} aria-pressed={filtro === k}
            style={{ padding: '5px 11px', borderRadius: 99, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', border: '1.5px solid ' + (filtro === k ? C.orange : C.border), background: filtro === k ? C.orangeLight : 'white', color: filtro === k ? C.orangeDark : C.textSub }}>
            {n} · {conteo[k]}
          </button>
        ))}
        {!movil && <span style={{ fontSize: 11.5, color: C.textMuted, marginLeft: 'auto' }}>Flechas para moverte · Enter guarda y baja</span>}
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar cliente o nota…" aria-label="Buscar" style={{ ...styles.input, width: 200, padding: '6px 10px', fontSize: 12.5, marginLeft: movil ? 'auto' : 0 }} />
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}
      {aviso && <div style={styles.errorBox} role="alert">{aviso}</div>}
      {cargando && !quotes.length && <div style={styles.empty}>Cargando instalaciones…</div>}
      {!cargando && !visibles.length && <div style={styles.empty}>No hay instalaciones con este filtro.</div>}

      {visibles.length > 0 && (movil ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {visibles.map(f => (
            <div key={f.q.cotNum} data-testid="fila-planilla" onClick={() => setDetalle(f.q.cotNum)}
              style={{ ...styles.card, padding: 12, cursor: 'pointer', borderLeft: '4px solid ' + (f.instalada ? C.green : f.atrasada ? C.yellow : C.border), background: f.instalada ? '#F6F7F9' : 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <label onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
                  <input type="checkbox" checked={f.instalada} aria-label={`Instalada: ${f.q.nombre}`} onChange={e => actualizar(f.q.cotNum, { instalada: e.target.checked })} style={{ width: 18, height: 18, margin: 0, flex: 'none' }} />
                  {f.q.nombre}
                </label>
                <strong style={{ fontSize: 14 }}>{fmt(f.montos.bruto)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: C.textSub, marginTop: 4 }}>
                <span>{fechaCorta(f.fecha)}{f.inst.inicio ? ` · ${f.inst.inicio}–${f.inst.fin}` : ''}</span>
                <span><strong style={{ color: porEmitir(f.documento) ? C.red : C.textSub }}>{f.documento || (f.sugerido ? f.sugerido + '?' : '—')}</strong> · {f.pago.estado === 'pagada' ? <span style={{ color: C.green }}>Pagada</span> : f.pago.pagado ? `${f.pago.porcentaje}%` : <span style={{ color: f.instalada ? C.red : C.textMuted }}>Sin pago</span>}</span>
              </div>
              {f.inst.nota && <div style={{ fontSize: 12, color: '#92400E', marginTop: 4 }}>📝 {f.inst.nota}</div>}
              {f.porCobrar && <a onClick={e => e.stopPropagation()} href={linkCobro(f.q)} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6, fontSize: 12, fontWeight: 700, color: '#128C7E' }}>💬 Cobrar {fmt(f.pago.saldo)}</a>}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ ...styles.card, padding: 0, overflowX: 'auto' }}>
          {/* Solo la celda en que se esta escribiendo lleva un borde suave; al salir, vuelve a quedar limpia. */}
          <style>{`.planilla-celda:focus{outline:none;border-color:${C.orange}66 !important;background:#fff !important}`}</style>
          <table data-testid="planilla" onKeyDown={moverConTeclado} style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1280 }}>
            <thead>
              <tr style={{ background: '#F4F5F7' }}>
                {['Nota', '', 'Cliente', 'Fecha', 'Inicio', 'Fin', 'Doc.', 'Pagado', 'Repisas', ...SERV.map(s => CORTO[s.clave] || s.nombre), 'Despacho', 'Neto', 'Bruto', ''].map((h, i) => (
                  <th key={i} style={{ padding: '8px 6px', textAlign: i >= 8 && i <= 15 ? 'right' : 'left', fontSize: 10.5, fontWeight: 800, letterSpacing: .4, textTransform: 'uppercase', color: C.textMuted, whiteSpace: 'nowrap', position: 'sticky', top: 0, background: '#F4F5F7' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((f, i) => {
                const q = f.q, nuevaSemana = i > 0 && f.fecha && visibles[i - 1].fecha && lunes(f.fecha) !== lunes(visibles[i - 1].fecha)
                const td = { padding: '2px 4px', borderTop: (nuevaSemana ? '2px solid ' : '1px solid ') + (nuevaSemana ? C.orange + '55' : C.border), verticalAlign: 'middle' }
                return (
                  <tr key={q.cotNum} data-testid="fila-planilla" data-cot={q.cotNum}>
                    <td style={{ ...td, width: 170 }}><Celda valor={f.inst.nota} etiqueta={`Nota de ${q.nombre}`} placeholder="" alGuardar={v => actualizar(q.cotNum, { nota: v })} estilo={{ color: '#92400E', fontWeight: 600 }} /></td>
                    <td data-sin-teclado style={{ ...td, width: 26, textAlign: 'center' }}><button onClick={() => cancelar(q)} aria-label={`Cancelar ${q.nombre}`} title="Canceló: sacar de la planilla" style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 13 }}>✕</button></td>
                    <td style={{ ...td, minWidth: 190, background: f.instalada ? '#ECEEF1' : f.atrasada ? '#FFFBEB' : 'transparent' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" checked={f.instalada} title={f.instalada ? 'Instalada' : f.atrasada ? 'La fecha ya pasó: ¿se instaló?' : 'Marcar como instalada'} aria-label={`Instalada: ${q.nombre}`}
                          onChange={e => actualizar(q.cotNum, { instalada: e.target.checked })} style={{ width: 15, height: 15, margin: 0, flex: 'none', cursor: 'pointer' }} />
                        <button onClick={() => setDetalle(q.cotNum)} style={{ background: 'none', border: 'none', padding: '5px 0', font: 'inherit', fontWeight: 700, color: C.text, cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{q.nombre}</button>
                      </div>
                    </td>
                    <td style={{ ...td, width: 122 }}><Celda tipo="date" valor={f.fecha} etiqueta={`Fecha de ${q.nombre}`} alGuardar={v => actualizar(q.cotNum, { fecha: v })} /></td>
                    <td style={{ ...td, width: 82 }}><Celda tipo="time" valor={f.inst.inicio} etiqueta={`Inicio de ${q.nombre}`} alGuardar={v => actualizar(q.cotNum, { inicio: v })} /></td>
                    <td style={{ ...td, width: 82 }}><Celda tipo="time" valor={f.inst.fin} etiqueta={`Fin de ${q.nombre}`} alGuardar={v => actualizar(q.cotNum, { fin: v })} /></td>
                    <td style={{ ...td, width: 82 }}><Documento fila={f} alGuardar={v => actualizar(q.cotNum, { documento: v })} /></td>
                    <td style={{ ...td, width: 64 }}><Pagado fila={f} onRegistrar={(m, medio) => registrarPago(q, m, medio)} onAbrir={() => setDetalle(q.cotNum)} /></td>
                    {['repisas', ...SERV.map(s => s.clave), 'despacho'].map(campo => (
                      <td key={campo} style={{ ...td, width: 88 }}>
                        <CeldaMonto valor={f.montos[campo]} etiqueta={`${campo} de ${q.nombre}`} editable={unaLinea(q, campo)}
                          onAbrir={() => setDetalle(q.cotNum)} alGuardar={v => editarMonto(q, campo, v)} />
                      </td>
                    ))}
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, padding: '2px 8px', whiteSpace: 'nowrap' }}>{fmt(f.montos.neto)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: C.orangeDark, padding: '2px 8px', whiteSpace: 'nowrap' }}>{fmt(f.montos.bruto)}</td>
                    <td style={{ ...td, width: 34, textAlign: 'center' }}>
                      {f.porCobrar && <a href={linkCobro(q)} target="_blank" rel="noreferrer" aria-label={`Cobrar a ${q.nombre} por WhatsApp`} title={`Cobrar ${fmt(f.pago.saldo)} por WhatsApp`} style={{ textDecoration: 'none', fontSize: 16 }}>💬</a>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#F4F5F7', fontWeight: 800 }}>
                <td colSpan={8} style={{ padding: '8px 10px', fontSize: 12 }} data-testid="totales-planilla">{visibles.length} {visibles.length === 1 ? 'venta' : 'ventas'}</td>
                {['repisas', ...SERV.map(s => s.clave), 'despacho', 'neto', 'bruto'].map(c => <td key={c} style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap', color: c === 'bruto' ? C.orangeDark : C.text }}>{fmt(suma(c))}</td>)}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ))}

      {abierta && <Detalle q={abierta} onCerrar={() => setDetalle(null)} onActualizar={c => actualizar(abierta.cotNum, c)} onCambioLocal={c => reemplazar({ cotNum: abierta.cotNum, ...c })} onVerCotizacion={onVerCotizacion} />}
      {importar && <ImportarExcel onCerrar={() => setImportar(false)} onListo={() => { setImportar(false); setPeriodo('todo'); cargar() }} />}
    </div>
  )
}

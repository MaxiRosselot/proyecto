// Admin → Contabilidad: la cuenta corriente BCI de la empresa. Se suben los PDF de BCI (cartola o
// "Movimientos desde última cartola", cuando quieras: lo repetido no se duplica), el panel sugiere a
// qué corresponde cada movimiento (reglas, pagos de las cotizaciones, costos fijos) y aquí se confirma.
// Arriba, los costos fijos del mes con su vencimiento. Datos: netlify/functions/lib/contabilidad*.mjs.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORIA, CATEGORIAS, normalizarGlosa } from '../../netlify/functions/lib/contabilidad.mjs'
import { C, apiFetch, fmt, styles } from './utils.js'

const URL = '/.netlify/functions/contabilidad'
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const nombreMes = m => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
const moverMes = (m, d) => { const f = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + d, 1); return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}` }
const fechaCorta = f => (f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : '')
const chip = (color, fondo) => ({ display: 'inline-block', padding: '2px 9px', borderRadius: 99, fontSize: 11.5, fontWeight: 700, color, background: fondo, whiteSpace: 'nowrap' })
const COLOR_TIPO = { ingreso: '#15803d', gasto: '#B91C1C', traspaso: '#6B7280' }
const GRUPOS = [...new Set(CATEGORIAS.map(c => c.grupo))]
const monto = n => <span style={{ fontWeight: 700, color: n < 0 ? '#B91C1C' : '#15803d', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{n < 0 ? '−' : '+'}{fmt(Math.abs(n))}</span>

function SelectCategoria({ value, onChange, lado, style }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label="Categoría" style={{ ...styles.input, padding: '6px 8px', fontSize: 13, ...style }}>
      <option value="">— ¿Qué es? —</option>
      {GRUPOS.map(g => (
        <optgroup key={g} label={g}>
          {CATEGORIAS.filter(c => c.grupo === g && (lado === 'abono' ? c.tipo !== 'gasto' : c.tipo !== 'ingreso' || c.id === 'otro-ingreso')).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </optgroup>
      ))}
    </select>
  )
}

const ESTADO_FIJO = {
  pagado: ['Pagado', '#15803d', '#DCFCE7'],
  'pagado?': ['¿Pagado?', '#1D4ED8', '#DBEAFE'],
  'por vencer': ['Por vencer', '#B45309', '#FEF3C7'],
  pendiente: ['Pendiente', '#4B5563', '#F3F4F6'],
  vencido: ['Vencido', '#B91C1C', '#FEE2E2'],
}

function FormFijo({ inicial, onGuardar, onCancelar }) {
  const [f, setF] = useState({ nombre: '', categoria: '', monto: '', dia: 5, patron: '', ...inicial })
  const [guardando, setGuardando] = useState(false)
  const etiqueta = { fontSize: 12, fontWeight: 700, color: C.textSub, display: 'grid', gap: 4 }
  return (
    <form onSubmit={async e => { e.preventDefault(); setGuardando(true); try { await onGuardar(f) } finally { setGuardando(false) } }}
      style={{ display: 'grid', gap: 10, padding: 14, border: '1px solid ' + C.border, borderRadius: 12, background: '#FAFAFB', marginTop: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <label style={etiqueta}>Nombre<input autoFocus value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Arriendo bodega" style={styles.input} /></label>
        <label style={etiqueta}>Categoría<SelectCategoria value={f.categoria} onChange={v => setF({ ...f, categoria: v })} lado="cargo" /></label>
        <label style={etiqueta}>Monto aprox.<input inputMode="numeric" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value.replace(/\D/g, '') })} placeholder="450000" style={styles.input} /></label>
        <label style={etiqueta}>Vence el día<input type="number" min="1" max="31" value={f.dia} onChange={e => setF({ ...f, dia: e.target.value })} style={styles.input} /></label>
        <label style={etiqueta}>Texto en el banco (opcional)<input value={f.patron} onChange={e => setF({ ...f, patron: e.target.value })} placeholder="STORAGE" style={styles.input} /></label>
      </div>
      <div style={{ fontSize: 12, color: C.textMuted }}>Se da por pagado con un cargo del mes que diga ese texto, o si no tiene texto, con un cargo de un monto parecido (±5 %).</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancelar} style={styles.btnSecondary}>Cancelar</button>
        <button type="submit" disabled={!f.nombre.trim() || guardando} style={styles.btnPrimary}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}

function CostosFijos({ datos, accion }) {
  const [editando, setEditando] = useState(null)
  const guardar = async f => { await accion({ accion: 'guardar-fijo', fijo: f, movimiento: f.movimiento }); setEditando(null) }
  const fijos = [...datos.fijos].sort((a, b) => (a.estado === 'pagado') - (b.estado === 'pagado') || a.vence.localeCompare(b.vence))
  const pagados = datos.fijos.filter(f => f.estado === 'pagado').length
  return (
    <section style={{ ...styles.card, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Costos fijos de {nombreMes(datos.mes)} <span style={{ color: C.textMuted, fontWeight: 500, fontSize: 13 }}>· {pagados} de {datos.fijos.length} pagados</span></h3>
        <button onClick={() => setEditando({})} style={{ ...styles.btnSecondary, padding: '6px 12px', fontSize: 13 }}>+ Costo fijo</button>
      </div>
      {editando && <FormFijo inicial={editando} onGuardar={guardar} onCancelar={() => setEditando(null)} />}
      {!fijos.length && !editando && <p style={{ color: C.textSub, fontSize: 13.5, margin: '10px 0 0' }}>Agrega lo que pagas todos los meses (bodega, cuota del auto, contador, Previred, F29…) con el día en que vence, y aquí vas viendo si ya está pagado.</p>}
      <div style={{ display: 'grid', gap: 6, marginTop: fijos.length ? 12 : 0 }}>
        {fijos.map(f => {
          const [txt, color, fondo] = ESTADO_FIJO[f.estado]
          const cuando = f.estado === 'pagado' || f.estado === 'pagado?' ? `${fmt(f.pagado)}` : f.faltan === 0 ? 'vence hoy' : f.faltan > 0 ? `vence en ${f.faltan} día${f.faltan === 1 ? '' : 's'}` : `venció hace ${-f.faltan} día${f.faltan === -1 ? '' : 's'}`
          return (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: f.estado === 'vencido' ? '#FEF2F2' : '#FAFAFB', flexWrap: 'wrap' }}>
              <span style={chip(color, fondo)}>{txt}</span>
              <span style={{ fontWeight: 700, fontSize: 14, flex: '1 1 140px' }}>{f.nombre}</span>
              <span style={{ fontSize: 12.5, color: C.textSub }}>día {f.dia} · {f.monto ? fmt(f.monto) : 'monto variable'}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color, minWidth: 110, textAlign: 'right' }}>{cuando}</span>
              <button onClick={() => setEditando(f)} aria-label={`Editar ${f.nombre}`} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.textMuted, fontSize: 13 }}>Editar</button>
              <button onClick={() => window.confirm(`¿Quitar "${f.nombre}" de los costos fijos?`) && accion({ accion: 'borrar-fijo', id: f.id })} aria-label={`Quitar ${f.nombre}`} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.textMuted, fontSize: 16 }}>×</button>
            </div>
          )
        })}
      </div>
      {datos.pareceFijo.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: C.orangeDark }}>Se repiten todos los meses: ¿son costos fijos? ({datos.pareceFijo.length})</summary>
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {datos.pareceFijo.slice(0, 12).map(p => (
              <div key={p.monto + p.glosa} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, minWidth: 90 }}>{fmt(p.monto)}</span>
                <span style={{ color: C.textSub, flex: 1 }}>{p.glosa} · {p.veces} veces, cerca del día {p.dia}</span>
                <button onClick={() => setEditando({ monto: String(p.monto), dia: p.dia, categoria: p.categoria })} style={{ ...styles.btnSecondary, padding: '4px 10px', fontSize: 12 }}>Es fijo…</button>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}

// El nombre como sale en la app de BCI ("De Nicolás Tapia Céspedes", "A Juan Pérez"): la cartola lo
// corta o no lo trae, y con él se encuentra al cliente o se recuerda a quién se le paga.
function Contraparte({ m, accion }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(m.contraparte)
  useEffect(() => setTexto(m.contraparte), [m.contraparte])
  const guardar = async () => { setEditando(false); if (texto.trim() !== m.contraparte) await accion({ accion: 'clasificar', id: m.id, contraparte: texto.trim() }) }
  if (editando) return (
    <input autoFocus value={texto} onChange={e => setTexto(e.target.value)} onBlur={guardar} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setTexto(m.contraparte); setEditando(false) } }}
      placeholder={m.monto < 0 ? 'A quién (como sale en la app de BCI)' : 'De quién (como sale en la app de BCI)'} aria-label="De o para quién"
      style={{ ...styles.input, padding: '3px 8px', fontSize: 12.5, width: 260 }} />
  )
  return m.contraparte
    ? <button onClick={() => setEditando(true)} title="Cambiar" style={{ ...chip('#374151', '#F3F4F6'), border: 'none', cursor: 'pointer' }}>👤 {m.contraparte}</button>
    : <button onClick={() => setEditando(true)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: C.textMuted, fontSize: 12, textDecoration: 'underline dotted' }}>+ {m.monto < 0 ? 'para quién' : 'de quién'}</button>
}

// Ligar el abono a una cotización a mano: se busca por N° o nombre.
function LigarCotizacion({ m, datos, accion, onListo }) {
  const [texto, setTexto] = useState('')
  const opciones = useMemo(() => {
    const q = normalizarGlosa(texto)
    if (q.length < 2) return []
    return datos.cotizaciones.filter(c => c.cotNum.includes(q) || normalizarGlosa(c.nombre).includes(q)).slice(0, 8)
  }, [texto, datos.cotizaciones])
  const ligar = async c => { await accion({ accion: 'clasificar', id: m.id, cotNum: c.cotNum, categoria: m.categoria || 'venta-transferencia' }); onListo() }
  return (
    <div style={{ position: 'relative' }}>
      <input autoFocus value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === 'Escape' && onListo()} placeholder="N° o nombre del cliente" aria-label="Buscar cotización" style={{ ...styles.input, padding: '5px 8px', fontSize: 12.5, width: 230 }} />
      {opciones.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, marginTop: 4, background: 'white', border: '1px solid ' + C.border, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', minWidth: 300 }}>
          {opciones.map(c => {
            const saldo = c.total - c.pagado
            return (
              <button key={c.cotNum} onClick={() => ligar(c)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #F3F4F6' }}>
                <b>N° {c.cotNum}</b> · {c.nombre}
                <div style={{ fontSize: 11.5, color: C.textSub }}>total {fmt(c.total)} · pagado {fmt(c.pagado)}{saldo > 0 ? ` · saldo ${fmt(saldo)}` : ' · pagada'}{[c.total, Math.round(c.total / 2), saldo].includes(m.monto) ? ' · ✓ calza el monto' : ''}</div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Un movimiento con su categoría (confirmada o sugerida), su cotización y su costo fijo.
function Movimiento({ m, datos, accion, compacto }) {
  const s = m.sugerencia
  const [categoria, setCategoria] = useState(m.categoria || s.categoria || '')
  const [recordar, setRecordar] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [nota, setNota] = useState(m.nota)
  const [ligando, setLigando] = useState(false)
  useEffect(() => { setCategoria(m.categoria || s.categoria || ''); setNota(m.nota) }, [m.id, m.categoria, s.categoria, m.nota])
  const lado = m.monto < 0 ? 'cargo' : 'abono'
  const cotNum = m.cotNum || s.cotNum
  const fijo = datos.fijos.find(f => f.id === (m.fijo || s.fijo))
  // ¿El pago de este abono ya está anotado en su cotización? (mismo monto en ese mes)
  const fila = cotNum && datos.conciliacion.filas.find(f => f.cotNum === cotNum)
  const pagoAnotado = m.cotNum ? Boolean(fila?.pagos.some(p => p.monto === m.monto)) : s.registrado !== false
  const hacer = async f => { setOcupado(true); try { await f() } finally { setOcupado(false) } }
  const confirmar = () => hacer(() => accion({
    accion: 'clasificar', id: m.id, categoria, nota, recordar: recordar && !cotNum,
    ...(s.cotNum && !m.cotNum && !s.dudoso ? { cotNum: s.cotNum } : {}), ...(s.fijo && !m.fijo ? { fijo: s.fijo } : {}),
  }))
  const registrarPago = () => hacer(async () => {
    const r = await apiFetch('/.netlify/functions/pagos', { method: 'POST', body: JSON.stringify({ accion: 'registrar', cotNum, monto: m.monto, medio: 'Transferencia', fecha: m.fecha, nota: 'BCI: ' + (m.contraparte || normalizarGlosa(m.glosa)) }) })
    if (!r?.ok) throw new Error(r?.error || 'No se pudo registrar el pago')
    await accion({ accion: 'clasificar', id: m.id, categoria: m.categoria || 'venta-transferencia', cotNum })
  })
  const cambio = categoria !== (m.categoria || '') || nota !== m.nota || (!m.confirmado && categoria)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: compacto ? '1fr' : 'minmax(0, 1fr) auto', gap: 8, padding: '10px 12px', borderRadius: 10, background: m.confirmado ? C.surface : '#FFFBF2', border: '1px solid ' + (m.confirmado ? C.border : '#F5E3C0'), opacity: ocupado ? .6 : 1 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: C.textMuted, minWidth: 48 }}>{fechaCorta(m.fecha)}</span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>{normalizarGlosa(m.glosa)}</span>
          {monto(m.monto)}
          {m.origen === 'manual' && <span style={chip('#6B7280', '#F3F4F6')}>a mano</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 5, fontSize: 12 }}>
          <Contraparte m={m} accion={accion} />
          {cotNum && !ligando && (
            <span style={chip(m.cotNum && pagoAnotado ? '#15803d' : '#B45309', m.cotNum && pagoAnotado ? '#DCFCE7' : '#FEF3C7')}>
              {m.cotNum ? '' : '¿'}Cot. N° {cotNum}{(m.nombreCot || s.nombre) ? ` · ${m.nombreCot || s.nombre}` : ''}{m.cotNum ? '' : '?'}{!pagoAnotado ? ' · pago sin anotar en la cotización' : ''}{s.dudoso && !m.cotNum ? ' · monto distinto' : ''}
              {m.cotNum && <button onClick={() => hacer(() => accion({ accion: 'clasificar', id: m.id, cotNum: '' }))} aria-label="Desligar cotización" title="Desligar" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', padding: '0 0 0 6px', fontWeight: 800 }}>×</button>}
            </span>
          )}
          {m.monto > 0 && !m.cotNum && !ligando && <button onClick={() => setLigando(true)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: C.orangeDark, fontSize: 12, fontWeight: 600 }}>{cotNum ? 'otra cotización…' : 'ligar a cotización…'}</button>}
          {ligando && <LigarCotizacion m={m} datos={datos} accion={accion} onListo={() => setLigando(false)} />}
          {fijo && <span style={chip('#1D4ED8', '#DBEAFE')}>Costo fijo: {fijo.nombre}</span>}
          {!m.confirmado && s.motivo && <span style={{ color: C.textMuted }}>Sugerido: {s.motivo}</span>}
          {m.confirmado && m.nota && <span style={{ color: C.textSub }}>📝 {m.nota}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <SelectCategoria value={categoria} onChange={setCategoria} lado={lado} style={{ width: 190 }} />
        {!m.confirmado && <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota (opcional)" aria-label="Nota" style={{ ...styles.input, padding: '6px 8px', fontSize: 13, width: 130 }} />}
        {!m.confirmado && !cotNum && categoria && (
          <label title={m.contraparte ? `La próxima vez que aparezca "${m.contraparte}" se clasifica igual` : 'La próxima vez que aparezca este movimiento (o este mismo monto en un traspaso) se clasifica igual'} style={{ fontSize: 11.5, color: C.textSub, display: 'flex', alignItems: 'center', gap: 3 }}>
            <input type="checkbox" checked={recordar} onChange={e => setRecordar(e.target.checked)} />recordar
          </label>
        )}
        {cotNum && !pagoAnotado && !s.dudoso && <button disabled={ocupado} onClick={registrarPago} style={{ ...styles.btnSecondary, padding: '6px 10px', fontSize: 12.5 }}>Anotar pago en N° {cotNum}</button>}
        {cambio && <button disabled={ocupado || !categoria} onClick={confirmar} style={{ ...styles.btnPrimary, padding: '6px 12px', fontSize: 13 }}>{m.confirmado ? 'Guardar' : '✓'}</button>}
        {m.origen === 'manual' && <button onClick={() => window.confirm('¿Borrar este movimiento anotado a mano?') && hacer(() => accion({ accion: 'borrar', id: m.id }))} aria-label="Borrar" style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.textMuted, fontSize: 16 }}>×</button>}
      </div>
    </div>
  )
}

const ESTADO_CONCILIA = {
  'no llegó al banco': ['No llegó al banco', '#B91C1C', '#FEE2E2', 'Hay un pago anotado en la cotización, pero no lo encuentro en BCI (o falta ligar el abono).'],
  'pago sin registrar': ['Pago sin anotar', '#B45309', '#FEF3C7', 'Llegó al banco pero la cotización no tiene ese pago.'],
  'montos distintos': ['No cuadra', '#B45309', '#FEF3C7', ''],
  'por confirmar': ['Por confirmar', '#1D4ED8', '#DBEAFE', 'Cuadra con lo sugerido: confirma el abono abajo.'],
  cuadra: ['Cuadra', '#15803d', '#DCFCE7', ''],
}

function Conciliacion({ datos, onVerCotizacion }) {
  const { filas, sinCotizacion } = datos.conciliacion
  const [verTodas, setVerTodas] = useState(false)
  const problemas = filas.filter(f => f.estado !== 'cuadra')
  const visibles = verTodas ? filas : problemas
  const sueltos = datos.movimientos.filter(m => sinCotizacion.includes(m.id))
  return (
    <section style={{ ...styles.card, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Clientes: lo anotado vs. lo que llegó a BCI</h3>
        <span style={{ fontSize: 13, color: C.textSub }}>{filas.length - problemas.length} de {filas.length} cuadran{filas.length > problemas.length && <> · <button onClick={() => setVerTodas(v => !v)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: C.orangeDark, fontSize: 13 }}>{verTodas ? 'ver solo lo pendiente' : 'ver todos'}</button></>}</span>
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>Cotizaciones con pagos anotados este mes (sin Mercado Pago) o con abonos ligados. Los pagos en efectivo no se esperan en el banco.</div>
      {!filas.length && <p style={{ color: C.textSub, fontSize: 13.5, margin: 0 }}>No hay pagos de clientes este mes.</p>}
      <div style={{ display: 'grid', gap: 6 }}>
        {visibles.map(f => {
          const [txt, color, fondo, ayuda] = ESTADO_CONCILIA[f.estado]
          return (
            <div key={f.cotNum} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 10, background: '#FAFAFB' }}>
              <span style={chip(color, fondo)} title={ayuda}>{txt}</span>
              <button onClick={() => onVerCotizacion?.(f.cotNum)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, fontSize: 13.5, color: C.text, flex: '1 1 180px', textAlign: 'left' }}>N° {f.cotNum} · {f.nombre}</button>
              <span style={{ fontSize: 12.5, color: C.textSub }}>anotado {fmt(f.registrado)}{f.efectivo ? ` (${fmt(f.efectivo)} en efectivo)` : ''}</span>
              <span style={{ fontSize: 12.5, color: C.textSub }}>en BCI {fmt(f.enBanco)}</span>
              {f.diferencia !== 0 && <span style={{ fontSize: 12.5, fontWeight: 700, color }}>{f.diferencia > 0 ? '+' : '−'}{fmt(Math.abs(f.diferencia))}</span>}
            </div>
          )
        })}
      </div>
      {sueltos.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 13, color: '#B45309' }}>
          {sueltos.length} transferencia{sueltos.length === 1 ? '' : 's'} recibida{sueltos.length === 1 ? '' : 's'} sin cliente ({fmt(sueltos.reduce((t, m) => t + m.monto, 0))}): anota de quién es (como sale en la app de BCI) o lígala a su cotización en "Por revisar".
        </div>
      )}
    </section>
  )
}

function Resumen({ datos, sinIva, setSinIva }) {
  const r = datos.resumen
  const res = sinIva ? r.sinIva : r.conIva
  const tarjeta = (titulo, valor, color, extra) => (
    <div style={{ ...styles.card, padding: '14px 16px' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: .5 }}>{titulo}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
      {extra && <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{extra}</div>}
    </div>
  )
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 8 }}>
        {tarjeta('Entró al banco', fmt(r.entradas), '#15803d', `${r.cantidad} movimientos`)}
        {tarjeta('Salió del banco', fmt(r.salidas), '#B91C1C')}
        {tarjeta(`Resultado ${sinIva ? 'sin IVA' : 'con IVA'}`, (res.resultado < 0 ? '−' : '') + fmt(Math.abs(res.resultado)), res.resultado < 0 ? '#B91C1C' : '#15803d', `Ventas ${fmt(res.ingresos)} − gastos ${fmt(res.gastos)}`)}
        {tarjeta('Por revisar', r.porConfirmar, r.porConfirmar ? C.orangeDark : '#15803d', r.sinClasificar ? `${r.sinClasificar} sin idea de qué son` : 'todo con categoría')}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 12.5, color: C.textSub, marginBottom: 16 }}>
        <span style={{ color: r.sinClasificar ? '#B45309' : C.textMuted }}>{r.sinClasificar ? `⚠ El resultado todavía no es real: faltan ${r.sinClasificar} movimientos por decir qué son (${fmt(Math.abs(r.montoSinClasificar))} ${r.montoSinClasificar < 0 ? 'en salidas' : 'en entradas'} netas).` : r.porConfirmar ? 'Incluye sugerencias sin confirmar.' : 'Todo confirmado.'}</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', whiteSpace: 'nowrap' }}><input type="checkbox" checked={sinIva} onChange={e => setSinIva(e.target.checked)} />Ver sin IVA (÷1,19 en lo que lo tiene, como en el Excel)</label>
      </div>
    </>
  )
}

function PorCategoria({ datos, sinIva }) {
  const r = datos.resumen
  const lineas = r.lineas.map(l => ({ ...l, valor: sinIva && l.iva ? Math.round(l.total / 1.19) : l.total }))
  const max = Math.max(1, ...lineas.map(l => Math.abs(l.valor)))
  const mp = datos.mp
  const filas = [
    ...(mp ? [{ id: 'mp-bruto', nombre: 'Ventas por Mercado Pago (bruto, según MP)', tipo: 'ingreso', valor: sinIva ? Math.round(mp.bruto / 1.19) : mp.bruto, cantidad: mp.cantidad }] : []),
    ...lineas.filter(l => l.tipo === 'ingreso'),
    ...(mp ? [{ id: 'mp-comision', nombre: 'Comisiones Mercado Pago', tipo: 'gasto', valor: -(sinIva ? Math.round(mp.comision / 1.19) : mp.comision), cantidad: mp.cantidad }] : []),
    ...lineas.filter(l => l.tipo === 'gasto'),
    ...lineas.filter(l => l.tipo === 'traspaso'),
  ]
  return (
    <section style={{ ...styles.card, marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>En qué se fue (y de dónde vino)</h3>
      {!filas.length && <p style={{ color: C.textSub, fontSize: 13.5, margin: 0 }}>Todavía no hay movimientos con categoría este mes.</p>}
      <div style={{ display: 'grid', gap: 5 }}>
        {filas.map((l, i) => (
          <React.Fragment key={l.id}>
            {l.tipo === 'traspaso' && filas[i - 1]?.tipo !== 'traspaso' && <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 8 }}>No cuentan en el resultado (plata que se mueve, no se gana ni se gasta):</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 230px) 1fr auto', gap: 10, alignItems: 'center', fontSize: 13 }}>
              <span style={{ color: COLOR_TIPO[l.tipo], fontWeight: 600 }}>{l.nombre}{l.porConfirmar ? <span style={{ color: C.textMuted, fontWeight: 400 }}> · {l.porConfirmar} por confirmar</span> : ''}</span>
              <div style={{ background: '#F3F4F6', borderRadius: 4, height: 10 }}>
                <div style={{ width: `${Math.round(Math.abs(l.valor) * 100 / Math.max(max, mp ? mp.bruto : 0))}%`, height: '100%', borderRadius: 4, background: l.tipo === 'ingreso' ? '#86EFAC' : l.tipo === 'gasto' ? '#FCA5A5' : '#D1D5DB' }} />
              </div>
              {monto(l.valor)}
            </div>
          </React.Fragment>
        ))}
      </div>
    </section>
  )
}

function MercadoPago({ datos }) {
  const { mp } = datos
  const retiros = datos.movimientos.filter(m => m.fecha.startsWith(datos.mes) && m.categoriaFinal === 'venta-mp').reduce((s, m) => s + m.monto, 0)
  if (!datos.mpConectado) return null
  return (
    <section style={{ ...styles.card, marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>Mercado Pago en {nombreMes(datos.mes)}</h3>
      {datos.errorMp && <p style={{ color: '#B91C1C', fontSize: 13, margin: 0 }}>{datos.errorMp}</p>}
      {mp && (
        <>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 13.5 }}>
            <div>Cobrado: <b>{fmt(mp.bruto)}</b> <span style={{ color: C.textMuted }}>({mp.cantidad} pagos)</span></div>
            <div>Comisión: <b style={{ color: '#B91C1C' }}>{fmt(mp.comision)}</b> <span style={{ color: C.textMuted }}>({mp.bruto ? (mp.comision * 100 / mp.bruto).toFixed(1).replace('.', ',') : 0} %)</span></div>
            <div>Te queda: <b>{fmt(mp.neto)}</b></div>
            <div>Llegó al banco este mes: <b>{fmt(retiros)}</b></div>
          </div>
          {mp.pagos.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, color: C.textSub }}>Ver cada pago</summary>
              <div style={{ display: 'grid', gap: 3, marginTop: 6, fontSize: 12.5 }}>
                {mp.pagos.map(p => (
                  <div key={p.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ color: C.textMuted, minWidth: 48 }}>{fechaCorta(p.fecha)}</span>
                    <span style={{ flex: 1 }}>{p.pagador || p.descripcion || `#${p.id}`}{p.cotNum ? ` · Cot. N° ${p.cotNum}` : ''}</span>
                    <span>{fmt(p.bruto)}</span><span style={{ color: '#B91C1C' }}>−{fmt(p.comision)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </section>
  )
}

function MovimientoManual({ accion, onListo }) {
  const [m, setM] = useState({ fecha: new Date().toLocaleDateString('en-CA'), glosa: '', monto: '', signo: -1, categoria: '' })
  return (
    <form onSubmit={async e => { e.preventDefault(); await accion({ accion: 'manual', fecha: m.fecha, glosa: m.glosa, monto: m.signo * Number(m.monto), categoria: m.categoria }); onListo() }}
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: 12, border: '1px solid ' + C.border, borderRadius: 12, marginBottom: 12, background: '#FAFAFB' }}>
      <select value={m.signo} onChange={e => setM({ ...m, signo: Number(e.target.value), categoria: '' })} style={{ ...styles.input, width: 'auto', padding: '6px 8px' }}><option value={-1}>Gasto</option><option value={1}>Ingreso</option></select>
      <input type="date" value={m.fecha} onChange={e => setM({ ...m, fecha: e.target.value })} style={{ ...styles.input, width: 'auto', padding: '6px 8px' }} />
      <input value={m.glosa} onChange={e => setM({ ...m, glosa: e.target.value })} placeholder="Qué fue (ej. pago en efectivo a Tomi)" style={{ ...styles.input, flex: '1 1 200px', padding: '6px 8px' }} />
      <input inputMode="numeric" value={m.monto} onChange={e => setM({ ...m, monto: e.target.value.replace(/\D/g, '') })} placeholder="Monto" style={{ ...styles.input, width: 110, padding: '6px 8px' }} />
      <SelectCategoria value={m.categoria} onChange={v => setM({ ...m, categoria: v })} lado={m.signo < 0 ? 'cargo' : 'abono'} style={{ width: 180 }} />
      <button type="submit" disabled={!m.monto} style={{ ...styles.btnPrimary, padding: '6px 12px' }}>Anotar</button>
    </form>
  )
}

export default function ContabilidadSection({ onVerCotizacion }) {
  const [mes, setMes] = useState(null)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [sinIva, setSinIva] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [verManual, setVerManual] = useState(false)
  const [compacto, setCompacto] = useState(() => window.innerWidth < 900)
  const archivo = useRef(null)

  useEffect(() => { const fn = () => setCompacto(window.innerWidth < 900); window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn) }, [])

  // Solo vale la respuesta del último pedido: si una lectura lenta llega después de otra más nueva
  // (por ejemplo la de al abrir, después de traer lo de BCI), no la pisa.
  const pedido = useRef(0)
  const cargar = useCallback(async (m = mes) => {
    const n = ++pedido.current
    try {
      const r = await apiFetch(URL + (m ? `?mes=${m}` : ''))
      if (n !== pedido.current) return
      if (!r?.ok) throw new Error(r?.error || 'No se pudo cargar')
      setDatos(r); setError('')
      if (!m) setMes(r.mes)
    } catch (e) { setError(e.message) }
  }, [mes])
  useEffect(() => { cargar(mes) }, [mes])

  // Extensión "Don Maxi: BCI al panel": lo que leyó en BCI en línea (Mis Movimientos) entra solo al
  // abrir Contabilidad, y al volver a esta pestaña del navegador.
  const extensionBci = typeof document !== 'undefined' && document.documentElement.dataset.bciPanel
  const [leidoBci, setLeidoBci] = useState(null)
  const trayendo = useRef(false)
  const traerDeBci = useCallback(() => {
    if (!extensionBci || trayendo.current) return
    trayendo.current = true
    const oir = async ev => {
      if (ev.source !== window || ev.data?.dm !== 'bci-movimientos') return
      window.removeEventListener('message', oir)
      setLeidoBci(ev.data.leidoEn)
      try {
        if (!ev.data.movimientos?.length) return
        const r = await apiFetch(URL, { method: 'POST', body: JSON.stringify({ accion: 'importar-web', movimientos: ev.data.movimientos }) })
        if (!r?.ok) throw new Error(r?.error || 'No se pudo traer lo de BCI')
        window.postMessage({ dm: 'bci-importados' }, location.origin)
        const c = r.carga
        setAviso(`BCI en línea: ${c.leidos} movimientos, ${c.nuevos} nuevos${c.enriquecidos ? `, ${c.enriquecidos} con su nombre completo` : ''}${c.cuadra === false ? ' · ⚠ los saldos no encadenan: puede faltar una página en BCI' : ''}`)
        await cargar(mes)
      } catch (e) { setError(e.message) } finally { trayendo.current = false }
    }
    window.addEventListener('message', oir)
    window.postMessage({ dm: 'bci-pedir' }, location.origin)
    setTimeout(() => { window.removeEventListener('message', oir); trayendo.current = false }, 4000)
  }, [extensionBci, mes, cargar])
  useEffect(() => {
    traerDeBci()
    const alVolver = () => document.visibilityState === 'visible' && traerDeBci()
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [traerDeBci])

  async function accion(cuerpo) {
    const r = await apiFetch(URL, { method: 'POST', body: JSON.stringify(cuerpo) })
    if (!r?.ok) { setError(r?.error || 'No se pudo guardar'); throw new Error(r?.error) }
    await cargar(mes)
    return r
  }

  async function subir(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setSubiendo(true); setAviso(''); setError('')
    try {
      const pdf = await new Promise((ok, mal) => { const lector = new FileReader(); lector.onload = () => ok(lector.result); lector.onerror = mal; lector.readAsDataURL(f) })
      const r = await apiFetch(URL, { method: 'POST', body: JSON.stringify({ accion: 'subir', pdf, nombre: f.name }) })
      if (!r?.ok) throw new Error(r?.error || 'No se pudo leer el PDF')
      const c = r.carga
      setAviso(`${f.name}: ${c.leidos} movimientos leídos, ${c.nuevos} nuevos${c.cuadra === true ? ' · cuadra con el saldo del banco ✓' : c.cuadra === false ? ' · ⚠ no cuadra con el saldo del banco: revisa que no falten movimientos' : ''}`)
      await cargar(mes)
    } catch (e2) { setError(e2.message) } finally { setSubiendo(false) }
  }

  const delMes = useMemo(() => (datos ? datos.movimientos.filter(m => m.fecha.startsWith(datos.mes)).sort((a, b) => b.fecha.localeCompare(a.fecha)) : []), [datos])
  const porRevisar = delMes.filter(m => !m.confirmado)
  const conSugerencia = porRevisar.filter(m => m.sugerencia.categoria && !m.sugerencia.dudoso && (m.sugerencia.registrado !== false))
  const confirmados = delMes.filter(m => m.confirmado && (!filtro || normalizarGlosa(m.glosa).includes(normalizarGlosa(filtro)) || CATEGORIA[m.categoria]?.nombre.toUpperCase().includes(filtro.toUpperCase()) || m.cotNum.includes(filtro) || normalizarGlosa(m.contraparte).includes(normalizarGlosa(filtro))))

  if (error && !datos) return <div style={{ ...styles.card, color: '#B91C1C' }}>{error} <button onClick={() => cargar(mes)} style={styles.btnSecondary}>Reintentar</button></div>
  if (!datos) return <div style={{ color: C.textSub }}>Cargando la contabilidad…</div>

  const ultima = datos.cargas.at(-1)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => setMes(moverMes(datos.mes, -1))} aria-label="Mes anterior" style={{ ...styles.btnSecondary, padding: '6px 10px' }}>‹</button>
          <h2 style={{ ...styles.sectionTitle, minWidth: 170, textAlign: 'center', textTransform: 'capitalize' }}>{nombreMes(datos.mes)}</h2>
          <button onClick={() => setMes(moverMes(datos.mes, 1))} aria-label="Mes siguiente" disabled={datos.mes >= datos.hoy.slice(0, 7)} style={{ ...styles.btnSecondary, padding: '6px 10px' }}>›</button>
        </div>
        {datos.saldo && <div style={{ fontSize: 13, color: C.textSub }}>Saldo BCI: <b style={{ color: C.text }}>{fmt(datos.saldo.monto)}</b> al {fechaCorta(datos.saldo.fecha)}</div>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setVerManual(v => !v)} style={{ ...styles.btnSecondary, padding: '8px 12px', fontSize: 13 }}>+ A mano</button>
          <input ref={archivo} type="file" accept="application/pdf" onChange={subir} style={{ display: 'none' }} />
          <button onClick={() => archivo.current?.click()} disabled={subiendo} style={styles.btnPrimary}>{subiendo ? 'Leyendo…' : 'Subir PDF de BCI'}</button>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: -6, marginBottom: 12 }}>
        {extensionBci
          ? <>Abre BCI en línea → Cuentas → <b>Mis Movimientos</b> y vuelve aquí: lo leído entra solo.{leidoBci && ` BCI leído: ${new Date(leidoBci).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`} También sirve subir el PDF.</>
          : <>En BCI: Cuenta corriente → "Movimientos desde última cartola" → descargar PDF y súbelo (lo repetido no se duplica). Con la extensión "Don Maxi: BCI al panel" entra solo.</>}
        {ultima && ` Última carga: ${new Date(ultima.en).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`}
      </div>
      {aviso && <div style={{ ...styles.card, padding: '10px 14px', marginBottom: 12, background: '#F0FDF4', color: '#166534', fontSize: 13.5 }}>{aviso}</div>}
      {error && <div style={{ ...styles.card, padding: '10px 14px', marginBottom: 12, background: '#FEF2F2', color: '#B91C1C', fontSize: 13.5 }}>{error}</div>}
      {verManual && <MovimientoManual accion={accion} onListo={() => setVerManual(false)} />}

      <Resumen datos={datos} sinIva={sinIva} setSinIva={setSinIva} />
      <CostosFijos datos={datos} accion={accion} />

      <section style={{ ...styles.card, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Por revisar <span style={{ color: C.textMuted, fontWeight: 500 }}>({porRevisar.length})</span></h3>
          {conSugerencia.length > 0 && <button onClick={() => accion({ accion: 'aceptar', ids: conSugerencia.map(m => m.id) })} style={{ ...styles.btnSecondary, padding: '6px 12px', fontSize: 13 }}>Aceptar las {conSugerencia.length} sugerencias</button>}
        </div>
        {!delMes.length && <p style={{ color: C.textSub, fontSize: 13.5, margin: 0 }}>No hay movimientos de este mes. Sube el PDF de BCI.</p>}
        {delMes.length > 0 && !porRevisar.length && <p style={{ color: '#15803d', fontSize: 13.5, margin: 0 }}>Todo revisado ✓</p>}
        <div style={{ display: 'grid', gap: 6 }}>
          {porRevisar.map(m => <Movimiento key={m.id} m={m} datos={datos} accion={accion} compacto={compacto} />)}
        </div>
      </section>

      <Conciliacion datos={datos} onVerCotizacion={onVerCotizacion} />
      <MercadoPago datos={datos} />
      <PorCategoria datos={datos} sinIva={sinIva} />

      {datos.descuentos.lista.length > 0 && (
        <section style={{ ...styles.card, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Descuentos dados en las ventas del mes: {fmt(datos.descuentos.total)}</h3>
          <div style={{ display: 'grid', gap: 3, fontSize: 13 }}>
            {datos.descuentos.lista.map(d => <div key={d.cotNum}>N° {d.cotNum} · {d.nombre} · {d.pct} % = {fmt(d.monto)}</div>)}
          </div>
        </section>
      )}

      <section style={{ ...styles.card }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Revisados <span style={{ color: C.textMuted, fontWeight: 500 }}>({delMes.length - porRevisar.length})</span></h3>
          <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar (glosa, categoría, N° cot.)" aria-label="Buscar movimientos" style={{ ...styles.input, width: 240, padding: '6px 10px', fontSize: 13 }} />
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {confirmados.map(m => <Movimiento key={m.id} m={m} datos={datos} accion={accion} compacto={compacto} />)}
        </div>
      </section>
    </div>
  )
}

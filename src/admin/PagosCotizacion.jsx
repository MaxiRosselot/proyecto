import React, { useState } from 'react'
import { C, apiFetch, fmt, styles } from './utils.js'
import { MEDIOS_PAGO, resumenPagos } from '../../netlify/functions/lib/pagos-resumen.mjs'

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
const fechaCorta = iso => { const [y, m, d] = iso.split('-'); return `${d}-${m}-${y}` }
const COLOR = { pagada: C.green, abono: C.yellow, 'sin pago': C.textMuted }
export const ETIQUETA_PAGO = { pagada: 'Pagada', abono: 'Abono', 'sin pago': 'Sin pago' }

export function BadgePago({ quote }) {
  const r = resumenPagos(quote.total, quote.pagos)
  if (r.estado === 'sin pago') return null
  return <span style={{ ...styles.badge(COLOR[r.estado]), marginLeft: 10 }}>{r.estado === 'pagada' ? 'Pagada' : `Abono ${r.porcentaje}%`}</span>
}

// Abonos y saldo de una cotizacion: barra de avance, lista de pagos y formulario para registrar otro.
export function PagosCotizacion({ quote, onCambio }) {
  const r = resumenPagos(quote.total, quote.pagos)
  const [abierto, setAbierto] = useState(false)
  const [monto, setMonto] = useState('')
  const [medio, setMedio] = useState(MEDIOS_PAGO[0])
  const [fecha, setFecha] = useState(hoy)
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const mitad = Math.round(r.total / 2)

  async function llamar(cuerpo) {
    setGuardando(true); setError('')
    try {
      const res = await apiFetch('/.netlify/functions/pagos', { method: 'POST', body: JSON.stringify({ cotNum: quote.cotNum, ...cuerpo }) })
      if (!res.ok) throw new Error(res.error || 'No se pudo guardar el pago')
      onCambio({ pagos: res.pagos })
      return true
    } catch (e) { setError(e.message); return false }
    finally { setGuardando(false) }
  }
  async function registrar() {
    if (await llamar({ accion: 'registrar', monto: Number(monto), medio, fecha, nota })) { setAbierto(false); setMonto(''); setNota('') }
  }
  async function borrar(pago) {
    if (window.confirm(`¿Borrar el pago de ${fmt(pago.monto)} del ${fechaCorta(pago.fecha)}?`)) await llamar({ accion: 'borrar', id: pago.id })
  }

  const campo = { ...styles.input, padding: '7px 10px', fontSize: 13 }
  const chip = { ...styles.btnSecondary, fontSize: 12, padding: '5px 10px' }
  return (
    <div data-testid="pagos" style={{ marginBottom: 14, padding: 14, borderRadius: 12, border: '1px solid ' + C.border, background: '#FCFCFD' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: C.textMuted, textTransform: 'uppercase', letterSpacing: .8 }}>Pagos</span>
        <span style={{ fontSize: 13, color: C.textSub }}>
          Pagado <strong style={{ color: C.text }}>{fmt(r.pagado)}</strong> de {fmt(r.total)} ·
          {r.saldo > 0 ? <> saldo <strong style={{ color: C.orangeDark }}>{fmt(r.saldo)}</strong></> : <strong style={{ color: C.green }}> pagada completa</strong>}
        </span>
      </div>
      <div role="progressbar" aria-valuenow={r.porcentaje} aria-valuemin={0} aria-valuemax={100}
        style={{ height: 8, borderRadius: 99, background: C.border, overflow: 'hidden', margin: '8px 0 10px' }}>
        <div style={{ width: r.porcentaje + '%', height: '100%', background: r.estado === 'pagada' ? C.green : C.yellow, transition: 'width .3s' }} />
      </div>

      {(quote.pagos || []).map(p => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '6px 0', borderTop: '1px solid ' + C.border }}>
          <span style={{ color: C.textMuted, minWidth: 78 }}>{fechaCorta(p.fecha)}</span>
          <strong style={{ minWidth: 86 }}>{fmt(p.monto)}</strong>
          <span style={{ color: C.textSub, flex: 1 }}>{p.medio}{p.nota ? ' · ' + p.nota : ''}</span>
          <button onClick={() => borrar(p)} disabled={guardando} aria-label="Borrar pago"
            style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 13 }}>✕</button>
        </div>
      ))}

      {r.saldo > 0 && !abierto && (
        <button onClick={() => { setAbierto(true); setMonto(String((quote.pagos || []).length ? r.saldo : mitad)) }}
          style={{ ...styles.btnSecondary, fontSize: 12, padding: '6px 14px', marginTop: 6 }}>Registrar pago</button>
      )}
      {abierto && (
        <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {mitad < r.saldo && <button type="button" style={chip} onClick={() => setMonto(String(mitad))}>Abono 50% · {fmt(mitad)}</button>}
            <button type="button" style={chip} onClick={() => setMonto(String(r.saldo))}>Saldo completo · {fmt(r.saldo)}</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8 }}>
            <input type="number" min="1" step="1000" aria-label="Monto del pago" value={monto} onChange={e => setMonto(e.target.value)} style={campo} />
            <select aria-label="Medio de pago" value={medio} onChange={e => setMedio(e.target.value)} style={campo}>
              {MEDIOS_PAGO.map(m => <option key={m}>{m}</option>)}
            </select>
            <input type="date" aria-label="Fecha del pago" value={fecha} onChange={e => setFecha(e.target.value)} style={campo} />
          </div>
          <input aria-label="Nota del pago" placeholder="Nota (opcional): N° de transferencia, quién pagó..." value={nota} onChange={e => setNota(e.target.value)} style={campo} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={registrar} disabled={guardando || !(Number(monto) > 0)} style={{ ...styles.btnPrimary, fontSize: 12, padding: '7px 16px', opacity: guardando || !(Number(monto) > 0) ? .55 : 1 }}>
              {guardando ? 'Guardando...' : 'Guardar pago'}
            </button>
            <button onClick={() => setAbierto(false)} style={{ ...styles.btnSecondary, fontSize: 12, padding: '7px 14px' }}>Cancelar</button>
          </div>
        </div>
      )}
      {error && <div style={{ ...styles.errorBox, marginTop: 8, marginBottom: 0 }}>{error}</div>}
    </div>
  )
}

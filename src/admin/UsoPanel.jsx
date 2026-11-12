// Inicio → "Uso del panel": lo que mas se usa, lo que nunca se toca y cuanto hay que bajar para
// llegar a cada cosa. Es para ir ajustando el panel; el boton "Copiar resumen" deja el texto listo
// para pegarselo a Claude.
import React, { useCallback, useEffect, useState } from 'react'
import { apiFetch, C, SECTIONS, styles } from './utils.js'
import { enviarUso } from './registroUso.js'

const PERIODOS = [[7, '7 días'], [30, '30 días'], [90, '90 días'], [0, 'Todo']]
const nombreSeccion = (id) => (id === 'menu' ? 'Menú' : SECTIONS.find((s) => s.id === id)?.label || id)
const pantallas = (px) => (px < 350 ? 'arriba' : `bajar ≈ ${(px / 700).toLocaleString('es-CL', { maximumFractionDigits: 1 })} pantallas`)
const fechaDesde = (dias) => { const d = new Date(Date.now() - (dias - 1) * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export function textoResumenUso(r) {
  const l = [`Uso del panel (${r.desde || '—'} a ${r.hasta || '—'})`, '', 'Secciones (veces abiertas · cel/pc):']
  for (const s of r.secciones) l.push(`- ${nombreSeccion(s.seccion)}: ${s.veces} (${s.cel}/${s.pc})`)
  l.push('', 'Botones más usados (veces · cel/pc · cuánto hubo que bajar):')
  for (const a of r.acciones.slice(0, 40)) l.push(`- [${nombreSeccion(a.seccion)}] ${a.etiqueta}: ${a.veces} (${a.cel}/${a.pc}) · ${pantallas(a.bajadaPromedio)}`)
  if (r.sinUso.length) {
    l.push('', 'Botones que aparecen pero nunca se tocaron:')
    for (const s of SECTIONS) {
      const de = r.sinUso.filter((x) => x.seccion === s.id).map((x) => x.etiqueta)
      if (de.length) l.push(`- ${s.label}: ${de.join(' · ')}`)
    }
  }
  return l.join('\n')
}

export default function UsoPanel({ onVolver }) {
  const [dias, setDias] = useState(30)
  const [r, setR] = useState(null)
  const [error, setError] = useState('')
  const [copiado, setCopiado] = useState(false)

  const cargar = useCallback(async () => {
    setError('')
    try {
      await enviarUso()
      const res = await apiFetch('/.netlify/functions/uso' + (dias ? `?desde=${fechaDesde(dias)}` : ''))
      if (!res.ok) throw new Error(res.error || 'No se pudo leer el uso')
      setR(res)
    } catch (e) { setError(e.message) }
  }, [dias])
  useEffect(() => { cargar() }, [cargar])

  const copiar = async () => {
    try { await navigator.clipboard.writeText(textoResumenUso(r)); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { setError('No se pudo copiar') }
  }
  const max = Math.max(1, ...(r?.secciones || []).map((s) => s.veces))

  return (
    <div data-uso-ignorar>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onVolver} style={{ ...styles.btnSecondary, padding: '6px 10px' }} aria-label="Volver">‹</button>
          <h2 style={{ ...styles.sectionTitle, margin: 0 }}>Uso del panel</h2>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PERIODOS.map(([d, n]) => (
            <button key={d} onClick={() => setDias(d)} aria-pressed={dias === d}
              style={{ ...styles.btnSecondary, padding: '6px 11px', fontSize: 12.5, ...(dias === d ? { borderColor: C.orange, color: C.orangeDark } : {}) }}>{n}</button>
          ))}
          <button onClick={copiar} disabled={!r} style={{ ...styles.btnPrimary, padding: '7px 13px', fontSize: 12.5 }}>{copiado ? 'Copiado ✓' : 'Copiar resumen'}</button>
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: C.textSub, margin: '0 0 14px' }}>
        Se anota solo, mientras usas el panel. Con unas semanas de uso, copia el resumen y pégaselo a Claude para ajustar el panel a tu medida.
      </p>
      {error && <div style={styles.errorBox}>{error}</div>}
      {!r && !error && <div style={styles.empty}>Cargando…</div>}
      {r && !r.acciones.length && !r.secciones.length && <div style={styles.empty}>Todavía no hay uso anotado en este período.</div>}

      {r && r.secciones.length > 0 && (
        <div style={{ ...styles.card, marginBottom: 14 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 10px' }}>Secciones</h3>
          {r.secciones.map((s) => (
            <div key={s.seccion} style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: 10, alignItems: 'center', fontSize: 13, marginBottom: 6 }}>
              <span>{nombreSeccion(s.seccion)}</span>
              <div style={{ height: 10, background: '#EEF0F3', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ width: `${(s.veces / max) * 100}%`, height: '100%', background: C.orange }} />
              </div>
              <span style={{ color: C.textSub, whiteSpace: 'nowrap' }}>{s.veces} · 📱{s.cel} 💻{s.pc}</span>
            </div>
          ))}
        </div>
      )}

      {r && r.acciones.length > 0 && (
        <div style={{ ...styles.card, marginBottom: 14, padding: 0, overflowX: 'auto' }}>
          <h3 style={{ fontSize: 14, margin: 0, padding: '14px 16px 8px' }}>Lo que más usas</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ textAlign: 'left', color: C.textMuted, fontSize: 11 }}>
              <th style={{ padding: '6px 16px' }}>Sección</th><th>Botón</th><th style={{ textAlign: 'right' }}>Veces</th><th style={{ padding: '0 10px' }}>📱/💻</th><th style={{ paddingRight: 16 }}>Dónde estaba</th>
            </tr></thead>
            <tbody>
              {r.acciones.slice(0, 60).map((a) => (
                <tr key={a.seccion + a.etiqueta} style={{ borderTop: '1px solid ' + C.border }}>
                  <td style={{ padding: '6px 16px', color: C.textSub, whiteSpace: 'nowrap' }}>{nombreSeccion(a.seccion)}</td>
                  <td>{a.etiqueta}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{a.veces}</td>
                  <td style={{ padding: '0 10px', whiteSpace: 'nowrap', color: C.textSub }}>{a.cel}/{a.pc}</td>
                  <td style={{ paddingRight: 16, whiteSpace: 'nowrap', color: a.bajadaPromedio >= 1400 ? C.red : C.textSub }}>{pantallas(a.bajadaPromedio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {r && r.sinUso.length > 0 && (
        <div style={styles.card}>
          <h3 style={{ fontSize: 14, margin: '0 0 4px' }}>Aparecen pero nunca los tocas</h3>
          <p style={{ fontSize: 12, color: C.textSub, margin: '0 0 10px' }}>Candidatos a esconder o mover más abajo.</p>
          {SECTIONS.map((s) => {
            const de = r.sinUso.filter((x) => x.seccion === s.id)
            return de.length ? (
              <div key={s.id} style={{ fontSize: 12.5, marginBottom: 8 }}>
                <strong>{s.label}:</strong> <span style={{ color: C.textSub }}>{de.map((x) => x.etiqueta).join(' · ')}</span>
              </div>
            ) : null
          })}
        </div>
      )}
    </div>
  )
}

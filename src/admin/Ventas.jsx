import React, { useEffect, useState, useCallback } from 'react'
import { C, apiFetch, fmt, styles } from './utils.js'

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ ...styles.card, flex: 1, minWidth: 140 }}>
      <div style={styles.cardLabel}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || C.text }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export default function VentasSection() {
  const [installs, setInstalls] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear())

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await apiFetch('/.netlify/functions/get-sales')
      if (data.ok) setInstalls(data.installations)
      else setError(data.error || 'Error')
    } catch { setError('No se pudo conectar') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  // Filtrar por año
  const ofYear = installs.filter(i => {
    if (!i.fecha) return false
    const y = parseInt(i.fecha.split('-')[0])
    return y === yearFilter
  })

  // Totales generales
  const totalRepisas = ofYear.reduce((s, i) => s + (i.repisas || 0), 0)
  const totalAd      = ofYear.reduce((s, i) => s + (i.adicionales || 0), 0)
  const totalGeneral = ofYear.reduce((s, i) => s + (i.total || 0), 0)

  // Por mes
  const byMonth = Array.from({ length: 12 }, (_, m) => {
    const mes = ofYear.filter(i => {
      if (!i.fecha) return false
      return parseInt(i.fecha.split('-')[1]) - 1 === m
    })
    return {
      mes: MESES[m],
      repisas: mes.reduce((s, i) => s + (i.repisas || 0), 0),
      adicionales: mes.reduce((s, i) => s + (i.adicionales || 0), 0),
      total: mes.reduce((s, i) => s + (i.total || 0), 0),
      count: mes.length,
    }
  })

  const maxTotal = Math.max(...byMonth.map(m => m.total), 1)
  const years = [...new Set(installs.map(i => i.fecha?.split('-')[0]).filter(Boolean).map(Number))].sort((a, b) => b - a)
  if (!years.includes(yearFilter)) years.unshift(yearFilter)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={styles.sectionTitle}>Ventas</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={yearFilter} onChange={e => setYearFilter(Number(e.target.value))}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid ' + C.border, fontSize: 13, background: '#FAFAFA', fontFamily: 'inherit', outline: 'none' }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={load} style={styles.btnSecondary}>Actualizar</button>
        </div>
      </div>

      {loading && <div style={styles.empty}>Cargando...</div>}
      {error   && <div style={styles.errorBox}>{error}</div>}

      {!loading && !error && (
        <>
          {/* Resumen anual */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <StatCard label={`Total ${yearFilter}`} value={fmt(totalGeneral)} color={C.orangeDark} sub={`${ofYear.length} instalaciones`} />
            <StatCard label="Repisas" value={fmt(totalRepisas)} color={C.text}
              sub={totalGeneral > 0 ? Math.round(totalRepisas / totalGeneral * 100) + '% del total' : '-'} />
            <StatCard label="Adicionales" value={fmt(totalAd)} color={C.green}
              sub={totalGeneral > 0 ? Math.round(totalAd / totalGeneral * 100) + '% del total' : '-'} />
          </div>

          {/* Grafico de barras por mes */}
          <div style={{ ...styles.card, marginBottom: 24 }}>
            <div style={styles.cardLabel}>Ingresos por mes — {yearFilter}</div>
            {ofYear.length === 0
              ? <div style={{ textAlign: 'center', color: C.textMuted, padding: '32px 0', fontSize: 14 }}>No hay instalaciones registradas para {yearFilter}</div>
              : (
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 160, paddingTop: 8 }}>
                  {byMonth.map(m => {
                    const h = m.total > 0 ? Math.max(16, (m.total / maxTotal) * 130) : 4
                    const hr = m.repisas > 0 ? (m.repisas / maxTotal) * 130 : 0
                    return (
                      <div key={m.mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: m.total > 0 ? C.orangeDark : C.textMuted, textAlign: 'center', whiteSpace: 'nowrap', minHeight: 14 }}>
                          {m.total > 0 ? (m.total >= 1000000 ? (m.total/1000000).toFixed(1)+'M' : (m.total/1000).toFixed(0)+'K') : ''}
                        </div>
                        <div style={{ width: '100%', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: 130 }}>
                          {/* Barra total */}
                          <div style={{ width: '100%', height: h, background: C.orange + '30', borderRadius: '4px 4px 0 0', position: 'relative', overflow: 'hidden' }}>
                            {/* Barra repisas encima */}
                            {hr > 0 && <div style={{ position: 'absolute', bottom: 0, width: '100%', height: hr, background: C.orange, borderRadius: '4px 4px 0 0' }}/>}
                          </div>
                        </div>
                        <div style={{ fontSize: 9, color: C.textMuted, fontWeight: 600 }}>{m.mes}</div>
                        {m.count > 0 && <div style={{ fontSize: 8, color: C.textMuted }}>{m.count}</div>}
                      </div>
                    )
                  })}
                </div>
              )
            }
            <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: 11, color: C.textSub }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, background: C.orange, borderRadius: 2, display: 'inline-block' }}/> Repisas</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, background: C.orange + '30', borderRadius: 2, display: 'inline-block' }}/> Adicionales</span>
            </div>
          </div>

          {/* Tabla por mes */}
          <div style={styles.card}>
            <div style={styles.cardLabel}>Detalle mensual</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid ' + C.border }}>
                    {['Mes', 'Instalaciones', 'Repisas', 'Adicionales', 'Total'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Mes' || h === 'Instalaciones' ? 'left' : 'right', color: C.textMuted, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: .5, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byMonth.filter(m => m.count > 0).map(m => (
                    <tr key={m.mes} style={{ borderBottom: '1px solid ' + C.border }}>
                      <td style={{ padding: '9px 10px', fontWeight: 600, color: C.text }}>{m.mes}</td>
                      <td style={{ padding: '9px 10px', color: C.textSub }}>{m.count}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: C.text }}>{fmt(m.repisas)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: C.green }}>{fmt(m.adicionales)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: C.orangeDark }}>{fmt(m.total)}</td>
                    </tr>
                  ))}
                  {byMonth.some(m => m.count > 0) && (
                    <tr style={{ background: C.orangeLight }}>
                      <td style={{ padding: '9px 10px', fontWeight: 800 }}>Total {yearFilter}</td>
                      <td style={{ padding: '9px 10px', fontWeight: 700 }}>{ofYear.length}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700 }}>{fmt(totalRepisas)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: C.green }}>{fmt(totalAd)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 800, color: C.orangeDark }}>{fmt(totalGeneral)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {byMonth.every(m => m.count === 0) && (
                <div style={{ textAlign: 'center', color: C.textMuted, padding: '32px 0', fontSize: 14 }}>No hay datos para {yearFilter}</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

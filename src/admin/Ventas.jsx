import React, { useEffect, useState, useCallback } from 'react'
import { C, apiFetch, fmt, fmtDate, styles } from './utils.js'

const AD_KEYS = [
  { key: 'retiro_orden',  label: 'Retiro de orden' },
  { key: 'retiro_basura', label: 'Retiro de basura' },
  { key: 'cajas',         label: 'Cajas' },
  { key: 'bici',          label: 'Bici' },
]

const PAGO_COLORS = { Pendiente: C.red, Parcial: C.yellow, Pagado: C.green }

function PagoBadge({ pago }) {
  const color = PAGO_COLORS[pago] || C.red
  return (
    <span style={{ padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700, background:color+'18', color, border:'1px solid '+color+'30' }}>
      {pago || 'Pendiente'}
    </span>
  )
}

function calcTotal(v) {
  return (v.subtotalRepisas || 0) + (v.subtotalAdicionales || 0) + (Number(v.ajusteMonto) || 0)
}

function VentaRow({ venta, onSaved }) {
  const [open, setOpen]           = useState(false)
  const [editing, setEditing]     = useState(false)
  const [repisas, setRepisas]     = useState(venta.subtotalRepisas || 0)
  const [ad, setAd]               = useState(venta.adicionales || {})
  const [ajusteMonto, setAjuste]  = useState(venta.ajusteMonto || 0)
  const [ajusteNota, setAjusteNota] = useState(venta.ajusteNota || '')
  const [pago, setPago]           = useState(venta.pago || 'Pendiente')
  const [saving, setSaving]       = useState(false)

  const subtotalAd = AD_KEYS.reduce((s, {key}) => s + (Number(ad['qty_'+key]||0) * Number(ad['precio_'+key]||0)), 0)
  const total = Number(repisas) + subtotalAd + Number(ajusteMonto)

  async function handleSave() {
    setSaving(true)
    try {
      await apiFetch('/.netlify/functions/update-sale', {
        method: 'POST',
        body: JSON.stringify({
          cotNum: venta.cotNum,
          subtotalRepisas: Number(repisas),
          adicionales: ad,
          ajusteMonto: Number(ajusteMonto),
          ajusteNota,
          pago,
        }),
      })
      setEditing(false)
      onSaved()
    } catch (e) { alert('Error al guardar: ' + e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ ...styles.card, marginBottom:10, borderLeft:'3px solid '+(PAGO_COLORS[pago]||C.red) }}>
      {/* Cabecera */}
      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <div style={{ flex:1, cursor:'pointer' }} onClick={() => !editing && setOpen(o => !o)}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:3 }}>
            <span style={{ fontSize:12, fontWeight:700, color:C.textMuted }}>N°{venta.cotNum}</span>
            <span style={{ fontWeight:700, fontSize:15, color:C.text }}>{venta.nombre}</span>
            <PagoBadge pago={pago} />
          </div>
          <div style={{ fontSize:13, color:C.textSub }}>
            {venta.fechaInstalacion ? fmtDate(venta.fechaInstalacion) + ' · ' : ''}
            <span style={{ fontWeight:700, color:C.orangeDark }}>{fmt(total)}</span>
            {venta.direccion && <span style={{ marginLeft:10, color:C.textMuted }}>{venta.direccion}</span>}
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {!editing && (
            <button onClick={() => { setOpen(true); setEditing(true) }}
              style={{ ...styles.btnSecondary, fontSize:12, padding:'5px 12px' }}>
              Editar
            </button>
          )}
          {!editing && (
            <button onClick={() => setOpen(o => !o)}
              style={{ background:'none', border:'none', cursor:'pointer', color:C.textMuted, padding:'4px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transition:'transform .2s', transform:open?'rotate(180deg)':'none' }}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Desglose expandido */}
      {open && (
        <div style={{ marginTop:16, paddingTop:16, borderTop:'1px solid '+C.border }}>
          {/* Repisas */}
          <div style={{ marginBottom:14 }}>
            <div style={styles.cardLabel}>Repisas</div>
            {editing ? (
              <input type="number" value={repisas} onChange={e => setRepisas(e.target.value)}
                style={{ ...styles.input, fontSize:13, padding:'7px 10px', maxWidth:200 }} />
            ) : (
              <span style={{ fontSize:14, fontWeight:700, color:C.text }}>{fmt(repisas)}</span>
            )}
          </div>

          {/* Adicionales */}
          <div style={{ marginBottom:14 }}>
            <div style={styles.cardLabel}>Adicionales</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:'6px 16px', alignItems:'center', fontSize:13 }}>
              {AD_KEYS.map(({key, label}) => {
                const qty   = Number(ad['qty_'+key] || 0)
                const precio = Number(ad['precio_'+key] || 0)
                if (!editing && qty === 0) return null
                return (
                  <React.Fragment key={key}>
                    <span style={{ color:C.textSub }}>{label}</span>
                    {editing ? (
                      <>
                        <input type="number" value={ad['qty_'+key]||0}
                          style={{ ...styles.input, padding:'5px 6px', fontSize:12, textAlign:'center', width:64 }}
                          onChange={e => setAd(p => ({...p, ['qty_'+key]: parseInt(e.target.value)||0}))} />
                        <input type="number" value={ad['precio_'+key]||0} step={1000}
                          style={{ ...styles.input, padding:'5px 6px', fontSize:12, textAlign:'right', width:110 }}
                          onChange={e => setAd(p => ({...p, ['precio_'+key]: parseInt(e.target.value)||0}))} />
                      </>
                    ) : (
                      <>
                        <span style={{ color:C.textMuted, textAlign:'center' }}>{qty}x</span>
                        <span style={{ fontWeight:600 }}>{fmt(precio)}</span>
                      </>
                    )}
                  </React.Fragment>
                )
              })}
              {!editing && subtotalAd > 0 && (
                <>
                  <span style={{ color:C.textMuted, fontWeight:700, paddingTop:4 }}>Subtotal adicionales</span>
                  <span/>
                  <span style={{ fontWeight:700, paddingTop:4 }}>{fmt(subtotalAd)}</span>
                </>
              )}
            </div>
          </div>

          {/* Ajuste */}
          <div style={{ marginBottom:14 }}>
            <div style={styles.cardLabel}>Ajuste post-instalación</div>
            {editing ? (
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                <input type="number" value={ajusteMonto} onChange={e => setAjuste(e.target.value)}
                  placeholder="Monto (+ o -)"
                  style={{ ...styles.input, fontSize:13, padding:'7px 10px', maxWidth:160 }} />
                <input type="text" value={ajusteNota} onChange={e => setAjusteNota(e.target.value)}
                  placeholder="Nota (ej: repisa extra)"
                  style={{ ...styles.input, fontSize:13, padding:'7px 10px', flex:1, minWidth:180 }} />
              </div>
            ) : (
              Number(ajusteMonto) !== 0 ? (
                <div style={{ fontSize:13 }}>
                  <span style={{ fontWeight:700, color: Number(ajusteMonto) >= 0 ? C.green : C.red }}>
                    {Number(ajusteMonto) >= 0 ? '+' : ''}{fmt(ajusteMonto)}
                  </span>
                  {ajusteNota && <span style={{ marginLeft:10, color:C.textMuted }}>{ajusteNota}</span>}
                </div>
              ) : <span style={{ fontSize:13, color:C.textMuted }}>Sin ajuste</span>
            )}
          </div>

          {/* Total */}
          <div style={{ padding:'12px 16px', background:C.orangeLight, borderRadius:10, marginBottom:14, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontWeight:700, fontSize:13, color:C.orangeDark }}>Total</span>
            <span style={{ fontWeight:800, fontSize:18, color:C.orangeDark }}>{fmt(total)}</span>
          </div>

          {/* Pago */}
          <div style={{ marginBottom: editing ? 16 : 0 }}>
            <div style={styles.cardLabel}>Estado de pago</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {['Pendiente','Parcial','Pagado'].map(op => {
                const color = PAGO_COLORS[op]
                const active = pago === op
                return (
                  <button key={op} onClick={() => setPago(op)}
                    style={{
                      padding:'7px 16px', borderRadius:8, fontSize:12, fontWeight:700,
                      cursor: active ? 'default' : 'pointer',
                      border:'2px solid '+(active ? color : C.border),
                      background: active ? color+'18' : C.surface,
                      color: active ? color : C.textSub,
                      transition:'all .15s',
                    }}>
                    {op}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Botones guardar/cancelar */}
          {editing && (
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button onClick={handleSave} disabled={saving}
                style={{ ...styles.btnPrimary, fontSize:13, padding:'9px 20px' }}>
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button onClick={() => {
                setEditing(false)
                setRepisas(venta.subtotalRepisas || 0)
                setAd(venta.adicionales || {})
                setAjuste(venta.ajusteMonto || 0)
                setAjusteNota(venta.ajusteNota || '')
                setPago(venta.pago || 'Pendiente')
              }} style={styles.btnSecondary}>Cancelar</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function VentasSection() {
  const [ventas, setVentas]   = useState([])
  const [loading, setLoading] = useState(true)
  const [year, setYear]       = useState(new Date().getFullYear())
  const [filterPago, setFilterPago] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [instData, cotData] = await Promise.all([
        apiFetch('/.netlify/functions/get-installations'),
        apiFetch('/.netlify/functions/get-quotes'),
      ])

      if (!instData.ok || !cotData.ok) return

      // Cruzar instalaciones activas con cotizaciones confirmadas
      const cotMap = {}
      ;(cotData.quotes || []).filter(q => q.status === 'confirmada').forEach(q => {
        cotMap[String(q.cotNum)] = q
      })

      const result = (instData.installations || [])
        .filter(i => i.estado !== 'Cancelada' && i.cotNum && cotMap[String(i.cotNum)])
        .map(i => {
          const cot = cotMap[String(i.cotNum)]
          return {
            ...i,
            nombre:           cot.nombre,
            direccion:        cot.direccion || '',
            email:            cot.email || i.email,
            fechaInstalacion: i.start,
            // Si Sheets ya tiene subtotalRepisas guardado, usarlo; si no, calcularlo desde cotización
            subtotalRepisas: i.subtotalRepisas || (() => {
              const reps = cot.repisas || []
              return reps.reduce((s, r) => s + (r.unidades||r.u||0)*(r.valor||r.v||0), 0)
            })(),
            adicionales: Object.keys(i.adicionales || {}).length > 0
              ? i.adicionales
              : cot.adicionales || {},
          }
        })
        .sort((a, b) => new Date(b.fechaInstalacion) - new Date(a.fechaInstalacion))

      setVentas(result)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const years = [...new Set(ventas.map(v => new Date(v.fechaInstalacion||v.start||'').getFullYear()).filter(Boolean))].sort((a,b)=>b-a)
  if (years.length > 0 && !years.includes(year)) setYear(years[0])

  const byYear = ventas.filter(v => new Date(v.fechaInstalacion||v.start||'').getFullYear() === year)
  const filtered = filterPago === 'all' ? byYear : byYear.filter(v => (v.pago||'Pendiente') === filterPago)

  const totalAnio     = byYear.reduce((s, v) => s + calcTotal(v), 0)
  const totalCobrado  = byYear.filter(v => v.pago === 'Pagado').reduce((s, v) => s + calcTotal(v), 0)
  const totalPendiente = byYear.filter(v => !v.pago || v.pago !== 'Pagado').reduce((s, v) => s + calcTotal(v), 0)

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <h2 style={styles.sectionTitle}>Ventas</h2>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            style={{ ...styles.input, width:'auto', padding:'7px 12px', fontSize:13 }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
            {!years.includes(year) && <option value={year}>{year}</option>}
          </select>
          <button onClick={load} style={styles.btnSecondary}>Actualizar</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <div style={{ ...styles.card, flex:1, minWidth:140 }}>
          <div style={styles.cardLabel}>Total {year}</div>
          <div style={{ fontSize:26, fontWeight:800, color:C.orange }}>{fmt(totalAnio)}</div>
          <div style={{ fontSize:12, color:C.textMuted, marginTop:4 }}>{byYear.length} instalaciones</div>
        </div>
        <div style={{ ...styles.card, flex:1, minWidth:140 }}>
          <div style={styles.cardLabel}>Cobrado</div>
          <div style={{ fontSize:26, fontWeight:800, color:C.green }}>{fmt(totalCobrado)}</div>
          <div style={{ fontSize:12, color:C.textMuted, marginTop:4 }}>{byYear.filter(v=>v.pago==='Pagado').length} pagadas</div>
        </div>
        <div style={{ ...styles.card, flex:1, minWidth:140 }}>
          <div style={styles.cardLabel}>Por cobrar</div>
          <div style={{ fontSize:26, fontWeight:800, color:C.red }}>{fmt(totalPendiente)}</div>
          <div style={{ fontSize:12, color:C.textMuted, marginTop:4 }}>{byYear.filter(v=>v.pago!=='Pagado').length} pendientes</div>
        </div>
      </div>

      {/* Filtro pago */}
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {[['all','Todas'],['Pendiente','Pendiente'],['Parcial','Parcial'],['Pagado','Pagado']].map(([k,l]) => (
          <button key={k} onClick={() => setFilterPago(k)}
            style={{ ...styles.tab, ...(filterPago===k ? styles.tabActive : {}), fontSize:12 }}>
            {l}
          </button>
        ))}
      </div>

      {loading && <div style={styles.empty}>Cargando ventas...</div>}
      {!loading && filtered.length === 0 && <div style={styles.empty}>No hay ventas en este período.</div>}

      {!loading && filtered.map(v => (
        <VentaRow key={v.id || v.cotNum} venta={v} onSaved={load} />
      ))}
    </div>
  )
}

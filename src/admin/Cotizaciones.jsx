import React, { useEffect, useState, useCallback } from 'react'
import { ADMIN_PASSWORD, CONVERTAPI_SECRET, QUOTE_STATUS_LABELS, C, apiFetch, fmt, fmtDate, styles, DEFAULTS_REPISA } from './utils.js'

const MOTIVOS_RECHAZO = ['Precio alto', 'Sin respuesta', 'Eligio otro proveedor', 'Otro']

function Badge({ status }) {
  const s = QUOTE_STATUS_LABELS[status] || QUOTE_STATUS_LABELS['por confirmar']
  return <span style={styles.badge(s.color)}>{s.label}</span>
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ ...styles.card, flex: 1, minWidth: 120 }}>
      <div style={styles.cardLabel}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || C.text }}>{value}</div>
    </div>
  )
}

export default function CotizacionesSection() {
  const [quotes, setQuotes]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [filter, setFilter]         = useState('all')
  const [updating, setUpdating]     = useState(null)
  const [expanded, setExpanded]     = useState(null)
  const [rechazandoId, setRechazandoId] = useState(null)
  const [motivoSelec, setMotivoSelec]   = useState('')
  const [editingId, setEditingId]   = useState(null)
  const [editRepisas, setEditRepisas]   = useState([])
  const [editAd, setEditAd]         = useState({})
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [scheduledCotNums, setScheduledCotNums] = useState(new Set())

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [quotesData, instData] = await Promise.all([
        apiFetch('/.netlify/functions/get-quotes'),
        apiFetch('/.netlify/functions/get-installations').catch(() => ({ ok: false })),
      ])
      if (quotesData.ok) setQuotes(quotesData.quotes)
      else setError(quotesData.error || 'Error')
      if (instData.ok) {
        const nums = new Set(
          (instData.installations || [])
            .filter(i => i.cotNum)
            .map(i => String(i.cotNum))
        )
        setScheduledCotNums(nums)
      }
    } catch { setError('No se pudo conectar') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function updateStatus(quote, newStatus, motivo = '') {
    setUpdating(quote.cotNum)
    try {
      await apiFetch('/.netlify/functions/save-quote', {
        method: 'POST',
        body: JSON.stringify({ ...quote, status: newStatus, motivoRechazo: motivo }),
      })
      setQuotes(prev => prev.map(q => q.cotNum === quote.cotNum ? { ...q, status: newStatus, motivoRechazo: motivo } : q))
    } catch { alert('Error al actualizar') }
    finally { setUpdating(null) }
  }

  async function handleDelete(cotNum) {
    setDeleting(cotNum)
    try {
      await apiFetch('/.netlify/functions/delete-quote', { method: 'POST', body: JSON.stringify({ cotNum }) })
      setQuotes(prev => prev.filter(q => q.cotNum !== cotNum))
      setConfirmDel(null); setExpanded(null)
    } catch { alert('Error al borrar') }
    finally { setDeleting(null) }
  }

  function startEditing(quote) {
    setEditingId(quote.cotNum)
    setEditRepisas(quote.repisas?.length ? quote.repisas.map((r, i) => ({ ...r, id: i })) : [{ ...DEFAULTS_REPISA, id: 0 }])
    setEditAd(quote.adicionales || {})
  }

  async function saveEdit(quote) {
    setSaving(true)
    try {
      await apiFetch('/.netlify/functions/save-quote', {
        method: 'POST',
        body: JSON.stringify({ ...quote, repisas: editRepisas, adicionales: editAd }),
      })

      const subtotal = editRepisas.reduce((s, r) => s + (r.unidades||r.u||0)*(r.valor||r.v||0), 0) +
        ['retiro_orden','retiro_basura','cajas','bici'].reduce((s, k) => s + (editAd['qty_'+k]||0)*(editAd['precio_'+k]||0), 0)
      const iva = Math.round(subtotal * 0.19)

      const payload = {
        cot_num: quote.cotNum,
        nombre:    (quote.nombre || '').toUpperCase(),
        direccion: (quote.direccion || '').toUpperCase(),
        rut: '', telefono: quote.telefono || '',
        email: (quote.email || '').toUpperCase(),
        repisas: editRepisas.map(r => ({ largo:r.largo||r.l, prof:r.prof||r.p, alto:r.alto||r.a, niveles:r.niveles||r.n, unidades:r.unidades||r.u, valor:r.valor||r.v })),
        ...editAd,
      }
      const res = await fetch('/.netlify/functions/generate-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': ADMIN_PASSWORD },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const xlsxBlob = await res.blob()
        const formData = new FormData()
        formData.append('File', xlsxBlob, 'cotizacion.xlsx')
        const cvt  = await fetch('https://v2.convertapi.com/convert/xlsx/to/pdf?Secret=' + CONVERTAPI_SECRET, { method: 'POST', body: formData })
        const cvtData = await cvt.json()
        if (cvtData.Files?.[0]) {
          const fi = cvtData.Files[0]
          let blob
          if (fi.FileData) {
            const bin = atob(fi.FileData); const bytes = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
            blob = new Blob([bytes], { type: 'application/pdf' })
          } else { blob = await fetch(fi.Url).then(r => r.blob()) }
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = 'Cotizacion ' + quote.nombre + ' - Repisas Don Maxi.pdf'; a.click()
        }
      }

      setQuotes(prev => prev.map(q => q.cotNum === quote.cotNum
        ? { ...q, repisas: editRepisas, adicionales: editAd }
        : q
      ))
      setEditingId(null)
    } catch (e) { alert('Error al guardar: ' + e.message) }
    finally { setSaving(false) }
  }

  const FILTERS = [
    { key: 'all', label: 'Todas' },
    { key: 'por confirmar', label: 'Por confirmar' },
    { key: 'confirmada', label: 'Confirmadas' },
    { key: 'rechazada', label: 'Rechazadas' },
  ]

  const counts = {
    'por confirmar': quotes.filter(q => q.status === 'por confirmar').length,
    'confirmada': quotes.filter(q => q.status === 'confirmada').length,
    'rechazada': quotes.filter(q => q.status === 'rechazada').length,
  }
  const filtered = filter === 'all' ? quotes : quotes.filter(q => q.status === filter)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={styles.sectionTitle}>Historial de Cotizaciones</h2>
        <button onClick={load} style={styles.btnSecondary}>Actualizar</button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard label="Por confirmar" value={counts['por confirmar']} color={C.yellow} />
        <StatCard label="Confirmadas"   value={counts['confirmada']}   color={C.green} />
        <StatCard label="Rechazadas"    value={counts['rechazada']}    color={C.red} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{ ...styles.tab, ...(filter === f.key ? styles.tabActive : {}) }}>
            {f.label}
            {f.key !== 'all' && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, opacity: .85 }}>({counts[f.key] || 0})</span>}
          </button>
        ))}
      </div>

      {loading && <div style={styles.empty}>Cargando...</div>}
      {error   && <div style={styles.errorBox}>{error}</div>}
      {!loading && !error && filtered.length === 0 && <div style={styles.empty}>No hay cotizaciones en esta categoria.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(q => {
          const isExp  = expanded === q.cotNum
          const isUpd  = updating === q.cotNum
          const isEdit = editingId === q.cotNum
          const color  = QUOTE_STATUS_LABELS[q.status]?.color || C.border
          return (
            <div key={q.cotNum} style={{ ...styles.card, borderLeft: '3px solid ' + color }}>
              <div onClick={() => !isEdit && setExpanded(isExp ? null : q.cotNum)}
                style={{ cursor: isEdit ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted }}>#{q.cotNum}</span>
                    <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{q.nombre}</span>
                    <Badge status={q.status} />
                    {scheduledCotNums.has(String(q.cotNum)) && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: C.orange + '18', color: C.orangeDark, border: '1px solid ' + C.orange + '40' }}>
                        Agendada
                      </span>
                    )}
                    {q.motivoRechazo && <span style={{ fontSize: 11, color: C.red, background: C.red + '10', padding: '2px 8px', borderRadius: 99 }}>{q.motivoRechazo}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: C.textSub }}>
                    {q.fechaVisita && <span>{fmtDate(q.fechaVisita)} &middot; </span>}
                    <span style={{ fontWeight: 700, color: C.orangeDark }}>{fmt(q.total)}</span>
                    {q.direccion && <span style={{ marginLeft: 12, color: C.textMuted }}>{q.direccion}</span>}
                  </div>
                </div>
                {!isEdit && (
                  <div style={{ color: C.textMuted, transition: 'transform .2s', transform: isExp ? 'rotate(180deg)' : 'none' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                )}
              </div>

              {isEdit && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid ' + C.border }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', marginBottom: 10, letterSpacing: 1 }}>Editar repisas</div>
                  {editRepisas.map((r, i) => (
                    <div key={r.id} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      {[
                        ['Largo','largo','l'], ['Prof','prof','p'], ['Alto','alto','a'],
                        ['Niveles','niveles','n'], ['Unid','unidades','u'], ['Valor','valor','v'],
                      ].map(([lbl, field, fb]) => (
                        <div key={field} style={{ flex: 1, minWidth: 60 }}>
                          <div style={{ fontSize: 9, color: C.textMuted, fontWeight: 700, marginBottom: 3 }}>{lbl}</div>
                          <input type="number" value={r[field] ?? r[fb] ?? ''} style={{ ...styles.input, padding: '5px 6px', fontSize: 12 }}
                            onChange={e => setEditRepisas(prev => prev.map((x, j) => j === i ? { ...x, [field]: parseFloat(e.target.value)||0 } : x))} />
                        </div>
                      ))}
                    </div>
                  ))}
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', marginBottom: 8, marginTop: 12, letterSpacing: 1 }}>Adicionales</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 80px 120px', gap: '6px 12px', alignItems: 'center', fontSize: 13 }}>
                    {['retiro_orden','retiro_basura','cajas','bici'].map(k => (
                      <React.Fragment key={k}>
                        <span style={{ color: C.textSub }}>{k.replace(/_/g,' ')}</span>
                        <input type="number" value={editAd['qty_'+k]||0} style={{ ...styles.input, padding: '5px', fontSize: 12, textAlign:'center' }}
                          onChange={e => setEditAd(prev => ({ ...prev, ['qty_'+k]: parseInt(e.target.value)||0 }))} />
                        <input type="number" value={editAd['precio_'+k]||0} step={1000} style={{ ...styles.input, padding: '5px', fontSize: 12, textAlign:'center' }}
                          onChange={e => setEditAd(prev => ({ ...prev, ['precio_'+k]: parseInt(e.target.value)||0 }))} />
                      </React.Fragment>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button onClick={() => saveEdit(q)} disabled={saving} style={{ ...styles.btnPrimary, fontSize: 13 }}>
                      {saving ? 'Guardando...' : 'Guardar y regenerar PDF'}
                    </button>
                    <button onClick={() => setEditingId(null)} style={styles.btnSecondary}>Cancelar</button>
                  </div>
                </div>
              )}

              {isExp && !isEdit && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid ' + C.border }}>
                  <div style={{ ...styles.detailGrid, marginBottom: 14 }}>
                    {q.email    && <><span style={styles.detailLabel}>Email</span><span style={{ fontSize: 13 }}>{q.email}</span></>}
                    {q.telefono && <><span style={styles.detailLabel}>Tel</span><span style={{ fontSize: 13 }}>{q.telefono}</span></>}
                    {q.notas    && <><span style={styles.detailLabel}>Notas</span><span style={{ fontSize: 13 }}>{q.notas}</span></>}
                    {q.subtotal && <><span style={styles.detailLabel}>Subtotal</span><span style={{ fontSize: 13 }}>{fmt(q.subtotal)}</span></>}
                    {q.iva      && <><span style={styles.detailLabel}>IVA</span><span style={{ fontSize: 13 }}>{fmt(q.iva)}</span></>}
                    {q.total    && <><span style={styles.detailLabel}>Total</span><span style={{ fontSize: 13, fontWeight: 700, color: C.orangeDark }}>{fmt(q.total)}</span></>}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5 }}>Estado</span>
                    {Object.entries(QUOTE_STATUS_LABELS).map(([key, val]) => (
                      <button key={key} onClick={() => {
                        if (key === 'rechazada') { setRechazandoId(q.cotNum); setMotivoSelec('') }
                        else updateStatus(q, key)
                      }}
                        disabled={isUpd || q.status === key}
                        style={{
                          padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                          cursor: q.status === key ? 'default' : 'pointer',
                          border: '1.5px solid ' + (q.status === key ? val.color : C.border),
                          background: q.status === key ? val.color + '18' : C.surface,
                          color: q.status === key ? val.color : C.textSub, opacity: isUpd ? .5 : 1,
                        }}>{val.label}</button>
                    ))}
                    <button onClick={() => startEditing(q)} style={{ ...styles.btnSecondary, fontSize: 12, padding: '6px 14px', marginLeft: 4 }}>
                      Editar
                    </button>
                  </div>

                  {rechazandoId === q.cotNum && (
                    <div style={{ background: C.red + '0A', border: '1px solid ' + C.red + '30', borderRadius: 10, padding: 14, marginTop: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 10 }}>Motivo del rechazo</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                        {MOTIVOS_RECHAZO.map(m => (
                          <button key={m} onClick={() => setMotivoSelec(m)} style={{
                            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            border: '1.5px solid ' + (motivoSelec === m ? C.red : C.border),
                            background: motivoSelec === m ? C.red + '18' : C.surface,
                            color: motivoSelec === m ? C.red : C.textSub,
                          }}>{m}</button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => { updateStatus(q, 'rechazada', motivoSelec); setRechazandoId(null) }}
                          disabled={!motivoSelec}
                          style={{ ...styles.btnPrimary, fontSize: 12, padding: '7px 16px', background: C.red, boxShadow: 'none', opacity: motivoSelec ? 1 : .5 }}>
                          Confirmar rechazo
                        </button>
                        <button onClick={() => setRechazandoId(null)} style={styles.btnSecondary}>Cancelar</button>
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid ' + C.border }}>
                    {confirmDel === q.cotNum
                      ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, color: C.red, fontWeight: 600 }}>Confirmar eliminacion?</span>
                          <button onClick={() => handleDelete(q.cotNum)} disabled={deleting === q.cotNum}
                            style={{ ...styles.btnPrimary, background: C.red, boxShadow: 'none', fontSize: 12, padding: '6px 14px' }}>
                            {deleting === q.cotNum ? 'Borrando...' : 'Si, borrar'}
                          </button>
                          <button onClick={() => setConfirmDel(null)} style={{ ...styles.btnSecondary, fontSize: 12, padding: '6px 14px' }}>Cancelar</button>
                        </div>
                      )
                      : (
                        <button onClick={() => setConfirmDel(q.cotNum)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontSize: 12, fontWeight: 600, padding: 0 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                          Eliminar cotizacion
                        </button>
                      )
                    }
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

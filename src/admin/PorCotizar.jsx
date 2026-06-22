import React, { useEffect, useState } from 'react'
import { ADMIN_PASSWORD, CONVERTAPI_SECRET, DEFAULTS_REPISA, apiFetch, fmtDate, fmt, styles } from './utils.js'

export default function PorCotizarSection({ statuses, visitaSeleccionada, allVisits }) {
  const realizadas = allVisits.filter(v => statuses[v.id] === 'realizada')

  const [selectedVisit, setSelectedVisit] = useState(visitaSeleccionada || null)
  const [cotNum, setCotNum]               = useState(() => parseInt(localStorage.getItem('dm_cot_num') || '1421'))
  const [repisas, setRepisas]             = useState([{ ...DEFAULTS_REPISA, id: Date.now() }])
  const [adicionales, setAdicionales]     = useState({
    qty_retiro_orden: 0, precio_retiro_orden: 40000,
    qty_retiro_basura: 0, precio_retiro_basura: 30000,
    qty_cajas: 0, precio_cajas: 15000,
    qty_bici: 0, precio_bici: 20000,
  })
  const [generating, setGenerating] = useState(false)
  const [pdfUrl, setPdfUrl]         = useState(null)
  const [pdfBlob, setPdfBlob]       = useState(null)
  const [totalInfo, setTotalInfo]   = useState({ subtotal: 0, iva: 0, total: 0 })
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => { if (visitaSeleccionada) setSelectedVisit(visitaSeleccionada) }, [visitaSeleccionada])

  function calcTotales() {
    const totRep = repisas.reduce((s, r) => s + (r.u || 0) * (r.v || 0), 0)
    const totAd  = ['retiro_orden', 'retiro_basura', 'cajas', 'bici']
      .reduce((s, k) => s + (adicionales[`qty_${k}`] || 0) * (adicionales[`precio_${k}`] || 0), 0)
    const subtotal = totRep + totAd
    const iva      = Math.round(subtotal * 0.19)
    return { subtotal, iva, total: subtotal + iva }
  }

  const totales = calcTotales()

  function addRepisa() {
    if (repisas.length >= 4) return alert('Máximo 4 repisas')
    setRepisas(prev => [...prev, { ...DEFAULTS_REPISA, id: Date.now() }])
  }
  function updateRepisa(id, field, val) {
    setRepisas(prev => prev.map(r => r.id === id
      ? { ...r, [field]: parseFloat(String(val).replace(',', '.')) || 0 } : r))
  }
  function removeRepisa(id) { setRepisas(prev => prev.filter(r => r.id !== id)) }

  async function handleGenerar() {
    if (!selectedVisit) return alert('Selecciona una visita primero')
    setGenerating(true); setError(''); setPdfUrl(null); setSaved(false)
    const payload = {
      cot_num:   cotNum,
      nombre:    (selectedVisit.nombre || '').toUpperCase(),
      direccion: (selectedVisit.direccion || '').toUpperCase(),
      rut: '', telefono: selectedVisit.celular || '',
      email: (selectedVisit.email || '').toUpperCase(),
      repisas: repisas.map(r => ({ largo: r.l, prof: r.p, alto: r.a, niveles: r.n, unidades: r.u, valor: r.v })),
      ...adicionales,
    }
    try {
      const res = await fetch('/.netlify/functions/generate-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': ADMIN_PASSWORD },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`) }

      setTotalInfo({
        subtotal: parseInt(res.headers.get('x-subtotal') || '0'),
        iva:      parseInt(res.headers.get('x-iva')      || '0'),
        total:    parseInt(res.headers.get('x-total')    || '0'),
      })

      const xlsxBlob = await res.blob()
      const formData = new FormData()
      formData.append('File', xlsxBlob, 'cotizacion.xlsx')

      const convertRes  = await fetch(`https://v2.convertapi.com/convert/xlsx/to/pdf?Secret=${CONVERTAPI_SECRET}`, { method: 'POST', body: formData })
      const convertData = await convertRes.json()
      if (!convertRes.ok || !convertData.Files) throw new Error('ConvertAPI: ' + (convertData.Message || 'Error'))

      const fi = convertData.Files[0]
      let blob
      if (fi.FileData) {
        const bin = atob(fi.FileData); const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        blob = new Blob([bytes], { type: 'application/pdf' })
      } else { blob = await fetch(fi.Url).then(r => r.blob()) }

      setPdfBlob(blob); setPdfUrl(URL.createObjectURL(blob))
      const next = cotNum + 1; setCotNum(next); localStorage.setItem('dm_cot_num', String(next))
    } catch (e) { setError(e.message) }
    finally { setGenerating(false) }
  }

  function handleDescargar() {
    if (!pdfBlob) return
    const a = document.createElement('a')
    a.href = pdfUrl; a.download = `Cotizacion ${selectedVisit?.nombre || 'cliente'} - Repisas Don Maxi.pdf`; a.click()
  }

  async function handleGuardar() {
    if (!pdfBlob || !selectedVisit) return
    setSaving(true)
    try {
      await apiFetch('/.netlify/functions/save-quote', {
        method: 'POST',
        body: JSON.stringify({
          cotNum: cotNum - 1, nombre: selectedVisit.nombre, email: selectedVisit.email,
          telefono: selectedVisit.celular, direccion: selectedVisit.direccion,
          fechaVisita: fmtDate(selectedVisit.start), total: fmt(totalInfo.total),
          notas: selectedVisit.notas || '', status: 'por confirmar',
        }),
      })
      setSaved(true)
    } catch (e) { setError('Error al guardar: ' + e.message) }
    finally { setSaving(false) }
  }

  return (
    <div>
      <h2 style={{ ...styles.sectionTitle, marginBottom: 20 }}>📋 Por Cotizar</h2>

      {/* Selector de visita */}
      <div style={{ ...styles.card, marginBottom: 16 }}>
        <div style={styles.cardLabel}>Visita a cotizar</div>
        {realizadas.length === 0
          ? <p style={{ color: '#aaa', fontSize: 14 }}>No hay visitas marcadas como Realizadas aún.</p>
          : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {realizadas.map(v => (
                <button key={v.id} onClick={() => { setSelectedVisit(v); setPdfUrl(null); setSaved(false) }}
                  style={{
                    padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: `1.5px solid ${selectedVisit?.id === v.id ? '#F47920' : '#ddd'}`,
                    background: selectedVisit?.id === v.id ? '#FFF0E0' : 'white',
                    color: selectedVisit?.id === v.id ? '#D4600A' : '#444', transition: 'all .15s',
                  }}>
                  {v.nombre} · {fmtDate(v.start)}
                </button>
              ))}
            </div>
        }
        {selectedVisit && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0', ...styles.detailGrid }}>
            {selectedVisit.email     && <><span style={styles.detailLabel}>Email</span><span style={{fontSize:13}}>{selectedVisit.email}</span></>}
            {selectedVisit.celular   && <><span style={styles.detailLabel}>Celular</span><span style={{fontSize:13}}>{selectedVisit.celular}</span></>}
            {selectedVisit.direccion && <><span style={styles.detailLabel}>Dirección</span><span style={{fontSize:13}}>{selectedVisit.direccion}</span></>}
          </div>
        )}
      </div>

      {/* N° Cotización */}
      <div style={{ ...styles.card, marginBottom: 16 }}>
        <div style={styles.cardLabel}>Número de Cotización</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14 }}>N°</span>
          <input type="number" value={cotNum}
            onChange={e => { setCotNum(parseInt(e.target.value)); localStorage.setItem('dm_cot_num', e.target.value) }}
            style={{ width: 90, padding: '8px 10px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 15, fontWeight: 700 }} />
          <span style={{ color: '#aaa', fontSize: 12 }}>Fecha y validez se calculan solos en el Excel</span>
        </div>
      </div>

      {/* Repisas */}
      <div style={{ ...styles.card, marginBottom: 16 }}>
        <div style={styles.cardLabel}>🗄️ Repisas</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 540 }}>
            <thead>
              <tr>{['Largo (m)', 'Prof. (m)', 'Alto (m)', 'Niveles', 'Unidades', 'Valor ($)', 'Total', ''].map(h =>
                <th key={h} style={{ background: '#F47920', color: 'white', padding: '8px 6px', fontWeight: 700, fontSize: 11, textAlign: 'center' }}>{h}</th>
              )}</tr>
            </thead>
            <tbody>
              {repisas.map((r, idx) => (
                <tr key={r.id} style={{ background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                  {[{f:'l',v:r.l},{f:'p',v:r.p},{f:'a',v:r.a},{f:'n',v:r.n},{f:'u',v:r.u},{f:'v',v:r.v}].map(({ f, v }) => (
                    <td key={f} style={{ padding: '4px 3px', textAlign: 'center' }}>
                      <input type="number" value={v}
                        step={['l','p','a'].includes(f) ? '0.01' : f === 'v' ? '1000' : '1'}
                        onChange={e => updateRepisa(r.id, f, e.target.value)}
                        style={{ width: '100%', padding: '6px 4px', border: '1.5px solid #ddd', borderRadius: 6, fontSize: 13, textAlign: 'center' }} />
                    </td>
                  ))}
                  <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700, color: '#D4600A', whiteSpace: 'nowrap' }}>{fmt(r.u * r.v)}</td>
                  <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                    <button onClick={() => removeRepisa(r.id)}
                      style={{ background: 'none', border: '1.5px solid #eee', borderRadius: 6, width: 26, height: 26, cursor: 'pointer', color: '#aaa', fontSize: 14 }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addRepisa}
          style={{ marginTop: 10, width: '100%', background: 'none', border: '2px dashed #F47920', color: '#F47920', padding: '8px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
          + Agregar repisa
        </button>
      </div>

      {/* Adicionales */}
      <div style={{ ...styles.card, marginBottom: 16 }}>
        <div style={styles.cardLabel}>➕ Adicionales</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 110px 80px', gap: '8px 10px', alignItems: 'center', fontSize: 13 }}>
          {['Servicio', 'Cant.', 'Precio', 'Total'].map(h =>
            <span key={h} style={{ fontWeight: 600, fontSize: 11, color: '#bbb', textTransform: 'uppercase', textAlign: h !== 'Servicio' ? 'center' : 'left' }}>{h}</span>
          )}
          {[
            { key: 'retiro_orden',  label: 'Retiro y orden' },
            { key: 'retiro_basura', label: 'Retiro de basura' },
            { key: 'cajas',         label: 'Cajas organizadoras' },
            { key: 'bici',          label: 'Soporte bici / ski' },
          ].map(({ key, label }) => {
            const q = adicionales[`qty_${key}`] || 0
            const p = adicionales[`precio_${key}`] || 0
            return (
              <React.Fragment key={key}>
                <span>{label}</span>
                <input type="number" value={q} min="0"
                  onChange={e => setAdicionales(prev => ({ ...prev, [`qty_${key}`]: parseInt(e.target.value) || 0 }))}
                  style={{ padding: '6px 4px', border: '1.5px solid #ddd', borderRadius: 6, fontSize: 13, textAlign: 'center', width: '100%' }} />
                <input type="number" value={p} min="0" step="1000"
                  onChange={e => setAdicionales(prev => ({ ...prev, [`precio_${key}`]: parseInt(e.target.value) || 0 }))}
                  style={{ padding: '6px 4px', border: '1.5px solid #ddd', borderRadius: 6, fontSize: 13, textAlign: 'center', width: '100%' }} />
                <span style={{ textAlign: 'center', color: '#aaa', fontSize: 12 }}>{fmt(q * p)}</span>
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* Totales */}
      <div style={{ ...styles.card, marginBottom: 20, background: '#FFF0E0' }}>
        {[['Subtotal neto', totales.subtotal], ['IVA (19%)', totales.iva]].map(([label, val]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
            <span style={{ color: '#666' }}>{label}</span><span style={{ fontWeight: 700 }}>{fmt(val)}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px', fontSize: 20, fontWeight: 800, borderTop: '2px solid #F47920', marginTop: 6, color: '#D4600A' }}>
          <span>TOTAL</span><span>{fmt(totales.total)}</span>
        </div>
      </div>

      {error && <div style={{ ...styles.errorBox, marginBottom: 12 }}>{error}</div>}

      <button onClick={handleGenerar} disabled={generating || !selectedVisit}
        style={{ ...styles.btnPrimary, width: '100%', padding: '16px', fontSize: 16, borderRadius: 12, marginBottom: 12, opacity: (!selectedVisit || generating) ? .6 : 1 }}>
        {generating ? '⏳ Generando PDF…' : '⬇️  Generar Cotización PDF'}
      </button>

      {pdfUrl && (
        <div style={{ ...styles.card, borderLeft: '4px solid #10B981' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <p style={{ fontWeight: 700, color: '#10B981', marginBottom: 2 }}>✅ PDF generado</p>
              <p style={{ fontSize: 13, color: '#666' }}>Total: {fmt(totalInfo.total)}</p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={handleDescargar} style={styles.btnSecondary}>⬇️ Descargar</button>
              <a href={pdfUrl} target="_blank" rel="noreferrer"
                style={{ ...styles.btnSecondary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                👁️ Ver
              </a>
              {!saved
                ? <button onClick={handleGuardar} disabled={saving} style={{ ...styles.btnPrimary, opacity: saving ? .6 : 1 }}>
                    {saving ? 'Guardando…' : '💾 Guardar cotización'}
                  </button>
                : <span style={{ color: '#10B981', fontWeight: 700, fontSize: 13, alignSelf: 'center' }}>✅ Guardada</span>
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

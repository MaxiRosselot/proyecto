import React, { useEffect, useState, useCallback } from 'react'
import { QUOTE_STATUS_LABELS, C, apiFetch, fmt, fmtDate, styles, DEFAULTS_REPISA, porCreacion } from './utils.js'
import { hayBorradorSinGuardar } from './PorCotizar.jsx'
import { AgendarInstalacion, ResumenInstalacion } from './AgendarInstalacion.jsx'
import { fechaLarga } from './whatsappInstalacion.js'
import { BadgePago, PagosCotizacion } from './PagosCotizacion.jsx'
import { regenerarPdf } from './regenerarPdf.js'
import EnviarCotizacion, { CopiarLink } from './EnviarCotizacion.jsx'
import TransferenciaPorVerificar from './TransferenciaPorVerificar.jsx'
import { resumenPagos } from '../../netlify/functions/lib/pagos-resumen.mjs'
import { porcentajeDescuento } from '../../netlify/functions/lib/totales.mjs'

const MOTIVOS_RECHAZO = ['Precio alto', 'Sin respuesta', 'Eligio otro proveedor', 'Otro']
const AMBAR = '#D97706'
const porVerificar = q => q.reserva?.estado === 'por verificar'

function Badge({ status }) {
  const s = QUOTE_STATUS_LABELS[status] || QUOTE_STATUS_LABELS['por confirmar']
  return <span style={styles.badge(s.color)}>{s.label}</span>
}

function driveFileId(url) {
  if (!url) return ''
  const m = url.match(/\/d\/([^/]+)/)
  return m ? m[1] : ''
}

// Un bloque de la tarjeta con su titulo: Cliente, Documento, Enviar al cliente.
function Seccion({ titulo, children, testid }) {
  return (
    <section data-testid={testid} style={{ padding: 14, borderRadius: 12, border: '1px solid ' + C.border, background: '#FCFCFD', minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.textMuted, textTransform: 'uppercase', letterSpacing: .8, marginBottom: 10 }}>{titulo}</div>
      {children}
    </section>
  )
}

const boton = { ...styles.btnSecondary, fontSize: 12, padding: '6px 14px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }
const fila = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }

// Lo que toca hacer ahora con esta cotizacion, arriba y con un solo boton.
function SiguientePaso({ q, onAgendar }) {
  const pago = resumenPagos(q.total, q.pagos)
  const caja = (color, fondo, texto, accion) => (
    <div data-testid="siguiente-paso" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderRadius: 12, background: fondo, border: '1px solid ' + color + '40', marginBottom: 14 }}>
      <div style={{ fontSize: 13.5, color: C.text }}><span style={{ fontSize: 11, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: .8, display: 'block' }}>Siguiente paso</span>{texto}</div>
      {accion && <div style={fila}>{accion}</div>}
    </div>
  )
  if (q.status === 'rechazada') return null
  if (q.reserva?.estado === 'esperando pago') return caja(C.blue, '#EFF6FF', <>El cliente está pagando con Mercado Pago{q.reserva.fecha ? ` (reservó ${fechaLarga(q.reserva.fecha).toLowerCase()}, ${q.reserva.inicio})` : ''}. Se agenda solo cuando se apruebe.</>)
  if (q.status === 'por confirmar') return caja(C.orange, C.orangeLight,
    <>Mándale la cotización con su link: ahí elige su día y paga. Si ya aceptó por otro lado, agenda tú.</>,
    <><EnviarCotizacion cotizacion={q} tamano={12} soloWhatsapp /><CopiarLink link={q.linkPago} texto="Copiar link" />
      <button onClick={onAgendar} style={{ ...boton, color: C.green, borderColor: C.green }}>Agendar instalación</button></>)
  if (!q.instalacion?.fecha) return caja(C.green, C.green + '0F', <>Aceptada{pago.pagado ? ` · pagó ${fmt(pago.pagado)}` : ''}. Falta agendar la instalación.</>,
    <button onClick={onAgendar} style={{ ...boton, background: C.green, borderColor: C.green, color: 'white' }}>Agendar instalación</button>)
  if (pago.saldo > 0) return caja(C.yellow, '#FFFBEB', <>Instalación agendada. Saldo por cobrar: <strong>{fmt(pago.saldo)}</strong>.</>,
    <CopiarLink link={q.linkPago} texto="Copiar link para pagar" />)
  return caja(C.green, C.green + '0F', <>Pagada y con la instalación agendada. Recuerda anotar las boletas.</>)
}

export default function CotizacionesSection({ onAbrirEnCotizador, enfocar }) {
  const [quotes, setQuotes]             = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [tab, setTab]                   = useState('por confirmar')
  const [updating, setUpdating]         = useState(null)
  const [expanded, setExpanded]         = useState(null)
  const [rechazandoId, setRechazandoId] = useState(null)
  const [motivoSelec, setMotivoSelec]   = useState('')
  const [editingId, setEditingId]       = useState(null)
  const [editRepisas, setEditRepisas]   = useState([])
  const [editAd, setEditAd]             = useState({})
  const [saving, setSaving]             = useState(false)
  const [deleting, setDeleting]         = useState(null)
  const [confirmDel, setConfirmDel]     = useState(null)
  const [buscar, setBuscar]             = useState('')
  const [abriendo, setAbriendo]         = useState(null)
  const [probandoCorreo, setProbandoCorreo] = useState(false)
  const [agendandoId, setAgendandoId]   = useState(null)
  const [masId, setMasId]               = useState(null)
  const [pdfEnCurso, setPdfEnCurso]     = useState(null)   // { cotNum, etapa }
  const [pdfNuevo, setPdfNuevo]         = useState({})     // cotNum -> 'sugerido' | { blobUrl } | { error }
  const actualizarLocal = (cotNum, cambios) => setQuotes(prev => prev.map(x => x.cotNum === cotNum ? { ...x, ...cambios } : x))

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const quotesData = await apiFetch('/.netlify/functions/get-quotes')
      // Las ventas importadas del Excel viven en Instalaciones: aca solo las cotizaciones del panel.
      if (quotesData.ok) setQuotes(quotesData.quotes.filter(q => q.instalacion?.origen !== 'excel'))
      else setError(quotesData.error || 'Error')
    } catch { setError('No se pudo conectar') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Si hay transferencias por verificar, se parte ahi.
  useEffect(() => { if (!loading && quotes.some(porVerificar) && tab === 'por confirmar' && !enfocar) setTab('verificar') }, [loading])

  // Desde el calendario: abrir la cotizacion de ese evento, en su pestaña.
  useEffect(() => {
    if (!enfocar || loading) return
    const q = quotes.find(x => String(x.cotNum) === String(enfocar.cotNum))
    if (!q) return
    setBuscar(''); setTab(q.status); setExpanded(q.cotNum)
    setTimeout(() => document.getElementById('cot-' + q.cotNum)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
  }, [enfocar, loading])

  async function rehacerPdf(q) {
    setPdfEnCurso({ cotNum: q.cotNum, etapa: 'Empezando' })
    try {
      const r = await regenerarPdf(q.cotNum, { alAvanzar: etapa => setPdfEnCurso({ cotNum: q.cotNum, etapa }) })
      actualizarLocal(q.cotNum, { pdfUrl: r.pdfUrl })
      setPdfNuevo(p => ({ ...p, [q.cotNum]: { blobUrl: r.blobUrl } }))
    } catch (e) { setPdfNuevo(p => ({ ...p, [q.cotNum]: { error: e.message } })) }
    finally { setPdfEnCurso(null) }
  }

  // Solo viajan los campos que cambian: el resto (incluido el modelo 3D) queda como estaba.
  async function updateStatus(quote, newStatus, motivo) {
    setUpdating(quote.cotNum)
    try {
      const res = await apiFetch('/.netlify/functions/save-quote', {
        method: 'POST',
        body: JSON.stringify({ cotNum: quote.cotNum, status: newStatus, motivoRechazo: motivo || '' }),
      })
      if (!res.ok) throw new Error(res.error)
      setQuotes(prev => prev.map(q => q.cotNum === quote.cotNum
        ? { ...q, status: newStatus, motivoRechazo: motivo || '' } : q))
    } catch (e) { alert('Error al actualizar' + (e?.message ? ': ' + e.message : '')) }
    finally { setUpdating(null) }
  }

  async function handleDelete(cotNum) {
    setDeleting(cotNum)
    try {
      const res = await apiFetch('/.netlify/functions/delete-quote', { method: 'POST', body: JSON.stringify({ cotNum }) })
      if (!res.ok) throw new Error(res.error)
      setQuotes(prev => prev.filter(q => q.cotNum !== cotNum))
      setConfirmDel(null); setExpanded(null)
    } catch (e) { alert('Error al borrar' + (e?.message ? ': ' + e.message : '')) }
    finally { setDeleting(null) }
  }

  function startEditing(quote) {
    setEditingId(quote.cotNum)
    setEditRepisas(quote.repisas && quote.repisas.length
      ? quote.repisas.map((r, i) => ({ ...r, id: i }))
      : [{ ...DEFAULTS_REPISA, id: 0 }])
    setEditAd(quote.adicionales || {})
  }

  async function saveEdit(quote) {
    if (editRepisas.some(r => r.kind === 'rack' && (!Number.isSafeInteger(r.valor) || r.valor <= 0))) return alert('Ingresa un precio neto entero positivo para cada rack.')
    setSaving(true)
    try {
      const res = await apiFetch('/.netlify/functions/save-quote', {
        method: 'POST',
        body: JSON.stringify({ cotNum: quote.cotNum, repisas: editRepisas, adicionales: editAd }),
      })
      if (!res.ok) throw new Error(res.error)
      setQuotes(prev => prev.map(q => q.cotNum === quote.cotNum
        ? { ...q, repisas: editRepisas, adicionales: editAd } : q))
      setEditingId(null)
    } catch (e) { alert('Error al guardar: ' + e.message) }
    finally { setSaving(false) }
  }

  // Trae la cotizacion completa, con su modelo 3D, y la lleva al cotizador.
  async function abrirEnCotizador(quote) {
    if (hayBorradorSinGuardar() && !window.confirm('Hay una cotización nueva sin guardar en el cotizador. ¿Reemplazarla por la N° ' + quote.cotNum + '?')) return
    setAbriendo(quote.cotNum)
    try {
      const res = await apiFetch('/.netlify/functions/get-quotes?cotNum=' + encodeURIComponent(quote.cotNum))
      if (!res.ok || !res.quote) throw new Error(res.error || 'No se encontró la cotización')
      onAbrirEnCotizador?.(res.quote)
    } catch (e) { alert('No se pudo abrir: ' + e.message) }
    finally { setAbriendo(null) }
  }

  // Diagnostico: manda un correo de prueba y muestra la causa exacta si Google lo rechaza.
  async function probarCorreo() {
    setProbandoCorreo(true)
    try {
      const r = await apiFetch('/.netlify/functions/probar-correo', { method: 'POST' })
      alert(r.ok
        ? `Correo de prueba enviado a ${r.para}${r.remitente ? ' desde ' + r.remitente : ''}. Revisa esa bandeja.`
        : `No se pudo enviar el correo de prueba a ${r.para || 'NOTIFY_EMAIL'}.\n\n${r.causa || r.error}\n\nDetalle de Google: ${r.detalle || '-'}`)
    } catch (e) { alert('No se pudo probar el correo: ' + e.message) }
    finally { setProbandoCorreo(false) }
  }

  function abrirAgendar(q) {
    setAgendandoId(q.cotNum)
    setTimeout(() => document.getElementById('instalacion-' + q.cotNum)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }

  const counts = {
    'verificar':     quotes.filter(porVerificar).length,
    'por confirmar': quotes.filter(q => q.status === 'por confirmar').length,
    'confirmada':    quotes.filter(q => q.status === 'confirmada').length,
    'rechazada':     quotes.filter(q => q.status === 'rechazada').length,
  }
  const TABS = [
    ...(counts.verificar ? [{ key: 'verificar', label: 'Transferencias por verificar', color: AMBAR }] : []),
    { key: 'por confirmar', label: 'Por confirmar', color: C.yellow },
    { key: 'confirmada',    label: 'Confirmadas',   color: C.green  },
    { key: 'rechazada',     label: 'Rechazadas',    color: C.red    },
  ]
  const enTab = q => (tab === 'verificar' ? porVerificar(q) : q.status === tab)
  useEffect(() => { if (tab === 'verificar' && !counts.verificar) setTab('por confirmar') }, [counts.verificar])

  const bq = buscar.trim().toLowerCase()
  const filtered = quotes
    .filter(enTab)
    .filter(q => !bq || (q.nombre || '').toLowerCase().includes(bq) || String(q.cotNum).includes(bq))
    .sort(porCreacion)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={styles.sectionTitle}>Cotizaciones</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={buscar}
            onChange={e => setBuscar(e.target.value)}
            placeholder="Buscar por nombre o N°..."
            style={{ ...styles.input, width: 200, padding: '7px 12px', fontSize: 13 }}
          />
          <button onClick={probarCorreo} disabled={probandoCorreo} style={styles.btnSecondary}>{probandoCorreo ? 'Probando...' : 'Probar correo'}</button>
          <button onClick={load} style={styles.btnSecondary}>Actualizar</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            ...styles.tab,
            ...(t.key === 'verificar' && tab !== t.key ? { borderColor: AMBAR, color: AMBAR } : {}),
            ...(tab === t.key ? { background: t.color, borderColor: t.color, color: 'white', boxShadow: '0 2px 8px ' + t.color + '40' } : {}),
          }}>
            {t.key === 'verificar' ? '💸 ' : ''}{t.label}
            <span style={{
              marginLeft: 7, padding: '1px 7px', borderRadius: 99, fontSize: 11, fontWeight: 700,
              background: tab === t.key ? 'rgba(255,255,255,.25)' : C.bg,
              color: tab === t.key ? 'white' : C.textMuted,
            }}>{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {loading && <div style={styles.empty}>Cargando cotizaciones...</div>}
      {error   && <div style={styles.errorBox}>{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div style={styles.empty}>
          {buscar ? 'Sin resultados para "' + buscar + '".' : 'No hay cotizaciones en esta seccion.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(q => {
          const isExp  = expanded === q.cotNum
          const isEdit = editingId === q.cotNum
          const isUpd  = updating === q.cotNum
          const borderColor = porVerificar(q) ? AMBAR : QUOTE_STATUS_LABELS[q.status]?.color || C.border
          const activa = q.status !== 'rechazada'
          const descuento = porcentajeDescuento(q.adicionales)

          return (
            <div key={q.cotNum} id={'cot-' + q.cotNum} style={{ ...styles.card, borderLeft: '3px solid ' + borderColor, scrollMarginTop: 70 }}>
              {/* Header */}
              <div
                onClick={() => !isEdit && setExpanded(isExp ? null : q.cotNum)}
                style={{ cursor: isEdit ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{q.nombre}</span>
                    <Badge status={q.status} />
                    {porVerificar(q) && <span style={styles.badge(AMBAR)}>Transferencia por verificar</span>}
                    {q.reserva?.estado === 'esperando pago' && <span style={styles.badge(C.blue)}>Pagando con MP</span>}
                  </div>
                  <div style={{ fontSize: 13, color: C.textSub }}>
                    <span style={{ marginRight: 8, color: C.textMuted, fontWeight: 600 }}>N{q.cotNum}</span>
                    <span style={{ fontWeight: 700, color: C.orangeDark }}>{fmt(q.total)}</span>
                    {q.direccion && <span style={{ marginLeft: 10, color: C.textMuted }}>{q.direccion}</span>}
                    {q.creado && <span style={{ marginLeft: 10, color: C.textMuted }}>Creada {String(q.creado).split(/[ ,]/)[0]}</span>}
                    {q.tieneProyecto3d && <span style={{ ...styles.badge(C.purple), marginLeft: 10 }}>Modelo 3D</span>}
                    <BadgePago quote={q} />
                    {q.instalacion?.fecha && <span style={{ ...styles.badge(C.green), marginLeft: 10 }}>Instalación {fechaLarga(q.instalacion.fecha).split(',')[1]?.trim()} · {q.instalacion.inicio}</span>}
                  </div>
                </div>
                {!isEdit && (
                  <div style={{ color: C.textMuted, transition: 'transform .2s', transform: isExp ? 'rotate(180deg)' : 'none' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                )}
              </div>

              {/* Formulario de edicion */}
              {isEdit && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid ' + C.border }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 1 }}>Repisas</div>
                  {editRepisas.map((r, i) => (
                    <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6, marginBottom: 8 }}>
                      {r.kind === 'rack' && <strong style={{gridColumn:'1 / -1',fontSize:12}}>{r.label} · cajas incluidas · medidas fijas</strong>}
                      {['largo','prof','alto','niveles','unidades','valor'].map(field => (
                        <div key={field}>
                          <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 2, textTransform: 'uppercase' }}>{field}</div>
                          <input
                            type="number"
                            readOnly={r.kind === 'rack' && field !== 'valor'}
                            value={r[field] ?? r[field[0]] ?? 0}
                            style={{ ...styles.input, padding: '5px 6px', fontSize: 12 }}
                            onChange={e => setEditRepisas(prev => prev.map((x, j) => j === i ? { ...x, [field]: parseFloat(e.target.value) || 0 } : x))}
                          />
                        </div>
                      ))}
                    </div>
                  ))}

                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', marginBottom: 8, marginTop: 12, letterSpacing: 1 }}>Adicionales</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 80px 120px', gap: '6px 12px', alignItems: 'center', fontSize: 13 }}>
                    {['retiro_orden','retiro_basura','cajas','bici'].map(k => (
                      <React.Fragment key={k}>
                        <span style={{ color: C.textSub }}>{k.replace(/_/g,' ')}</span>
                        <input type="number" value={editAd['qty_'+k] || 0}
                          style={{ ...styles.input, padding: '5px', fontSize: 12, textAlign: 'center' }}
                          onChange={e => setEditAd(prev => ({ ...prev, ['qty_'+k]: parseInt(e.target.value)||0 }))} />
                        <input type="number" value={editAd['precio_'+k] || 0} step={1000}
                          style={{ ...styles.input, padding: '5px', fontSize: 12, textAlign: 'center' }}
                          onChange={e => setEditAd(prev => ({ ...prev, ['precio_'+k]: parseInt(e.target.value)||0 }))} />
                      </React.Fragment>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button onClick={() => saveEdit(q)} disabled={saving}
                      style={{ ...styles.btnPrimary, fontSize: 13 }}>
                      {saving ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                    <button onClick={() => setEditingId(null)} style={styles.btnSecondary}>Cancelar</button>
                  </div>
                </div>
              )}

              {/* Detalle expandido: siguiente paso, luego todo ordenado por tema */}
              {isExp && !isEdit && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid ' + C.border }}>
                  {porVerificar(q)
                    ? <TransferenciaPorVerificar quote={q} onCambio={cambios => { actualizarLocal(q.cotNum, cambios); if (cambios.status) setTab(cambios.status) }} />
                    : <SiguientePaso q={q} onAgendar={() => abrirAgendar(q)} />}
                  {q.avisoConfirmacion && (
                    <div style={{ ...styles.errorBox, background: C.green + '12', borderColor: C.green + '40', color: '#065F46' }}>
                      ✓ Transferencia confirmada{q.instalacion ? ' e instalación agendada' : ''}. {q.avisoConfirmacion === 'enviado' ? 'Le enviamos el correo de confirmación y la invitación.' : q.avisoConfirmacion === 'falló' ? 'No se pudo enviar el correo de confirmación.' : 'No tiene correo: avísale por WhatsApp.'} {q.instalacion && 'Usa “Avisar por WhatsApp” para mandarle la confirmación.'}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 14 }}>
                    <Seccion titulo="Cliente y montos">
                      <div style={styles.detailGrid}>
                        {q.email    && <><span style={styles.detailLabel}>Email</span><span style={{ fontSize: 13, wordBreak: 'break-all' }}>{q.email}</span></>}
                        {q.telefono && <><span style={styles.detailLabel}>Tel</span><span style={{ fontSize: 13 }}>{q.telefono}</span></>}
                        {q.direccion && <><span style={styles.detailLabel}>Dirección</span><span style={{ fontSize: 13 }}>{q.direccion}</span></>}
                        {q.fechaVisita && <><span style={styles.detailLabel}>Visita</span><span style={{ fontSize: 13 }}>{fmtDate(q.fechaVisita)}</span></>}
                        {q.subtotal > 0 && <><span style={styles.detailLabel}>Neto</span><span style={{ fontSize: 13 }}>{fmt(q.subtotal)}{descuento ? <span style={{ color: C.green, fontWeight: 700 }}> · {descuento}% dcto.</span> : ''}</span></>}
                        {q.iva      > 0 && <><span style={styles.detailLabel}>IVA</span><span style={{ fontSize: 13 }}>{fmt(q.iva)}</span></>}
                        {q.total    > 0 && <><span style={styles.detailLabel}>Total</span><span style={{ fontSize: 13, fontWeight: 700, color: C.orangeDark }}>{fmt(q.total)}</span></>}
                        {q.motivoRechazo && <><span style={styles.detailLabel}>Motivo</span><span style={{ fontSize: 13, color: C.red }}>{q.motivoRechazo}</span></>}
                        {q.notas && <><span style={styles.detailLabel}>Notas</span><span style={{ fontSize: 13, color: /Correo no enviado/.test(q.notas) ? C.red : C.textSub }}>{q.notas}</span></>}
                      </div>
                    </Seccion>

                    <Seccion titulo="Documento" testid="seccion-documento">
                      {pdfNuevo[q.cotNum] === 'sugerido' && (
                        <div style={{ ...styles.errorBox, background: '#FFFBEB', borderColor: '#FDE68A', color: '#92400E', marginBottom: 10, padding: '8px 12px' }}>
                          El total cambió con los servicios agregados: regenera el PDF para mandarle el valor actualizado.
                        </div>
                      )}
                      {pdfNuevo[q.cotNum]?.error && <div style={{ ...styles.errorBox, marginBottom: 10, padding: '8px 12px' }}>No se pudo regenerar el PDF: {pdfNuevo[q.cotNum].error}</div>}
                      <div style={fila}>
                        {q.pdfUrl && <a href={q.pdfUrl} target="_blank" rel="noreferrer" style={{ ...boton, ...styles.btnPrimary, fontSize: 12, padding: '6px 14px', textDecoration: 'none' }}>Ver PDF</a>}
                        {q.pdfUrl && <a href={'https://drive.google.com/uc?export=download&id=' + driveFileId(q.pdfUrl)} style={boton}>Descargar</a>}
                        <button onClick={() => rehacerPdf(q)} disabled={Boolean(pdfEnCurso)} style={{ ...boton, opacity: pdfEnCurso ? .6 : 1 }}>
                          {pdfEnCurso?.cotNum === q.cotNum ? pdfEnCurso.etapa + '…' : 'Regenerar PDF'}
                        </button>
                        {pdfNuevo[q.cotNum]?.blobUrl && <a href={pdfNuevo[q.cotNum].blobUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: C.green }}>✓ PDF actualizado · ver</a>}
                      </div>
                      {activa && (
                        <div style={{ ...fila, marginTop: 8 }}>
                          {onAbrirEnCotizador && (
                            <button onClick={() => abrirEnCotizador(q)} disabled={abriendo === q.cotNum} style={boton}
                              title={q.tieneProyecto3d ? 'Abre la cotización con su modelo 3D para ajustarla y regenerar el PDF' : 'Abre la cotización en el cotizador para ajustarla y regenerar el PDF'}>
                              {abriendo === q.cotNum ? 'Abriendo...' : 'Abrir en cotizador'}
                            </button>
                          )}
                          <button onClick={() => startEditing(q)} style={boton}>Editar montos</button>
                        </div>
                      )}
                    </Seccion>

                    {activa && (
                      <Seccion titulo="Enviar al cliente" testid="seccion-enviar">
                        <div style={fila}>
                          <EnviarCotizacion cotizacion={q} tamano={12} />
                          <CopiarLink link={q.linkPago} />
                        </div>
                        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8 }}>Con el link el cliente elige su día y paga (transferencia o Mercado Pago).</div>
                      </Seccion>
                    )}
                  </div>

                  {/* Instalacion */}
                  {activa && (
                    <div id={'instalacion-' + q.cotNum} style={{ scrollMarginTop: 90 }}>
                      {q.instalacion?.fecha && agendandoId !== q.cotNum && (
                        <ResumenInstalacion quote={q} onReagendar={() => setAgendandoId(q.cotNum)}
                          onInvitado={cambios => actualizarLocal(q.cotNum, cambios)} />
                      )}
                      {agendandoId === q.cotNum && (
                        <AgendarInstalacion quote={q} onCancelar={() => setAgendandoId(null)}
                          onListo={cambios => {
                            if (Number(cambios.total) !== Number(q.total)) setPdfNuevo(p => ({ ...p, [q.cotNum]: 'sugerido' }))
                            actualizarLocal(q.cotNum, cambios)
                            setAgendandoId(null)
                            // Queda en Confirmadas, abierta, con el resumen y el boton de WhatsApp a la vista.
                            setTab('confirmada'); setExpanded(q.cotNum)
                          }} />
                      )}
                    </div>
                  )}

                  {activa && <PagosCotizacion quote={q} onCambio={cambios => actualizarLocal(q.cotNum, cambios)} />}

                  {/* Mas acciones: lo que se usa poco */}
                  <div style={{ marginTop: 6, paddingTop: 12, borderTop: '1px solid ' + C.border }}>
                    <button onClick={() => setMasId(masId === q.cotNum ? null : q.cotNum)} aria-expanded={masId === q.cotNum}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textSub, fontSize: 12, fontWeight: 700, padding: 0 }}>
                      {masId === q.cotNum ? '▾' : '▸'} Más acciones
                    </button>
                    {masId === q.cotNum && (
                      <div style={{ ...fila, marginTop: 10 }}>
                        {q.status !== 'por confirmar' && (
                          <button onClick={() => updateStatus(q, 'por confirmar')} disabled={isUpd} style={boton}>Volver a "Por confirmar"</button>
                        )}
                        {q.status !== 'rechazada' && (
                          <button onClick={() => { setRechazandoId(q.cotNum); setMotivoSelec('') }} disabled={isUpd} style={{ ...boton, color: C.red, borderColor: C.red + '55' }}>Marcar como rechazada</button>
                        )}
                        {confirmDel === q.cotNum ? (
                          <>
                            <span style={{ fontSize: 13, color: C.red, fontWeight: 600 }}>¿Eliminar para siempre?</span>
                            <button onClick={() => handleDelete(q.cotNum)} disabled={deleting === q.cotNum}
                              style={{ ...styles.btnPrimary, background: C.red, boxShadow: 'none', fontSize: 12, padding: '6px 14px' }}>
                              {deleting === q.cotNum ? 'Borrando...' : 'Sí, eliminar'}
                            </button>
                            <button onClick={() => setConfirmDel(null)} style={boton}>Cancelar</button>
                          </>
                        ) : (
                          <button onClick={() => setConfirmDel(q.cotNum)} style={{ ...boton, color: C.red, borderColor: C.red + '55' }}>Eliminar cotización</button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Motivo de rechazo */}
                  {rechazandoId === q.cotNum && (
                    <div style={{ background: C.red + '0A', border: '1px solid ' + C.red + '30', borderRadius: 10, padding: 14, marginTop: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 10 }}>Motivo del rechazo (opcional)</div>
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
                        <button
                          onClick={() => { updateStatus(q, 'rechazada', motivoSelec); setRechazandoId(null) }}
                          style={{ ...styles.btnPrimary, fontSize: 12, padding: '7px 16px', background: C.red, boxShadow: 'none' }}>
                          Confirmar rechazo
                        </button>
                        <button onClick={() => setRechazandoId(null)} style={styles.btnSecondary}>Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

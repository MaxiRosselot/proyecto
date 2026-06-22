import React, { useEffect, useState, useCallback } from 'react'
import { apiFetch, fmtTime, styles } from './utils.js'

function fmtDateLocal(iso) {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('es-CL', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
      timeZone: 'America/Santiago',
    }).format(new Date(iso))
  } catch { return iso }
}

function isPast(iso) {
  return iso && new Date(iso) < new Date()
}

function InstallCard({ inst, past }) {
  return (
    <div style={{ ...styles.card, opacity: past ? .7 : 1, borderLeft: '3px solid ' + (past ? '#ddd' : '#F47920') }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a', marginBottom: 3 }}>{inst.nombre}</div>
          <div style={{ fontSize: 13, color: '#666' }}>{fmtDateLocal(inst.start)}</div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
            {fmtTime(inst.start)} - {fmtTime(inst.end)}
            {inst.cotNum && <span style={{ marginLeft: 12, color: '#aaa' }}>N {inst.cotNum}</span>}
          </div>
        </div>
        {inst.link && (
          <a href={inst.link} target="_blank" rel="noreferrer"
            style={{ fontSize: 12, color: '#F47920', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Ver en Calendar
          </a>
        )}
      </div>
    </div>
  )
}

export default function InstalacionesSection() {
  const [confirmedQuotes, setConfirmedQuotes] = useState([])
  const [selectedQuote, setSelectedQuote]     = useState(null)
  const [useManual, setUseManual]             = useState(false)
  const [manualNombre, setManualNombre]       = useState('')
  const [manualEmail, setManualEmail]         = useState('')
  const [manualTelefono, setManualTelefono]   = useState('')
  const [manualDireccion, setManualDireccion] = useState('')
  const [fecha, setFecha]                     = useState('')
  const [horaInicio, setHoraInicio]           = useState('09:00')
  const [horaFin, setHoraFin]                 = useState('11:00')
  const [notas, setNotas]                     = useState('')
  const [submitting, setSubmitting]           = useState(false)
  const [submitOk, setSubmitOk]               = useState(null)
  const [submitErr, setSubmitErr]             = useState('')
  const [installations, setInstallations]     = useState([])
  const [loadingList, setLoadingList]         = useState(true)
  const [listError, setListError]             = useState('')

  useEffect(() => {
    apiFetch('/.netlify/functions/get-quotes').then(data => {
      if (data.ok) setConfirmedQuotes(data.quotes.filter(q => q.status === 'confirmada'))
    }).catch(() => {})
  }, [])

  const loadInstallations = useCallback(async () => {
    setLoadingList(true); setListError('')
    try {
      const data = await apiFetch('/.netlify/functions/get-installations')
      if (data.ok) setInstallations(data.installations)
      else setListError(data.error || 'Error al cargar instalaciones')
    } catch { setListError('No se pudo conectar') }
    finally { setLoadingList(false) }
  }, [])

  useEffect(() => { loadInstallations() }, [loadInstallations])

  async function handleAgendar(e) {
    e.preventDefault()
    setSubmitErr(''); setSubmitOk(null)

    const nombre    = useManual ? manualNombre.trim()    : selectedQuote?.nombre    || ''
    const email     = useManual ? manualEmail.trim()     : selectedQuote?.email     || ''
    const telefono  = useManual ? manualTelefono.trim()  : selectedQuote?.telefono  || ''
    const direccion = useManual ? manualDireccion.trim() : selectedQuote?.direccion || ''
    const cotNum    = useManual ? '' : selectedQuote?.cotNum || ''

    if (!nombre) return setSubmitErr('Ingresa el nombre del cliente')
    if (!fecha)  return setSubmitErr('Selecciona una fecha')
    if (horaFin <= horaInicio) return setSubmitErr('La hora de fin debe ser posterior a la hora de inicio')

    setSubmitting(true)
    try {
      // Calcular subtotales desde cotización seleccionada
      let subtotalRepisas = 0, subtotalAdicionales = 0, total = 0
      if (!useManual && selectedQuote) {
        const reps = selectedQuote.repisas || []
        subtotalRepisas = reps.reduce((s, r) => s + (r.unidades || r.u || 0) * (r.valor || r.v || 0), 0)
        const ad = selectedQuote.adicionales || {}
        subtotalAdicionales = ['retiro_orden','retiro_basura','cajas','bici']
          .reduce((s, k) => s + (ad['qty_'+k]||0)*(ad['precio_'+k]||0), 0)
        total = parseFloat(selectedQuote.total) || (subtotalRepisas + subtotalAdicionales) * 1.19
      }
      const data = await apiFetch('/.netlify/functions/create-installation', {
        method: 'POST',
        body: JSON.stringify({ nombre, email, telefono, direccion, fecha, horaInicio, horaFin, notas, cotNum, subtotalRepisas, subtotalAdicionales, total }),
      })
      if (data.ok) {
        setSubmitOk(data)
        setSelectedQuote(null); setManualNombre(''); setManualEmail('')
        setManualTelefono(''); setManualDireccion('')
        setFecha(''); setHoraInicio('09:00'); setHoraFin('11:00'); setNotas('')
        setUseManual(false)
        loadInstallations()
      } else {
        setSubmitErr(data.error || 'Error al agendar')
      }
    } catch (err) {
      setSubmitErr(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const upcoming = installations.filter(i => !isPast(i.end))
  const past     = installations.filter(i =>  isPast(i.end))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={styles.sectionTitle}>Instalaciones</h2>
        <button onClick={loadInstallations} style={styles.btnSecondary}>Actualizar</button>
      </div>

      <div style={{ ...styles.card, marginBottom: 20 }}>
        <div style={styles.cardLabel}>Agendar nueva instalacion</div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <button type="button" onClick={() => setUseManual(false)}
              style={{ ...styles.tab, ...(useManual ? {} : styles.tabActive), fontSize: 12, padding: '5px 12px' }}>
              Desde cotizacion confirmada
            </button>
            <button type="button" onClick={() => setUseManual(true)}
              style={{ ...styles.tab, ...(useManual ? styles.tabActive : {}), fontSize: 12, padding: '5px 12px' }}>
              Ingresar manualmente
            </button>
          </div>

          {!useManual && (
            confirmedQuotes.length === 0
              ? <p style={{ color: '#aaa', fontSize: 13 }}>No hay cotizaciones confirmadas aun.</p>
              : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {confirmedQuotes.map(q => (
                    <button key={q.cotNum} type="button"
                      onClick={() => setSelectedQuote(selectedQuote?.cotNum === q.cotNum ? null : q)}
                      style={{
                        padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        border: '1.5px solid ' + (selectedQuote?.cotNum === q.cotNum ? '#F47920' : '#ddd'),
                        background: selectedQuote?.cotNum === q.cotNum ? '#FFF0E0' : 'white',
                        color: selectedQuote?.cotNum === q.cotNum ? '#D4600A' : '#444',
                        transition: 'all .15s',
                      }}>
                      {q.nombre} N{q.cotNum}
                    </button>
                  ))}
                </div>
          )}

          {!useManual && selectedQuote && (
            <div style={{ marginTop: 10, padding: '10px 14px', background: '#FFF0E0', borderRadius: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', color: '#666' }}>
                {selectedQuote.email    && <span>{selectedQuote.email}</span>}
                {selectedQuote.telefono && <span>{selectedQuote.telefono}</span>}
                {selectedQuote.total    && <span style={{ fontWeight: 700, color: '#D4600A' }}>{selectedQuote.total}</span>}
              </div>
            </div>
          )}

          {useManual && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Nombre',    val: manualNombre,    set: setManualNombre,    placeholder: 'Nombre completo',         full: true },
                { label: 'Email',     val: manualEmail,     set: setManualEmail,     placeholder: 'correo@ejemplo.com' },
                { label: 'Telefono',  val: manualTelefono,  set: setManualTelefono,  placeholder: '+56 9 XXXX XXXX' },
                { label: 'Direccion', val: manualDireccion, set: setManualDireccion, placeholder: 'Direccion de instalacion', full: true },
              ].map(({ label, val, set, placeholder, full }) => (
                <div key={label} style={{ gridColumn: full ? '1 / -1' : undefined }}>
                  <label style={{ ...styles.detailLabel, display: 'block', marginBottom: 4 }}>{label}</label>
                  <input value={val} onChange={e => set(e.target.value)} placeholder={placeholder}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleAgendar}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ ...styles.detailLabel, display: 'block', marginBottom: 4 }}>Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} required
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ ...styles.detailLabel, display: 'block', marginBottom: 4 }}>Hora inicio</label>
              <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} required
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ ...styles.detailLabel, display: 'block', marginBottom: 4 }}>Hora fin</label>
              <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} required
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ ...styles.detailLabel, display: 'block', marginBottom: 4 }}>Notas (opcional)</label>
            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: llevar taladro, piso de madera"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} />
          </div>

          {submitErr && <div style={{ ...styles.errorBox, marginBottom: 12 }}>{submitErr}</div>}

          {submitOk && (
            <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 8, padding: '12px 16px', marginBottom: 12, fontSize: 13, color: '#065f46' }}>
              Instalacion agendada en Google Calendar.{' '}
              {submitOk.link && <a href={submitOk.link} target="_blank" rel="noreferrer" style={{ color: '#065f46', fontWeight: 700 }}>Ver evento</a>}
            </div>
          )}

          <button type="submit" disabled={submitting || (!useManual && !selectedQuote)}
            style={{ ...styles.btnPrimary, padding: '12px 24px', fontSize: 14, borderRadius: 10, opacity: (submitting || (!useManual && !selectedQuote)) ? .6 : 1 }}>
            {submitting ? 'Agendando...' : 'Agendar instalacion en Calendar'}
          </button>
        </form>
      </div>

      {loadingList && <div style={styles.empty}>Cargando instalaciones...</div>}
      {listError   && <div style={styles.errorBox}>{listError}</div>}

      {!loadingList && !listError && (
        <>
          {upcoming.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#10B981', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                Proximas ({upcoming.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upcoming.map(i => <InstallCard key={i.id} inst={i} />)}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                Realizadas ({past.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {past.map(i => <InstallCard key={i.id} inst={i} past />)}
              </div>
            </div>
          )}
          {upcoming.length === 0 && past.length === 0 && (
            <div style={styles.empty}>No hay instalaciones agendadas aun.</div>
          )}
        </>
      )}
    </div>
  )
}

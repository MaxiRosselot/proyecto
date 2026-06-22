import React, { useEffect, useState, useCallback } from 'react'
import { C, apiFetch, styles } from './utils.js'

// ── helpers ──────────────────────────────────────────────────────────────────
function fmtDateLocal(iso) {
  if (!iso) return ''
  try { return new Intl.DateTimeFormat('es-CL', { weekday:'long', day:'2-digit', month:'long', year:'numeric', timeZone:'America/Santiago' }).format(new Date(iso)) }
  catch { return iso }
}
function fmtTime(iso) {
  if (!iso) return ''
  try { return new Intl.DateTimeFormat('es-CL', { hour:'2-digit', minute:'2-digit', timeZone:'America/Santiago' }).format(new Date(iso)) }
  catch { return '' }
}
function addHours(timeStr, h) {
  const [hh, mm] = timeStr.split(':').map(Number)
  const total = hh * 60 + mm + h * 60
  return String(Math.floor(total / 60) % 24).padStart(2,'0') + ':' + String(total % 60).padStart(2,'0')
}
function isoToLocalDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }) // YYYY-MM-DD
}
function isoToLocalTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'America/Santiago' })
}
// Semana: lunes..sábado
function getWeekDays(refDate) {
  const d = new Date(refDate)
  const day = d.getDay() // 0=dom
  const monday = new Date(d)
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return Array.from({ length: 6 }, (_, i) => {
    const dd = new Date(monday); dd.setDate(monday.getDate() + i); return dd
  })
}
function sameDay(d1, d2) {
  return d1.getFullYear()===d2.getFullYear() && d1.getMonth()===d2.getMonth() && d1.getDate()===d2.getDate()
}
const DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb']

// ── CalendarioSemanal ─────────────────────────────────────────────────────────
function CalendarioSemanal({ installations, onReagendar }) {
  const [weekRef, setWeekRef] = useState(() => new Date())
  const days = getWeekDays(weekRef)

  function prev() { const d = new Date(weekRef); d.setDate(d.getDate()-7); setWeekRef(d) }
  function next() { const d = new Date(weekRef); d.setDate(d.getDate()+7); setWeekRef(d) }

  const fmtWeekRange = () => {
    const opts = { day:'numeric', month:'short' }
    return days[0].toLocaleDateString('es-CL',opts) + ' – ' + days[5].toLocaleDateString('es-CL',opts)
  }

  return (
    <div style={styles.card}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        <div style={styles.cardLabel}>Calendario de instalaciones</div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={prev} style={{ ...styles.btnSecondary, padding:'5px 10px', fontSize:13 }}>‹</button>
          <span style={{ fontSize:13, fontWeight:600, color:C.textSub, minWidth:150, textAlign:'center' }}>{fmtWeekRange()}</span>
          <button onClick={next} style={{ ...styles.btnSecondary, padding:'5px 10px', fontSize:13 }}>›</button>
          <button onClick={() => setWeekRef(new Date())} style={{ ...styles.btnSecondary, fontSize:11, padding:'5px 10px' }}>Hoy</button>
        </div>
      </div>

      {/* Cabecera días */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:4, marginBottom:6 }}>
        {days.map((d, i) => {
          const isToday = sameDay(d, new Date())
          return (
            <div key={i} style={{ textAlign:'center' }}>
              <div style={{ fontSize:10, fontWeight:700, color:C.textMuted, textTransform:'uppercase', letterSpacing:.5 }}>{DIAS[i]}</div>
              <div style={{
                fontSize:15, fontWeight:800, color: isToday ? 'white' : C.text,
                background: isToday ? C.orange : 'transparent',
                borderRadius:'50%', width:28, height:28, display:'inline-flex',
                alignItems:'center', justifyContent:'center', margin:'4px auto 0',
              }}>{d.getDate()}</div>
            </div>
          )
        })}
      </div>

      {/* Celdas */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:4 }}>
        {days.map((d, i) => {
          const dayInstalls = installations.filter(inst => {
            if (!inst.start) return false
            return sameDay(new Date(inst.start), d)
          })
          return (
            <div key={i} style={{
              minHeight:80, background: sameDay(d,new Date()) ? C.orangeLight : C.bg,
              borderRadius:8, padding:'6px 5px',
              border: '1.5px solid ' + (sameDay(d,new Date()) ? C.orange+'40' : C.border),
            }}>
              {dayInstalls.length === 0
                ? <div style={{ fontSize:10, color:C.textMuted, textAlign:'center', paddingTop:20 }}>—</div>
                : dayInstalls.map((inst, j) => (
                  <div key={j} onClick={() => onReagendar(inst)}
                    style={{
                      background: new Date(inst.end||inst.start) < new Date() ? '#E5E7EB' : C.orange,
                      color: new Date(inst.end||inst.start) < new Date() ? C.textSub : 'white',
                      borderRadius:6, padding:'4px 6px', marginBottom:3, fontSize:10, fontWeight:700,
                      cursor:'pointer', lineHeight:1.3,
                    }}>
                    <div style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{inst.nombre}</div>
                    <div style={{ opacity:.85, fontWeight:400 }}>{fmtTime(inst.start)}–{fmtTime(inst.end)}</div>
                  </div>
                ))
              }
            </div>
          )
        })}
      </div>
      <div style={{ fontSize:11, color:C.textMuted, marginTop:10 }}>Haz clic en una instalación para reagendar.</div>
    </div>
  )
}

// ── Modal reagendar ───────────────────────────────────────────────────────────
function ModalReagendar({ inst, onClose, onSaved }) {
  const [fecha, setFecha]           = useState(isoToLocalDate(inst.start))
  const [horaInicio, setHoraInicio] = useState(isoToLocalTime(inst.start))
  const [horaFin, setHoraFin]       = useState(isoToLocalTime(inst.end))
  const [saving, setSaving]         = useState(false)
  const [err, setErr]               = useState('')

  function handleInicioChange(v) {
    setHoraInicio(v)
    setHoraFin(addHours(v, 3))
  }

  async function handleSave() {
    if (horaFin <= horaInicio) return setErr('Hora fin debe ser posterior a hora inicio')
    setSaving(true); setErr('')
    try {
      const data = await apiFetch('/.netlify/functions/reschedule-installation', {
        method: 'POST',
        body: JSON.stringify({ eventId: inst.id, fecha, horaInicio, horaFin }),
      })
      if (data.ok) { onSaved(); onClose() }
      else setErr(data.error || 'Error')
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ ...styles.card, width:'100%', maxWidth:400, boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
          <div style={{ fontWeight:800, fontSize:15, color:C.text }}>Reagendar instalación</div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:C.textMuted, fontSize:20, lineHeight:1 }}>×</button>
        </div>
        <div style={{ fontSize:13, color:C.textSub, marginBottom:16, fontWeight:600 }}>{inst.nombre}</div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:14 }}>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={{ ...styles.detailLabel, display:'block', marginBottom:4 }}>Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              style={{ ...styles.input, fontSize:13, padding:'8px 10px' }} />
          </div>
          <div>
            <label style={{ ...styles.detailLabel, display:'block', marginBottom:4 }}>Inicio</label>
            <input type="time" value={horaInicio} onChange={e => handleInicioChange(e.target.value)}
              style={{ ...styles.input, fontSize:13, padding:'8px 10px' }} />
          </div>
          <div>
            <label style={{ ...styles.detailLabel, display:'block', marginBottom:4 }}>Fin</label>
            <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)}
              style={{ ...styles.input, fontSize:13, padding:'8px 10px' }} />
          </div>
        </div>

        {err && <div style={{ ...styles.errorBox, marginBottom:12 }}>{err}</div>}

        <div style={{ display:'flex', gap:8 }}>
          <button onClick={handleSave} disabled={saving} style={{ ...styles.btnPrimary, flex:1, padding:'11px', fontSize:13 }}>
            {saving ? 'Guardando...' : 'Reagendar en Calendar'}
          </button>
          <button onClick={onClose} style={styles.btnSecondary}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ── Sección principal ─────────────────────────────────────────────────────────
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
  const [horaFin, setHoraFin]                 = useState('12:00')
  const [notas, setNotas]                     = useState('')
  const [submitting, setSubmitting]           = useState(false)
  const [submitOk, setSubmitOk]               = useState(null)
  const [submitErr, setSubmitErr]             = useState('')
  const [installations, setInstallations]     = useState([])
  const [loadingList, setLoadingList]         = useState(true)
  const [listError, setListError]             = useState('')
  const [reagendarInst, setReagendarInst]     = useState(null)
  const [view, setView]                       = useState('calendar') // 'calendar' | 'list'

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
      else setListError(data.error || 'Error')
    } catch { setListError('No se pudo conectar') }
    finally { setLoadingList(false) }
  }, [])
  useEffect(() => { loadInstallations() }, [loadInstallations])

  function handleInicioChange(v) {
    setHoraInicio(v)
    setHoraFin(addHours(v, 3))
  }

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
    if (horaFin <= horaInicio) return setSubmitErr('Hora fin debe ser posterior a hora inicio')

    let subtotalRepisas = 0, subtotalAdicionales = 0, total = 0
    if (!useManual && selectedQuote) {
      const reps = selectedQuote.repisas || []
      subtotalRepisas = reps.reduce((s, r) => s + (r.unidades||r.u||0)*(r.valor||r.v||0), 0)
      const ad = selectedQuote.adicionales || {}
      subtotalAdicionales = ['retiro_orden','retiro_basura','cajas','bici']
        .reduce((s, k) => s + (ad['qty_'+k]||0)*(ad['precio_'+k]||0), 0)
      total = parseFloat(selectedQuote.total) || (subtotalRepisas + subtotalAdicionales) * 1.19
    }

    setSubmitting(true)
    try {
      const data = await apiFetch('/.netlify/functions/create-installation', {
        method: 'POST',
        body: JSON.stringify({ nombre, email, telefono, direccion, fecha, horaInicio, horaFin, notas, cotNum, subtotalRepisas, subtotalAdicionales, total }),
      })
      if (data.ok) {
        setSubmitOk(data)
        setSelectedQuote(null); setManualNombre(''); setManualEmail('')
        setManualTelefono(''); setManualDireccion('')
        setFecha(''); setHoraInicio('09:00'); setHoraFin('12:00'); setNotas('')
        setUseManual(false)
        loadInstallations()
      } else { setSubmitErr(data.error || 'Error') }
    } catch (err) { setSubmitErr(err.message) }
    finally { setSubmitting(false) }
  }

  const upcoming = installations.filter(i => !i.end || new Date(i.end) >= new Date())
  const past     = installations.filter(i => i.end && new Date(i.end) < new Date())

  return (
    <div>
      {reagendarInst && (
        <ModalReagendar inst={reagendarInst} onClose={() => setReagendarInst(null)} onSaved={loadInstallations} />
      )}

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <h2 style={styles.sectionTitle}>Instalaciones</h2>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => setView('calendar')} style={{ ...styles.tab, ...(view==='calendar' ? styles.tabActive : {}) }}>Calendario</button>
          <button onClick={() => setView('list')}     style={{ ...styles.tab, ...(view==='list'     ? styles.tabActive : {}) }}>Lista</button>
          <button onClick={loadInstallations} style={styles.btnSecondary}>Actualizar</button>
        </div>
      </div>

      {/* Vista Calendario */}
      {view === 'calendar' && !loadingList && (
        <div style={{ marginBottom:20 }}>
          <CalendarioSemanal installations={installations} onReagendar={setReagendarInst} />
        </div>
      )}

      {/* Formulario nueva instalación */}
      <div style={{ ...styles.card, marginBottom:20 }}>
        <div style={styles.cardLabel}>Agendar nueva instalacion</div>

        <div style={{ marginBottom:16 }}>
          <div style={{ display:'flex', gap:10, marginBottom:10 }}>
            <button type="button" onClick={() => setUseManual(false)}
              style={{ ...styles.tab, ...(useManual ? {} : styles.tabActive), fontSize:12, padding:'5px 12px' }}>
              Desde cotizacion confirmada
            </button>
            <button type="button" onClick={() => setUseManual(true)}
              style={{ ...styles.tab, ...(useManual ? styles.tabActive : {}), fontSize:12, padding:'5px 12px' }}>
              Ingreso manual
            </button>
          </div>

          {!useManual && (
            confirmedQuotes.length === 0
              ? <p style={{ color:C.textMuted, fontSize:13, margin:0 }}>No hay cotizaciones confirmadas aun.</p>
              : <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {confirmedQuotes.map(q => (
                    <button key={q.cotNum} type="button"
                      onClick={() => setSelectedQuote(selectedQuote?.cotNum===q.cotNum ? null : q)}
                      style={{
                        padding:'8px 14px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer',
                        border:'1.5px solid '+(selectedQuote?.cotNum===q.cotNum ? C.orange : C.border),
                        background:selectedQuote?.cotNum===q.cotNum ? C.orangeLight : C.surface,
                        color:selectedQuote?.cotNum===q.cotNum ? C.orangeDark : C.textSub, transition:'all .15s',
                      }}>
                      {q.nombre} N°{q.cotNum}
                    </button>
                  ))}
                </div>
          )}

          {!useManual && selectedQuote && (
            <div style={{ marginTop:10, padding:'10px 14px', background:C.orangeLight, borderRadius:8, fontSize:13, color:C.textSub }}>
              {selectedQuote.email    && <span style={{ marginRight:16 }}>{selectedQuote.email}</span>}
              {selectedQuote.telefono && <span style={{ marginRight:16 }}>{selectedQuote.telefono}</span>}
              {selectedQuote.total    && <span style={{ fontWeight:700, color:C.orangeDark }}>${Number(selectedQuote.total).toLocaleString('es-CL')}</span>}
            </div>
          )}

          {useManual && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                { label:'Nombre',    val:manualNombre,    set:setManualNombre,    placeholder:'Nombre completo',         full:true },
                { label:'Email',     val:manualEmail,     set:setManualEmail,     placeholder:'correo@ejemplo.com' },
                { label:'Telefono',  val:manualTelefono,  set:setManualTelefono,  placeholder:'+56 9 XXXX XXXX' },
                { label:'Direccion', val:manualDireccion, set:setManualDireccion, placeholder:'Direccion',               full:true },
              ].map(({ label, val, set, placeholder, full }) => (
                <div key={label} style={{ gridColumn:full ? '1 / -1' : undefined }}>
                  <label style={{ ...styles.detailLabel, display:'block', marginBottom:4 }}>{label}</label>
                  <input value={val} onChange={e => set(e.target.value)} placeholder={placeholder}
                    style={{ ...styles.input, fontSize:13, padding:'8px 10px' }} />
                </div>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleAgendar}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <label style={{ ...styles.detailLabel, display:'block', marginBottom:4 }}>Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} required
                style={{ ...styles.input, fontSize:13, padding:'8px 10px' }} />
            </div>
            <div>
              <label style={{ ...styles.detailLabel, display:'block', marginBottom:4 }}>Hora inicio</label>
              <input type="time" value={horaInicio} onChange={e => handleInicioChange(e.target.value)} required
                style={{ ...styles.input, fontSize:13, padding:'8px 10px' }} />
            </div>
            <div>
              <label style={{ ...styles.detailLabel, display:'block', marginBottom:4 }}>Hora fin</label>
              <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} required
                style={{ ...styles.input, fontSize:13, padding:'8px 10px' }} />
            </div>
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={{ ...styles.detailLabel, display:'block', marginBottom:4 }}>Notas (opcional)</label>
            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: llevar taladro, piso de madera"
              style={{ ...styles.input, fontSize:13, padding:'8px 10px' }} />
          </div>

          {submitErr && <div style={{ ...styles.errorBox, marginBottom:12 }}>{submitErr}</div>}
          {submitOk  && (
            <div style={{ background:'#d1fae5', border:'1px solid #6ee7b7', borderRadius:8, padding:'12px 16px', marginBottom:12, fontSize:13, color:'#065f46' }}>
              Instalacion agendada.{' '}
              {submitOk.link && <a href={submitOk.link} target="_blank" rel="noreferrer" style={{ color:'#065f46', fontWeight:700 }}>Ver en Calendar</a>}
            </div>
          )}

          <button type="submit" disabled={submitting || (!useManual && !selectedQuote)}
            style={{ ...styles.btnPrimary, padding:'12px 24px', fontSize:14, borderRadius:10, opacity:(submitting || (!useManual && !selectedQuote)) ? .6 : 1 }}>
            {submitting ? 'Agendando...' : 'Agendar en Calendar'}
          </button>
        </form>
      </div>

      {/* Lista */}
      {view === 'list' && (
        <>
          {loadingList && <div style={styles.empty}>Cargando...</div>}
          {listError   && <div style={styles.errorBox}>{listError}</div>}
          {!loadingList && !listError && (
            <>
              {upcoming.length > 0 && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.green, textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>Proximas ({upcoming.length})</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {upcoming.map(i => (
                      <div key={i.id} style={{ ...styles.card, borderLeft:'3px solid '+C.orange }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
                          <div>
                            <div style={{ fontWeight:700, fontSize:14, color:C.text, marginBottom:3 }}>{i.nombre}</div>
                            <div style={{ fontSize:13, color:C.textSub }}>{fmtDateLocal(i.start)}</div>
                            <div style={{ fontSize:13, color:C.textMuted }}>{fmtTime(i.start)} – {fmtTime(i.end)}</div>
                          </div>
                          <button onClick={() => setReagendarInst(i)} style={{ ...styles.btnSecondary, fontSize:12, padding:'6px 14px' }}>Reagendar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {past.length > 0 && (
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:C.textMuted, textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>Realizadas ({past.length})</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {past.map(i => (
                      <div key={i.id} style={{ ...styles.card, opacity:.7, borderLeft:'3px solid #ddd' }}>
                        <div style={{ fontWeight:700, fontSize:14, color:C.text, marginBottom:3 }}>{i.nombre}</div>
                        <div style={{ fontSize:13, color:C.textSub }}>{fmtDateLocal(i.start)}</div>
                        <div style={{ fontSize:13, color:C.textMuted }}>{fmtTime(i.start)} – {fmtTime(i.end)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {upcoming.length === 0 && past.length === 0 && (
                <div style={styles.empty}>No hay instalaciones agendadas aun.</div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

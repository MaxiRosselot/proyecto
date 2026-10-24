import React, { useEffect, useMemo, useState } from 'react'
import { WHATSAPP } from '../netlify/functions/lib/marca.mjs'
import { COMUNAS } from '../netlify/functions/lib/zonas.mjs'

const CONFIG = {
  timezone: 'America/Santiago',
  business: { name: 'Repisas Don Maxi', notifyPhone: WHATSAPP },
  logoUrl: '/logo.png',
  endpoints: {
    horarios: '/.netlify/functions/horarios',
    // Dias y horas segun la comuna del cliente (para no cruzar Santiago entre visitas).
    porZona: '/.netlify/functions/visitas-zona',
    availability: '/.netlify/functions/get-availability',
    createEvent: '/.netlify/functions/create_event',
  }
}

// ---------- Utils ----------
function parseLocalDate(iso){ const [y,m,d]=iso.split('-').map(Number); return new Date(y,(m??1)-1,d??1) }
function prettyDate(date){ return new Intl.DateTimeFormat('es-CL',{dateStyle:'full'}).format(date) }
function encode(data){ return new URLSearchParams(data).toString() }

const OTRA_COMUNA = 'Otra (fuera de Santiago)'

export default function App(){
  // Primero la direccion: con la comuna se ofrecen las horas que calzan con las visitas de ese dia.
  const [ubicacion, setUbicacion] = useState({ calle: '', comuna: '' })
  const [ubicacionLista, setUbicacionLista] = useState(false)
  // Dias y horas los define el admin (seccion Horarios); el servidor los entrega ya calculados.
  const [dias, setDias] = useState(null) // null = cargando
  const [diasError, setDiasError] = useState('')
  const [selectedDateISO,setSelectedDateISO]=useState('')
  const [selectedSlot,setSelectedSlot]=useState('')
  const [availability, setAvailability] = useState(null) // null = aún no cargado
  const [loadingAvail, setLoadingAvail] = useState(false)
  const [availError, setAvailError] = useState('')

  const [form,setForm]=useState({nombre:'',apellido:'',email:'',celular:'',direccion:'',comentarios:''})
  const [submitting,setSubmitting]=useState(false)
  const [toast,setToast]=useState({ type:'', msg:'' })

  useEffect(() => {
    if (!ubicacionLista) return
    setDias(null); setDiasError(''); setSelectedDateISO(''); setSelectedSlot('')
    const comuna = ubicacion.comuna === OTRA_COMUNA ? '' : ubicacion.comuna
    fetch(`${CONFIG.endpoints.porZona}?comuna=${encodeURIComponent(comuna)}&v=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data?.ok && Array.isArray(data.dias)) setDias(data.dias)
        else throw new Error()
      })
      // Si falla, las horas de siempre (sin agrupar por zona).
      .catch(() => fetch(`${CONFIG.endpoints.horarios}?v=${Date.now()}`, { cache: 'no-store' }).then(r => r.json())
        .then(data => setDias(data?.ok ? data.dias.map(d => ({ fecha: d.fecha, horas: d.horas.map(hora => ({ hora })) })) : []))
        .catch(() => { setDias([]); setDiasError('No se pudieron cargar las fechas disponibles.') }))
  }, [ubicacionLista, ubicacion.comuna])
  const diaElegido = useMemo(() => dias?.find(d => d.fecha === selectedDateISO), [dias, selectedDateISO])
  const baseSlots = useMemo(() => diaElegido?.horas.map(h => h.hora) || [], [diaElegido])
  const recomendadas = useMemo(() => new Set(diaElegido?.horas.filter(h => h.recomendada).map(h => h.hora) || []), [diaElegido])
  const selectedDate = useMemo(()=>selectedDateISO?parseLocalDate(selectedDateISO):null,[selectedDateISO])

  const step = useMemo(()=> !ubicacionLista ? 1 : selectedSlot ? 3 : 2, [ubicacionLista, selectedSlot])
  useEffect(()=>{
    const el = document.getElementById('progress-bar')
    if(!el) return
    el.style.width = step === 1 ? '33%' : step === 2 ? '66%' : '100%'
  },[step])

  const canSubmit = Boolean(
    selectedDateISO && selectedSlot &&
    form.nombre.trim() && form.apellido.trim() &&
    /^\S+@\S+\.\S+$/.test(form.email.trim()) &&
    form.celular.trim() && ubicacion.calle.trim()
  )
  const direccionCompleta = [ubicacion.calle.trim(), ubicacion.comuna && ubicacion.comuna !== OTRA_COMUNA ? ubicacion.comuna : ''].filter(Boolean).join(', ')

  // ----------- DISPONIBILIDAD -----------
  useEffect(() => {
    if (!selectedDateISO || baseSlots.length === 0) return
    const controller = new AbortController()
    setLoadingAvail(true)
    setAvailError('')
    setAvailability(null)
    setSelectedSlot('')

    const params = new URLSearchParams({
      date: selectedDateISO,
      tz: CONFIG.timezone,
      mode: 'created-only',
      slots: baseSlots.join(',')
    })

    const url = `${CONFIG.endpoints.availability}?${params.toString()}&v=${Date.now()}`
    fetch(url, { signal: controller.signal, cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data?.ok && data.availability) {
          setAvailability(data.availability)
        } else {
          setAvailError('No se pudo cargar la disponibilidad.')
          setAvailability({})
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          setAvailError('Error al obtener la disponibilidad.')
          setAvailability({})
        }
      })
      .finally(() => setLoadingAvail(false))

    return () => controller.abort()
  }, [selectedDateISO, baseSlots])

  // ----------- ENVÍO DE FORMULARIO -----------
  async function handleSubmit(e){
    e.preventDefault()
    if(!canSubmit || submitting || loadingAvail) return
    setSubmitting(true)
    setToast({ type:'', msg:'' })

    try{
      // Revalida el slot antes de enviar
      const checkParams = new URLSearchParams({
        date: selectedDateISO, tz: CONFIG.timezone, mode: 'created-only', slots: selectedSlot
      })
      const check = await fetch(`${CONFIG.endpoints.availability}?${checkParams}&v=${Date.now()}`, { cache:'no-store' })
      const j = await check.json()
      if (!j?.ok || j.availability?.[selectedSlot] !== true) {
        throw new Error('El horario seleccionado ya no está disponible.')
      }

      // 1) Google Calendar
      const r2 = await fetch(CONFIG.endpoints.createEvent,{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          nombre:form.nombre, apellido:form.apellido, email:form.email, celular:form.celular,
          direccion: ubicacion.calle.trim(), comuna: ubicacion.comuna === OTRA_COMUNA ? '' : ubicacion.comuna,
          fechaISO:selectedDateISO, horaHHmm:selectedSlot, tz:CONFIG.timezone, note:form.comentarios
        })
      })
      if(!r2.ok){
        const detail = await r2.text().catch(()=> '')
        throw new Error('No se pudo crear el evento en Calendar. '+detail)
      }

      // 2) Netlify Forms (solo si Calendar fue OK)
      const payload = {
        'form-name':'agendador','bot-field':'',
        nombre:form.nombre,apellido:form.apellido,email:form.email,celular:form.celular,
        direccion:direccionCompleta,comentarios:form.comentarios,
        fecha:selectedDateISO,hora:selectedSlot,tz:CONFIG.timezone
      }
      await fetch('/',{
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:encode(payload)
      }).catch(()=> console.warn('Netlify Forms falló, pero Calendar fue OK'))

      // 3) Redirección — pasamos todos los datos del cliente en la URL
      const qs = new URLSearchParams({
        date: selectedDateISO,
        time: selectedSlot,
        email: form.email,
        nombre: form.nombre,
        apellido: form.apellido,
        celular: form.celular,
        direccion: direccionCompleta,
        ...(form.comentarios ? { comentarios: form.comentarios } : {})
      })
      const confirmUrl = `${window.location.origin}/confirm.html?${qs.toString()}`
      window.location.replace(confirmUrl)
      setToast({ type:'ok', msg:'¡Agendado! Redirigiendo…' })
    }catch(err){
      console.error(err)
      setToast({ type:'err', msg: err.message || 'Ocurrió un error al agendar.' })
    }finally{ setSubmitting(false) }
  }

  return (
    <div role="application" aria-label="Agendador de visitas">
      {/* DIRECCION: primero, para ofrecer horas cerca de otras visitas de la zona */}
      <section aria-labelledby="tit-donde">
        <h2 id="tit-donde" className="section-title">📍 ¿Dónde es la visita?</h2>
        {ubicacionLista ? (
          <p className="note" style={{ fontSize: 14 }}>
            <strong>{direccionCompleta}</strong>{' '}
            <button type="button" className="link-btn" onClick={() => setUbicacionLista(false)}>Cambiar</button>
          </p>
        ) : (
          <form onSubmit={e => { e.preventDefault(); if (ubicacion.calle.trim() && ubicacion.comuna) setUbicacionLista(true) }}>
            <div className="grid">
              <div><label htmlFor="v-calle">Dirección</label><input id="v-calle" autoComplete="street-address" placeholder="Calle, número y depto" value={ubicacion.calle} onChange={e => setUbicacion({ ...ubicacion, calle: e.target.value })} required /></div>
              <div><label htmlFor="v-comuna">Comuna</label>
                <select id="v-comuna" value={ubicacion.comuna} onChange={e => setUbicacion({ ...ubicacion, comuna: e.target.value })} required>
                  <option value="">Elige tu comuna</option>
                  {COMUNAS.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value={OTRA_COMUNA}>{OTRA_COMUNA}</option>
                </select>
              </div>
            </div>
            <button className="btn" type="submit" style={{ marginTop: 12 }} disabled={!ubicacion.calle.trim() || !ubicacion.comuna}>Ver días y horarios</button>
            <p className="note">Te mostramos los horarios en que ya estaremos cerca de tu casa.</p>
          </form>
        )}
      </section>

      {ubicacionLista && <>
      {/* FECHAS */}
      <section aria-labelledby="tit-fechas">
        <h2 id="tit-fechas" className="section-title">📅 Fechas disponibles</h2>
        {dias === null && <p className="note">Cargando fechas…</p>}
        {diasError && <p className="note" role="alert" style={{ color:'#b91c1c' }}>{diasError}</p>}
        {dias?.length === 0 && !diasError && (
          <p className="note">
            Por ahora no hay fechas disponibles para agendar. Escríbenos por WhatsApp al{' '}
            <a href={`https://wa.me/${CONFIG.business.notifyPhone.replace(/\D/g,'')}`}>{CONFIG.business.notifyPhone}</a>{' '}
            y coordinamos.
          </p>
        )}
        {dias?.some(d => d.recomendado) && <p className="note">⭐ Los días marcados ya tenemos visitas cerca de tu dirección.</p>}
        <div className="dates" role="listbox" aria-label="Seleccione una fecha">
          {(dias || []).map(({ fecha: date, recomendado })=> {
            const d = parseLocalDate(date)
            const label = new Intl.DateTimeFormat('es-CL',{ weekday:'long', day:'2-digit', month:'short' }).format(d)
            const active = selectedDateISO===date
            return (
              <button
                key={date}
                type="button"
                className={`date-btn ${active?'active':''} ${recomendado?'cerca':''}`}
                aria-pressed={active}
                onClick={()=> setSelectedDateISO(date)}
              >{recomendado ? '⭐ ' : ''}{label}</button>
            )
          })}
        </div>
      </section>

      {/* HORARIOS */}
      {selectedDate && (
        <section aria-labelledby="tit-horas" style={{ marginTop: 8 }}>
          <h2 id="tit-horas" className="section-title">
            ⏰ Horarios para {prettyDate(selectedDate)}
            {loadingAvail ? ' — verificando…' : ''}
          </h2>

          {availError && (
            <p className="note" role="alert" style={{ color:'#b91c1c' }}>
              {availError}
            </p>
          )}

          <div
            className="slots"
            role="listbox"
            aria-label="Seleccione un horario"
            aria-busy={loadingAvail ? 'true' : 'false'}
            style={loadingAvail ? { opacity:.6, pointerEvents:'none', cursor:'progress' } : {}}
          >
            {baseSlots.map(slot=>{
              const isFree = availability?.[slot] === true
              const active = selectedSlot===slot
              const disabled = loadingAvail || !isFree || !!availError
              return (
                <button
                  key={slot}
                  type="button"
                  className={`slot ${active?'active':''} ${recomendadas.has(slot)?'cerca':''}`}
                  aria-pressed={active}
                  aria-disabled={disabled}
                  disabled={disabled}
                  onClick={()=> !disabled && setSelectedSlot(slot)}
                  title={loadingAvail ? 'Verificando…' : (isFree ? (recomendadas.has(slot) ? 'Recomendada: ya estaremos cerca' : 'Disponible') : 'No disponible')}
                >
                  {recomendadas.has(slot) ? '⭐ ' : ''}{slot}
                </button>
              )
            })}
          </div>

          {recomendadas.size > 0 && <p className="note">⭐ Horarios recomendados: ese día ya estaremos cerca de tu dirección.</p>}
          {selectedSlot && !loadingAvail && (
            <p className="note" aria-live="polite" style={{ marginTop: 8 }}>
              Seleccionaste <strong>{prettyDate(selectedDate)}</strong> a las <strong>{selectedSlot}</strong>.
            </p>
          )}
        </section>
      )}

      {/* FORMULARIO */}
      {selectedSlot && !loadingAvail && (
        <section aria-labelledby="tit-datos" style={{ marginTop: 10 }}>
          <h2 id="tit-datos" className="section-title">🧾 Tus datos</h2>
          <form onSubmit={handleSubmit} noValidate>
            <div className="grid">
              <div><label>Nombre</label><input value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} required /></div>
              <div><label>Apellido</label><input value={form.apellido} onChange={e=>setForm({...form,apellido:e.target.value})} required /></div>
              <div><label>Correo</label><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required /></div>
              <div><label>Celular</label><input type="tel" value={form.celular} onChange={e=>setForm({...form,celular:e.target.value})} required /></div>
              <div><label>Comentarios</label><input value={form.comentarios} onChange={e=>setForm({...form,comentarios:e.target.value})} placeholder="Opcional" /></div>
            </div>

            <div style={{ marginTop: 14 }}>
              <button
                className="btn"
                type="submit"
                disabled={!canSubmit || submitting || loadingAvail}
                aria-busy={submitting ? 'true' : 'false'}
              >
                {submitting ? 'Agendando…' : 'Agendar visita (15 min)'}
              </button>
              <p className="note">
                Al agendar recibirás una invitación directamente en tu correo.
                Por favor asegúrate de haberlo escrito correctamente.
              </p>
            </div>

            {toast.type==='ok' && (<div className="toast ok" role="status">✅ {toast.msg}</div>)}
            {toast.type==='err' && (<div className="toast err" role="alert">❌ {toast.msg}</div>)}
          </form>
        </section>
      )}

      </>}

      <footer style={{ textAlign:'center', marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
        Zona horaria: {CONFIG.timezone}
      </footer>
    </div>
  )
}

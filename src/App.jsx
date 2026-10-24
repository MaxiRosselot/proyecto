import React, { useEffect, useMemo, useState } from 'react'
import { WHATSAPP } from '../netlify/functions/lib/marca.mjs'
import DireccionVisita, { OTRA_COMUNA } from './DireccionVisita.jsx'

const CONFIG = {
  timezone: 'America/Santiago',
  business: { name: 'Repisas Don Maxi', notifyPhone: WHATSAPP },
  logoUrl: '/logo.png',
  endpoints: {
    // Dias y rangos (8–11, 11–14, 14–17, 17–20) con cupo, segun Admin → Horarios.
    rangos: '/.netlify/functions/visitas-rangos',
    createEvent: '/.netlify/functions/create_event',
  }
}

// ---------- Utils ----------
function parseLocalDate(iso){ const [y,m,d]=iso.split('-').map(Number); return new Date(y,(m??1)-1,d??1) }
function prettyDate(date){ return new Intl.DateTimeFormat('es-CL',{dateStyle:'full'}).format(date) }
function encode(data){ return new URLSearchParams(data).toString() }
const textoRango = r => `${r.desde} a ${r.hasta}`

export default function App(){
  // Primero la direccion (con autocompletado de Google si hay clave), despues el dia y el rango:
  // la hora exacta sale de la ruta del dia y se le avisa al cliente el dia anterior.
  const [ubicacion, setUbicacion] = useState({ calle: '', depto: '', comuna: '', verificada: false })
  const [ubicacionLista, setUbicacionLista] = useState(false)
  const [dias, setDias] = useState(null) // null = cargando
  const [diasError, setDiasError] = useState('')
  const [selectedDateISO,setSelectedDateISO]=useState('')
  const [rango,setRango]=useState(null)

  const [form,setForm]=useState({nombre:'',apellido:'',email:'',celular:'',comentarios:''})
  const [submitting,setSubmitting]=useState(false)
  const [toast,setToast]=useState({ type:'', msg:'' })

  function cargarDias() {
    setDias(null); setDiasError(''); setSelectedDateISO(''); setRango(null)
    fetch(`${CONFIG.endpoints.rangos}?v=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => { if (data?.ok && Array.isArray(data.dias)) setDias(data.dias); else throw new Error() })
      .catch(() => { setDias([]); setDiasError('No se pudieron cargar las fechas disponibles.') })
  }
  useEffect(() => { if (ubicacionLista) cargarDias() }, [ubicacionLista])
  const diaElegido = useMemo(() => dias?.find(d => d.fecha === selectedDateISO), [dias, selectedDateISO])
  const selectedDate = useMemo(()=>selectedDateISO?parseLocalDate(selectedDateISO):null,[selectedDateISO])

  const step = useMemo(()=> !ubicacionLista ? 1 : rango ? 3 : 2, [ubicacionLista, rango])
  useEffect(()=>{
    const el = document.getElementById('progress-bar')
    if(!el) return
    el.style.width = step === 1 ? '33%' : step === 2 ? '66%' : '100%'
  },[step])

  const canSubmit = Boolean(
    selectedDateISO && rango &&
    form.nombre.trim() && form.apellido.trim() &&
    /^\S+@\S+\.\S+$/.test(form.email.trim()) &&
    form.celular.trim() && ubicacion.calle.trim()
  )
  const comuna = ubicacion.comuna === OTRA_COMUNA ? '' : ubicacion.comuna
  const direccionCompleta = [[ubicacion.calle.trim(), comuna].filter(Boolean).join(', '), ubicacion.depto.trim()].filter(Boolean).join(' · ')

  // ----------- ENVÍO DE FORMULARIO -----------
  async function handleSubmit(e){
    e.preventDefault()
    if(!canSubmit || submitting) return
    setSubmitting(true)
    setToast({ type:'', msg:'' })

    try{
      // 1) Google Calendar (el servidor revisa que el rango siga con cupo)
      const r2 = await fetch(CONFIG.endpoints.createEvent,{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          nombre:form.nombre, apellido:form.apellido, email:form.email, celular:form.celular,
          direccion: ubicacion.calle.trim(), depto: ubicacion.depto.trim(), comuna,
          ...(ubicacion.verificada ? { lat: ubicacion.lat, lng: ubicacion.lng } : {}),
          fechaISO:selectedDateISO, rango:rango.desde, note:form.comentarios
        })
      })
      if(!r2.ok){
        const j = await r2.json().catch(()=> ({}))
        if (r2.status === 409) cargarDias()
        throw new Error(j.message || j.error || 'No se pudo agendar la visita.')
      }

      // 2) Netlify Forms (solo si Calendar fue OK)
      const payload = {
        'form-name':'agendador','bot-field':'',
        nombre:form.nombre,apellido:form.apellido,email:form.email,celular:form.celular,
        direccion:direccionCompleta,comentarios:form.comentarios,
        fecha:selectedDateISO,hora:`${rango.desde}-${rango.hasta}`,tz:CONFIG.timezone
      }
      await fetch('/',{
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:encode(payload)
      }).catch(()=> console.warn('Netlify Forms falló, pero Calendar fue OK'))

      // 3) Redirección — pasamos todos los datos del cliente en la URL
      const qs = new URLSearchParams({
        date: selectedDateISO,
        time: rango.desde,
        hasta: rango.hasta,
        email: form.email,
        nombre: form.nombre,
        apellido: form.apellido,
        celular: form.celular,
        direccion: direccionCompleta,
        ...(form.comentarios ? { comentarios: form.comentarios } : {})
      })
      window.location.replace(`${window.location.origin}/confirm.html?${qs.toString()}`)
      setToast({ type:'ok', msg:'¡Agendado! Redirigiendo…' })
    }catch(err){
      console.error(err)
      setToast({ type:'err', msg: err.message || 'Ocurrió un error al agendar.' })
    }finally{ setSubmitting(false) }
  }

  return (
    <div role="application" aria-label="Agendador de visitas">
      {/* DIRECCION */}
      <section aria-labelledby="tit-donde">
        <h2 id="tit-donde" className="section-title">📍 ¿Dónde es la visita?</h2>
        {ubicacionLista ? (
          <p className="note" style={{ fontSize: 14 }}>
            <strong>{direccionCompleta}</strong>{' '}
            <button type="button" className="link-btn" onClick={() => setUbicacionLista(false)}>Cambiar</button>
          </p>
        ) : (
          <DireccionVisita valor={ubicacion} onChange={setUbicacion} onListo={() => setUbicacionLista(true)} />
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
        <div className="dates" role="listbox" aria-label="Seleccione una fecha">
          {(dias || []).map(({ fecha: date })=> {
            const label = new Intl.DateTimeFormat('es-CL',{ weekday:'long', day:'2-digit', month:'short' }).format(parseLocalDate(date))
            const active = selectedDateISO===date
            return (
              <button key={date} type="button" className={`date-btn ${active?'active':''}`} aria-pressed={active}
                onClick={()=> { setSelectedDateISO(date); setRango(null) }}>{label}</button>
            )
          })}
        </div>
      </section>

      {/* RANGOS */}
      {selectedDate && diaElegido && (
        <section aria-labelledby="tit-horas" style={{ marginTop: 8 }}>
          <h2 id="tit-horas" className="section-title">⏰ ¿En qué horario te acomoda? · {prettyDate(selectedDate)}</h2>
          <div className="slots rangos" role="listbox" aria-label="Seleccione un rango horario">
            {diaElegido.rangos.map(r => {
              const active = rango?.desde === r.desde
              return (
                <button key={r.desde} type="button" className={`slot ${active?'active':''}`} aria-pressed={active} onClick={()=> setRango(r)}>
                  {textoRango(r)}
                  {r.libres <= 2 && <small>{r.libres === 1 ? 'Último cupo' : 'Últimos cupos'}</small>}
                </button>
              )
            })}
          </div>
          <p className="note">La visita dura unos 15 minutos. El día anterior te confirmamos por WhatsApp la hora exacta de llegada dentro de ese horario, según la ruta del día.</p>
        </section>
      )}

      {/* FORMULARIO */}
      {rango && (
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
              <button className="btn" type="submit" disabled={!canSubmit || submitting} aria-busy={submitting ? 'true' : 'false'}>
                {submitting ? 'Agendando…' : `Agendar visita · ${textoRango(rango)}`}
              </button>
              <p className="note">
                Al agendar recibirás una invitación en tu correo con el horario elegido.
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

import React, { useEffect, useMemo, useState } from 'react'
import { C, apiFetch, styles } from './utils.js'
import {
  DIAS, PASO_MIN, MAX_SEMANAS, ahoraEnZona, aHHMM, diaSemana, diasDisponibles, rangosDelDia, validarHorario,
} from '../../netlify/functions/lib/horarios.mjs'

// Horas que se pueden elegir en los selectores: de 06:00 a 23:00, cada media hora.
const HORAS = Array.from({ length: (23 - 6) * 60 / PASO_MIN + 1 }, (_, i) => aHHMM(6 * 60 + i * PASO_MIN))
// La semana parte el lunes, como en el calendario chileno.
const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0]
const RANGO_NUEVO = { desde: '10:00', hasta: '14:00' }

const capitalizar = s => s.charAt(0).toUpperCase() + s.slice(1)
function fechaLarga(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return capitalizar(new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d))))
}
const textoRangos = rangos => rangos.map(r => `${r.desde}–${r.hasta}`).join(', ')

function EditorRangos({ rangos, onChange }) {
  const sel = { padding: '6px 8px', border: '1.5px solid ' + C.border, borderRadius: 7, fontSize: 13, fontFamily: 'inherit', background: '#FAFAFA' }
  const cambiar = (i, campo, valor) => onChange(rangos.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rangos.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <select aria-label="Desde" value={r.desde} onChange={e => cambiar(i, 'desde', e.target.value)} style={sel}>
            {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <span style={{ color: C.textMuted, fontSize: 13 }}>a</span>
          <select aria-label="Hasta" value={r.hasta} onChange={e => cambiar(i, 'hasta', e.target.value)} style={sel}>
            {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <button type="button" aria-label="Quitar rango" onClick={() => onChange(rangos.filter((_, j) => j !== i))}
            style={{ background: 'none', border: '1.5px solid ' + C.border, borderRadius: 6, width: 28, height: 28, cursor: 'pointer', color: C.textMuted }}>x</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rangos, { ...RANGO_NUEVO }])}
        style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: C.orange, cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: 0 }}>
        + Agregar rango
      </button>
    </div>
  )
}

export default function HorariosSection() {
  const [config, setConfig]     = useState(null)
  const [guardado, setGuardado] = useState(null)   // ultima version guardada, para saber si hay cambios
  const [error, setError]       = useState('')
  const [mensaje, setMensaje]   = useState('')
  const [guardando, setGuardando] = useState(false)
  const [nuevaFecha, setNuevaFecha] = useState('')
  const hoy = ahoraEnZona().fecha

  async function cargar() {
    setError('')
    try {
      const res = await apiFetch('/.netlify/functions/horarios?config=1')
      if (!res.ok) throw new Error(res.error || 'No se pudieron cargar los horarios')
      setConfig(res.config); setGuardado(JSON.stringify(res.config))
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { cargar() }, [])

  // Vista previa con la misma funcion que usa el servidor para la pagina publica.
  const { previa, invalido } = useMemo(() => {
    if (!config) return { previa: [], invalido: '' }
    try { return { previa: diasDisponibles(validarHorario(config, hoy)), invalido: '' } }
    catch (e) { return { previa: [], invalido: e.message } }
  }, [config, hoy])

  if (!config) return (
    <div>
      <h2 style={{ ...styles.sectionTitle, marginBottom: 24 }}>Horarios de visitas</h2>
      {error ? <div style={styles.errorBox}>{error}</div> : <div style={styles.empty}>Cargando horarios...</div>}
    </div>
  )

  const hayCambios = JSON.stringify(config) !== guardado
  const setSemanal = (d, rangos) => setConfig(c => ({ ...c, semanal: { ...c.semanal, [d]: rangos } }))
  const setFecha = (f, rangos) => setConfig(c => ({ ...c, fechas: { ...c.fechas, [f]: rangos } }))
  const quitarFecha = f => setConfig(c => { const fechas = { ...c.fechas }; delete fechas[f]; return { ...c, fechas } })
  const fechas = Object.keys(config.fechas).filter(f => f >= hoy).sort()

  function agregarFecha(abrir) {
    if (!nuevaFecha || nuevaFecha < hoy) return
    // Al abrir, se parte del horario semanal de ese dia si tiene; si no, un rango de ejemplo.
    const base = config.semanal[diaSemana(nuevaFecha)]
    setFecha(nuevaFecha, abrir ? (base?.length ? base.map(r => ({ ...r })) : [{ ...RANGO_NUEVO }]) : [])
    setNuevaFecha('')
  }

  async function guardar() {
    setGuardando(true); setError(''); setMensaje('')
    try {
      const res = await apiFetch('/.netlify/functions/horarios', { method: 'POST', body: JSON.stringify(config) })
      if (!res.ok) throw new Error(res.error || 'No se pudo guardar')
      setConfig(res.config); setGuardado(JSON.stringify(res.config))
      setMensaje(`Horarios guardados. Los clientes ya ven ${res.dias.length} ${res.dias.length === 1 ? 'fecha disponible' : 'fechas disponibles'}.`)
    } catch (e) { setError(e.message) }
    finally { setGuardando(false) }
  }

  const fila = { display: 'grid', gridTemplateColumns: '130px 1fr', gap: 12, alignItems: 'start', padding: '12px 0', borderTop: '1px solid ' + C.border }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 10, flexWrap: 'wrap' }}>
        <h2 style={styles.sectionTitle}>Horarios de visitas</h2>
        <button onClick={guardar} disabled={!hayCambios || guardando || Boolean(invalido)}
          style={{ ...styles.btnPrimary, opacity: !hayCambios || guardando || invalido ? .55 : 1 }}>
          {guardando ? 'Guardando...' : hayCambios ? 'Guardar cambios' : 'Sin cambios'}
        </button>
      </div>
      <p style={{ color: C.textSub, fontSize: 13, marginTop: 0, marginBottom: 20 }}>
        Define cuándo pueden agendar los clientes. Las visitas parten cada {PASO_MIN} minutos dentro de cada rango.
        Las visitas ya agendadas no se borran al cambiar el horario.
      </p>

      {error    && <div style={styles.errorBox}>{error}</div>}
      {invalido && <div style={styles.errorBox}>{invalido}</div>}
      {mensaje  && <div role="status" style={{ ...styles.errorBox, background: '#ECFDF5', borderColor: '#A7F3D0', color: '#047857' }}>{mensaje}</div>}

      {/* Semanal */}
      <div style={{ ...styles.card, marginBottom: 14 }}>
        <div style={styles.cardLabel}>Horario semanal</div>
        <p style={{ fontSize: 12, color: C.textMuted, marginTop: -6 }}>Se repite todas las semanas. Un día sin rangos queda cerrado.</p>
        {ORDEN_SEMANA.map(d => {
          const rangos = config.semanal[d] || []
          return (
            <div key={d} data-dia={d} style={fila}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, paddingTop: 4 }}>
                <input type="checkbox" checked={rangos.length > 0}
                  onChange={e => setSemanal(d, e.target.checked ? [{ ...RANGO_NUEVO }] : [])} />
                {capitalizar(DIAS[d])}
              </label>
              {rangos.length
                ? <EditorRangos rangos={rangos} onChange={r => setSemanal(d, r)} />
                : <span style={{ fontSize: 13, color: C.textMuted, paddingTop: 6 }}>Cerrado</span>}
            </div>
          )
        })}
      </div>

      {/* Fechas especiales */}
      <div style={{ ...styles.card, marginBottom: 14 }}>
        <div style={styles.cardLabel}>Fechas especiales</div>
        <p style={{ fontSize: 12, color: C.textMuted, marginTop: -6 }}>
          Para un día puntual: abrir un sábado, cambiar el horario de un domingo o cerrar un día. Reemplaza al horario semanal ese día.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
          <input type="date" aria-label="Fecha especial" min={hoy} value={nuevaFecha} onChange={e => setNuevaFecha(e.target.value)}
            style={{ ...styles.input, width: 170, padding: '7px 10px', fontSize: 13 }} />
          <button type="button" disabled={!nuevaFecha} onClick={() => agregarFecha(true)} style={{ ...styles.btnSecondary, fontSize: 12 }}>Abrir con horario</button>
          <button type="button" disabled={!nuevaFecha} onClick={() => agregarFecha(false)} style={{ ...styles.btnSecondary, fontSize: 12 }}>Cerrar ese día</button>
        </div>
        {fechas.length === 0 && <div style={{ fontSize: 13, color: C.textMuted, padding: '8px 0' }}>No hay fechas especiales.</div>}
        {fechas.map(f => {
          const rangos = config.fechas[f]
          const semanal = config.semanal[diaSemana(f)] || []
          return (
            <div key={f} data-fecha={f} style={fila}>
              <div style={{ fontSize: 14, fontWeight: 600, paddingTop: 4 }}>
                {fechaLarga(f)}
                <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 400 }}>
                  Semanal: {semanal.length ? textoRangos(semanal) : 'cerrado'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                {rangos.length
                  ? <EditorRangos rangos={rangos} onChange={r => setFecha(f, r)} />
                  : <span style={styles.badge(C.red)}>Cerrado</span>}
                <button type="button" onClick={() => quitarFecha(f)}
                  style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  Quitar
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Alcance y vista previa */}
      <div style={{ ...styles.card, marginBottom: 14 }}>
        <div style={styles.cardLabel}>Lo que ven los clientes</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12 }}>
          Mostrar las próximas
          <select value={config.semanas} onChange={e => setConfig(c => ({ ...c, semanas: Number(e.target.value) }))}
            style={{ padding: '6px 8px', border: '1.5px solid ' + C.border, borderRadius: 7, fontSize: 13 }}>
            {Array.from({ length: MAX_SEMANAS }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          semanas
        </label>
        {previa.length === 0
          ? <div style={{ fontSize: 13, color: C.red }}>Con este horario los clientes no tienen ninguna fecha para agendar.</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {previa.map(d => (
                <div key={d.fecha} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '6px 0', borderTop: '1px solid ' + C.border }}>
                  <span style={{ fontWeight: 600 }}>{fechaLarga(d.fecha)}</span>
                  <span style={{ color: C.textSub }}>
                    {textoRangos(rangosDelDia(config, d.fecha))} · {d.horas.length} {d.horas.length === 1 ? 'horario' : 'horarios'}
                  </span>
                </div>
              ))}
            </div>}
        {hayCambios && previa.length > 0 && <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 0 }}>Vista previa: se aplica al guardar.</p>}
      </div>
    </div>
  )
}

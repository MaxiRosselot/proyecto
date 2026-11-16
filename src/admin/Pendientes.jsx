// Admin → Pendientes: las mejoras que se van haciendo con Claude. Cada pendiente tiene estado,
// prioridad, area, quien lo hace y una bitacora con lo que se fue haciendo. Datos: lib/pendientes.mjs.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AREAS, ESTADOS, PRIORIDADES, RESPONSABLES } from '../../netlify/functions/lib/pendientes.mjs'
import { C, apiFetch, styles } from './utils.js'

const URL = '/.netlify/functions/pendientes'
const COLUMNAS = [
  ['en-curso', 'En curso', '#2563EB'],
  ['por-hacer', 'Por hacer', C.orange],
  ['idea', 'Ideas', '#7C3AED'],
  ['hecho', 'Hecho', '#16A34A'],
]
const NOMBRE_ESTADO = Object.fromEntries(COLUMNAS.map(([k, n]) => [k, n]))
const COLOR_PRIORIDAD = { alta: '#DC2626', media: '#D97706', baja: '#9CA3AF' }
const ORDEN_PRIORIDAD = { alta: 0, media: 1, baja: 2 }
const fechaCorta = f => (f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : '')
const chip = (color, fondo) => ({ display: 'inline-block', padding: '1px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, color, background: fondo, whiteSpace: 'nowrap' })
const VACIO = { titulo: '', detalle: '', estado: 'por-hacer', prioridad: 'media', area: 'Panel', responsable: 'Claude' }

function Formulario({ inicial, onGuardar, onCancelar }) {
  const [p, setP] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const campo = (k, opciones, nombres = {}) => (
    <label style={{ fontSize: 12, fontWeight: 700, color: C.textSub, display: 'grid', gap: 4 }}>
      {k === 'responsable' ? 'Quién' : k[0].toUpperCase() + k.slice(1)}
      <select value={p[k]} onChange={e => setP({ ...p, [k]: e.target.value })} style={{ ...styles.input, padding: '7px 10px' }}>
        {opciones.map(o => <option key={o} value={o}>{nombres[o] || o}</option>)}
      </select>
    </label>
  )
  return (
    <form onSubmit={async e => { e.preventDefault(); setGuardando(true); try { await onGuardar(p) } finally { setGuardando(false) } }}
      style={{ ...styles.card, display: 'grid', gap: 10, marginBottom: 14 }}>
      <input autoFocus value={p.titulo} onChange={e => setP({ ...p, titulo: e.target.value })} placeholder="¿Qué hay que hacer?" aria-label="Título" style={styles.input} />
      <textarea value={p.detalle} onChange={e => setP({ ...p, detalle: e.target.value })} placeholder="Detalle (opcional)" aria-label="Detalle" rows={3} style={{ ...styles.input, resize: 'vertical', fontFamily: 'inherit' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {campo('estado', ESTADOS, NOMBRE_ESTADO)}{campo('prioridad', PRIORIDADES)}{campo('area', AREAS)}{campo('responsable', RESPONSABLES)}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancelar} style={styles.btnSecondary}>Cancelar</button>
        <button type="submit" disabled={!p.titulo.trim() || guardando} style={styles.btnPrimary}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}

function Detalle({ p, onNota, onEditar, onBorrar, onCerrar }) {
  const [nota, setNota] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const accion = async (f) => { setOcupado(true); try { await f() } finally { setOcupado(false) } }
  return (
    <div role="dialog" aria-label={p.titulo} onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,.45)', zIndex: 80, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 12px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ ...styles.card, width: '100%', maxWidth: 560, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>{p.titulo}</h3>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: C.textMuted }}>×</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={chip(COLOR_PRIORIDAD[p.prioridad], COLOR_PRIORIDAD[p.prioridad] + '18')}>Prioridad {p.prioridad}</span>
          <span style={chip(C.textSub, '#EEF0F3')}>{p.area}</span>
          <span style={chip(C.textSub, '#EEF0F3')}>{p.responsable}</span>
          <span style={{ fontSize: 11, color: C.textMuted, alignSelf: 'center' }}>Creado {fechaCorta(p.creado)} · actualizado {fechaCorta(p.actualizado)}</span>
        </div>
        {p.detalle && <p style={{ margin: 0, fontSize: 13.5, color: C.textSub, whiteSpace: 'pre-wrap' }}>{p.detalle}</p>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Estado">
          {COLUMNAS.map(([k, n, color]) => (
            <button key={k} disabled={ocupado} aria-pressed={p.estado === k} onClick={() => p.estado !== k && accion(() => onNota(p.id, '', k))}
              style={{ padding: '5px 11px', borderRadius: 99, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', border: '1.5px solid ' + (p.estado === k ? color : C.border), background: p.estado === k ? color + '18' : 'white', color: p.estado === k ? color : C.textSub }}>{n}</button>
          ))}
        </div>
        <div>
          <h4 style={{ margin: '4px 0 8px', fontSize: 13 }}>Bitácora</h4>
          {!p.bitacora.length && <p style={{ fontSize: 12.5, color: C.textMuted, margin: 0 }}>Todavía sin notas.</p>}
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {[...p.bitacora].reverse().map((n, i) => (
              <li key={i} style={{ fontSize: 12.5, display: 'grid', gridTemplateColumns: '58px 1fr', gap: 8 }}>
                <span style={{ color: C.textMuted }}>{fechaCorta(n.fecha)}</span><span style={{ whiteSpace: 'pre-wrap' }}>{n.texto}</span>
              </li>
            ))}
          </ol>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (nota.trim()) accion(async () => { await onNota(p.id, nota); setNota('') }) }} style={{ display: 'flex', gap: 8 }}>
          <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Agregar una nota…" aria-label="Nota" style={{ ...styles.input, flex: 1 }} />
          <button type="submit" disabled={!nota.trim() || ocupado} style={styles.btnPrimary}>Anotar</button>
        </form>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <button onClick={() => { if (window.confirm(`¿Borrar "${p.titulo}"?`)) accion(onBorrar) }} style={{ ...styles.btnSecondary, color: C.red }}>Borrar</button>
          <button onClick={onEditar} style={styles.btnSecondary}>Editar</button>
        </div>
      </div>
    </div>
  )
}

export default function PendientesSection() {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const [editando, setEditando] = useState(null)
  const [abierto, setAbierto] = useState(null)
  const [area, setArea] = useState('')
  const [quien, setQuien] = useState('')
  const [verHechos, setVerHechos] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const r = await apiFetch(URL)
      if (!r.ok) throw new Error(r.error || 'No se pudieron leer los pendientes')
      setLista(r.pendientes); setError('')
    } catch (e) { setError(e.message); setLista(l => l || []) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const enviar = async (cuerpo) => {
    const r = await apiFetch(URL, { method: 'POST', body: JSON.stringify(cuerpo) })
    if (!r.ok) { setError(r.error || 'No se pudo guardar'); throw new Error(r.error) }
    setLista(r.pendientes); setError('')
    return r.pendiente
  }
  const guardar = async (p) => { await enviar({ accion: 'guardar', pendiente: p }); setNuevo(false); setEditando(null) }
  const anotar = (id, texto, estado) => enviar({ accion: 'nota', id, texto, ...(estado ? { estado } : {}) })
  const borrar = async (id) => { await enviar({ accion: 'borrar', id }); setAbierto(null) }

  const visibles = useMemo(() => (lista || []).filter(p => (!area || p.area === area) && (!quien || p.responsable === quien)), [lista, area, quien])
  const porEstado = estado => visibles.filter(p => p.estado === estado).sort((a, b) =>
    estado === 'hecho' ? b.actualizado.localeCompare(a.actualizado) : ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad] || a.creado.localeCompare(b.creado))
  const pendienteAbierto = abierto && (lista || []).find(p => p.id === abierto)
  const filtro = (valor, set, opciones, todos, etiqueta) => (
    <select value={valor} onChange={e => set(e.target.value)} aria-label={etiqueta} style={{ ...styles.input, width: 'auto', padding: '6px 10px', fontSize: 12.5 }}>
      <option value="">{todos}</option>{opciones.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ ...styles.sectionTitle, margin: 0 }}>Pendientes</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {filtro(area, setArea, AREAS, 'Todas las áreas', 'Área')}
          {filtro(quien, setQuien, RESPONSABLES, 'Todos', 'Quién')}
          <button onClick={() => { setNuevo(v => !v); setEditando(null) }} style={{ ...styles.btnPrimary, fontSize: 12.5, padding: '8px 14px' }}>+ Nuevo</button>
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: C.textSub, margin: '0 0 14px' }}>Las mejoras que vamos haciendo con Claude. Cada una guarda una bitácora de lo que se hizo.</p>
      {error && <div style={styles.errorBox}>{error}</div>}
      {nuevo && <Formulario inicial={VACIO} onGuardar={guardar} onCancelar={() => setNuevo(false)} />}
      {editando && <Formulario inicial={editando} onGuardar={guardar} onCancelar={() => setEditando(null)} />}
      {lista === null && <div style={styles.empty}>Cargando pendientes…</div>}

      {lista && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, alignItems: 'start' }}>
          {COLUMNAS.map(([estado, nombre, color]) => {
            const items = porEstado(estado)
            const mostrados = estado === 'hecho' && !verHechos ? items.slice(0, 5) : items
            return (
              <section key={estado} data-testid={`columna-${estado}`} aria-label={nombre} style={{ background: '#F4F5F7', borderRadius: 14, padding: 10 }}>
                <h3 style={{ margin: '2px 4px 10px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: color }} />{nombre}
                  <span style={{ color: C.textMuted, fontWeight: 600 }}>{items.length}</span>
                </h3>
                <div style={{ display: 'grid', gap: 8 }}>
                  {!items.length && <p style={{ fontSize: 12, color: C.textMuted, margin: '0 4px 4px' }}>Nada por aquí.</p>}
                  {mostrados.map(p => (
                    <button key={p.id} data-testid="pendiente" onClick={() => setAbierto(p.id)}
                      style={{ ...styles.card, padding: '10px 12px', textAlign: 'left', cursor: 'pointer', border: '1px solid ' + C.border, borderLeft: '3px solid ' + COLOR_PRIORIDAD[p.prioridad], display: 'grid', gap: 5, fontFamily: 'inherit', width: '100%' }}>
                      <strong style={{ fontSize: 13.5, color: C.text }}>{p.titulo}</strong>
                      <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        <span style={chip(C.textSub, '#EEF0F3')}>{p.area}</span>
                        {p.responsable !== 'Claude' && <span style={chip('#92400E', '#FEF3C7')}>{p.responsable}</span>}
                      </span>
                      {p.bitacora.length > 0 && <span style={{ fontSize: 11.5, color: C.textMuted, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{fechaCorta(p.bitacora.at(-1).fecha)} · {p.bitacora.at(-1).texto}</span>}
                    </button>
                  ))}
                  {estado === 'hecho' && items.length > 5 && (
                    <button onClick={() => setVerHechos(v => !v)} style={{ border: 'none', background: 'none', color: C.textSub, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                      {verHechos ? 'Ver menos' : `Ver los ${items.length}`}
                    </button>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {pendienteAbierto && (
        <Detalle p={pendienteAbierto} onNota={anotar} onBorrar={() => borrar(pendienteAbierto.id)} onCerrar={() => setAbierto(null)}
          onEditar={() => { setEditando(pendienteAbierto); setAbierto(null); setNuevo(false); window.scrollTo({ top: 0 }) }} />
      )}
    </div>
  )
}

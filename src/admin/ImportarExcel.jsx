import React, { useState } from 'react'
import { C, apiFetch, fmt, styles } from './utils.js'
import { leerExcel } from './leerExcel.js'
import { ventasDesdeHojas } from '../../netlify/functions/lib/leer-ventas.mjs'

// Importa el historial de ventas desde el Excel. Primero muestra que va a pasar (simulacion) y
// recien al confirmar escribe. Importar de nuevo el mismo archivo no duplica.
export default function ImportarExcel({ onCerrar, onListo }) {
  const [paso, setPaso] = useState('archivo') // archivo | leyendo | revision | importando | listo
  const [lectura, setLectura] = useState(null)
  const [reporte, setReporte] = useState(null)
  const [error, setError] = useState('')

  const llamar = async (ventas, simular) => {
    const r = await apiFetch('/.netlify/functions/planilla', { method: 'POST', body: JSON.stringify({ accion: 'importar', ventas, simular }) })
    if (!r.ok) throw new Error(r.error || 'No se pudo importar')
    return r.reporte
  }
  async function elegir(archivo) {
    if (!archivo) return
    setError(''); setPaso('leyendo')
    try {
      const hojas = await leerExcel(archivo)
      const l = ventasDesdeHojas(hojas)
      if (!l.ventas.length) throw new Error('No encontré hojas de ventas (con columnas NOMBRE y FECHA) en este archivo.')
      setLectura(l)
      setReporte(await llamar(l.ventas, true))
      setPaso('revision')
    } catch (e) { setError(e.message); setPaso('archivo') }
  }
  async function importar() {
    setError(''); setPaso('importando')
    try { setReporte(await llamar(lectura.ventas, false)); setPaso('listo') }
    catch (e) { setError(e.message); setPaso('revision') }
  }

  const dato = (n, texto, color = C.text) => <div style={{ padding: '10px 12px', borderRadius: 10, background: C.bg }}><div style={{ fontSize: 20, fontWeight: 800, color }}>{n}</div><div style={{ fontSize: 12, color: C.textSub }}>{texto}</div></div>
  return (
    <div role="dialog" aria-modal="true" aria-label="Importar Excel" onClick={e => e.target === e.currentTarget && paso !== 'importando' && onCerrar()}
      style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(17,24,39,.4)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ ...styles.card, width: 'min(620px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>Importar ventas desde Excel</h3>
          {paso !== 'importando' && <button onClick={onCerrar} aria-label="Cerrar" style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: C.textMuted }}>✕</button>}
        </div>
        {error && <div style={styles.errorBox}>{error}</div>}

        {(paso === 'archivo' || paso === 'leyendo') && (
          <>
            <p style={{ fontSize: 13.5, color: C.textSub, marginTop: 0 }}>
              Elige tu planilla (.xlsx). Leo las hojas de ventas por el nombre de sus columnas (NOMBRE, FECHA, REPISAS, RETIRO…), así que da lo mismo si cambian de lugar entre meses.
              Las hojas del banco se ignoran. Los nombres pintados quedan como <strong>instalados</strong>.
            </p>
            <label style={{ display: 'grid', placeItems: 'center', gap: 6, padding: 28, borderRadius: 12, border: '2px dashed ' + C.border, cursor: 'pointer', background: '#FAFAFA' }}>
              <span style={{ fontSize: 30 }}>📄</span>
              <strong style={{ fontSize: 14 }}>{paso === 'leyendo' ? 'Leyendo el archivo…' : 'Elegir archivo .xlsx'}</strong>
              <input type="file" accept=".xlsx" aria-label="Archivo Excel" disabled={paso === 'leyendo'} onChange={e => elegir(e.target.files?.[0])} style={{ display: 'none' }} />
            </label>
          </>
        )}

        {(paso === 'revision' || paso === 'importando' || paso === 'listo') && reporte && (
          <div data-testid="reporte-importar">
            {paso === 'listo'
              ? <p style={{ fontSize: 14, color: C.green, fontWeight: 700, marginTop: 0 }}>✓ Listo: {reporte.nuevas} ventas importadas.{reporte.enlazadas ? ` ${reporte.enlazadas} próximas quedaron enlazadas a su evento del calendario.` : ''}</p>
              : <p style={{ fontSize: 13.5, color: C.textSub, marginTop: 0 }}>Esto es lo que va a pasar. Revisa y confirma.</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 12 }}>
              {dato(reporte.nuevas, 'ventas nuevas', C.green)}
              {dato(reporte.existentes, 'ya estaban (no se duplican)')}
              {dato(reporte.proximas, 'instalaciones próximas')}
              {dato(reporte.sinFecha, 'sin fecha')}
              {dato(fmt(reporte.neto), 'neto de las nuevas')}
            </div>
            {paso === 'listo' && reporte.sinEvento?.length > 0 && (
              <p style={{ fontSize: 12.5, color: '#92400E' }}>No encontré en el calendario el evento de {reporte.sinEvento.length} próximas: {reporte.sinEvento.join(', ')}. Si no lo tienen, cámbiales la hora en la planilla y se crea.</p>
            )}
            {reporte.completadas > 0 && <p style={{ fontSize: 12.5, color: C.textSub }}>A {reporte.completadas} que ya estaban en el panel se les completa el documento, la nota o la marca de instalada.</p>}
            <div style={{ fontSize: 12.5, color: C.textSub, marginBottom: 6 }}>
              <strong>Hojas leídas:</strong> {lectura.hojasLeidas.map(h => `${h.nombre} (${h.ventas})`).join(' · ')}
            </div>
            {lectura.hojasIgnoradas.length > 0 && <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>Ignoradas (no son de ventas): {lectura.hojasIgnoradas.join(', ')}</div>}
            {paso !== 'listo' && reporte.ejemplos?.length > 0 && (
              <div style={{ fontSize: 12.5, marginBottom: 12 }}>
                <strong>Ejemplos:</strong>
                {reporte.ejemplos.map((e, i) => <div key={i} style={{ color: C.textSub }}>{e.nombre} · {e.fecha || 'sin fecha'} · {fmt(e.neto)} neto · {e.documento || '—'} <span style={{ color: C.textMuted }}>({e.hoja})</span></div>)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {paso === 'listo'
                ? <button onClick={onListo} style={styles.btnPrimary}>Ver la planilla</button>
                : <>
                  <button onClick={onCerrar} disabled={paso === 'importando'} style={styles.btnSecondary}>Cancelar</button>
                  <button onClick={importar} disabled={paso === 'importando' || !reporte.nuevas} style={{ ...styles.btnPrimary, opacity: reporte.nuevas ? 1 : .5 }}>
                    {paso === 'importando' ? 'Importando…' : `Importar ${reporte.nuevas} ventas`}
                  </button>
                </>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

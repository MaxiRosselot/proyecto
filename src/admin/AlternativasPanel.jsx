// Alternativas para la pagina 5 del PDF: se calculan desde el modelo 3D (ver alternativas.js), cada
// una con su vista y su precio, y se eligen hasta 2. Sin ninguna elegida el PDF queda en 4 paginas.
import React, { useState } from 'react'
import { C, fmt, styles } from './utils.js'
import { MAX_ALTERNATIVAS, alternativasDe } from './alternativas.js'
import { precioAlternativa } from './regenerarPdf.js'

// Huella del proyecto: las alternativas valen para el modelo con que se calcularon.
export function firmaProyecto(p) {
  const s = JSON.stringify(p || null)
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36)
}

export default function AlternativasPanel({ project3d, principal, tabla, adicionales, elegidas, onCambio }) {
  const [lista, setLista] = useState(null)
  const [cargando, setCargando] = useState('')
  const [error, setError] = useState('')
  const base = firmaProyecto(project3d)
  const posibles = project3d ? alternativasDe(project3d) : []

  async function calcular() {
    setError(''); setLista([])
    const listas = []
    try {
      for (const [i, alt] of posibles.entries()) {
        setCargando(`Calculando ${i + 1} de ${posibles.length}: ${alt.titulo}…`)
        const conPrecio = await precioAlternativa(alt, { principal, tabla, adicionales })
        if (conPrecio) { listas.push({ ...conPrecio, base }); setLista([...listas]) }
      }
      if (!listas.length) setError('Ninguna alternativa tiene todas sus medidas en la tabla de precios.')
    } catch (e) { setError('No se pudieron calcular: ' + e.message) }
    finally { setCargando('') }
  }

  const elegida = a => elegidas.some(e => e.tipo === a.tipo)
  const alternar = a => onCambio(elegida(a) ? elegidas.filter(e => e.tipo !== a.tipo) : [...elegidas, a].slice(-MAX_ALTERNATIVAS))
  const visibles = lista ?? elegidas

  return (
    <div style={{ ...styles.card, marginBottom: 14 }} data-testid="alternativas">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: visibles.length || cargando || error ? 12 : 0 }}>
        <div>
          <div style={styles.cardLabel}>Otras opciones (página 5)</div>
          <div style={{ fontSize: 12.5, color: C.textMuted }}>
            {elegidas.length ? `${elegidas.length} de ${MAX_ALTERNATIVAS} elegidas: el PDF lleva una página 5 con ellas.` : 'Opcional. Sin ninguna elegida, el PDF queda en 4 páginas.'}
          </div>
        </div>
        <button type="button" onClick={calcular} disabled={!project3d || Boolean(cargando) || !posibles.length} style={{ ...styles.btnSecondary, fontSize: 13, opacity: !project3d || !posibles.length ? .55 : 1 }}
          title={!project3d ? 'Arma el modelo 3D primero' : !posibles.length ? 'Este modelo no tiene alternativas automáticas (bodega irregular o repisas sueltas)' : ''}>
          {cargando ? 'Calculando…' : lista ? 'Volver a calcular' : `Ver alternativas${posibles.length ? ` (${posibles.length})` : ''}`}
        </button>
      </div>
      {cargando && <div style={{ fontSize: 12.5, color: C.textSub, marginBottom: 10 }}>{cargando}</div>}
      {error && <div style={{ ...styles.errorBox, marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
        {visibles.map(a => {
          const si = elegida(a), vieja = a.base && a.base !== base
          return (
            <label key={a.tipo} data-testid={`alternativa-${a.tipo}`} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 10, cursor: 'pointer',
              border: '1.5px solid ' + (si ? C.orange : C.border), background: si ? C.orangeLight : C.surface, opacity: vieja ? .6 : 1 }}>
              {a.imagen && <img src={a.imagen} alt="" style={{ width: '100%', height: 120, objectFit: 'contain', background: '#fff', borderRadius: 6 }} />}
              {a.etiqueta && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: .5 }}>{a.etiqueta}</span>}
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={si} onChange={() => alternar(a)} aria-label={`Incluir ${a.titulo}`}
                  style={{ width: 16, height: 16, margin: 0, padding: 0, flex: 'none', accentColor: C.orange }} />
                <strong style={{ fontSize: 14 }}>{a.titulo}</strong>
              </span>
              <span style={{ fontSize: 12, color: C.textSub }}>{a.descripcion}</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: C.orangeDark }}>{fmt(a.total)}</span>
              {a.comparacion && <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{a.comparacion}</span>}
              {vieja && <span style={{ fontSize: 11.5, color: C.red || '#B91C1C' }}>Calculada con otro modelo: vuelve a calcular.</span>}
            </label>
          )
        })}
      </div>
    </div>
  )
}

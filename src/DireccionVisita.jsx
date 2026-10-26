import React, { useEffect, useRef, useState } from 'react'
import { COMUNAS, comunaDe } from '../netlify/functions/lib/zonas.mjs'
import { CLAVE_MAPS, cargarPlaces, comunaDeLugar, componente } from './googlePlaces.js'

// Direccion de la visita en /visita. Con VITE_GOOGLE_MAPS_KEY (Places API New) autocompleta
// mientras escriben y valida: hay que elegir una sugerencia y que tenga numero; queda con sus
// coordenadas para armar la ruta del dia. Sin clave, o si Google falla, se escribe a mano con la
// comuna de la lista (la ruta ordena esas por comuna).
export const OTRA_COMUNA = 'Otra (fuera de Santiago)'
const SANTIAGO = { center: { lat: -33.45, lng: -70.65 }, radius: 50000 }

// valor: { calle, depto, comuna, lat?, lng?, verificada }
export default function DireccionVisita({ valor, onChange, onListo }) {
  const [modo, setModo] = useState(CLAVE_MAPS ? 'cargando' : 'manual') // cargando | google | manual
  const [texto, setTexto] = useState(valor.calle ? [valor.calle, valor.comuna].filter(Boolean).join(', ') : '')
  const [sugerencias, setSugerencias] = useState([])
  const [error, setError] = useState('')
  const lib = useRef(null), sesion = useRef(null), reloj = useRef(null), pedido = useRef(0)

  useEffect(() => {
    if (!CLAVE_MAPS) return
    cargarPlaces()
      .then(l => { lib.current = l; sesion.current = new l.AutocompleteSessionToken(); setModo(m => (m === 'cargando' ? 'google' : m)) })
      .catch(() => setModo('manual'))
  }, [])

  function escribir(t) {
    setTexto(t); setError('')
    onChange({ ...valor, calle: '', comuna: '', lat: undefined, lng: undefined, verificada: false })
    clearTimeout(reloj.current)
    if (t.trim().length < 4) { setSugerencias([]); return }
    const n = ++pedido.current
    reloj.current = setTimeout(async () => {
      try {
        const { suggestions } = await lib.current.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: t, sessionToken: sesion.current, includedRegionCodes: ['cl'], language: 'es', region: 'cl', locationBias: SANTIAGO,
        })
        if (n === pedido.current) setSugerencias((suggestions || []).map(s => s.placePrediction).filter(Boolean).slice(0, 5))
      } catch { if (n === pedido.current) setModo('manual') }
    }, 250)
  }

  async function elegir(prediccion) {
    setSugerencias([]); setError('')
    try {
      const lugar = prediccion.toPlace()
      await lugar.fetchFields({ fields: ['formattedAddress', 'location', 'addressComponents'] })
      sesion.current = new lib.current.AutocompleteSessionToken()
      const numero = componente(lugar, 'street_number'), calle = componente(lugar, 'route')
      const comunaGoogle = comunaDeLugar(lugar)
      setTexto(lugar.formattedAddress || prediccion.text?.text || '')
      if (!numero || !calle) { setError('Falta el número de la casa o edificio: escríbelo y elige la dirección de nuevo.'); return }
      onChange({ ...valor, calle: `${calle} ${numero}`, comuna: comunaDe(comunaGoogle) || comunaGoogle || '', lat: lugar.location.lat(), lng: lugar.location.lng(), verificada: true })
    } catch { setModo('manual') }
  }

  const listo = modo === 'manual' ? Boolean(valor.calle.trim() && valor.comuna) : valor.verificada
  return (
    <form onSubmit={e => { e.preventDefault(); if (listo) onListo() }}>
      {modo === 'manual' ? (
        <div className="grid">
          <div><label htmlFor="v-calle">Dirección</label><input id="v-calle" autoComplete="street-address" placeholder="Calle y número" value={valor.calle} onChange={e => onChange({ ...valor, calle: e.target.value, verificada: false })} required /></div>
          <div><label htmlFor="v-comuna">Comuna</label>
            <select id="v-comuna" value={valor.comuna} onChange={e => onChange({ ...valor, comuna: e.target.value })} required>
              <option value="">Elige tu comuna</option>
              {COMUNAS.map(c => <option key={c} value={c}>{c}</option>)}
              <option value={OTRA_COMUNA}>{OTRA_COMUNA}</option>
            </select>
          </div>
        </div>
      ) : (
        <div className="autocompletar">
          <label htmlFor="v-buscar">Dirección</label>
          <input id="v-buscar" autoComplete="off" placeholder={modo === 'cargando' ? 'Cargando…' : 'Escribe tu calle y número'} disabled={modo === 'cargando'}
            value={texto} onChange={e => escribir(e.target.value)} role="combobox" aria-expanded={sugerencias.length > 0} aria-controls="v-sugerencias" />
          {sugerencias.length > 0 && (
            <ul id="v-sugerencias" role="listbox" className="sugerencias">
              {sugerencias.map((p, i) => (
                <li key={i} role="option" aria-selected="false">
                  <button type="button" onClick={() => elegir(p)}>
                    <strong>{p.mainText?.text || p.text?.text}</strong>
                    {p.secondaryText?.text && <span>{p.secondaryText.text}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {valor.verificada && <p className="note ok-text">✓ Dirección verificada{valor.comuna ? ` · ${valor.comuna}` : ''}</p>}
          {error && <p className="note" role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
          <button type="button" className="link-btn" style={{ fontSize: 12, marginTop: 6 }} onClick={() => { setModo('manual'); setSugerencias([]) }}>¿No aparece? Escríbela a mano</button>
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <label htmlFor="v-depto">Depto, casa u oficina <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(opcional)</span></label>
        <input id="v-depto" placeholder="Ej: depto 302, torre B" value={valor.depto} onChange={e => onChange({ ...valor, depto: e.target.value })} />
      </div>
      <button className="btn" type="submit" style={{ marginTop: 12 }} disabled={!listo}>Ver días y horarios</button>
    </form>
  )
}

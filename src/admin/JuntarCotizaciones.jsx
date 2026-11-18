// Admin → Cotizaciones → "Juntar cotizaciones": se eligen varias cotizaciones (por ejemplo, varias
// bodegas de un mismo cliente) y se arma un solo presupuesto en PDF con su resumen y una pagina por
// bodega (netlify/functions/lib/presupuesto-pdf.mjs). Las vistas 3D se dibujan aca, como en el PDF
// de cada cotizacion.
import React, { useEffect, useState } from 'react'
import { C, adminFetch, apiFetch, fmt, styles } from './utils.js'
import { vistasDelProyecto } from './regenerarPdf.js'

export const MAX_JUNTAR = 6

// cotNums en el orden en que van en el presupuesto. Devuelve { blobUrl, nombreArchivo, total }.
export async function armarPresupuesto(cotNums, cliente, { titulos = {}, alAvanzar = () => {} } = {}) {
  const bodegas = []
  for (const [i, cotNum] of cotNums.entries()) {
    alAvanzar(`Leyendo la cotización N${cotNum} (${i + 1} de ${cotNums.length})`)
    const { ok, quote, error } = await apiFetch('/.netlify/functions/get-quotes?cotNum=' + encodeURIComponent(cotNum))
    if (!ok || !quote) throw new Error(error || `No se encontró la cotización N${cotNum}`)
    let grafica3d
    if (quote.proyecto3d) {
      alAvanzar(`Dibujando la bodega ${i + 1} de ${cotNums.length}`)
      grafica3d = await vistasDelProyecto(quote.proyecto3d)
    }
    bodegas.push({ cotNum: quote.cotNum, titulo: titulos[cotNum] || `Bodega ${i + 1}`, repisas: quote.repisas || [], adicionales: quote.adicionales || {}, ...(grafica3d ? { grafica3d } : {}) })
  }
  alAvanzar('Armando el PDF')
  const res = await adminFetch('/.netlify/functions/presupuesto-conjunto', { method: 'POST', body: JSON.stringify({ cliente, bodegas }) })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'No se pudo armar el presupuesto') }
  const blob = await res.blob()
  const nombre = (cliente.nombre || 'cliente').trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
  return { blobUrl: URL.createObjectURL(blob), nombreArchivo: `Presupuesto ${nombre} - ${cotNums.length} bodegas - Repisas Don Maxi.pdf`, total: Number(res.headers.get('x-total')) || 0 }
}

// La barra de arriba mientras se eligen: las elegidas (en orden), los datos del cliente y el boton.
export default function PanelJuntar({ elegidas, quotes, onQuitar, onMover, onCancelar }) {
  const lista = elegidas.map(n => quotes.find(q => String(q.cotNum) === String(n))).filter(Boolean)
  const primera = lista[0]
  const [cliente, setCliente] = useState({ nombre: '', telefono: '', direccion: '', email: '' })
  const [tocado, setTocado] = useState(false)
  const [etapa, setEtapa] = useState('')
  const [error, setError] = useState('')
  const [listo, setListo] = useState(null)
  // Los datos del cliente salen de la primera elegida (o de la primera que los tenga), hasta que se editan.
  useEffect(() => {
    if (tocado) return
    const dato = k => lista.map(q => String(q[k] || '').trim()).find(Boolean) || ''
    setCliente({ nombre: primera ? String(primera.nombre || '') : '', telefono: dato('telefono'), direccion: dato('direccion'), email: dato('email') })
  }, [elegidas.join(','), quotes.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalSuma = lista.reduce((s, q) => s + (Number(q.total) || 0), 0)
  const armar = async () => {
    setError(''); setListo(null)
    try { setListo(await armarPresupuesto(lista.map(q => q.cotNum), cliente, { alAvanzar: setEtapa })) }
    catch (e) { setError(e.message) } finally { setEtapa('') }
  }
  const campo = (k, etiqueta, ancho) => (
    <label style={{ display: 'grid', gap: 3, fontSize: 11.5, fontWeight: 700, color: C.textSub, flex: ancho }}>
      {etiqueta}
      <input value={cliente[k]} onChange={e => { setTocado(true); setCliente({ ...cliente, [k]: e.target.value }) }} aria-label={etiqueta} style={{ ...styles.input, padding: '7px 10px', fontSize: 13 }} />
    </label>
  )

  return (
    <div data-testid="panel-juntar" style={{ ...styles.card, position: 'sticky', top: 64, zIndex: 20, marginBottom: 14, border: '1.5px solid ' + C.orange, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>Juntar cotizaciones en un presupuesto</strong>
        <button onClick={onCancelar} style={{ ...styles.btnSecondary, padding: '5px 12px', fontSize: 12.5 }}>Cancelar</button>
      </div>
      {!lista.length && <p style={{ margin: 0, fontSize: 13, color: C.textSub }}>Marca abajo las cotizaciones que van juntas (de 2 a {MAX_JUNTAR}). El orden en que las marcas es el orden de las bodegas.</p>}
      {lista.length > 0 && (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {lista.map((q, i) => (
            <li key={q.cotNum} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 10px', borderRadius: 99, background: C.orangeLight, fontSize: 12.5 }}>
              <strong>Bodega {i + 1}</strong> · N{q.cotNum} · {fmt(q.total)}
              {i > 0 && <button onClick={() => onMover(q.cotNum, -1)} aria-label={`Subir N${q.cotNum}`} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.textSub }}>←</button>}
              <button onClick={() => onQuitar(q.cotNum)} aria-label={`Quitar N${q.cotNum}`} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.textSub, fontSize: 15 }}>×</button>
            </li>
          ))}
        </ol>
      )}
      {lista.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {campo('nombre', 'Cliente', '2 1 180px')}{campo('telefono', 'Teléfono', '1 1 120px')}{campo('direccion', 'Dirección', '2 1 160px')}{campo('email', 'Correo', '2 1 160px')}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={armar} disabled={lista.length < 2 || lista.length > MAX_JUNTAR || !!etapa || !cliente.nombre.trim()} style={styles.btnPrimary}>
          {etapa ? 'Armando…' : `Armar presupuesto${lista.length ? ` (${lista.length})` : ''}`}
        </button>
        {lista.length > 1 && <span style={{ fontSize: 13, color: C.textSub }}>Total: <strong style={{ color: C.orangeDark }}>{fmt(totalSuma)}</strong></span>}
        {lista.length > MAX_JUNTAR && <span style={{ fontSize: 12.5, color: C.red }}>Máximo {MAX_JUNTAR}.</span>}
        {etapa && <span style={{ fontSize: 12.5, color: C.textMuted }}>{etapa}…</span>}
        {listo && <>
          <a href={listo.blobUrl} target="_blank" rel="noreferrer" style={{ ...styles.btnSecondary, textDecoration: 'none' }}>Abrir PDF</a>
          <a href={listo.blobUrl} download={listo.nombreArchivo} data-testid="descargar-presupuesto" style={{ ...styles.btnSecondary, textDecoration: 'none' }}>Descargar</a>
        </>}
      </div>
      {error && <div style={styles.errorBox}>{error}</div>}
    </div>
  )
}

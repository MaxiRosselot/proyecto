// Admin → Cotizaciones → "Juntar cotizaciones": se eligen varias cotizaciones (por ejemplo, varias
// bodegas de un mismo cliente) y se arma un solo presupuesto en PDF con su resumen y una pagina por
// bodega (netlify/functions/lib/presupuesto-pdf.mjs). Las vistas 3D se dibujan aca, como en el PDF
// de cada cotizacion.
import React, { useEffect, useState } from 'react'
import { C, adminFetch, apiFetch, fmt, styles } from './utils.js'
import { vistasDelProyecto } from './regenerarPdf.js'
import { juntarEnUnaVenta } from '../../netlify/functions/lib/juntar-venta.mjs'

const aBase64 = buffer => { const b = new Uint8Array(buffer); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s) }

// "Juntar en una venta": crea una cotizacion nueva con todo (ver lib/juntar-venta.mjs), le deja el
// presupuesto conjunto como PDF y pasa las originales a rechazadas ("Juntada en la N° X"), para
// que no se agenden ni se cuenten dos veces. La nueva queda por confirmar: se agenda como cualquiera.
export async function juntarEnVenta(cotNums, cliente, { pdf, alAvanzar = () => {} } = {}) {
  alAvanzar('Leyendo las cotizaciones')
  const completas = []
  for (const cotNum of cotNums) {
    const { ok, quote, error } = await apiFetch('/.netlify/functions/get-quotes?cotNum=' + encodeURIComponent(cotNum))
    if (!ok || !quote) throw new Error(error || `No se encontró la cotización N${cotNum}`)
    completas.push(quote)
  }
  const { venta, motivo } = juntarEnUnaVenta(completas, cliente)
  alAvanzar('Creando la venta')
  const creada = await apiFetch('/.netlify/functions/save-quote', { method: 'POST', body: JSON.stringify({ crear: true, ...venta }) })
  if (!creada.ok) throw new Error(creada.error || 'No se pudo crear la venta')
  const nuevo = creada.cotNum
  let aviso = ''
  try {
    alAvanzar('Subiendo el presupuesto')
    const archivo = pdf || await armarPresupuesto(cotNums, cliente)
    const bytes = await (await fetch(archivo.blobUrl)).arrayBuffer()
    const subida = await apiFetch('/.netlify/functions/upload-pdf', { method: 'POST', body: JSON.stringify({ pdfBase64: aBase64(bytes), fileName: archivo.nombreArchivo, cotNum: nuevo }) })
    if (!subida.ok || !subida.viewUrl) throw new Error(subida.error || 'Drive no respondió')
    const conPdf = await apiFetch('/.netlify/functions/save-quote', { method: 'POST', body: JSON.stringify({ cotNum: nuevo, pdfUrl: subida.viewUrl }) })
    if (!conPdf.ok) throw new Error(conPdf.error || 'No se guardó el link del PDF')
  } catch (e) { aviso = `La venta quedó creada, pero el PDF no se pudo subir (${e.message}).` }
  alAvanzar('Marcando las originales como juntadas')
  for (const cotNum of cotNums) {
    const r = await apiFetch('/.netlify/functions/save-quote', { method: 'POST', body: JSON.stringify({ cotNum, status: 'rechazada', motivoRechazo: motivo(nuevo) }) })
    if (!r.ok) aviso += ` No se pudo marcar la N° ${cotNum} como juntada: hazlo a mano.`
  }
  return { cotNum: nuevo, aviso: aviso.trim() }
}

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
export default function PanelJuntar({ elegidas, quotes, onQuitar, onMover, onCancelar, onJuntada }) {
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
  // Vista previa de la venta junta (o por que no se puede): con lo que ya esta en la lista.
  let previa = null, impedimento = ''
  try { if (lista.length >= 2) previa = juntarEnUnaVenta(lista, cliente) } catch (e) { impedimento = e.message }
  const juntar = async () => {
    if (!previa) return
    const ok = window.confirm(`Se crea una venta nueva con las ${lista.length} cotizaciones por ${fmt(previa.venta.total)} (con IVA), lista para agendar el trabajo completo.\n\nLas originales (${lista.map(q => 'N° ' + q.cotNum).join(', ')}) quedan en Rechazadas como "Juntada en la N° …", para no agendarlas ni contarlas dos veces.\n\n¿Seguir?`)
    if (!ok) return
    setError('')
    try {
      const r = await juntarEnVenta(lista.map(q => q.cotNum), cliente, { pdf: listo, alAvanzar: setEtapa })
      if (r.aviso) window.alert(r.aviso)
      onJuntada?.(r.cotNum)
    } catch (e) { setError(e.message) } finally { setEtapa('') }
  }
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
        {lista.length >= 2 && (
          <button onClick={juntar} disabled={!previa || !!etapa || !cliente.nombre.trim() || lista.length > MAX_JUNTAR}
            title={impedimento || 'Crea una sola venta con todo, para agendar el trabajo completo de una vez'}
            style={{ ...styles.btnSecondary, color: C.green, borderColor: C.green, opacity: previa ? 1 : .5 }}>
            📅 Juntar en una venta para agendar{previa ? ` · ${fmt(previa.venta.total)}` : ''}
          </button>
        )}
      </div>
      {impedimento && lista.length >= 2 && <div style={{ fontSize: 12.5, color: C.red }}>Para juntarlas en una venta: {impedimento}</div>}
      {previa && previa.venta.total !== totalSuma && <div style={{ fontSize: 12.5, color: C.textSub }}>La venta junta suma {fmt(previa.venta.total)} y no {fmt(totalSuma)} porque el recargo de sábado no se copia: se vuelve a poner solo si el trabajo completo se agenda un sábado.</div>}
      {error && <div style={styles.errorBox}>{error}</div>}
    </div>
  )
}

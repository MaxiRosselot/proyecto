import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { C, QUOTE_STATUS_LABELS, adminFetch, apiFetch, fmt, styles } from './utils.js'
import { ahoraEnZona, sumarDias } from '../../netlify/functions/lib/horarios.mjs'
import {
  anotarBitacora, esperarHasta, estadoSeguimiento, marcarSinWhatsapp, marcarYaCompro, quitarDeBitacora, quitarSinWhatsapp, registrarPregunta, registrarRespuesta, sinWhatsapp,
} from '../../netlify/functions/lib/seguimiento-whatsapp.mjs'
import { mensajeEnvioCotizacion, mensajeRecordatorio, telefonoWhatsapp } from '../../netlify/functions/lib/mensajes.mjs'
import { LugarWhatsapp } from './MarcoWhatsapp.jsx'
import { ControlZoom, Copiar, ParaEnviar, SinExtension, boton, botonVerde } from './VentanaWhatsapp.jsx'
import { CopiarHorarios } from './EnviarCotizacion.jsx'
import { EVENTO_PARA_ENVIAR, abrirChatEnMarco, adjuntarEnChat, buscarClientes, enfocarMarco, esMarco, extensionInstalada, inicioMarco, oirSinWhatsapp, oirTeclasDelMarco, telefonoLegible } from './whatsappPanel.js'
import { ATAJOS, ATAJOS_EN_WHATSAPP, accionDeTecla, siguiente } from './atajosWhatsapp.js'
import { FILTROS, clasificar, enQueVa, fechaCorta, guardarRapidos, leerRapidos, mensajesPara, rellenar } from './moduloWhatsapp.js'

// Seccion WhatsApp (solo PC): a la izquierda los clientes por filtro, al centro WhatsApp Web (lo usas
// tu, a mano) y a la derecha la ficha del cliente elegido: en que va, seguimiento, bitacora y los
// mensajes que le sirven, listos para copiar o para dejar escritos en su chat (sin enviar).

const TONOS = { ambar: '#D97706', verde: C.green, gris: C.textMuted, rojo: C.red }
const MOTIVOS_RECHAZO = ['Precio alto', 'Sin respuesta', 'Eligio otro proveedor', 'Otro']
const columna = { display: 'flex', flexDirection: 'column', minHeight: 0, background: C.surface }
const titulo = { fontSize: 11, fontWeight: 800, color: C.textMuted, textTransform: 'uppercase', letterSpacing: .8 }
const bloque = { padding: '12px 14px', borderBottom: '1px solid ' + C.border }
const mismoTelefono = (a, b) => { const x = telefonoWhatsapp(a), y = telefonoWhatsapp(b); return x.length >= 8 && x === y }

// Una tecla dibujada, para los atajos.
function Tecla({ children }) {
  return <kbd style={{ display: 'inline-block', minWidth: 16, padding: '0 4px', marginRight: 5, border: '1px solid ' + C.border, borderBottomWidth: 2, borderRadius: 4, background: '#F8FAFC', fontSize: 10.5, fontWeight: 700, color: C.textSub, textAlign: 'center', fontFamily: 'inherit', lineHeight: '15px' }}>{children}</kbd>
}

function AyudaAtajos({ onCerrar }) {
  const fila = ([t, d]) => (
    <div key={t} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12, color: C.text }}>
      <span style={{ minWidth: 92, whiteSpace: 'nowrap' }}>{t.split(' ').map((x, i) => /^[+…/]$/.test(x) ? <span key={i} style={{ color: C.textMuted, marginRight: 4 }}>{x}</span> : <Tecla key={i}>{x}</Tecla>)}</span>
      <span style={{ color: C.textSub }}>{d}</span>
    </div>
  )
  return (
    <div data-testid="ayuda-atajos" style={{ ...bloque, background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={titulo}>Atajos de teclado</span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar atajos" style={{ ...boton, marginLeft: 'auto' }}>✕</button>
      </div>
      {ATAJOS.map(fila)}
      <div style={{ ...titulo, marginTop: 6 }}>Desde dentro de WhatsApp</div>
      {ATAJOS_EN_WHATSAPP.map(fila)}
      <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 4, lineHeight: 1.45 }}>
        Para ir rápido: <b>Alt+↓</b> (siguiente cliente) → <b>Alt+1</b> (su mensaje) → revisas y <b>Enter</b> en WhatsApp. Nada se envía solo.
      </div>
    </div>
  )
}

function FilaCliente({ q, hoy, activo, onElegir, extra }) {
  const v = enQueVa(q, hoy)
  return (
    <button type="button" onClick={onElegir} data-testid={'cliente-' + q.cotNum} style={{
      display: 'block', width: '100%', textAlign: 'left', border: 'none', borderBottom: '1px solid ' + C.border, cursor: 'pointer', fontFamily: 'inherit',
      padding: '9px 12px', background: activo ? C.orangeLight : 'white', borderLeft: '3px solid ' + (activo ? C.orange : 'transparent'),
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{q.nombre || 'Sin nombre'}</span>
        <span style={{ fontSize: 11, color: C.textMuted }}>N° {q.cotNum}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: TONOS[v.tono] }}>{extra || v.texto}</span>
        {q.total > 0 && <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 'auto' }}>{fmt(q.total)}</span>}
      </div>
    </button>
  )
}

function FilaEvento({ e, activo, onElegir }) {
  return (
    <button type="button" onClick={onElegir} data-testid={'evento-' + e.id} style={{
      display: 'block', width: '100%', textAlign: 'left', border: 'none', borderBottom: '1px solid ' + C.border, cursor: 'pointer', fontFamily: 'inherit',
      padding: '9px 12px', background: activo ? C.orangeLight : 'white', borderLeft: '3px solid ' + (activo ? C.orange : 'transparent'),
    }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{e.cliente || e.titulo}</div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: e.tipo === 'instalacion' ? C.green : C.blue, marginTop: 2 }}>
        {e.tipo === 'instalacion' ? 'Instalación' : 'Visita'} mañana · {e.inicio}{e.telefono ? '' : ' · sin teléfono'}
      </div>
    </button>
  )
}

// Un mensaje listo: titulo, vista previa (se despliega) y Copiar / Escribir en su chat.
function Mensaje({ m, telefono, onUsado, numero }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div data-testid={'mensaje-' + m.id} style={{ border: '1px solid ' + C.border, borderRadius: 9, padding: '7px 9px', background: 'white' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" onClick={() => setAbierto(v => !v)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: C.text, textAlign: 'left', flex: 1 }}>
          {numero <= 9 && <Tecla>{numero}</Tecla>}{abierto ? '▾' : '▸'} {m.titulo}
        </button>
        <Copiar texto={m.texto} titulo={'Copiar para pegar en el chat' + (numero <= 9 ? ` (Shift+${numero})` : '')} data-atajo={numero <= 9 ? 'copiar-' + numero : undefined}>Copiar</Copiar>
        {telefono && <button type="button" style={botonVerde} data-atajo={numero <= 9 ? 'chat-' + numero : undefined} title={'Lo deja escrito en su chat, sin enviar: tú lo revisas y das Enter' + (numero <= 9 ? ` (tecla ${numero})` : '')}
          onClick={() => { abrirChatEnMarco(telefono, m.texto); onUsado?.(m) }}>En su chat</button>}
      </div>
      <div onClick={() => setAbierto(v => !v)} style={{ fontSize: 12, color: C.textSub, whiteSpace: 'pre-wrap', marginTop: 5, cursor: 'pointer', ...(abierto ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}>{m.texto}</div>
    </div>
  )
}

// Mis mensajes: los propios, editables, con {nombre}, {cotizacion}, {total}, {agendar}, {pagar}.
function MisMensajes({ cliente, telefono, desde = 0 }) {
  const [lista, setLista] = useState(leerRapidos)
  const [editando, setEditando] = useState(false)
  const cambiar = nueva => { setLista(nueva); guardarRapidos(nueva) }
  const campo = { ...styles.input, padding: '6px 8px', fontSize: 12.5 }
  return (
    <div style={bloque}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={titulo}>Mis mensajes</span>
        <button type="button" onClick={() => setEditando(v => !v)} style={{ ...boton, marginLeft: 'auto' }}>{editando ? 'Listo' : 'Editar'}</button>
      </div>
      {editando ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11.5, color: C.textMuted }}>Puedes usar {'{nombre}'}, {'{cotizacion}'}, {'{total}'}, {'{agendar}'} y {'{pagar}'}: se cambian por los datos del cliente elegido.</div>
          {lista.map((m, i) => (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 8, border: '1px solid ' + C.border, borderRadius: 8 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={m.titulo} aria-label="Título del mensaje" onChange={e => cambiar(lista.map((x, j) => j === i ? { ...x, titulo: e.target.value } : x))} style={campo} />
                <button type="button" aria-label={'Borrar ' + m.titulo} onClick={() => cambiar(lista.filter((_, j) => j !== i))} style={{ ...boton, color: C.red }}>✕</button>
              </div>
              <textarea value={m.texto} rows={3} aria-label="Texto del mensaje" onChange={e => cambiar(lista.map((x, j) => j === i ? { ...x, texto: e.target.value } : x))} style={{ ...campo, resize: 'vertical' }} />
            </div>
          ))}
          <button type="button" style={botonVerde} onClick={() => cambiar([...lista, { id: 'm' + Date.now().toString(36), titulo: 'Mensaje nuevo', texto: 'Hola {nombre}, ' }])}>+ Agregar mensaje</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lista.map((m, i) => <Mensaje key={m.id} numero={desde + i + 1} m={{ ...m, id: 'propio-' + m.id, texto: rellenar(m.texto, cliente) }} telefono={telefono} />)}
          {!lista.length && <div style={{ fontSize: 12, color: C.textMuted }}>No tienes mensajes propios. Toca Editar para agregar.</div>}
        </div>
      )}
    </div>
  )
}

// Seguimiento de una cotizacion por confirmar: anotar pregunta/respuesta y esperar hasta una fecha.
function Seguimiento({ q, hoy, onGuardar, guardando }) {
  const e = estadoSeguimiento(q, hoy)
  const [fecha, setFecha] = useState('')
  const rapido = [['1 semana', 7], ['2 semanas', 14], ['1 mes', 30]]
  return (
    <div style={bloque} data-testid="ficha-seguimiento">
      <div style={{ ...titulo, marginBottom: 8 }}>Seguimiento</div>
      <div style={{ fontSize: 12.5, color: C.textSub, marginBottom: 8, lineHeight: 1.5 }}>
        {e.veces ? `Preguntado ${e.veces} ${e.veces === 1 ? 'vez' : 'veces'}, la última el ${fechaCorta(e.ultima)}.` : 'Todavía no le preguntas.'}
        {e.respondio && ` Respondió el ${fechaCorta(e.respondio)}.`}
        {e.esperando && <> <b style={{ color: C.text }}>Esperando hasta el {fechaCorta(e.esperando)}.</b></>}
        {e.tocaPreguntar && <b style={{ color: TONOS.ambar }}> Toca preguntar.</b>}
        {e.yaCompro && <b style={{ color: C.green }}> Ya compró con la N° {e.yaCompro.cotNum}: no hace falta preguntarle por esta.</b>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" disabled={guardando} style={boton} data-atajo="pregunte" title="Tecla P" onClick={() => onGuardar(registrarPregunta(q.seguimiento, hoy))}>✓ Le pregunté hoy</button>
        {e.veces > 0 && !e.respondio && <button type="button" disabled={guardando} style={boton} data-atajo="respondio" title="Tecla R" onClick={() => onGuardar(registrarRespuesta(q.seguimiento, hoy))}>Respondió hoy</button>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, fontSize: 12, color: C.textSub }}>
        <span>Pospuso, esperar:</span>
        {rapido.map(([t, d]) => <button key={t} type="button" disabled={guardando} style={boton} onClick={() => onGuardar(esperarHasta(q.seguimiento, sumarDias(hoy, d)))}>{t}</button>)}
        <input type="date" value={fecha} min={sumarDias(hoy, 1)} onChange={ev => setFecha(ev.target.value)} aria-label="Esperar hasta" style={{ fontSize: 12, padding: '3px 6px', border: '1px solid ' + C.border, borderRadius: 6, fontFamily: 'inherit' }} />
        {fecha && <button type="button" disabled={guardando || fecha <= hoy} style={botonVerde} onClick={() => { onGuardar(esperarHasta(q.seguimiento, fecha)); setFecha('') }}>Esperar</button>}
        {q.seguimiento?.esperarHasta && <button type="button" disabled={guardando} style={{ ...boton, color: C.red }} onClick={() => onGuardar(esperarHasta(q.seguimiento, ''))}>Quitar espera</button>}
      </div>
    </div>
  )
}

function Bitacora({ q, hoy, onGuardar, guardando }) {
  const [texto, setTexto] = useState('')
  const notas = q.seguimiento?.bitacora || []
  const anotar = async () => { if (!texto.trim()) return; await onGuardar(anotarBitacora(q.seguimiento, hoy, texto)); setTexto('') }
  return (
    <div style={bloque} data-testid="ficha-bitacora">
      <div style={{ ...titulo, marginBottom: 8 }}>Bitácora</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === 'Enter' && anotar()} placeholder="Qué hablaron: “pidió 5 niveles”, “lo ve en enero”…"
          aria-label="Nota para la bitácora" style={{ ...styles.input, padding: '6px 9px', fontSize: 12.5 }} />
        <button type="button" disabled={guardando || !texto.trim()} onClick={anotar} style={botonVerde}>Anotar</button>
      </div>
      {notas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          {[...notas.entries()].reverse().map(([i, n]) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: C.text, alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, color: C.textMuted, whiteSpace: 'nowrap' }}>{fechaCorta(n.fecha)}</span>
              <span style={{ flex: 1 }}>{n.texto}</span>
              <button type="button" disabled={guardando} aria-label="Borrar nota" onClick={() => onGuardar(quitarDeBitacora(q.seguimiento, i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.textMuted, padding: 0 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EstadoCotizacion({ q, onEstado, guardando }) {
  const [rechazando, setRechazando] = useState(false)
  if (q.instalacion?.fecha) return null
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {q.status === 'por confirmar' && !rechazando && <>
        <button type="button" disabled={guardando} style={botonVerde} data-atajo="confirmo" title="Tecla C" onClick={() => onEstado('confirmada')}>✓ Confirmó</button>
        <button type="button" disabled={guardando} style={{ ...boton, color: C.red }} onClick={() => setRechazando(true)}>Rechazó…</button>
      </>}
      {rechazando && <>
        <span style={{ fontSize: 12, color: C.textSub, alignSelf: 'center' }}>Motivo:</span>
        {MOTIVOS_RECHAZO.map(m => <button key={m} type="button" disabled={guardando} style={{ ...boton, color: C.red }} onClick={() => { onEstado('rechazada', m); setRechazando(false) }}>{m}</button>)}
        <button type="button" style={boton} onClick={() => setRechazando(false)}>Cancelar</button>
      </>}
      {q.status !== 'por confirmar' && <button type="button" disabled={guardando} style={boton} onClick={() => onEstado('por confirmar')}>Volver a por confirmar</button>}
    </div>
  )
}

// El id del PDF guardado: de Drive (/d/<id>/view) o del backend local (?id=).
function idPdf(url) {
  const m = String(url || '').match(/\/d\/([^/?#]+)/)
  if (m) return m[1]
  try { return new URL(url, window.location.href).searchParams.get('id') || '' } catch { return '' }
}
const nombrePdf = nombre => `Cotizacion ${(nombre || 'cliente').trim()} - Repisas Don Maxi.pdf`
function descargar(blob, nombre) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = nombre
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10000)
}

// Deja el PDF de la cotizacion en su chat, con el mensaje de envio como comentario. No lo envia:
// WhatsApp muestra la vista previa y tu das Enter. Si la extension no puede, lo descarga y copia el
// mensaje para arrastrarlo a mano.
function PdfEnSuChat({ q, onEnWhatsapp }) {
  const [estado, setEstado] = useState({ texto: '', tono: '' })
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { setEstado({ texto: '', tono: '' }) }, [q.cotNum])
  const id = idPdf(q.pdfUrl)
  async function dejar() {
    setOcupado(true); setEstado({ texto: 'Trayendo el PDF…', tono: '' })
    try {
      const r = await adminFetch('/.netlify/functions/pdf-cotizacion?id=' + encodeURIComponent(id))
      if (!r.ok) throw new Error((await r.text()).slice(0, 120) || 'error ' + r.status)
      const archivo = await r.blob()
      const nombre = nombrePdf(q.nombre), texto = mensajeEnvioCotizacion(q.linkAgenda)
      setEstado({ texto: 'Dejándolo en su chat… (un PDF grande tarda unos segundos)', tono: '' })
      const res = await adjuntarEnChat(q.telefono, { archivo, nombre, texto })
      if (res.ok && res.motivo === 'sin-comentario') {
        navigator.clipboard?.writeText(texto).catch(() => {})
        setEstado({ texto: '✓ El PDF quedó en su chat. El mensaje no entró solo: lo copié, pégalo en el comentario (Ctrl+V) y da Enter.', tono: 'verde' }); onEnWhatsapp?.()
      } else if (res.ok) { setEstado({ texto: '✓ Quedó en su chat con su mensaje: revísalo y da Enter en WhatsApp', tono: 'verde' }); onEnWhatsapp?.() }
      else if (res.motivo === 'sin-whatsapp') setEstado({ texto: 'WhatsApp dice que este número no existe', tono: 'rojo' })
      else {
        descargar(archivo, nombre)
        navigator.clipboard?.writeText(texto).catch(() => {}) // sin esperar: con WhatsApp enfocado puede no contestar
        setEstado({ texto: 'No pude dejarlo en el chat (¿extensión al día y WhatsApp abierto?). Lo descargué y copié el mensaje: arrástralo al chat.', tono: 'ambar' })
      }
    } catch (e) { setEstado({ texto: 'No se pudo traer el PDF: ' + e.message, tono: 'rojo' }) }
    finally { setOcupado(false) }
  }
  if (!q.telefono) return null
  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" data-atajo="pdf" disabled={!id || ocupado} onClick={dejar} title={id ? 'Tecla D' : 'Esta cotización no tiene PDF guardado'}
        style={{ ...botonVerde, opacity: id ? 1 : .5 }}>📄 {ocupado ? 'Preparando…' : id ? 'PDF en su chat' : 'Sin PDF guardado'}</button>
      {estado.texto && <div data-testid="estado-pdf" style={{ fontSize: 11.5, marginTop: 4, color: TONOS[estado.tono] || C.textSub }}>{estado.texto}</div>}
    </div>
  )
}

function FichaCliente({ q, hoy, eventoManana, onGuardar, onEstado, guardando, onVerCotizacion, onEnWhatsapp }) {
  const estado = QUOTE_STATUS_LABELS[q.status] || QUOTE_STATUS_LABELS['por confirmar']
  const mensajes = mensajesPara(q, hoy, { eventoManana })
  const grupos = [...new Set(mensajes.map(m => m.grupo))]
  const usado = m => { if (m.seguimiento && q.status === 'por confirmar') onGuardar(registrarPregunta(q.seguimiento, hoy)) }
  return (
    <>
      <div style={bloque} data-testid="ficha-cliente">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: C.text, flex: 1 }}>{q.nombre || 'Sin nombre'}</span>
          <span style={styles.badge(estado.color)}>{estado.label}</span>
        </div>
        <div style={{ fontSize: 12.5, color: C.textSub, marginTop: 3 }}>
          N° {q.cotNum}{q.total ? ` · ${fmt(q.total)}` : ''}{' · '}
          <button type="button" onClick={() => onVerCotizacion(q.cotNum)} style={{ border: 'none', background: 'none', padding: 0, color: C.orangeDark, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 }}>Ver cotización</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{q.telefono ? telefonoLegible(q.telefono) : 'Sin teléfono'}</span>
          {q.telefono && <Copiar texto={telefonoLegible(q.telefono)}>Copiar</Copiar>}
          {q.telefono && <button type="button" style={botonVerde} onClick={() => abrirChatEnMarco(q.telefono)}>Abrir su chat</button>}
        </div>
        <PdfEnSuChat q={q} onEnWhatsapp={onEnWhatsapp} />
        {q.telefono && (sinWhatsapp(q)
          ? <div data-testid="ficha-sin-whatsapp" style={{ marginTop: 8, padding: '7px 9px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 12, color: C.red, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ flex: 1 }}>WhatsApp dice que este número no existe ({fechaCorta(q.seguimiento.sinWhatsapp.fecha)}). Revísalo por fuera: si lo corriges en la cotización, sale solo de esta lista.</span>
              <button type="button" style={boton} onClick={() => onGuardar(quitarSinWhatsapp(q.seguimiento))}>Sí tiene</button>
            </div>
          : <button type="button" onClick={() => onGuardar(marcarSinWhatsapp(q.seguimiento, q.telefono, hoy))} style={{ border: 'none', background: 'none', padding: 0, marginTop: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, color: C.textMuted, textDecoration: 'underline' }}>No tiene WhatsApp</button>)}
        {q.direccion && <div style={{ fontSize: 12, color: C.textSub, marginTop: 6 }}>📍 {q.direccion}</div>}
        {q.instalacion?.fecha && <div style={{ fontSize: 12, color: C.green, fontWeight: 700, marginTop: 4 }}>🛠️ Instalación {fechaCorta(q.instalacion.fecha)}, {q.instalacion.inicio}–{q.instalacion.fin}</div>}
        <EstadoCotizacion q={q} onEstado={onEstado} guardando={guardando} />
      </div>
      {q.status === 'por confirmar' && <Seguimiento q={q} hoy={hoy} onGuardar={onGuardar} guardando={guardando} />}
      <div style={bloque} data-testid="ficha-mensajes">
        <div style={{ ...titulo, marginBottom: 8 }}>Mensajes para {String(q.nombre || 'el cliente').split(' ')[0]}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {grupos.map(g => (
            <React.Fragment key={g}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, marginTop: 4 }}>{g}</div>
              {mensajes.map((m, i) => m.grupo === g && <Mensaje key={m.id} numero={i + 1} m={m} telefono={q.telefono} onUsado={usado} />)}
            </React.Fragment>
          ))}
          {q.status !== 'rechazada' && !q.instalacion?.fecha && q.linkAgenda && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              <CopiarHorarios link={q.linkAgenda} nombre={q.nombre} />
              {q.linkPago && <Copiar texto={q.linkPago}>Copiar link de pago</Copiar>}
              <Copiar texto={q.linkAgenda}>Copiar link para agendar</Copiar>
            </div>
          )}
        </div>
      </div>
      <Bitacora q={q} hoy={hoy} onGuardar={onGuardar} guardando={guardando} />
      <MisMensajes cliente={q} telefono={q.telefono} desde={mensajes.length} />
    </>
  )
}

function FichaEvento({ e }) {
  const m = [{ id: 'recordatorio', titulo: 'Recordatorio de mañana', texto: mensajeRecordatorio(e) }]
  return (
    <>
      <div style={bloque} data-testid="ficha-evento">
        <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{e.cliente || e.titulo}</div>
        <div style={{ fontSize: 12.5, color: C.textSub, marginTop: 3 }}>{e.tipo === 'instalacion' ? 'Instalación' : 'Visita de medición'} mañana, {e.inicio}–{e.fin}</div>
        {e.ubicacion && <div style={{ fontSize: 12, color: C.textSub, marginTop: 4 }}>📍 {e.ubicacion}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{e.telefono ? telefonoLegible(e.telefono) : 'Sin teléfono'}</span>
          {e.telefono && <Copiar texto={telefonoLegible(e.telefono)}>Copiar</Copiar>}
          {e.telefono && <button type="button" style={botonVerde} onClick={() => abrirChatEnMarco(e.telefono)}>Abrir su chat</button>}
        </div>
      </div>
      <div style={bloque}>
        <div style={{ ...titulo, marginBottom: 8 }}>Mensajes</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{m.map((x, i) => <Mensaje key={x.id} numero={i + 1} m={x} telefono={e.telefono} />)}</div>
      </div>
      <MisMensajes cliente={{ nombre: e.cliente }} telefono={e.telefono} desde={m.length} />
    </>
  )
}

export default function ModuloWhatsapp({ onVerCotizacion }) {
  const hoy = ahoraEnZona().fecha
  const [quotes, setQuotes] = useState([])
  const [eventos, setEventos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('toca')
  const [buscar, setBuscar] = useState('')
  const [sel, setSel] = useState(null) // { cotNum } | { evento }
  const [envio, setEnvio] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [hayExtension, setHayExtension] = useState(extensionInstalada)
  const [ayuda, setAyuda] = useState(false)
  const campoBuscar = React.useRef(null)

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    const manana = sumarDias(ahoraEnZona().fecha, 1)
    try {
      const [r, cal] = await Promise.all([
        apiFetch('/.netlify/functions/get-quotes'),
        apiFetch(`/.netlify/functions/calendario?desde=${manana}&hasta=${manana}`).catch(() => ({})),
      ])
      if (!r.ok) throw new Error(r.error || 'No se pudieron cargar los clientes')
      setQuotes(marcarYaCompro(r.quotes || []))
      setEventos((cal.eventos || []).filter(e => e.tipo === 'instalacion' || e.tipo === 'visita'))
    } catch (e) { setError(e.message || 'No se pudo conectar') }
    finally { setCargando(false) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const grupos = useMemo(() => clasificar(quotes, hoy), [quotes, hoy])
  const lista = buscar.trim() ? buscarClientes(grupos.todos, buscar, 40) : grupos[filtro] || []
  const q = sel?.cotNum ? quotes.find(x => x.cotNum === sel.cotNum) : null
  const eventoDe = c => eventos.find(e => e.cotNum && String(e.cotNum) === String(c?.cotNum)) || null

  // Los botones de WhatsApp de otras partes del panel (o de esta) dejan aca el mensaje copiado, y
  // si el telefono es de un cliente, lo eligen.
  useEffect(() => {
    const recibir = async ev => {
      const { telefono = '', texto = '', cliente = '' } = ev.detail || {}
      let copiado = false
      if (texto) { try { await navigator.clipboard.writeText(texto); copiado = true } catch { /* sin permiso */ } }
      setEnvio({ telefono, texto, cliente, copiado })
      const c = telefono && quotes.find(x => mismoTelefono(x.telefono, telefono))
      if (c) setSel({ cotNum: c.cotNum })
    }
    window.addEventListener(EVENTO_PARA_ENVIAR, recibir)
    return () => window.removeEventListener(EVENTO_PARA_ENVIAR, recibir)
  }, [quotes])

  // Tocar un cliente abre su ficha y, al tiro, su chat (si tiene celular y WhatsApp esta listo).
  // WhatsApp se queda con el teclado al abrir un chat: se le devuelve al panel para seguir con las
  // flechas, salvo que hayas pedido ir a WhatsApp (1–9, Enter).
  const raiz = React.useRef(null)
  const irAWhatsapp = React.useRef(0)
  function retenerTeclado() {
    const desde = Date.now()
    for (const t of [80, 300, 700, 1200, 2000]) setTimeout(() => {
      if (irAWhatsapp.current > desde || !esMarco(document.activeElement)) return
      raiz.current?.focus({ preventScroll: true })
    }, t)
  }
  function elegir(seleccion, telefono) {
    setSel(seleccion)
    if (telefono && hayExtension) { abrirChatEnMarco(telefono); retenerTeclado() }
  }

  // Atajos de teclado (ver atajosWhatsapp.js). La lista que se ve, en orden, con como elegir a cada uno.
  const filas = !buscar.trim() && filtro === 'manana'
    ? eventos.map(e => {
        const c = e.cotNum && quotes.find(x => String(x.cotNum) === String(e.cotNum))
        return { testid: 'evento-' + e.id, activo: sel?.evento?.id === e.id || (c && sel?.cotNum === c.cotNum), elegir: () => elegir(c ? { cotNum: c.cotNum } : { evento: e }, c?.telefono || e.telefono) }
      })
    : lista.map(c => ({ testid: 'cliente-' + c.cotNum, activo: sel?.cotNum === c.cotNum, elegir: () => elegir({ cotNum: c.cotNum }, c.telefono) }))
  function hacer(a) {
    const modulo = document.querySelector('[data-testid=modulo-whatsapp]')
    if (a.tipo === 'mover') {
      const i = siguiente(filas.findIndex(f => f.activo), a.paso, filas.length)
      if (i < 0) return
      if (document.activeElement === campoBuscar.current) campoBuscar.current.blur()
      filas[i].elegir()
      modulo?.querySelector(`[data-testid="${filas[i].testid}"]`)?.scrollIntoView({ block: 'nearest' })
    } else if (a.tipo === 'filtro') {
      const i = FILTROS.findIndex(f => f.id === filtro)
      setFiltro(FILTROS[(i + a.paso + FILTROS.length) % FILTROS.length].id)
    } else if (a.tipo === 'mensaje') {
      const b = modulo?.querySelector(`[data-atajo="${a.copiar ? 'copiar' : 'chat'}-${a.n}"]`)
      if (!b) return
      b.click()
      if (!a.copiar) { irAWhatsapp.current = Date.now(); setTimeout(enfocarMarco, 400) }
    } else if (a.tipo === 'clic') {
      modulo?.querySelector(`[data-atajo="${a.atajo}"]`)?.click()
    } else if (a.tipo === 'whatsapp') {
      irAWhatsapp.current = Date.now(); enfocarMarco()
    } else if (a.tipo === 'buscar') {
      campoBuscar.current?.focus(); campoBuscar.current?.select()
    } else if (a.tipo === 'ayuda') {
      setAyuda(v => !v)
    } else if (a.tipo === 'salir') {
      const el = document.activeElement
      if (el === campoBuscar.current && buscar) setBuscar('')
      else if (el && el !== document.body) el.blur()
      else setAyuda(false)
    }
  }
  // WhatsApp dijo que el numero no existe: se marca en sus cotizaciones (quedan en "Sin WhatsApp").
  const sinWhatsappRef = React.useRef(null)
  sinWhatsappRef.current = tel => {
    for (const c of quotes) if (mismoTelefono(c.telefono, tel) && !sinWhatsapp(c)) guardarCambios(c.cotNum, { seguimiento: marcarSinWhatsapp(c.seguimiento, c.telefono, hoy) })
  }
  const hacerRef = React.useRef(hacer)
  hacerRef.current = hacer
  useEffect(() => {
    const tecla = e => {
      if (e.defaultPrevented || e.isComposing) return
      const el = e.target
      const escribiendo = el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName)
      const campo = !escribiendo ? '' : el === campoBuscar.current ? 'buscar' : 'otro'
      // Enter o espacio sobre un boton lo apreta, como siempre (salvo sobre un cliente de la lista).
      if (!escribiendo && el?.tagName === 'BUTTON' && !/^(cliente|evento)-/.test(el.dataset.testid || '') && (e.key === 'Enter' || e.key === ' ')) return
      const a = accionDeTecla(e, campo)
      if (!a) return
      e.preventDefault()
      hacerRef.current(a)
    }
    window.addEventListener('keydown', tecla)
    const dejar = oirTeclasDelMarco(d => { const a = accionDeTecla(d, 'otro'); if (a) hacerRef.current(a) })
    const dejar2 = oirSinWhatsapp(tel => sinWhatsappRef.current(tel))
    return () => { window.removeEventListener('keydown', tecla); dejar(); dejar2() }
  }, [])

  // Se ve al instante y se guarda en la planilla por detras (tarda 1–2 s); si falla, se deshace.
  // Los guardados van en fila para que dos anotaciones seguidas no se pisen.
  const cola = React.useRef(Promise.resolve())
  function guardarCambios(cotNum, cambios) {
    const antes = quotes.find(x => x.cotNum === cotNum)
    const previo = antes && Object.fromEntries(Object.keys(cambios).map(k => [k, antes[k]]))
    setQuotes(prev => prev.map(x => x.cotNum === cotNum ? { ...x, ...cambios } : x))
    setGuardando(true)
    cola.current = cola.current.then(async () => {
      try {
        const r = await apiFetch('/.netlify/functions/save-quote', { method: 'POST', body: JSON.stringify({ cotNum, ...cambios }) })
        if (!r.ok) throw new Error(r.error || 'error')
      } catch (e) {
        if (previo) setQuotes(prev => prev.map(x => x.cotNum === cotNum ? { ...x, ...previo } : x))
        window.alert('No se pudo guardar, se deshizo: ' + e.message)
      }
    }).finally(() => setGuardando(false))
  }

  return (
    <div data-testid="modulo-whatsapp" ref={raiz} tabIndex={-1} style={{ outline: 'none', display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr) 360px', height: '100%', minHeight: 0, background: C.border, gap: 1 }}>
      {/* Clientes */}
      <section style={columna} aria-label="Clientes">
        <div style={{ padding: '10px 12px', borderBottom: '1px solid ' + C.border, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={titulo}>Clientes</span>
            <button type="button" onClick={cargar} disabled={cargando} style={{ ...boton, marginLeft: 'auto' }}>{cargando ? 'Cargando…' : '↻ Actualizar'}</button>
          </div>
          <input ref={campoBuscar} type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar: nombre, N°, teléfono…  ( / )" aria-label="Buscar cliente"
            style={{ ...styles.input, padding: '7px 10px', fontSize: 13 }} />
          {!buscar.trim() && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {FILTROS.map(f => {
                const n = f.id === 'manana' ? eventos.length : (grupos[f.id] || []).length
                const activo = filtro === f.id
                return (
                  <button key={f.id} type="button" title={f.ayuda} onClick={() => setFiltro(f.id)} aria-pressed={activo} style={{
                    border: '1px solid ' + (activo ? C.orange : C.border), background: activo ? C.orange : 'white', color: activo ? 'white' : C.textSub,
                    borderRadius: 99, padding: '3px 9px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}>{f.nombre}{f.id !== 'todos' ? ` · ${n}` : ''}</button>
                )
              })}
            </div>
          )}
        </div>
        <div style={{ padding: '5px 12px', borderBottom: '1px solid ' + C.border, fontSize: 11, color: C.textMuted, background: '#FAFAFA' }}>
          <Tecla>↓</Tecla><Tecla>↑</Tecla>clientes · <Tecla>1</Tecla>…<Tecla>9</Tecla>mensajes · <Tecla>?</Tecla>más
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }} data-testid="lista-clientes">
          {error && <div style={{ ...styles.errorBox, margin: 10 }}>{error}</div>}
          {!buscar.trim() && filtro === 'manana'
            ? eventos.map((e, i) => <FilaEvento key={e.id} e={e} activo={filas[i].activo} onElegir={filas[i].elegir} />)
            : lista.map((c, i) => <FilaCliente key={c.cotNum} q={c} hoy={hoy} activo={filas[i].activo} onElegir={filas[i].elegir} />)}
          {!cargando && !error && (filtro === 'manana' && !buscar.trim() ? !eventos.length : !lista.length) && (
            <div style={{ ...styles.empty, padding: '30px 14px', fontSize: 13 }}>{buscar.trim() ? `Nadie con “${buscar}”.` : 'No hay nadie aquí 🙌'}</div>
          )}
        </div>
      </section>

      {/* WhatsApp */}
      <section style={columna} aria-label="WhatsApp">
        <div style={{ height: 44, boxSizing: 'border-box', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', flexShrink: 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#25D366' }} />
          <span style={{ fontSize: 13.5, fontWeight: 800, color: C.text }}>WhatsApp</span>
          {hayExtension && <button type="button" onClick={inicioMarco} title="Vuelve a la lista de chats" style={boton}>↻ Chats</button>}
          <span style={{ marginLeft: 'auto' }} />
          <button type="button" onClick={() => setAyuda(v => !v)} aria-pressed={ayuda} title="Atajos de teclado (?)" style={boton}>⌨ Atajos</button>
          {hayExtension && <ControlZoom />}
        </div>
        {hayExtension ? <LugarWhatsapp /> : <SinExtension onReintentar={() => setHayExtension(extensionInstalada())} />}
      </section>

      {/* Ficha */}
      <section style={{ ...columna, overflowY: 'auto' }} aria-label="Ficha del cliente">
        {ayuda && <AyudaAtajos onCerrar={() => setAyuda(false)} />}
        {envio && <div style={{ padding: 10, borderBottom: '1px solid ' + C.border }}><ParaEnviar envio={envio} onAbrirChat={abrirChatEnMarco} onCerrar={() => setEnvio(null)} /></div>}
        {q ? <FichaCliente q={q} hoy={hoy} eventoManana={eventoDe(q)} guardando={false} onVerCotizacion={onVerCotizacion}
              onEnWhatsapp={() => { irAWhatsapp.current = Date.now(); enfocarMarco() }}
              onGuardar={seguimiento => guardarCambios(q.cotNum, { seguimiento })}
              onEstado={(status, motivo = '') => guardarCambios(q.cotNum, { status, motivoRechazo: motivo })} />
          : sel?.evento ? <FichaEvento e={sel.evento} />
          : <>
              <div style={{ ...bloque, fontSize: 13, color: C.textSub, lineHeight: 1.5 }}>
                Elige un cliente a la izquierda para ver en qué va, anotar el seguimiento y tener sus mensajes listos.
              </div>
              <MisMensajes cliente={null} telefono="" />
            </>}
      </section>
    </div>
  )
}

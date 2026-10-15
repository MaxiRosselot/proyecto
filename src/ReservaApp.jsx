import React, { useCallback, useEffect, useMemo, useState } from 'react'
import './reserva.css'

// /reserva?c=<N°>&t=<firma>: el cliente elige el dia de su instalacion y paga (transferencia con
// descuento o Mercado Pago). Las reglas viven en netlify/functions/lib/reservas.mjs.
const API = '/.netlify/functions/reserva'
const pesos = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const soloDigitos = s => String(s || '').replace(/\D/g, '')
const fechaUTC = iso => new Date(iso + 'T12:00:00Z')
const fmt = (iso, opciones) => new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', ...opciones }).format(fechaUTC(iso))
const fechaLarga = iso => { const t = fmt(iso, { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1) }
const diaCorto = iso => fmt(iso, { weekday: 'short' }).replace('.', '')
const numeroMes = iso => fmt(iso, { day: 'numeric', month: 'short' }).replace('.', '')

function Encabezado({ titulo, sub }) {
  return (
    <header className="rsv-hero">
      <img src="/logo.png" alt="Repisas Don Maxi" className="rsv-logo" />
      <h1>{titulo}</h1>
      {sub && <p>{sub}</p>}
    </header>
  )
}

function Ayuda({ whatsapp, cotNum }) {
  if (!whatsapp) return null
  const texto = `Hola, tengo una consulta sobre la cotización N° ${cotNum}`
  return <p className="rsv-pie">¿Dudas? Escríbenos por <a href={`https://wa.me/${soloDigitos(whatsapp)}?text=${encodeURIComponent(texto)}`}>WhatsApp</a></p>
}

function Estado({ icono, titulo, children }) {
  return (
    <section className="rsv-tarjeta rsv-estado" role="status">
      <div className="icono" aria-hidden="true">{icono}</div>
      <h2>{titulo}</h2>
      {children}
    </section>
  )
}

const bloqueTexto = r => `${fechaLarga(r.fecha)} · ${r.inicio} a ${r.fin} hrs`

// Paso 1: semanas de lunes a viernes con sus dos bloques.
function ElegirDia({ dias, elegido, onElegir }) {
  const semanas = useMemo(() => {
    const grupos = []
    for (const d of dias) {
      const lunes = new Date(fechaUTC(d.fecha)); lunes.setUTCDate(lunes.getUTCDate() - ((lunes.getUTCDay() + 6) % 7))
      const clave = lunes.toISOString().slice(0, 10)
      if (grupos.at(-1)?.clave !== clave) grupos.push({ clave, dias: [] })
      grupos.at(-1).dias.push(d)
    }
    return grupos
  }, [dias])
  const [i, setI] = useState(0)
  const semana = semanas[i]
  if (!semana) return <p className="rsv-sub">No quedan horarios disponibles en las próximas semanas. Escríbenos y lo coordinamos.</p>
  return (
    <div>
      <div className="rsv-semana">
        <button type="button" className="rsv-flecha" aria-label="Semana anterior" disabled={i === 0} onClick={() => setI(i - 1)}>‹</button>
        <span>Semana del {numeroMes(semana.dias[0].fecha)}</span>
        <button type="button" className="rsv-flecha" aria-label="Semana siguiente" disabled={i === semanas.length - 1} onClick={() => setI(i + 1)}>›</button>
      </div>
      {semana.dias.map(d => (
        <div className="rsv-dia" key={d.fecha} data-dia={d.fecha}>
          <div className="rsv-dia-nombre">{diaCorto(d.fecha)}<small>{numeroMes(d.fecha)}</small></div>
          {d.bloques.map(b => {
            const activo = elegido?.fecha === d.fecha && elegido?.inicio === b.inicio
            return (
              <button key={b.inicio} type="button" className="rsv-bloque" disabled={!b.libre} aria-pressed={activo}
                aria-label={`${fechaLarga(d.fecha)} de ${b.inicio} a ${b.fin}${b.libre ? '' : ' (ocupado)'}`}
                onClick={() => onElegir({ fecha: d.fecha, inicio: b.inicio, fin: b.fin })}>
                {b.libre ? `${b.inicio} – ${b.fin}` : 'Ocupado'}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// Paso 2: medio de pago y cuanto. La transferencia va primero: tiene descuento.
function ElegirPago({ pagos, medio, setMedio, opcion, setOpcion }) {
  const medios = [
    pagos.transferencia && { id: 'transferencia', nombre: 'Transferencia', detalle: 'Te mostramos los datos de la cuenta', info: pagos.transferencia },
    pagos.mercadopago && { id: 'mercadopago', nombre: 'Mercado Pago', detalle: 'Débito o crédito, hasta 3 cuotas sin interés', info: pagos.mercadopago },
  ].filter(Boolean)
  const elegido = medios.find(m => m.id === medio)?.info
  return (
    <>
      <div className="rsv-medios" role="radiogroup" aria-label="Medio de pago">
        {medios.map(m => (
          <button key={m.id} type="button" className="rsv-medio" aria-pressed={medio === m.id} onClick={() => setMedio(m.id)}>
            <span className="rsv-medio-radio" />
            <span><strong>{m.nombre}{m.info.descuento ? <span className="rsv-ahorro">Ahorra {m.info.descuento}%</span> : null}</strong><small>{m.detalle}</small></span>
            <span className="rsv-medio-precio">{m.info.descuento ? <s>{pesos(m.info.total)}</s> : null}{pesos(m.info.pagado ? m.info.saldo : m.info.totalAPagar)}</span>
          </button>
        ))}
      </div>
      {elegido && elegido.opciones.length > 1 && (
        <div className="rsv-cuanto" role="radiogroup" aria-label="Cuánto pagar">
          {elegido.opciones.map(o => (
            <button key={o.id} type="button" aria-pressed={opcion === o.id} onClick={() => setOpcion(o.id)}>
              <span>{o.id === 'abono' ? 'Abono 50% ahora' : 'Total'}</span><strong>{pesos(o.monto)}</strong>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function DatosBanco({ banco, monto, cotNum }) {
  const [copiado, setCopiado] = useState('')
  const copiar = async (clave, valor) => { try { await navigator.clipboard.writeText(valor); setCopiado(clave); setTimeout(() => setCopiado(''), 1500) } catch { /* sin portapapeles */ } }
  const filas = [
    ['Nombre', banco.razonSocial], ['RUT', banco.rut], ['Banco', banco.banco],
    [`Cuenta ${banco.tipoCuenta}`, banco.numeroCuenta], ['Monto', pesos(monto), String(monto)], ['Asunto', `Cotización N° ${cotNum}`],
  ]
  return (
    <dl className="rsv-banco">
      {filas.map(([etiqueta, valor, paraCopiar]) => (
        <div key={etiqueta}>
          <dt>{etiqueta}</dt>
          <dd>{valor}<button type="button" className="rsv-copiar" onClick={() => copiar(etiqueta, paraCopiar ?? valor)}>{copiado === etiqueta ? '✓' : 'Copiar'}</button></dd>
        </div>
      ))}
    </dl>
  )
}

export default function ReservaApp() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const c = params.get('c') || '', t = params.get('t') || ''
  const volvioDeMP = params.get('estado')
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [bloque, setBloque] = useState(null)
  const [paso, setPaso] = useState('dia') // dia | pago | transferir
  const [medio, setMedio] = useState('transferencia')
  const [opcion, setOpcion] = useState('total')
  const [enviando, setEnviando] = useState(false)
  const [reintentar, setReintentar] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`${API}?c=${encodeURIComponent(c)}&t=${encodeURIComponent(t)}`).then(x => x.json())
      if (!r.ok) throw new Error(r.error || 'No pudimos abrir tu cotización')
      setDatos(r); setError('')
      return r
    } catch (e) { setError(e.message); return null }
  }, [c, t])
  useEffect(() => { cargar() }, [cargar])

  // Volvio de Mercado Pago: el aviso del pago puede tardar unos segundos en llegar.
  useEffect(() => {
    if (datos?.estado !== 'esperando-pago' || volvioDeMP !== 'ok') return
    let vueltas = 0
    const id = setInterval(async () => { const r = await cargar(); if (++vueltas > 15 || r?.estado !== 'esperando-pago') clearInterval(id) }, 3000)
    return () => clearInterval(id)
  }, [datos?.estado, volvioDeMP, cargar])

  // Si ya tiene fecha (o solo paga el saldo), parte en el pago.
  useEffect(() => { if (datos?.estado === 'agendada') setPaso('pago') }, [datos?.estado])
  useEffect(() => { if (datos && !datos.pagos.transferencia?.opciones.length && datos.pagos.mercadopago) setMedio('mercadopago') }, [datos])

  const info = datos?.pagos?.[medio]
  const elegida = info?.opciones.find(o => o.id === opcion) || info?.opciones[0]

  async function enviar(accion) {
    setEnviando(true); setAviso('')
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ c, t, accion, opcion: elegida.id, ...(bloque ? { fecha: bloque.fecha, inicio: bloque.inicio } : {}) }) }).then(x => x.json().then(j => ({ ...j, status: x.status })))
      if (!r.ok) {
        if (r.status === 409) { setBloque(null); setPaso('dia'); await cargar() }
        throw new Error(r.error || 'No pudimos completar la reserva')
      }
      if (accion === 'mercadopago') { window.location.href = r.url; return }
      setReintentar(false); await cargar()
    } catch (e) { setAviso(e.message) }
    finally { setEnviando(false) }
  }

  if (error) return <div className="rsv"><Encabezado titulo="Reserva tu instalación" /><div className="rsv-tarjeta"><p className="rsv-error">{error}</p></div></div>
  if (!datos) return <div className="rsv"><p className="rsv-cargando">Cargando tu cotización…</p></div>

  const { cotizacion: q, estado, whatsapp } = datos
  const titulo = `Hola${q.nombre ? ' ' + q.nombre : ''} 👋`
  const sub = `Cotización N° ${q.cotNum} · ${pesos(q.total)} con IVA`

  if (estado === 'lista' || estado === 'pagada-sin-fecha') return (
    <div className="rsv"><Encabezado titulo={titulo} sub={sub} />
      <Estado icono="✅" titulo="¡Todo listo!">
        <p>Tu cotización está pagada{q.instalacion ? ' y tu instalación confirmada' : ''}. ¡Gracias!</p>
        {q.instalacion && <p className="rsv-fecha">{bloqueTexto(q.instalacion)}</p>}
      </Estado>
      <Ayuda whatsapp={whatsapp} cotNum={q.cotNum} />
    </div>
  )

  if (estado === 'verificando') return (
    <div className="rsv"><Encabezado titulo={titulo} sub={sub} />
      <Estado icono="🧾" titulo="Estamos verificando tu transferencia">
        <p>Recibimos tu aviso por <strong>{pesos(q.reserva.monto)}</strong>. Apenas la veamos en nuestra cuenta te confirmamos por correo y WhatsApp.</p>
        {q.reserva.fecha && <p className="rsv-fecha">Te reservamos: {bloqueTexto(q.reserva)}</p>}
      </Estado>
      <div className="rsv-tarjeta"><h2>¿Aún no transfieres?</h2><DatosBanco banco={datos.banco} monto={q.reserva.monto} cotNum={q.cotNum} /></div>
      <Ayuda whatsapp={whatsapp} cotNum={q.cotNum} />
    </div>
  )

  if (estado === 'esperando-pago' && !reintentar) return (
    <div className="rsv"><Encabezado titulo={titulo} sub={sub} />
      <Estado icono="⏳" titulo={volvioDeMP === 'ok' ? 'Confirmando tu pago…' : 'Tu pago está en curso'}>
        <p>{volvioDeMP === 'ok' ? 'Mercado Pago nos está avisando del pago. Esto toma unos segundos.' : 'Estamos esperando la confirmación de Mercado Pago.'}</p>
        {q.reserva?.fecha && <p className="rsv-fecha">Horario reservado: {bloqueTexto(q.reserva)}</p>}
        <button type="button" className="rsv-enlace" onClick={() => { setReintentar(true); setPaso(q.instalacion ? 'pago' : 'dia') }}>¿No terminaste el pago? Elegir de nuevo</button>
      </Estado>
      <Ayuda whatsapp={whatsapp} cotNum={q.cotNum} />
    </div>
  )

  const conDia = !q.instalacion
  const rechazo = q.reserva?.estado === 'rechazada'
  return (
    <div className="rsv">
      <Encabezado titulo={titulo} sub={sub} />
      {rechazo && <p className="rsv-error">No pudimos verificar tu transferencia{q.reserva.motivo ? ` (${q.reserva.motivo})` : ''}. Puedes intentarlo de nuevo o escribirnos.</p>}
      {volvioDeMP === 'error' && <p className="rsv-error">El pago no se completó. Puedes intentarlo de nuevo.</p>}
      {aviso && <p className="rsv-error" role="alert">{aviso}</p>}

      {q.instalacion && (
        <section className="rsv-tarjeta">
          <h2>Tu instalación</h2>
          <p className="rsv-fecha">{bloqueTexto(q.instalacion)}</p>
          {q.saldo > 0 && <p className="rsv-nota">Te queda un saldo de {pesos(q.saldo)}. Puedes pagarlo aquí o al terminar la instalación.</p>}
        </section>
      )}

      {conDia && (
        <section className="rsv-tarjeta">
          <h2><span className="rsv-paso">1</span>Elige el día de tu instalación</h2>
          {paso === 'dia' ? (
            <>
              <p className="rsv-sub">Instalamos de lunes a viernes, en bloques de 3 horas.</p>
              <ElegirDia dias={datos.disponibilidad} elegido={bloque} onElegir={setBloque} />
              <button type="button" className="rsv-boton" disabled={!bloque} onClick={() => setPaso('pago')}>Continuar</button>
            </>
          ) : (
            <div className="rsv-elegido">
              <span><strong>{fechaLarga(bloque.fecha)}</strong>{bloque.inicio} a {bloque.fin} hrs</span>
              <button type="button" className="rsv-enlace" onClick={() => setPaso('dia')}>Cambiar</button>
            </div>
          )}
        </section>
      )}

      {(paso === 'pago' || paso === 'transferir') && (
        <section className="rsv-tarjeta">
          <h2>{conDia && <span className="rsv-paso">2</span>}¿Cómo quieres pagar?</h2>
          {paso === 'pago' ? (
            <>
              <p className="rsv-sub">{datos.pagos.transferencia?.descuento ? `Pagando por transferencia tienes ${datos.pagos.transferencia.descuento}% de descuento.` : 'Elige el medio de pago.'}</p>
              <ElegirPago pagos={datos.pagos} medio={medio} setMedio={m => { setMedio(m); setOpcion('total') }} opcion={elegida?.id} setOpcion={setOpcion} />
              {medio === 'transferencia'
                ? <button type="button" className="rsv-boton" disabled={!elegida} onClick={() => setPaso('transferir')}>Ver datos para transferir</button>
                : <button type="button" className="rsv-boton mp" disabled={!elegida || enviando} onClick={() => enviar('mercadopago')}>{enviando ? 'Abriendo Mercado Pago…' : `Pagar ${pesos(elegida?.monto)} con Mercado Pago`}</button>}
            </>
          ) : (
            <>
              <p className="rsv-sub">Transfiere este monto y avísanos. Te confirmamos apenas lo veamos en la cuenta.</p>
              <div className="rsv-monto-transferir">{pesos(elegida.monto)}</div>
              <DatosBanco banco={datos.banco} monto={elegida.monto} cotNum={q.cotNum} />
              <button type="button" className="rsv-boton" disabled={enviando} onClick={() => enviar('transferencia')}>{enviando ? 'Enviando…' : 'Ya hice la transferencia'}</button>
              <button type="button" className="rsv-boton secundario" onClick={() => setPaso('pago')}>Volver</button>
              {conDia && <p className="rsv-nota">Tu horario queda reservado mientras verificamos el pago.</p>}
            </>
          )}
        </section>
      )}
      <Ayuda whatsapp={whatsapp} cotNum={q.cotNum} />
    </div>
  )
}

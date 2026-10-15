import React, { useState } from 'react'
import { C, apiFetch, fmt, styles } from './utils.js'
import { fechaLarga } from './whatsappInstalacion.js'

// El cliente aviso que transfirio desde su link. Don Maxi revisa la cuenta y confirma: se registra
// el pago, se agenda la instalacion (invitacion de Calendar) y se le manda el correo de confirmacion.
export default function TransferenciaPorVerificar({ quote, onCambio }) {
  const r = quote.reserva
  const [guardando, setGuardando] = useState(false)
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')

  async function llamar(cuerpo) {
    setGuardando(true); setError('')
    try {
      const res = await apiFetch('/.netlify/functions/pagos', { method: 'POST', body: JSON.stringify({ cotNum: quote.cotNum, ...cuerpo }) })
      if (!res.ok) throw new Error(res.error || 'No se pudo guardar')
      return res
    } catch (e) { setError(e.message); return null }
    finally { setGuardando(false) }
  }
  async function confirmar() {
    const res = await llamar({ accion: 'confirmar-transferencia' })
    if (res) onCambio({ ...res.cotizacion, linkPago: quote.linkPago, avisoConfirmacion: res.correo })
  }
  async function rechazar() {
    const res = await llamar({ accion: 'rechazar-transferencia', motivo })
    if (res) { onCambio({ reserva: res.reserva }); setRechazando(false) }
  }

  const opcion = r.opcion === 'abono' ? 'abono del 50%' : r.opcion === 'saldo' ? 'saldo' : 'total'
  return (
    <div data-testid="transferencia-por-verificar" style={{ padding: 16, borderRadius: 14, background: '#FFFBEB', border: '1.5px solid #FCD34D', marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#92400E', textTransform: 'uppercase', letterSpacing: .8 }}>Transferencia por verificar</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '4px 0 2px' }}>{fmt(r.monto)}</div>
      <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.5 }}>
        {quote.nombre} avisó que transfirió el {opcion}{r.descuentoPct ? ` (con ${r.descuentoPct}% de descuento por transferencia)` : ''}.
        {r.fecha && <><br />Pidió instalar el <strong>{fechaLarga(r.fecha).toLowerCase()}, de {r.inicio} a {r.fin}</strong>: ese bloque queda reservado mientras lo verificas.</>}
      </div>
      <div style={{ fontSize: 12, color: '#92400E', marginTop: 6 }}>Revisa que el pago esté en la cuenta antes de confirmar.</div>
      {error && <div style={{ ...styles.errorBox, marginTop: 10, marginBottom: 0 }}>{error}</div>}
      {!rechazando ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button onClick={confirmar} disabled={guardando} style={{ ...styles.btnPrimary, background: C.green, boxShadow: 'none', opacity: guardando ? .6 : 1 }}>
            {guardando ? 'Confirmando…' : r.fecha ? 'Recibí la transferencia: confirmar y agendar' : 'Recibí la transferencia'}
          </button>
          <button onClick={() => setRechazando(true)} disabled={guardando} style={styles.btnSecondary}>No ha llegado</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
          <input aria-label="Motivo" placeholder="Motivo (opcional): no llegó, monto distinto…" value={motivo} onChange={e => setMotivo(e.target.value)}
            style={{ ...styles.input, width: 280, padding: '7px 10px', fontSize: 13 }} />
          <button onClick={rechazar} disabled={guardando} style={{ ...styles.btnPrimary, background: C.red, boxShadow: 'none' }}>Liberar el horario</button>
          <button onClick={() => setRechazando(false)} style={styles.btnSecondary}>Cancelar</button>
        </div>
      )}
    </div>
  )
}

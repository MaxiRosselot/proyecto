import React, { useEffect, useState } from 'react'
import { C, apiFetch, styles } from './utils.js'

// Admin → Inicio: conectar el bot de Telegram que avisa todo lo que pasa en el panel
// (netlify/functions/telegram.mjs) y correr el seguimiento de las 20:00 a mano.
export default function AvisosTelegram() {
  const [estado, setEstado] = useState(null)
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function cargar() {
    try { setEstado(await apiFetch('/.netlify/functions/telegram')) }
    catch (e) { setEstado({ ok: false, error: e.message }) }
  }
  useEffect(() => { cargar() }, [])

  async function correr(ruta, cuerpo, exito) {
    setOcupado(true); setAviso('')
    try {
      const r = await apiFetch(ruta, { method: 'POST', body: JSON.stringify(cuerpo) })
      setAviso(r.ok ? exito(r) : '⚠️ ' + (r.error || 'No se pudo'))
    } catch (e) { setAviso('⚠️ ' + e.message) }
    finally { setOcupado(false) }
  }

  const listo = estado?.configurado && estado.chats?.length > 0
  const paso = { margin: '0 0 6px', fontSize: 13, color: C.text }
  return (
    <div style={{ ...styles.card, marginTop: 16 }} data-testid="avisos-telegram">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={styles.cardLabel}>Avisos por Telegram</div>
        <span style={styles.badge(listo ? C.green : C.yellow)}>{!estado ? '…' : listo ? 'Conectado' : 'Sin conectar'}</span>
      </div>
      {!estado ? null : !estado.configurado ? (
        <div>
          <p style={paso}>1. En Telegram, habla con <strong>@BotFather</strong>, escribe <code>/newbot</code> y ponle un nombre.</p>
          <p style={paso}>2. Copia el <strong>token</strong> que te da y guárdalo en Netlify como <code>TELEGRAM_BOT_TOKEN</code> (no lo pegues en ningún chat).</p>
          <p style={paso}>3. Abre tu bot, toca <strong>Iniciar</strong> y vuelve aquí: te muestro tu número de chat.</p>
        </div>
      ) : (
        <div>
          {!listo && <p style={paso}>Escríbele cualquier cosa a tu bot y toca “Buscar mi chat”. Copia tu número en Netlify como <code>TELEGRAM_CHAT_ID</code> (si son varias personas, sepáralos con coma) y vuelve a publicar.</p>}
          {estado.detectados?.length > 0 && (
            <div style={{ display: 'grid', gap: 4, margin: '6px 0 10px' }}>
              {estado.detectados.map(d => (
                <div key={d.id} style={{ fontSize: 13 }}>
                  {estado.chats?.includes(d.id) ? '✅' : '👤'} {d.nombre}: <code style={{ userSelect: 'all' }}>{d.id}</code>
                </div>
              ))}
            </div>
          )}
          {listo && <p style={{ ...paso, color: C.textSub }}>Te aviso: cotizaciones nuevas, confirmadas y rechazadas, visitas e instalaciones agendadas, fotos y mensajes de la web. Todos los días a las 20:00, las instalaciones de mañana (un mensaje por cada una para copiar al cliente) y las cotizaciones sin respuesta.</p>}
          {estado.error && <div style={styles.errorBox}>{estado.error}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={styles.btnSecondary} onClick={cargar} disabled={ocupado}>Buscar mi chat</button>
            {listo && <button type="button" style={styles.btnSecondary} disabled={ocupado}
              onClick={() => correr('/.netlify/functions/telegram', { accion: 'probar' }, () => '✅ Mensaje de prueba enviado')}>Enviar prueba</button>}
            {listo && <button type="button" style={styles.btnSecondary} disabled={ocupado}
              onClick={() => correr('/.netlify/functions/seguimiento-diario', {}, r => `✅ Listo: ${r.telegram} avisos por Telegram y ${r.correos} correos de seguimiento`)}>Enviar el resumen de las 20:00 ahora</button>}
          </div>
        </div>
      )}
      {aviso && <div role="status" style={{ marginTop: 10, fontSize: 13, fontWeight: 600 }}>{aviso}</div>}
    </div>
  )
}

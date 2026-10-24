import React, { useEffect, useState } from 'react'
import { C, apiFetch, styles } from './utils.js'

// Admin → Inicio: conectar el bot de Telegram que avisa todo lo que pasa en el panel
// (netlify/functions/telegram.mjs), activar su menu (telegram-bot.mjs), sumar al maestro y correr
// a mano el seguimiento de las 20:00 y las fichas de las 07:00.
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
      const r = await apiFetch(ruta, { method: 'POST', body: JSON.stringify(cuerpo) }).catch(() => ({ ok: false, error: 'El servidor no respondió. Intenta de nuevo en un momento.' }))
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
          {listo && <p style={{ ...paso, color: C.textSub }}>Te aviso: cotizaciones nuevas, confirmadas y rechazadas, visitas e instalaciones agendadas, fotos y mensajes de la web, y si algo falla en el servidor. Todos los días a las 07:00 el día (y al maestro sus fichas) y a las 20:00 las instalaciones de mañana y las cotizaciones sin respuesta.</p>}
          {listo && (
            <div style={{ borderTop: `1px solid ${C.border}`, margin: '10px 0', paddingTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <strong style={{ fontSize: 13 }}>Menú del bot</strong>
                <span style={styles.badge(estado.webhook?.activo ? C.green : C.yellow)}>{estado.webhook?.activo ? 'Activo' : 'Apagado'}</span>
              </div>
              <p style={{ ...paso, color: C.textSub }}>Con el menú activo le escribes <code>/menu</code> al bot: hoy, mañana, semana, visitas, horas libres, materiales, por cobrar, sin respuesta y buscar cliente. En cada instalación: marcar instalada, registrar pago y cambiar día u hora (mueve el calendario).</p>
              {estado.webhook?.ultimoError && <div style={styles.errorBox}>Último error de Telegram: {estado.webhook.ultimoError}</div>}
              <p style={paso}><strong>Maestro:</strong> {estado.maestros?.length ? `conectado (${estado.maestros.join(', ')}).` : 'que le escriba /start al bot; el bot le responde su número y te avisa. Guárdalo en Netlify como TELEGRAM_MAESTRO_CHAT_ID y vuelve a publicar.'} Recibe sus fichas a las 07:00, manda fotos (quedan en Drive por venta y tú eliges cuáles van a la web) y aprieta ✅ Terminada.</p>
            </div>
          )}
          {estado.error && <div style={styles.errorBox}>{estado.error}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={styles.btnSecondary} onClick={cargar} disabled={ocupado}>{estado.webhook?.activo ? 'Actualizar' : 'Buscar mi chat'}</button>
            {listo && <button type="button" style={styles.btnSecondary} disabled={ocupado}
              onClick={() => correr('/.netlify/functions/telegram', { accion: 'webhook' }, () => { cargar(); return '✅ Menú activado: escríbele /menu al bot' })}>{estado.webhook?.activo ? 'Reconectar menú del bot' : 'Activar menú del bot'}</button>}
            {listo && <button type="button" style={styles.btnSecondary} disabled={ocupado}
              onClick={() => correr('/.netlify/functions/telegram', { accion: 'probar' }, () => '✅ Mensaje de prueba enviado')}>Enviar prueba</button>}
            {listo && <button type="button" style={styles.btnSecondary} disabled={ocupado}
              onClick={() => correr('/.netlify/functions/telegram', { accion: 'resumen' }, r => `✅ Listo: ${r.telegram} avisos por Telegram y ${r.correos} correos de seguimiento`)}>Enviar el resumen de las 20:00 ahora</button>}
            {listo && <button type="button" style={styles.btnSecondary} disabled={ocupado}
              onClick={() => correr('/.netlify/functions/telegram', { accion: 'fichas' }, r => `✅ Listo: ${r.enviados} mensajes${r.maestros ? '' : ' (falta conectar al maestro)'}`)}>Enviar las fichas de hoy</button>}
          </div>
        </div>
      )}
      {aviso && <div role="status" style={{ marginTop: 10, fontSize: 13, fontWeight: 600 }}>{aviso}</div>}
    </div>
  )
}

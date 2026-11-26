// Atajos de teclado de la seccion WhatsApp: que hace cada tecla. Sin Ctrl/Cmd (esos son del navegador).
// Con Alt funcionan tambien desde dentro de WhatsApp (la extension 1.3 los pasa al panel), para ir de
// cliente en cliente sin soltar el chat: Alt+↓, Alt+1, Enter, Alt+↓...

export const ATAJOS = [
  ['↓ / ↑', 'Siguiente / anterior cliente (abre su chat)'],
  ['← / →', 'Filtro anterior / siguiente'],
  ['1 … 9', 'Escribe ese mensaje en su chat y te deja en WhatsApp: revisas y das Enter'],
  ['Shift + 1 … 9', 'Copia ese mensaje'],
  ['Enter', 'Ir a WhatsApp, a escribir'],
  ['D', 'Deja el PDF de la cotización en su chat (sin enviar)'],
  ['A', 'Copia el mensaje de agendamiento (para mandarlo aparte del PDF)'],
  ['E', 'Editar la cotización en el cotizador'],
  ['P', 'Le pregunté hoy'],
  ['C', 'Confirmó'],
  ['/', 'Buscar cliente (↓ para elegir el primero)'],
  ['Esc', 'Salir del buscador / de lo que estés escribiendo'],
  ['?', 'Mostrar u ocultar los atajos'],
]
export const ATAJOS_EN_WHATSAPP = [
  ['1 … 9', 'Siguen siendo del panel tras abrir un chat con ↓/↑ o desde la lista, hasta que hagas clic en WhatsApp'],
  ['↓ / ↑', 'Siguiente / anterior cliente, si no estás escribiendo (caja del chat vacía)'],
  ['Alt + ↓ / ↑', 'Siguiente / anterior cliente, aunque estés escribiendo'],
  ['Alt + 1 … 9', 'Escribe ese mensaje en su chat'],
]

const LETRAS = { p: 'pregunte', c: 'confirmo', d: 'pdf', a: 'copiar-agenda', e: 'editar' }

// e: { key, code, altKey, shiftKey, ctrlKey, metaKey }. campo: '' si no se esta escribiendo,
// 'buscar' en el buscador, 'otro' en cualquier otro campo. Devuelve la accion o null (la tecla sigue su curso).
export function accionDeTecla(e, campo = '') {
  if (e.ctrlKey || e.metaKey) return null
  const digito = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || '')
  if (e.altKey) {
    if (e.key === 'ArrowDown') return { tipo: 'mover', paso: 1 }
    if (e.key === 'ArrowUp') return { tipo: 'mover', paso: -1 }
    if (digito) return { tipo: 'mensaje', n: Number(digito[1]), copiar: Boolean(e.shiftKey) }
    return null
  }
  if (campo) {
    if (e.key === 'Escape') return { tipo: 'salir' }
    if (campo === 'buscar' && e.key === 'ArrowDown') return { tipo: 'mover', paso: 1 }
    return null
  }
  if (e.key === 'ArrowDown' || e.key === 'j') return { tipo: 'mover', paso: 1 }
  if (e.key === 'ArrowUp' || e.key === 'k') return { tipo: 'mover', paso: -1 }
  if (e.key === 'ArrowLeft') return { tipo: 'filtro', paso: -1 }
  if (e.key === 'ArrowRight') return { tipo: 'filtro', paso: 1 }
  if (digito) return { tipo: 'mensaje', n: Number(digito[1]), copiar: Boolean(e.shiftKey) }
  if (e.key === 'Enter') return { tipo: 'whatsapp' }
  if (e.key === '/') return { tipo: 'buscar' }
  if (e.key === '?') return { tipo: 'ayuda' }
  if (e.key === 'Escape') return { tipo: 'salir' }
  const letra = LETRAS[String(e.key).toLowerCase()]
  return letra && !e.shiftKey ? { tipo: 'clic', atajo: letra } : null
}

// El siguiente indice al moverse por la lista (sin dar la vuelta). Sin nadie elegido, parte del primero.
export function siguiente(indice, paso, largo) {
  if (!largo) return -1
  if (indice < 0) return paso > 0 ? 0 : largo - 1
  return Math.min(largo - 1, Math.max(0, indice + paso))
}

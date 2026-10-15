// netlify/functions/pagar.mjs — publico. Los PDF y mensajes anteriores llevan /pagar?c=&t=:
// ahora el cliente agenda y paga en /reserva, con el mismo link firmado.
export async function handler(event) {
  const { c = '', t = '', estado } = event.queryStringParameters || {}
  const destino = `/reserva?c=${encodeURIComponent(c)}&t=${encodeURIComponent(t)}${estado ? '&estado=' + encodeURIComponent(estado) : ''}`
  return { statusCode: 301, headers: { Location: destino, 'Cache-Control': 'no-store' }, body: '' }
}

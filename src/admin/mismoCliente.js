// ¿Lo que esta en pantalla sigue siendo el cliente de la cotizacion abierta? Si no, generar tiene
// que crear una nueva: actualizar la abierta borraria la del cliente anterior (asi se perdieron
// algunas en noviembre de 2026, como la N° 1682 y la 1635).
//
// Completar el nombre ("Francisco" → "Francisco Demo") o corregir una letra sigue siendo el mismo
// cliente, y tambien lo es si el telefono coincide.

const normalizar = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim()
const digitos = s => String(s || '').replace(/\D/g, '').slice(-8)

function distancia(a, b) {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0]; fila[0] = i
    for (let j = 1; j <= b.length; j++) {
      const t = fila[j]
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1))
      previo = t
    }
  }
  return fila[b.length]
}

// guardada: { nombre, telefono } con que se guardo la cotizacion abierta. Si no se sabe el nombre
// (un borrador de antes de este cambio), se asume el mismo, como antes.
export function mismoCliente(guardada, actual) {
  const antes = normalizar(guardada?.nombre)
  if (!antes) return true
  const ahora = normalizar(actual?.nombre)
  const tel = digitos(guardada?.telefono)
  if (tel.length === 8 && tel === digitos(actual?.telefono)) return true
  if (!ahora) return false
  if (antes === ahora || antes.startsWith(ahora + ' ') || ahora.startsWith(antes + ' ')) return true
  return distancia(antes, ahora) <= 2
}

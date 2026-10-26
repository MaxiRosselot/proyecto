// Comunas de Santiago agrupadas por zona: la lista de comunas de /visita y saber la comuna de una
// direccion escrita a mano (para la ruta de visitas y los resumenes del bot).
// Sin imports de Node: lo usan la pagina /visita y las funciones.

export const ZONAS = {
  oriente: { nombre: 'Oriente', comunas: ['Las Condes', 'Vitacura', 'Lo Barnechea', 'La Reina', 'Providencia', 'Ñuñoa'] },
  centro: { nombre: 'Centro', comunas: ['Santiago', 'Independencia', 'Recoleta', 'Estación Central', 'Quinta Normal', 'San Miguel', 'San Joaquín', 'Macul', 'Pedro Aguirre Cerda'] },
  suroriente: { nombre: 'Sur oriente', comunas: ['Peñalolén', 'La Florida', 'Puente Alto', 'Pirque', 'San José de Maipo', 'La Granja', 'La Pintana'] },
  sur: { nombre: 'Sur', comunas: ['San Bernardo', 'El Bosque', 'La Cisterna', 'Lo Espejo', 'San Ramón', 'Buin', 'Calera de Tango', 'Paine'] },
  poniente: { nombre: 'Poniente', comunas: ['Maipú', 'Cerrillos', 'Pudahuel', 'Lo Prado', 'Cerro Navia', 'Padre Hurtado', 'Peñaflor', 'Talagante', 'El Monte', 'Isla de Maipo', 'Melipilla', 'Curacaví', 'María Pinto', 'Alhué', 'San Pedro'] },
  norte: { nombre: 'Norte', comunas: ['Huechuraba', 'Conchalí', 'Quilicura', 'Renca', 'Colina', 'Chicureo', 'Lampa', 'Tiltil'] },
}

export const COMUNAS = Object.values(ZONAS).flatMap(z => z.comunas).sort((a, b) => a.localeCompare(b, 'es'))

const normalizar = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const PORZONA = Object.entries(ZONAS).flatMap(([zona, z]) => z.comunas.map(c => [normalizar(c), zona, c]))
  .sort((a, b) => b[0].length - a[0].length) // "San Jose de Maipo" antes que "Maipo"

// La zona de una comuna, o de una direccion escrita a mano ("Av. Grecia 1500, Ñuñoa").
export function zonaDe(texto) {
  const t = ` ${normalizar(texto)} `
  for (const [c, zona] of PORZONA) if (t.includes(` ${c} `)) return zona
  return null
}
export function comunaDe(texto) {
  const t = ` ${normalizar(texto)} `
  for (const [c, , original] of PORZONA) if (t.includes(` ${c} `)) return original
  return null
}

// Como comunaDe, pero perdona un error de tipeo en comunas de 6 letras o mas ("Viracura", "Providecia")
// y entiende "Stgo". Para direcciones escritas a mano (visitas antiguas de Calendly).
const ALIAS = { stgo: 'Santiago', 'stgo centro': 'Santiago', 'est central': 'Estación Central', 'pac': 'Pedro Aguirre Cerda' }
function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}
export function comunaAproximada(texto) {
  const exacta = comunaDe(texto)
  if (exacta) return exacta
  const palabras = normalizar(texto).split(' ')
  for (const [alias, comuna] of Object.entries(ALIAS)) if (` ${palabras.join(' ')} `.includes(` ${alias} `)) return comuna
  for (const [c, , original] of PORZONA) {
    if (c.replace(/ /g, '').length < 6) continue
    const n = c.split(' ').length
    for (let i = 0; i + n <= palabras.length; i++) if (distancia(palabras.slice(i, i + n).join(' '), c) <= 1) return original
  }
  return null
}

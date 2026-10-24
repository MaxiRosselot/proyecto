// Visitas por zona: para no ir a Puente Alto, despues a Las Condes y de vuelta a Puente Alto el
// mismo dia. El cliente elige su comuna antes de ver las horas, y:
//   · no se le ofrecen horas a menos de 2 h de una visita de una zona lejana (no da el traslado);
//   · se le recomiendan las horas pegadas (hasta 1 h) a visitas de su zona o de una vecina, para
//     que queden encadenadas.
// Sin imports de Node: lo usan la pagina /visita y las funciones de disponibilidad.

export const ZONAS = {
  oriente: { nombre: 'Oriente', comunas: ['Las Condes', 'Vitacura', 'Lo Barnechea', 'La Reina', 'Providencia', 'Ñuñoa'] },
  centro: { nombre: 'Centro', comunas: ['Santiago', 'Independencia', 'Recoleta', 'Estación Central', 'Quinta Normal', 'San Miguel', 'San Joaquín', 'Macul', 'Pedro Aguirre Cerda'] },
  suroriente: { nombre: 'Sur oriente', comunas: ['Peñalolén', 'La Florida', 'Puente Alto', 'Pirque', 'San José de Maipo', 'La Granja', 'La Pintana'] },
  sur: { nombre: 'Sur', comunas: ['San Bernardo', 'El Bosque', 'La Cisterna', 'Lo Espejo', 'San Ramón', 'Buin', 'Calera de Tango', 'Paine'] },
  poniente: { nombre: 'Poniente', comunas: ['Maipú', 'Cerrillos', 'Pudahuel', 'Lo Prado', 'Cerro Navia', 'Padre Hurtado', 'Peñaflor', 'Talagante', 'El Monte', 'Isla de Maipo', 'Melipilla', 'Curacaví', 'María Pinto', 'Alhué', 'San Pedro'] },
  norte: { nombre: 'Norte', comunas: ['Huechuraba', 'Conchalí', 'Quilicura', 'Renca', 'Colina', 'Chicureo', 'Lampa', 'Tiltil'] },
}

// Zonas que quedan cerca entre si (ademas de la misma). Oriente y sur oriente NO: Las Condes y
// Puente Alto estan lejos aunque La Reina y Peñalolen se toquen.
const VECINAS = [['oriente', 'centro'], ['centro', 'sur'], ['centro', 'poniente'], ['centro', 'norte'], ['suroriente', 'sur'], ['centro', 'suroriente']]

export const COMUNAS = Object.values(ZONAS).flatMap(z => z.comunas).sort((a, b) => a.localeCompare(b, 'es'))
export const LEJOS_MIN = 120   // a menos de esto de una visita lejana, no se ofrece la hora
export const CERCA_MIN = 60    // hasta esto de una visita de la zona, la hora se recomienda

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

export function zonasCerca(a, b) {
  if (!a || !b || a === b) return true
  return VECINAS.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
}

const aMin = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0) }

// Para las horas de un dia: cuales no se ofrecen y cuales se recomiendan, segun las visitas que ya
// hay (visitas: [{ hora: 'HH:MM', zona }]) y la zona del cliente.
export function horasPorZona(horas, visitas, zonaCliente) {
  const resultado = {}
  for (const h of horas) {
    const t = aMin(h)
    const lejos = zonaCliente && visitas.some(v => v.zona && !zonasCerca(v.zona, zonaCliente) && Math.abs(aMin(v.hora) - t) < LEJOS_MIN)
    const cerca = zonaCliente && visitas.some(v => v.zona && zonasCerca(v.zona, zonaCliente) && Math.abs(aMin(v.hora) - t) <= CERCA_MIN)
    resultado[h] = lejos ? 'lejos' : cerca ? 'recomendada' : 'libre'
  }
  return resultado
}

// Para la lista de dias: los que ya tienen visitas cerca del cliente van destacados.
export function diaRecomendado(visitas, zonaCliente) {
  return Boolean(zonaCliente) && visitas.some(v => v.zona && zonasCerca(v.zona, zonaCliente))
}

// Los dias y horas de visita para un cliente de cierta comuna. dias: los del horario de visitas
// ([{ fecha, horas: ['HH:MM'] }]); visitas: las ya agendadas ([{ fecha, hora, ubicacion }]).
// Saca las horas tomadas y las lejanas; marca las recomendadas y los dias en que ya vamos cerca.
export function diasParaComuna(dias, visitas, comuna) {
  const zona = zonaDe(comuna)
  const porDia = {}
  for (const v of visitas) (porDia[v.fecha] ||= []).push({ hora: v.hora, zona: zonaDe(v.ubicacion) })
  return dias.map(d => {
    const delDia = porDia[d.fecha] || []
    const tomadas = new Set(delDia.map(v => v.hora))
    const estado = horasPorZona(d.horas.filter(h => !tomadas.has(h)), delDia, zona)
    const horas = Object.entries(estado).filter(([, e]) => e !== 'lejos').map(([hora, e]) => ({ hora, recomendada: e === 'recomendada' }))
    return { fecha: d.fecha, recomendado: diaRecomendado(delDia, zona), horas }
  }).filter(d => d.horas.length)
}

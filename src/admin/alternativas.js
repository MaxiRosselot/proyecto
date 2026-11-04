// Alternativas de una cotizacion (pagina 5 del PDF): el mismo trabajo en otras versiones, armadas
// desde el proyecto 3D cotizado. La cotizada es la recomendada; las alternativas la rodean: una
// mas completa (y cara) y otras mas economicas que muestran lo que se pierde, para que el cliente
// compare y se quede con la recomendada.
//
//   · mas angosta      — un paso menos de fondo (68→48, 48→38; 28 solo si la cotizada es de 38)
//   · lateral angosto  — en L o U, el fondo igual y los laterales un paso mas angostos
//   · mas baja         — 3 m pasa a 2,5 m y 2,5 m a 2 m: la altura sube bastante el valor
//   · un solo muro     — solo el muro mas largo; esa repisa vale 20% mas (pierde el precio de conjunto)
//   · mas completa     — de L a U si cabe sin tocar la puerta; si no, un paso mas de fondo
//
// Aca solo se arman los proyectos: el precio sale de los modulos que planifica el visor 3D, igual
// que la cotizacion (ver precioAlternativa en regenerarPdf.js).

export const RECARGO_UN_MURO = 1.2
export const MAX_ALTERNATIVAS = 2
const FONDOS = [28, 38, 48, 68]
const TOL = 2
const NOMBRE_MURO = { back: 'del fondo', left: 'izquierdo', right: 'derecho' }

const fondoDe = (project, run) => run.depthCm ?? project.shelving?.depthCm ?? 48
const cerca = (a, b) => Math.abs(a - b) <= TOL

// Un paso menos de fondo. Como es un solo paso, 28 sale solo cuando la cotizada es de 38.
export function fondoMenor(fondo) {
  const i = FONDOS.indexOf(fondo)
  return i > 0 ? FONDOS[i - 1] : null
}

export function fondoMayor(fondo) {
  const i = FONDOS.indexOf(fondo)
  return i >= 0 && i < FONDOS.length - 1 ? FONDOS[i + 1] : null
}

// Solo bodegas rectangulares con repisas en los muros (sin planta irregular ni repisas sueltas).
function apto(project) {
  if (!project?.room || !project.shelving) return false
  if (project.room.planta?.length) return false
  if ((project.shelving.runs || []).some(r => r.floorPlacement)) return false
  return true
}

const manual = project => project.shelving.layout === 'manual' && (project.shelving.runs || []).length > 0
const conRuns = (project, runs, extra = {}) => ({ ...project, shelving: { ...project.shelving, ...extra, runs } })
// Al cambiar fondos o muros, los laterales puestos a mano ya no calzan: los vuelve a poner el visor.
const sinLaterales = run => { const { supports: _, ...resto } = run; return resto }

// Cambia el fondo de algunas repisas y corre las que nacen en esa esquina para que sigan pegadas.
function cambiarFondos(project, nuevoFondo) {
  const runs = project.shelving.runs
  const W = project.room.backWallCm
  const antes = new Map(runs.map(r => [r.id, fondoDe(project, r)]))
  const despues = new Map(runs.map(r => [r.id, nuevoFondo(r, antes.get(r.id))]))
  return runs.map(r => {
    let { startCm, lengthCm } = r
    const lado = r.wall === 'left' || r.wall === 'right'
    for (const otra of runs) {
      if (otra.id === r.id) continue
      const delta = antes.get(otra.id) - despues.get(otra.id)
      if (!delta) continue
      if (lado && otra.wall === 'back' && cerca(r.startCm, antes.get(otra.id))) { startCm -= delta; lengthCm += delta }
      if (r.wall === 'back' && otra.wall === 'left' && cerca(r.startCm, antes.get(otra.id))) { startCm -= delta; lengthCm += delta }
      if (r.wall === 'back' && otra.wall === 'right' && cerca(r.startCm + r.lengthCm, W - antes.get(otra.id))) lengthCm += delta
    }
    return sinLaterales({ ...r, startCm, lengthCm, depthCm: despues.get(r.id) })
  })
}

function masAngosta(project) {
  const fondo = project.shelving.depthCm
  if (manual(project)) {
    const mayor = Math.max(...project.shelving.runs.map(r => fondoDe(project, r)))
    const nuevo = fondoMenor(mayor)
    if (!nuevo) return null
    return {
      tipo: 'mas-angosta', titulo: 'Más angosta', etiqueta: 'Más económica',
      descripcion: `La misma distribución con fondo de ${nuevo} cm en vez de ${mayor} cm.`,
      proyecto: conRuns(project, cambiarFondos(project, (_r, f) => fondoMenor(f) ?? f), { depthCm: nuevo }),
    }
  }
  const nuevo = fondoMenor(fondo)
  if (!nuevo) return null
  return {
    tipo: 'mas-angosta', titulo: 'Más angosta', etiqueta: 'Más económica',
    descripcion: `La misma distribución con fondo de ${nuevo} cm en vez de ${fondo} cm.`,
    proyecto: { ...project, shelving: { ...project.shelving, depthCm: nuevo } },
  }
}

function lateralAngosto(project) {
  if (!manual(project)) return null
  const runs = project.shelving.runs
  const fondo = runs.find(r => r.wall === 'back')
  const lados = runs.filter(r => r.wall === 'left' || r.wall === 'right')
  if (!fondo || !lados.length) return null
  const fFondo = fondoDe(project, fondo)
  // Solo cuando el fondo pasa por las esquinas (los laterales nacen donde termina el fondo).
  if (!lados.every(l => cerca(l.startCm, fFondo))) return null
  const nuevo = fondoMenor(Math.max(...lados.map(l => fondoDe(project, l))))
  if (!nuevo || nuevo < 38) return null
  return {
    tipo: 'lateral-angosto', titulo: 'Laterales más angostos', etiqueta: 'Más económica',
    descripcion: `El muro del fondo queda en ${fFondo} cm y los laterales en ${nuevo} cm: más pasillo para moverse.`,
    proyecto: conRuns(project, runs.map(r => (r.wall === 'left' || r.wall === 'right') ? sinLaterales({ ...r, depthCm: nuevo }) : r)),
  }
}

const MAS_BAJA = { 300: 250, 250: 200 }
const metros = cm => `${String(cm / 100).replace('.', ',')} m`

function masBaja(project) {
  const alturas = [project.shelving.heightCm, ...(project.shelving.runs || []).map(r => r.heightCm)].filter(Boolean)
  const alta = Math.max(...alturas)
  const nueva = MAS_BAJA[alta]
  if (!nueva) return null
  // Los niveles se vuelven a calcular para la nueva altura; un nivel quitado que ya no existe se olvida.
  const bajar = r => {
    if ((r.heightCm ?? project.shelving.heightCm) !== alta) return r
    const { levels: _, ...resto } = sinLaterales(r)
    const variants = (r.variants || []).map(v => v.type === 'remove-levels' ? { ...v, heightsCm: v.heightsCm.filter(h => h <= nueva) } : v)
      .filter(v => v.type !== 'remove-levels' || v.heightsCm.length)
    return { ...resto, ...(r.heightCm ? { heightCm: nueva } : {}), ...(r.variants ? { variants } : {}) }
  }
  return {
    tipo: 'mas-baja', titulo: 'Más baja', etiqueta: 'Más económica',
    descripcion: `La misma distribución con repisas de ${metros(nueva)} de alto en vez de ${metros(alta)}.`,
    proyecto: { ...project, shelving: { ...project.shelving, heightCm: project.shelving.heightCm === alta ? nueva : project.shelving.heightCm, ...(project.shelving.runs ? { runs: project.shelving.runs.map(bajar) } : {}) } },
  }
}

function unSoloMuro(project) {
  if (manual(project)) {
    const runs = project.shelving.runs.filter(r => NOMBRE_MURO[r.wall])
    if (runs.length < 2) return null
    const W = project.room.backWallCm
    const largo = [...runs].sort((a, b) => b.lengthCm - a.lengthCm)[0]
    let { startCm, lengthCm } = largo
    // Recupera la esquina que ocupaba la otra repisa.
    for (const otra of runs) {
      if (otra.id === largo.id) continue
      const f = fondoDe(project, otra)
      if (largo.wall === 'back' && otra.wall === 'left' && cerca(largo.startCm, f)) { startCm = 0; lengthCm += f }
      if (largo.wall === 'back' && otra.wall === 'right' && cerca(largo.startCm + largo.lengthCm, W - f)) lengthCm += f
      if (largo.wall !== 'back' && otra.wall === 'back' && cerca(largo.startCm, f)) { startCm = 0; lengthCm += f }
    }
    return {
      tipo: 'un-muro', titulo: 'Solo un muro', etiqueta: 'Más económica', recargo: RECARGO_UN_MURO,
      descripcion: `Una sola repisa de ${Math.round(lengthCm)} cm en el muro ${NOMBRE_MURO[largo.wall]}.`,
      proyecto: conRuns(project, [sinLaterales({ ...largo, startCm, lengthCm })]),
    }
  }
  if (project.shelving.layout !== 'L' && project.shelving.layout !== 'U') return null
  return {
    tipo: 'un-muro', titulo: 'Solo un muro', etiqueta: 'Más económica', recargo: RECARGO_UN_MURO,
    descripcion: 'Una sola repisa en el muro del fondo.',
    proyecto: { ...project, shelving: { ...project.shelving, layout: 'single-wall' } },
  }
}

// De L a U: el lateral que falta, del mismo fondo, acortado para no chocar con la puerta.
function enU(project) {
  if (!manual(project)) {
    if (project.shelving.layout === 'L') return { proyecto: { ...project, shelving: { ...project.shelving, layout: 'U' } } }
    return null
  }
  const runs = project.shelving.runs
  const fondo = runs.find(r => r.wall === 'back')
  const lados = runs.filter(r => r.wall === 'left' || r.wall === 'right')
  if (!fondo || lados.length !== 1 || runs.length !== 2) return null
  const lado = lados[0]
  const otro = lado.wall === 'left' ? 'right' : 'left'
  const W = project.room.backWallCm
  const fFondo = fondoDe(project, fondo), fLado = fondoDe(project, lado)
  // El fondo tiene que llegar a la otra esquina.
  const llega = otro === 'left' ? cerca(fondo.startCm, 0) : cerca(fondo.startCm + fondo.lengthCm, W)
  if (!llega || !cerca(lado.startCm, fFondo)) return null
  const muro = otro === 'left' ? project.room.leftWallCm : project.room.rightWallCm
  let largo = Math.min(lado.lengthCm, muro - fFondo)
  const puerta = project.room.door
  if (puerta?.wall === 'front' && puerta.swingDirection !== 'outward' && !puerta.openingOnly) {
    const ancho = W - puerta.fromLeftCornerCm - puerta.toRightCornerCm
    const desde = puerta.fromLeftCornerCm, hasta = W - puerta.toRightCornerCm
    const [x0, x1] = otro === 'left' ? [0, fLado] : [W - fLado, W]
    // La hoja barre su ancho hacia adentro: el lateral termina antes.
    if (desde < x1 && hasta > x0) largo = Math.min(largo, muro - fFondo - ancho - 5)
  }
  largo = Math.floor(largo)
  if (largo < 50) return null
  return { proyecto: conRuns(project, [...runs.map(sinLaterales), { id: `${lado.id}-opuesto`, wall: otro, startCm: lado.startCm, lengthCm: largo, depthCm: fLado, ...(lado.heightCm ? { heightCm: lado.heightCm } : {}) }]) }
}

function masCompleta(project) {
  const u = enU(project)
  if (u) return { tipo: 'mas-completa', titulo: 'Más completa', etiqueta: 'Más espacio', descripcion: 'Sumamos repisas en el otro muro lateral: la bodega queda en U.', proyecto: u.proyecto }
  if (manual(project)) {
    const fondos = project.shelving.runs.map(r => fondoDe(project, r))
    const mayor = fondoMayor(Math.min(...fondos))
    if (!mayor) return null
    return {
      tipo: 'mas-completa', titulo: 'Más profunda', etiqueta: 'Más espacio',
      descripcion: `La misma distribución con fondo de ${mayor} cm: caben cajas y bultos más grandes.`,
      proyecto: conRuns(project, cambiarFondos(project, (_r, f) => fondoMayor(f) ?? f), { depthCm: mayor }),
    }
  }
  const mayor = fondoMayor(project.shelving.depthCm)
  if (!mayor) return null
  return {
    tipo: 'mas-completa', titulo: 'Más profunda', etiqueta: 'Más espacio',
    descripcion: `La misma distribución con fondo de ${mayor} cm: caben cajas y bultos más grandes.`,
    proyecto: { ...project, shelving: { ...project.shelving, depthCm: mayor } },
  }
}

// Todas las alternativas posibles para un proyecto, en el orden en que conviene ofrecerlas:
// primero la mas completa (ancla de precio), despues las economicas.
export function alternativasDe(project) {
  if (!apto(project)) return []
  return [masCompleta, masAngosta, masBaja, lateralAngosto, unSoloMuro]
    .map(f => f(project))
    .filter(Boolean)
    .map((a, i) => ({ id: `${a.tipo}-${i}`, ...a }))
}

// Superficie de repisa (m²): largo × fondo × niveles × unidades. Sirve para comparar opciones.
export function superficieRepisas(repisas = []) {
  return repisas.reduce((s, r) => s + (Number(r.largo ?? r.l) || 0) * (Number(r.prof ?? r.p) || 0) * (Number(r.niveles ?? r.n) || 0) * (Number(r.unidades ?? r.u ?? 1) || 0), 0)
}

const pesos = n => '$' + Math.round(Math.abs(n)).toLocaleString('es-CL')

// Una linea para el cliente: cuanto cambia el precio y el espacio frente a la recomendada.
export function comparacion(alternativa, principal) {
  const dif = alternativa.total - principal.total
  const supP = superficieRepisas(principal.repisas), supA = superficieRepisas(alternativa.repisas)
  const pct = supP > 0 ? Math.round((supA / supP - 1) * 100) : 0
  const espacio = pct === 0 ? 'el mismo espacio' : `${Math.abs(pct)}% ${pct < 0 ? 'menos' : 'más'} espacio para guardar`
  if (dif < 0) return `Ahorras ${pesos(dif)}, con ${espacio}.`
  if (dif > 0) return `${pesos(dif)} más, con ${espacio}.`
  return `Mismo precio, con ${espacio}.`
}

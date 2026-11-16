// Pendientes del panel: las mejoras que se van haciendo con Claude, con su estado y una bitacora
// de lo que se hizo. Se guardan en la pestaña "Pendientes" de la planilla (una fila por pendiente;
// la bitacora va como JSON en su columna). La primera vez se llena con PENDIENTES_INICIALES.

export const HOJA_PENDIENTES = 'Pendientes'
export const ENCABEZADOS_PENDIENTES = ['Id', 'Título', 'Detalle', 'Estado', 'Prioridad', 'Área', 'Responsable', 'Creado', 'Actualizado', 'Bitácora']
export const ESTADOS = ['idea', 'por-hacer', 'en-curso', 'hecho']
export const NOMBRE_ESTADO = { idea: 'Idea', 'por-hacer': 'Por hacer', 'en-curso': 'En curso', hecho: 'Hecho' }
const cambioEstado = (de, a) => `Estado: ${NOMBRE_ESTADO[de]} → ${NOMBRE_ESTADO[a]}`
export const PRIORIDADES = ['alta', 'media', 'baja']
export const AREAS = ['Panel', 'Agenda', 'Visitas', 'Instalaciones', 'Cotizaciones', '3D', 'Telegram', 'Stock', 'Web', 'RepisasPro', 'Otro']
export const RESPONSABLES = ['Claude', 'Maxi', 'José']

export class ErrorPendiente extends Error { constructor(estado, mensaje) { super(mensaje); this.estado = estado } }
const falla = (estado, mensaje) => { throw new ErrorPendiente(estado, mensaje) }
const texto = (v, max) => String(v ?? '').replace(/\s+$/g, '').trim().slice(0, max)
const fechaValida = f => /^\d{4}-\d{2}-\d{2}$/.test(f || '')

// Lo que ya se hablo con Claude hasta el 2026-11-16.
const nota = (fecha, t) => ({ fecha, texto: t })
export const PENDIENTES_INICIALES = [
  { id: 'p01', titulo: 'Registro de uso del panel', area: 'Panel', estado: 'hecho', prioridad: 'media', responsable: 'Claude', creado: '2026-11-11',
    detalle: 'Anotar qué secciones y botones se usan (celular o PC) y cuánto hay que bajar, para ajustar el panel a la medida.',
    bitacora: [nota('2026-11-11', 'Listo: se anota solo. Se ve en Inicio → Uso del panel, con "Copiar resumen" para pegárselo a Claude.')] },
  { id: 'p02', titulo: 'Instalaciones abre en el día de hoy', area: 'Instalaciones', estado: 'hecho', prioridad: 'media', responsable: 'Claude', creado: '2026-11-11',
    detalle: 'Sobre todo en el celular: que la lista parta en hoy y no en el primer día del mes.',
    bitacora: [nota('2026-11-11', 'Listo: al abrir y con el botón Hoy, la lista parte en hoy o el próximo día con instalaciones.')] },
  { id: 'p03', titulo: 'Reagendar instalación cuando quiera', area: 'Agenda', estado: 'hecho', prioridad: 'media', responsable: 'Claude', creado: '2026-11-13',
    detalle: 'Quitar el límite de 48 h para cambiar la instalación desde el link.',
    bitacora: [nota('2026-11-13', 'Listo: se puede cambiar en cualquier momento, salvo que ya esté marcada como instalada.')] },
  { id: 'p04', titulo: 'Agenda de instalaciones sin perder espacios libres', area: 'Agenda', estado: 'hecho', prioridad: 'alta', responsable: 'Claude', creado: '2026-11-16',
    detalle: 'El link no mostraba días con espacio (la regla de no dejar huecos de menos de 2 h).',
    bitacora: [nota('2026-11-16', 'Listo: en cada espacio libre se ofrece la hora pegada a su inicio y a su fin.')] },
  { id: 'p05', titulo: 'Duración de instalación según datos reales', area: 'Agenda', estado: 'hecho', prioridad: 'alta', responsable: 'Claude', creado: '2026-11-16',
    detalle: 'Calcular la duración con las instalaciones anteriores para no perder minutos.',
    bitacora: [nota('2026-11-16', 'Listo: 83 min + 25 por cada $100.000 de repisas + 29 con retiro y orden (+ racks, basura, bicicletas). Acierta el 50% exacto, error medio 20 min (antes 35).')] },
  { id: 'p06', titulo: 'Visitas: volver a día → hora → datos', area: 'Visitas', estado: 'hecho', prioridad: 'alta', responsable: 'Claude', creado: '2026-11-16',
    detalle: 'Con la dirección primero y los rangos de 3 h bajaron las visitas agendadas.',
    bitacora: [nota('2026-11-16', 'Listo: /visita vuelve a fecha, hora exacta y datos con la dirección al final.'), nota('2026-11-16', 'Por mirar: si las visitas agendadas suben en las próximas semanas.')] },
  { id: 'p07', titulo: 'Repisas en muros con cualquier ángulo', area: '3D', estado: 'hecho', prioridad: 'media', responsable: 'Claude', creado: '2026-11-11',
    detalle: 'Bodegas irregulares: muros inclinados con el ángulo que den las medidas y repisas que se pegan a ellos.',
    bitacora: [nota('2026-11-11', 'Listo: cierre en línea recta con muro inclinado, repisas al ángulo exacto, puerta en su muro real.')] },
  { id: 'p08', titulo: 'Tiempos reales del maestro por Telegram', area: 'Telegram', estado: 'por-hacer', prioridad: 'alta', responsable: 'Claude', creado: '2026-11-16',
    detalle: 'Botones "Empezamos" y "Terminamos" para el maestro en el bot; con eso se recalibra la duración de las instalaciones con tiempos de verdad.', bitacora: [] },
  { id: 'p09', titulo: 'Stock de materiales en el panel', area: 'Stock', estado: 'por-hacer', prioridad: 'media', responsable: 'Claude', creado: '2026-11-16',
    detalle: 'Llevar el stock de terciado, pino y otros materiales, y descontarlo con las instalaciones.', bitacora: [] },
  { id: 'p10', titulo: 'Altura 220 no cambia el render 3D', area: '3D', estado: 'por-hacer', prioridad: 'media', responsable: 'Claude', creado: '2026-11-11',
    detalle: 'Al poner 220 cm de alto, el 3D sigue mostrando 250.', bitacora: [] },
  { id: 'p11', titulo: 'Alternativas (pág. 5) que respeten la puerta', area: 'Cotizaciones', estado: 'por-hacer', prioridad: 'media', responsable: 'Claude', creado: '2026-11-11',
    detalle: 'Las distribuciones alternativas no consideran chocar con la puerta.', bitacora: [] },
  { id: 'p12', titulo: 'Ajustar el panel con el resumen de uso', area: 'Panel', estado: 'por-hacer', prioridad: 'media', responsable: 'Maxi', creado: '2026-11-11',
    detalle: 'Desde el 1 de diciembre: copiar Inicio → Uso del panel → Copiar resumen y pegárselo a Claude para subir, esconder u ordenar lo que más se usa.', bitacora: [] },
  { id: 'p13', titulo: 'Juntar cotizaciones de un mismo cliente', area: 'Cotizaciones', estado: 'idea', prioridad: 'media', responsable: 'Claude', creado: '2026-11-11',
    detalle: 'Un botón para armar un solo presupuesto con varias bodegas (como el de Ana Díaz, que se hizo a mano).', bitacora: [] },
  { id: 'p14', titulo: 'Manillas de laterales en repisas giradas', area: '3D', estado: 'idea', prioridad: 'baja', responsable: 'Claude', creado: '2026-11-11',
    detalle: 'En una repisa en ángulo no se pueden arrastrar a mano los laterales.', bitacora: [] },
  { id: 'p15', titulo: 'Editar el largo de un muro inclinado', area: '3D', estado: 'idea', prioridad: 'baja', responsable: 'Claude', creado: '2026-11-11',
    detalle: 'Hoy, al cambiar el largo de un muro inclinado la figura se abre y hay que cerrarla de nuevo.', bitacora: [] },
  { id: 'p16', titulo: 'App de Railway en el repo del 3D', area: '3D', estado: 'por-hacer', prioridad: 'baja', responsable: 'Maxi', creado: '2026-11-11',
    detalle: 'Instalar la app de Railway en repisas-3d-quote-demo y avisarle a José.', bitacora: [] },
  { id: 'p17', titulo: 'RepisasPro: dominio e Instagram', area: 'RepisasPro', estado: 'por-hacer', prioridad: 'baja', responsable: 'Maxi', creado: '2026-11-04',
    detalle: 'Comprar el dominio, abrir el Instagram y confirmar factura / plazos de 24 h para la marca de empresas.', bitacora: [] },
]

function limpiar(p, hoy) {
  const titulo = texto(p.titulo, 120)
  if (!titulo) falla(400, 'Escribe un título')
  const bitacora = (Array.isArray(p.bitacora) ? p.bitacora : []).slice(-60)
    .map(n => ({ fecha: fechaValida(n?.fecha) ? n.fecha : hoy, texto: texto(n?.texto, 600) })).filter(n => n.texto)
  return {
    id: /^[a-z0-9-]{1,24}$/.test(p.id || '') ? p.id : '',
    titulo, detalle: texto(p.detalle, 1200),
    estado: ESTADOS.includes(p.estado) ? p.estado : 'por-hacer',
    prioridad: PRIORIDADES.includes(p.prioridad) ? p.prioridad : 'media',
    area: AREAS.includes(p.area) ? p.area : 'Otro',
    responsable: RESPONSABLES.includes(p.responsable) ? p.responsable : 'Claude',
    creado: fechaValida(p.creado) ? p.creado : hoy,
    actualizado: fechaValida(p.actualizado) ? p.actualizado : (fechaValida(p.creado) ? p.creado : hoy),
    bitacora,
  }
}

export const pendienteAFila = p => [p.id, p.titulo, p.detalle, p.estado, p.prioridad, p.area, p.responsable, p.creado, p.actualizado, JSON.stringify(p.bitacora)]
export function filaAPendiente(f, hoy) {
  let bitacora = []
  try { bitacora = JSON.parse(f[9] || '[]') } catch { bitacora = [] }
  return limpiar({ id: f[0], titulo: f[1], detalle: f[2], estado: f[3], prioridad: f[4], area: f[5], responsable: f[6], creado: f[7], actualizado: f[8], bitacora }, hoy)
}

function siguienteId(lista) {
  const n = Math.max(0, ...lista.map(p => Number(String(p.id).replace(/\D/g, '')) || 0)) + 1
  return 'p' + String(n).padStart(2, '0')
}

// almacen: { leerFilas() → filas | null (si no existe la pestaña), guardarFilas(filas) }
export async function listarPendientes(almacen, hoy) {
  const filas = await almacen.leerFilas()
  if (filas === null) {
    const iniciales = PENDIENTES_INICIALES.map(p => limpiar(p, hoy))
    await almacen.guardarFilas(iniciales.map(pendienteAFila))
    return iniciales
  }
  return filas.filter(f => f?.[0]).map(f => filaAPendiente(f, hoy))
}

// cambios: { accion: 'guardar', pendiente } | { accion: 'nota', id, texto, estado? } | { accion: 'borrar', id }
export async function cambiarPendientes(almacen, cambios, hoy) {
  const lista = await listarPendientes(almacen, hoy)
  let resultado
  if (cambios.accion === 'guardar') {
    const p = cambios.pendiente || {}
    const i = lista.findIndex(x => x.id === p.id)
    if (i >= 0) {
      const antes = lista[i]
      const nuevo = limpiar({ ...antes, ...p, id: antes.id, creado: antes.creado, actualizado: hoy, bitacora: p.bitacora ?? antes.bitacora }, hoy)
      if (nuevo.estado !== antes.estado) nuevo.bitacora.push({ fecha: hoy, texto: cambioEstado(antes.estado, nuevo.estado) })
      lista[i] = resultado = nuevo
    } else {
      resultado = limpiar({ ...p, id: siguienteId(lista), creado: hoy, actualizado: hoy }, hoy)
      lista.push(resultado)
    }
  } else if (cambios.accion === 'nota') {
    const p = lista.find(x => x.id === cambios.id) || falla(404, 'No existe ese pendiente')
    const t = texto(cambios.texto, 600)
    if (!t && !cambios.estado) falla(400, 'Escribe la nota')
    if (cambios.estado && ESTADOS.includes(cambios.estado) && cambios.estado !== p.estado) {
      p.bitacora.push({ fecha: hoy, texto: cambioEstado(p.estado, cambios.estado) })
      p.estado = cambios.estado
    }
    if (t) p.bitacora.push({ fecha: hoy, texto: t })
    p.actualizado = hoy
    resultado = p
  } else if (cambios.accion === 'borrar') {
    const i = lista.findIndex(x => x.id === cambios.id)
    if (i < 0) falla(404, 'No existe ese pendiente')
    lista.splice(i, 1)
  } else falla(400, 'Acción desconocida')
  await almacen.guardarFilas(lista.map(pendienteAFila))
  return { pendiente: resultado, pendientes: lista }
}

export function almacenPendientesSheets(sheets, spreadsheetId) {
  return {
    async leerFilas() {
      try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${HOJA_PENDIENTES}!A2:J` })
        return res.data.values || []
      } catch (e) {
        if (String(e?.message || e).includes('Unable to parse range')) return null
        throw e
      }
    },
    async guardarFilas(filas) {
      const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' })
      if (!meta.data.sheets.some(s => s.properties.title === HOJA_PENDIENTES)) {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: HOJA_PENDIENTES } } }] } })
      }
      await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${HOJA_PENDIENTES}!A:J` })
      await sheets.spreadsheets.values.update({
        spreadsheetId, range: `${HOJA_PENDIENTES}!A1`, valueInputOption: 'RAW',
        requestBody: { values: [ENCABEZADOS_PENDIENTES, ...filas] },
      })
    },
  }
}

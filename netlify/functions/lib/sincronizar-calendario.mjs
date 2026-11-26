// Lo que Maxi cambia directo en Google Calendar pasa a la venta (2026-11-26): si una instalacion se
// movio o se alargo en el calendario, la venta toma la fecha y horas del evento. Asi los mensajes de
// la vispera, la ruta del dia y el panel usan la hora real. Se busca el evento por su id (el que
// guardo la venta al agendar); los eventos de todo el dia o de varios dias no se copian.
import { actualizarCotizacion } from './cotizaciones.mjs'

// eventos: los de eventosEntre (eventoParaVista). → [{ cotNum, instalacion, antes }]
export function cambiosDesdeCalendario(eventos = [], cotizaciones = []) {
  const porId = new Map(eventos.filter(e => e.tipo === 'instalacion' && !e.todoElDia && e.minutoFin < 24 * 60).map(e => [e.id, e]))
  const cambios = []
  for (const q of cotizaciones) {
    const i = q.instalacion
    const e = i?.eventId && porId.get(i.eventId)
    if (!e || (e.fecha === i.fecha && e.inicio === i.inicio && e.fin === i.fin)) continue
    cambios.push({ cotNum: String(q.cotNum), instalacion: { ...i, fecha: e.fecha, inicio: e.inicio, fin: e.fin }, antes: { fecha: i.fecha, inicio: i.inicio, fin: i.fin } })
  }
  return cambios
}

// Guarda los cambios en la planilla y devuelve las cotizaciones ya al dia. Si una no se puede
// guardar, sigue con las demas (se intenta de nuevo la proxima vez).
export async function sincronizarDesdeCalendario(almacen, eventos, cotizaciones) {
  const guardados = new Map()
  for (const c of cambiosDesdeCalendario(eventos, cotizaciones)) {
    try {
      await actualizarCotizacion(almacen, { cotNum: c.cotNum, instalacion: c.instalacion })
      guardados.set(c.cotNum, c)
      console.log(`calendario→venta N° ${c.cotNum}: ${c.antes.fecha} ${c.antes.inicio}-${c.antes.fin} → ${c.instalacion.fecha} ${c.instalacion.inicio}-${c.instalacion.fin}`)
    } catch (e) { console.warn(`calendario→venta N° ${c.cotNum} no se guardó:`, e.message) }
  }
  return {
    cambios: [...guardados.values()],
    cotizaciones: cotizaciones.map(q => (guardados.has(String(q.cotNum)) ? { ...q, instalacion: guardados.get(String(q.cotNum)).instalacion } : q)),
  }
}

// Mensajes de WhatsApp del admin. Los textos viven en netlify/functions/lib/mensajes.mjs,
// compartidos con el cron de recordatorios.
import { linkWhatsapp, mensajeInstalacion, mensajeRecordatorio } from '../../netlify/functions/lib/mensajes.mjs'

export { duracion, fechaLarga, mensajeInstalacion, mensajeRecordatorio, telefonoWhatsapp } from '../../netlify/functions/lib/mensajes.mjs'

// Al agendar: "Su hora ya esta agendada".
export const linkWhatsappInstalacion = (cotizacion, instalacion) => linkWhatsapp(cotizacion.telefono, mensajeInstalacion(cotizacion, instalacion))

// El dia anterior: recordatorio de instalacion o de visita.
export const linkWhatsappRecordatorio = evento => linkWhatsapp(evento.telefono, mensajeRecordatorio(evento))

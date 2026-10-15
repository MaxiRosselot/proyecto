// Clientes de Google con el refresh token del negocio, y lo que las funciones de reserva y pago
// necesitan de ellos. Un solo lugar para no repetir la autenticacion en cada funcion.
import { google } from 'googleapis'
import { almacenSheets } from './cotizaciones.mjs'
import { eventosEntre } from './calendario.mjs'
import { enviarCorreoGmail } from './correo.mjs'

export function serviciosGoogle(env = process.env) {
  const auth = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN })
  const calendar = google.calendar({ version: 'v3', auth })
  const gmail = google.gmail({ version: 'v1', auth })
  return {
    almacen: almacenSheets(google.sheets({ version: 'v4', auth }), env.GOOGLE_SHEET_ID),
    calendar, calendarId: env.CALENDAR_ID,
    leerEventos: (desde, hasta) => eventosEntre(calendar, env.CALENDAR_ID, desde, hasta),
    enviarCorreo: correo => enviarCorreoGmail(gmail, correo),
    avisoA: env.NOTIFY_EMAIL || 'repisas@donmaxi.cl',
  }
}

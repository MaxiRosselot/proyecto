// Lo que el bot (lib/bot.mjs) necesita de afuera, en produccion: la planilla, el calendario, Drive
// y la API de Telegram. El entorno local arma lo mismo con datos en memoria (server.mjs).
import { google } from 'googleapis'
import { listarCotizaciones } from './cotizaciones.mjs'
import { serviciosGoogle } from './google-servicios.mjs'
import { HOJA_HORARIOS_INSTALACIONES, HORARIO_INSTALACIONES, almacenHorariosSheets, leerHorario } from './horarios.mjs'
import { linkPagoCotizacion } from './mercadopago.mjs'
import { registrarPago } from './pagos.mjs'
import { actualizarFila } from './planilla.mjs'
import { almacenFotosDrive, carpetaPorNombre, subirFotoWeb } from './sitio.mjs'
import { rolesTelegram } from './bot.mjs'
import { configTelegram, llamarTelegram } from './telegram.mjs'
import { comunaDe } from './zonas.mjs'
import { fijarHoraVisita, guardarCoordenadas } from './visitas.mjs'

export const CARPETA_FOTOS_INSTALACIONES = 'Fotos instalaciones Don Maxi'
const MARCA_FOTO_VENTA = 'fotoVentaDonMaxi'

// La API de Telegram y la descarga de fotos (getFile → /file/bot<token>/<ruta>).
export function depsTelegram(env = process.env, fetchImpl = fetch) {
  const config = configTelegram(env)
  return {
    tg: (metodo, cuerpo) => llamarTelegram(config, metodo, cuerpo, { fetchImpl, timeoutMs: 8000 }),
    async bajarArchivo(fileId) {
      const { file_path: ruta } = await llamarTelegram(config, 'getFile', { file_id: fileId }, { fetchImpl })
      const r = await fetchImpl(`${config.api}/file/bot${config.token}/${ruta}`)
      if (!r.ok) throw new Error(`No pude bajar la foto de Telegram (${r.status})`)
      return { datos: Buffer.from(await r.arrayBuffer()), tipo: /\.png$/i.test(ruta) ? 'image/png' : 'image/jpeg' }
    },
  }
}

// Fotos de instalaciones en Drive: "Fotos instalaciones Don Maxi / N° 1450 · Juan Pérez".
export function fotosVentaDrive(drive) {
  return {
    async guardarFoto({ cotizacion: q, datos, tipo, nombre }) {
      const { Readable } = await import('stream')
      const raiz = await carpetaPorNombre(drive, CARPETA_FOTOS_INSTALACIONES)
      const carpeta = await carpetaPorNombre(drive, `N° ${q.cotNum} · ${String(q.nombre || '').slice(0, 60)}`, raiz)
      const comuna = comunaDe(q.direccion)
      const r = await drive.files.create({
        requestBody: { name: nombre, parents: [carpeta], appProperties: { [MARCA_FOTO_VENTA]: '1', cotNum: String(q.cotNum), titulo: comuna ? `Bodega en ${comuna}` : 'Bodega' } },
        media: { mimeType: tipo, body: Readable.from(datos) }, fields: 'id',
      })
      return { id: r.data.id, carpetaUrl: `https://drive.google.com/drive/folders/${carpeta}` }
    },
    // Solo archivos que guardo el bot (con su marca): el id llega desde un boton de Telegram.
    async leerFoto(id) {
      if (!/^[\w-]{10,100}$/.test(id)) return null
      const meta = await drive.files.get({ fileId: id, fields: 'mimeType,appProperties,trashed' }).catch(() => null)
      if (!meta || meta.data.appProperties?.[MARCA_FOTO_VENTA] !== '1' || meta.data.trashed) return null
      const r = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'arraybuffer' })
      return { datos: Buffer.from(r.data), tipo: meta.data.mimeType, titulo: meta.data.appProperties.titulo || 'Bodega' }
    },
  }
}

// Coordenadas de una direccion escrita (para la ruta de visitas antiguas o sin autocompletar).
// Con GOOGLE_MAPS_SERVER_KEY (Geocoding API); sin ella, la ruta ordena esas visitas por comuna.
export async function geocodificar(direccion, { key = process.env.GOOGLE_MAPS_SERVER_KEY, fetchImpl = fetch } = {}) {
  if (!key || !direccion) return null
  const q = new URLSearchParams({ address: direccion, region: 'cl', components: 'country:CL', language: 'es', key })
  const r = await fetchImpl(`https://maps.googleapis.com/maps/api/geocode/json?${q}`).then(x => x.json()).catch(() => null)
  const punto = r?.status === 'OK' ? r.results?.[0]?.geometry?.location : null
  return punto ? { lat: punto.lat, lng: punto.lng } : null
}

// Todo junto para atenderUpdate / enviarMananaDelBot.
export function depsBot(env = process.env) {
  const { almacen, calendar, calendarId, leerEventos } = serviciosGoogle(env)
  const auth = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN })
  const drive = google.drive({ version: 'v3', auth })
  const horarios = almacenHorariosSheets(google.sheets({ version: 'v4', auth }), env.GOOGLE_SHEET_ID, HOJA_HORARIOS_INSTALACIONES)
  return {
    ...depsTelegram(env),
    ...fotosVentaDrive(drive),
    roles: rolesTelegram(env),
    listar: async () => (await listarCotizaciones(almacen)).quotes,
    leerEventos,
    leerHorario: () => leerHorario(horarios, HORARIO_INSTALACIONES),
    actualizarFila: (cotNum, cambios) => actualizarFila(almacen, calendar, calendarId, cotNum, cambios, { leerEventos }),
    registrarPago: datos => registrarPago(almacen, datos),
    publicarFoto: ({ datos, tipo, titulo }) => subirFotoWeb(almacenFotosDrive(drive), { seccion: 'galeria', categoria: 'bodegas', tipo, titulo, datos: datos.toString('base64') }),
    linkPago: cotNum => { try { return linkPagoCotizacion(cotNum) } catch { return '' } },
    fijarHoraVisita: datos => fijarHoraVisita(calendar, calendarId, datos),
    guardarCoordenadas: (visitId, punto) => guardarCoordenadas(calendar, calendarId, visitId, punto),
    ...(env.GOOGLE_MAPS_SERVER_KEY ? { geocodificar: direccion => geocodificar(direccion, { key: env.GOOGLE_MAPS_SERVER_KEY }) } : {}),
  }
}

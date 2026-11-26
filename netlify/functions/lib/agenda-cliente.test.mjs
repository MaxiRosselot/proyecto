import test from 'node:test'
import assert from 'node:assert/strict'
import { almacenEnMemoria, crearCotizacion, obtenerCotizacion } from './cotizaciones.mjs'
import { firmaPago } from './mercadopago.mjs'
import { atenderAgendaGet, atenderAgendaPost, linkAgenda } from './agenda-cliente.mjs'

// Martes 20 de octubre de 2026, 12:00 en Chile.
const AHORA = Date.parse('2026-10-20T15:00:00Z')
const CONFIG = { secreto: 'secreto', base: 'https://donmaxi.example' }
const T = firmaPago('1500', CONFIG.secreto)

async function preparar(eventos = []) {
  const almacen = almacenEnMemoria()
  await crearCotizacion(almacen, {
    crear: true, cotNum: 1500, nombre: 'Marta Díaz', email: 'marta@example.cl', telefono: '9 7777 8888', direccion: 'Av. Grecia 1500',
    repisas: [{ unidades: 1, valor: 200000 }], adicionales: {}, subtotal: 200000, iva: 38000, total: 238000,
    // $200.000 en repisas: 2 h de instalacion.
    proyecto3d: { room: { backWallCm: 200, leftWallCm: 250, rightWallCm: 250, heightCm: 250 }, shelving: { layout: 'manual', heightCm: 200, depthCm: 48, runs: [{ id: 'a', wall: 'back', startCm: 0, lengthCm: 200 }, { id: 'b', wall: 'right', startCm: 48, lengthCm: 150 }] } },
  }, new Date(AHORA))
  const correos = [], insertados = []
  const calendar = { events: {
    async insert({ requestBody }) { insertados.push(requestBody); return { data: { id: 'ev1', htmlLink: 'https://calendar/ev1' } } },
    async patch({ eventId }) { return { data: { id: eventId, htmlLink: 'https://calendar/ev1' } } },
  } }
  const deps = { almacen, config: CONFIG, calendar, calendarId: 'cal', leerEventos: async () => eventos, enviarCorreo: async c => correos.push(c), avisoA: 'admin@example.cl', ahora: AHORA }
  return { almacen, deps, correos, insertados }
}
const leer = async r => ({ status: r.statusCode, ...JSON.parse(r.body) })

test('el link firmado abre la cotizacion; uno alterado no', async () => {
  const { deps } = await preparar()
  assert.equal(linkAgenda('1500', CONFIG), `https://donmaxi.example/agendar?c=1500&t=${T}`)
  const r = await leer(await atenderAgendaGet({ c: '1500', t: T }, deps))
  assert.equal(r.estado, 'por-agendar')
  assert.equal(r.cotizacion.netoRepisas, 200000)
  assert.deepEqual(r.cotizacion.servicios.map(s => s.clave), ['retiro_orden', 'retiro_basura', 'cajas', 'bici'])
  assert.equal((await leer(await atenderAgendaGet({ c: '1500', t: 'x' }, deps))).status, 404)
})

test('agenda con un servicio: bloque de 2 h, calendario, total y correos al cliente y a Don Maxi', async () => {
  // El miercoles 21 hay otra instalacion que Maxi alargo de 10:00 a 13:00.
  const { almacen, deps, correos, insertados } = await preparar([{ tipo: 'instalacion', id: 'otra', cotNum: '9', fecha: '2026-10-21', minutoInicio: 600, minutoFin: 780, todoElDia: false }])
  // Se ofrece desde las 13:00 y el evento queda de 2 h (Maxi lo alarga si hace falta).
  const r = await leer(await atenderAgendaPost({ c: '1500', t: T, fecha: '2026-10-21', inicio: '13:00', servicios: { retiro_orden: 1 } }, deps))
  assert.equal(r.ok, true, r.error)
  assert.deepEqual(r.cotizacion.instalacion, { fecha: '2026-10-21', inicio: '13:00', fin: '15:00' })
  const q = await obtenerCotizacion(almacen, 1500)
  assert.equal(q.adicionales.qty_retiro_orden, 1)
  assert.equal(Number(q.total), (200000 + 40000) * 1.19)
  assert.equal(q.instalacion.agendadaPorCliente, true)
  assert.equal(insertados.length, 1)
  assert.equal(correos.length, 2)
  assert.match(correos[0].asunto, /quedó agendada/)
  assert.match(correos[0].texto, /Llegamos a las 13:00 hrs \(el trabajo dura entre 2 y 3 horas\)[\s\S]*Retiro y orden de artículos[\s\S]*pago es una vez terminada/)
  assert.match(correos[0].texto, /agendar\?c=1500/)
  assert.equal(correos[1].para, 'admin@example.cl')
  assert.match(correos[1].asunto, /Agendó: Marta Díaz · Miércoles/)
  // Trae el mensaje para confirmarle por WhatsApp, listo para copiar y con el link al chat.
  assert.match(correos[1].texto, /Falta confirmarle por WhatsApp[\s\S]*confirmar su instalación de mañana miércoles 21 de octubre, de 13:00 a 15:00[\s\S]*wa\.me\/56977778888/)
  // Al volver a entrar ve su hora.
  const g = await leer(await atenderAgendaGet({ c: '1500', t: T }, deps))
  assert.equal(g.estado, 'agendada')
  // Aunque sea mañana, puede cambiarla desde el link.
  assert.equal(g.cotizacion.puedeReagendar, true)
})

test('solo horas que calzan; reagendar cuando quiera', async () => {
  const { deps, correos } = await preparar()
  // 2 h: a las 11:00 no se ofrece (dejaria 1 h suelta antes).
  const mal = await leer(await atenderAgendaPost({ c: '1500', t: T, fecha: '2026-10-21', inicio: '11:00', servicios: {} }, deps))
  assert.equal(mal.status, 409)
  // Sabado no.
  assert.equal((await leer(await atenderAgendaPost({ c: '1500', t: T, fecha: '2026-10-24', inicio: '10:00', servicios: {} }, deps))).status, 409)
  assert.equal((await leer(await atenderAgendaPost({ c: '1500', t: T, fecha: '2026-10-23', inicio: '10:00', servicios: {} }, deps))).ok, true)
  // Reagenda al lunes 26.
  const re = await leer(await atenderAgendaPost({ c: '1500', t: T, fecha: '2026-10-26', inicio: '14:00', servicios: {} }, deps))
  assert.equal(re.ok, true, re.error)
  assert.equal(re.reagendada, true)
  assert.match(correos.at(-1).texto, /Antes: Viernes,? 23 de octubre, 10:00–12:00/)
  // El dia antes todavia se puede (el lunes 26 a las 14:00; ahora domingo 25 a las 12:00).
  const vispera = await leer(await atenderAgendaPost({ c: '1500', t: T, fecha: '2026-10-27', inicio: '10:00', servicios: {} }, { ...deps, ahora: Date.parse('2026-10-25T15:00:00Z') }))
  assert.equal(vispera.ok, true, vispera.error)
  // Ya empezada (martes 27 a las 10:30), tambien.
  const tarde = await leer(await atenderAgendaPost({ c: '1500', t: T, fecha: '2026-10-28', inicio: '10:00', servicios: {} }, { ...deps, ahora: Date.parse('2026-10-27T13:30:00Z') }))
  assert.equal(tarde.ok, true, tarde.error)
})

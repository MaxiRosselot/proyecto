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

test('agenda con un servicio: duracion, calendario, total y correos al cliente y a Don Maxi', async () => {
  // El miercoles 21 hay otra instalacion de 10:00 a 12:30.
  const { almacen, deps, correos, insertados } = await preparar([{ tipo: 'instalacion', id: 'otra', cotNum: '9', fecha: '2026-10-21', minutoInicio: 600, minutoFin: 750, todoElDia: false }])
  // 200.000 + retiro y orden: 2,2 + 0,5 = 2,7 h → 3 h. Pegada a la otra: 12:30-15:30.
  const r = await leer(await atenderAgendaPost({ c: '1500', t: T, fecha: '2026-10-21', inicio: '12:30', servicios: { retiro_orden: 1 } }, deps))
  assert.equal(r.ok, true, r.error)
  assert.deepEqual(r.cotizacion.instalacion, { fecha: '2026-10-21', inicio: '12:30', fin: '15:30' })
  const q = await obtenerCotizacion(almacen, 1500)
  assert.equal(q.adicionales.qty_retiro_orden, 1)
  assert.equal(Number(q.total), (200000 + 40000) * 1.19)
  assert.equal(q.instalacion.agendadaPorCliente, true)
  assert.equal(insertados.length, 1)
  assert.equal(correos.length, 2)
  assert.match(correos[0].asunto, /quedó agendada/)
  assert.match(correos[0].texto, /De 12:30 a 15:30 hrs[\s\S]*Retiro y orden de artículos[\s\S]*pago es una vez terminada/)
  assert.match(correos[0].texto, /agendar\?c=1500/)
  assert.equal(correos[1].para, 'admin@example.cl')
  assert.match(correos[1].asunto, /Agendó: Marta Díaz · Miércoles/)
  // Trae el mensaje para confirmarle por WhatsApp, listo para copiar y con el link al chat.
  assert.match(correos[1].texto, /Falta confirmarle por WhatsApp[\s\S]*confirmar su instalación de mañana miércoles 21 de octubre, de 12:30 a 15:30[\s\S]*wa\.me\/56977778888/)
  // Al volver a entrar ve su hora.
  const g = await leer(await atenderAgendaGet({ c: '1500', t: T }, deps))
  assert.equal(g.estado, 'agendada')
  // Es mañana: faltan menos de 48 h, ya no puede reagendar solo.
  assert.equal(g.cotizacion.puedeReagendar, false)
})

test('solo horas que calzan; reagendar hasta 48 h antes', async () => {
  const { deps, correos } = await preparar()
  // 2 h 30 min: a las 11:00 no se ofrece (no queda pegada a nada).
  const mal = await leer(await atenderAgendaPost({ c: '1500', t: T, fecha: '2026-10-21', inicio: '11:00', servicios: {} }, deps))
  assert.equal(mal.status, 409)
  // Sabado no.
  assert.equal((await leer(await atenderAgendaPost({ c: '1500', t: T, fecha: '2026-10-24', inicio: '10:00', servicios: {} }, deps))).status, 409)
  assert.equal((await leer(await atenderAgendaPost({ c: '1500', t: T, fecha: '2026-10-23', inicio: '10:00', servicios: {} }, deps))).ok, true)
  // Reagenda al lunes 26 (faltan mas de 48 h para el viernes 23 a las 10).
  const re = await leer(await atenderAgendaPost({ c: '1500', t: T, fecha: '2026-10-26', inicio: '13:30', servicios: {} }, deps))
  assert.equal(re.ok, true, re.error)
  assert.equal(re.reagendada, true)
  assert.match(correos.at(-1).texto, /Antes: Viernes,? 23 de octubre, 10:00–12:30/)
  // A menos de 48 h ya no se puede.
  const tarde = await leer(await atenderAgendaPost({ c: '1500', t: T, fecha: '2026-10-27', inicio: '10:00', servicios: {} }, { ...deps, ahora: Date.parse('2026-10-25T15:00:00Z') }))
  assert.equal(tarde.status, 409)
  assert.match(tarde.error, /menos de 48 horas/)
})

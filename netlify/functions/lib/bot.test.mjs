import test from 'node:test'
import assert from 'node:assert/strict'
import { atenderUpdate, buscarClientes, enviarMananaDelBot, fichasDelDia, secretoWebhook } from './bot.mjs'
import { HORARIO_INSTALACIONES } from './horarios.mjs'
import { resumenPagos } from './pagos-resumen.mjs'

// Lunes 26 de octubre de 2026, 12:00 en Chile.
const AHORA = Date.parse('2026-10-26T15:00:00Z')
const HOY = '2026-10-26'

function venta(cotNum, extra = {}) {
  return {
    cotNum, nombre: 'Juan Pérez', telefono: '+56 9 1234 5678', direccion: 'Los Militares 5400, Las Condes', status: 'confirmada',
    total: 400000, pagos: [], adicionales: { qty_retiro_basura: 1 }, creadoMs: Date.parse('2026-10-10T15:00:00Z'),
    repisas: [{ l: 2.43, p: 0.48, a: 2, n: 4, u: 2 }],
    instalacion: { fecha: HOY, inicio: '10:00', fin: '13:00' }, ...extra,
  }
}

function crearDeps(quotes, { eventos = [] } = {}) {
  const llamadas = [], fotos = [], publicadas = [], cambios = [], pagos = []
  const deps = {
    roles: { admins: ['1'], maestros: ['2'] }, ahora: AHORA,
    tg: async (metodo, cuerpo) => { llamadas.push({ metodo, ...cuerpo }); return { message_id: 100 + llamadas.length } },
    listar: async () => quotes,
    leerEventos: async () => eventos,
    leerHorario: async () => HORARIO_INSTALACIONES,
    actualizarFila: async (cotNum, c) => {
      cambios.push({ cotNum, ...c })
      const q = quotes.find(x => String(x.cotNum) === String(cotNum))
      q.instalacion = { ...q.instalacion, ...c }
      return { cotizacion: q }
    },
    registrarPago: async p => {
      pagos.push(p)
      const q = quotes.find(x => String(x.cotNum) === String(p.cotNum))
      q.pagos = [...q.pagos, { monto: p.monto }]
      return { resumen: resumenPagos(q.total, q.pagos) }
    },
    bajarArchivo: async () => ({ datos: Buffer.from('foto'), tipo: 'image/jpeg' }),
    guardarFoto: async f => { fotos.push(f); return { id: `drive${fotos.length}`, carpetaUrl: 'https://drive.google.com/drive/folders/x' } },
    leerFoto: async id => ({ datos: Buffer.from(id), tipo: 'image/jpeg', titulo: 'Bodega en Las Condes' }),
    publicarFoto: async f => { publicadas.push(f) },
    linkPago: cotNum => `https://repisasdonmaxi.cl/reserva?c=${cotNum}`,
  }
  return { deps, llamadas, fotos, publicadas, cambios, pagos }
}

const mensaje = (chat, texto, extra = {}) => ({ message: { message_id: 7, chat: { id: chat }, from: { first_name: 'Felipe' }, text: texto, ...extra } })
const boton = (chat, data, extra = {}) => ({ callback_query: { id: 'cb1', data, message: { message_id: 50, chat: { id: chat }, text: 'antes', ...extra } } })
const botones = l => (l.reply_markup?.inline_keyboard || []).flat()
const enviados = llamadas => llamadas.filter(l => ['sendMessage', 'editMessageText'].includes(l.metodo))

test('el secreto del webhook sale del token y no se puede adivinar sin el', () => {
  assert.equal(secretoWebhook('abc').length, 48)
  assert.equal(secretoWebhook('abc'), secretoWebhook('abc'))
  assert.notEqual(secretoWebhook('abc'), secretoWebhook('abd'))
})

test('un chat desconocido recibe su numero y Maxi se entera', async () => {
  const { deps, llamadas } = crearDeps([])
  await atenderUpdate(mensaje(999, '/start'), deps)
  assert.match(llamadas[0].text, /Tu número de chat es 999/)
  assert.equal(llamadas[1].chat_id, '1')
  assert.match(llamadas[1].text, /TELEGRAM_MAESTRO_CHAT_ID/)
})

test('admin: /hoy lista instalaciones y visitas con un boton por instalacion', async () => {
  const eventos = [{ tipo: 'visita', fecha: HOY, inicio: '10:30', cliente: 'Ana Soto', ubicacion: 'Av. Grecia 1500, Ñuñoa', telefono: '+56 9 8888 7777' }]
  const { deps, llamadas } = crearDeps([venta(1450), venta(1451, { nombre: 'Rosa Díaz', instalacion: { fecha: HOY, inicio: '14:00', fin: '16:00' }, pagos: [{ monto: 200000 }] })], { eventos })
  await atenderUpdate(mensaje(1, '/hoy'), deps)
  const [m] = enviados(llamadas)
  assert.match(m.text, /🔧 Instalaciones \(2\)/)
  assert.match(m.text, /10:00–13:00 · Juan Pérez · N° 1450 · Las Condes · saldo \$400\.000/)
  assert.match(m.text, /14:00–16:00 · Rosa Díaz · N° 1451 · Las Condes · saldo \$200\.000/)
  assert.match(m.text, /10:30 · Ana Soto · Ñuñoa/)
  assert.deepEqual(botones(m).map(x => x.callback_data).slice(0, 2), ['v|1450', 'v|1451'])
})

test('admin: registrar un pago con botones (saldo → medio) y con un monto escrito', async () => {
  const q = venta(1450)
  const { deps, llamadas, pagos } = crearDeps([q])
  await atenderUpdate(boton(1, 'p|1450'), deps)
  assert.deepEqual(botones(enviados(llamadas).at(-1)).map(x => x.callback_data), ['pm|1450|400000', 'pm|1450|200000', 'po|1450', 'v|1450'])
  await atenderUpdate(boton(1, 'pm|1450|200000'), deps)
  assert.equal(botones(enviados(llamadas).at(-1))[0].callback_data, 'pg|1450|200000|0')
  await atenderUpdate(boton(1, 'pg|1450|200000|2'), deps)
  assert.deepEqual(pagos[0], { cotNum: '1450', monto: 200000, medio: 'Efectivo', fecha: HOY, nota: 'Registrado desde Telegram' })
  assert.match(enviados(llamadas).at(-1).text, /Saldo pendiente: \$200\.000/)
  assert.ok(llamadas.some(l => l.metodo === 'answerCallbackQuery' && l.text === '💳 Pago registrado'))

  // Otro monto: el bot pregunta y la respuesta trae el N° en el mensaje citado.
  await atenderUpdate(boton(1, 'po|1450'), deps)
  assert.equal(enviados(llamadas).at(-1).reply_markup.force_reply, true)
  await atenderUpdate(mensaje(1, '150.000', { reply_to_message: { text: enviados(llamadas).at(-1).text } }), deps)
  assert.equal(botones(enviados(llamadas).at(-1))[0].callback_data, 'pg|1450|150000|0')
})

test('admin: cambiar dia y hora (dia → hora → confirmar) mueve la instalacion con su duracion', async () => {
  const q = venta(1450, { instalacion: { fecha: '2026-10-28', inicio: '10:00', fin: '13:00', eventId: 'ev1' } })
  const otra = venta(1451, { instalacion: { fecha: '2026-10-29', inicio: '10:00', fin: '11:00' } })
  const { deps, llamadas, cambios } = crearDeps([q, otra])
  await atenderUpdate(boton(1, 'r|1450'), deps)
  const dias = botones(enviados(llamadas).at(-1)).map(x => x.callback_data)
  assert.equal(dias[0], 'rd|1450|20261027')   // mañana martes (hoy lunes ya paso de las 8:00)
  await atenderUpdate(boton(1, 'rd|1450|20261029'), deps)
  // El jueves ya hay una de 10 a 11: para 3 h, 11:00 o 13:00 (dejan 0 o ≥ 2 h libres).
  assert.deepEqual(botones(enviados(llamadas).at(-1)).map(x => x.text), ['11:00–14:00', '13:00–16:00', '⬅️ Otro día'])
  await atenderUpdate(boton(1, 'rh|1450|20261029|1300'), deps)
  assert.match(enviados(llamadas).at(-1).text, /Antes: Miércoles 28 de octubre, 10:00–13:00\nAhora: Jueves 29 de octubre, 13:00–16:00/)
  await atenderUpdate(boton(1, 'rc|1450|20261029|1300'), deps)
  assert.deepEqual(cambios, [{ cotNum: '1450', fecha: '2026-10-29', inicio: '13:00', fin: '16:00' }])
  assert.ok(llamadas.some(l => l.chat_id === '2' && /Cambio de agenda: Juan Pérez/.test(l.text)), 'el maestro se entera')
  assert.ok(botones(enviados(llamadas).at(-1)).some(x => /wa\.me/.test(x.url || '')))
})

test('maestro: no ve lo del admin, recibe sus fichas sin precios y marca terminada', async () => {
  const q = venta(1450, { pagos: [{ monto: 100000 }] })
  const { deps, llamadas, cambios } = crearDeps([q])
  await atenderUpdate(boton(2, 'c'), deps)
  assert.ok(llamadas.some(l => l.metodo === 'answerCallbackQuery' && /Solo Maxi/.test(l.text)))

  await atenderUpdate(mensaje(2, '/hoy'), deps)
  const [saludo, ficha] = enviados(llamadas)
  assert.match(saludo.text, /Hoy, lunes 26 de octubre: 1 instalación/)
  assert.match(saludo.text, /🪵 Materiales:/)
  assert.match(ficha.text, /💵 Cobrar al terminar: \$300\.000/)
  assert.doesNotMatch(ficha.text, /Total|Neto/)
  assert.deepEqual(botones(ficha).map(x => x.text), ['📍 Maps', '🚗 Waze', '💬 Avisar que voy en camino', '✅ Terminada'])

  await atenderUpdate(boton(2, 't|1450'), deps)
  assert.deepEqual(cambios, [{ cotNum: '1450', instalada: true }])
  const aviso = llamadas.find(l => l.chat_id === '1')
  assert.match(aviso.text, /terminó la instalación[\s\S]*Saldo por cobrar: \$300\.000/)
  assert.deepEqual(botones(aviso).map(x => x.text), ['💬 Cobrar saldo $300.000', '⭐ Pedir reseña en Google', '💳 Registrar pago'])
  assert.match(decodeURIComponent(botones(aviso)[0].url), /reserva\?c=1450/)
})

test('maestro: las fotos van a la instalacion de hoy, o pregunta de cual; Maxi las publica', async () => {
  const foto = { photo: [{ file_id: 'chica' }, { file_id: 'grande' }] }
  const una = crearDeps([venta(1450)])
  await atenderUpdate(mensaje(2, undefined, foto), una.deps)
  assert.equal(una.fotos[0].cotizacion.cotNum, 1450)
  const aMaxi = una.llamadas.find(l => l.metodo === 'sendPhoto')
  assert.equal(aMaxi.photo, 'grande')
  assert.equal(botones(aMaxi)[0].callback_data, 'w|drive1')

  const dos = crearDeps([venta(1450), venta(1451, { nombre: 'Rosa Díaz', instalacion: { fecha: HOY, inicio: '14:00', fin: '16:00' } })])
  await atenderUpdate(mensaje(2, undefined, foto), dos.deps)
  assert.equal(dos.fotos.length, 0)
  const pregunta = enviados(dos.llamadas).at(-1)
  assert.deepEqual(botones(pregunta).map(x => x.callback_data), ['f|1450', 'f|1451'])
  await atenderUpdate(boton(2, 'f|1451', { reply_to_message: { message_id: 7, ...foto } }), dos.deps)
  assert.equal(dos.fotos[0].cotizacion.cotNum, 1451)
  // Con el N° en el texto de la foto no pregunta.
  await atenderUpdate(mensaje(2, undefined, { ...foto, caption: 'N° 1450 terminada' }), dos.deps)
  assert.equal(dos.fotos[1].cotizacion.cotNum, 1450)

  await atenderUpdate(boton(1, 'w|drive1'), una.deps)
  assert.equal(una.publicadas[0].titulo, 'Bodega en Las Condes')
})

test('admin: texto suelto busca por nombre, N° o telefono', async () => {
  const quotes = [venta(1450), venta(1460, { nombre: 'Rosa Díaz', telefono: '+56 9 5555 4444' })]
  assert.deepEqual(buscarClientes(quotes, 'perez').map(q => q.cotNum), [1450])
  assert.deepEqual(buscarClientes(quotes, 'N° 1460').map(q => q.cotNum), [1460])
  assert.deepEqual(buscarClientes(quotes, '55554444').map(q => q.cotNum), [1460])
  const { deps, llamadas } = crearDeps(quotes)
  await atenderUpdate(mensaje(1, 'rosa'), deps)
  assert.match(enviados(llamadas)[0].text, /Rosa Díaz · N° 1460/)
  assert.ok(botones(enviados(llamadas)[0]).some(x => x.callback_data === 'i|1460'))
})

test('07:00: fichas al maestro y el dia a Maxi', async () => {
  assert.match(fichasDelDia([], HOY, HOY)[0].texto, /no hay instalaciones/)
  const { deps, llamadas } = crearDeps([venta(1450)])
  const r = await enviarMananaDelBot(deps)
  assert.equal(r.enviados, 3)
  assert.deepEqual(llamadas.map(l => l.chat_id), ['1', '2', '2'])
  assert.match(llamadas[0].text, /Buenos días Maxi/)

  // Sin maestro conectado, las fichas le llegan a Maxi para probarlas.
  const solo = crearDeps([venta(1450)])
  solo.deps.roles.maestros = []
  await enviarMananaDelBot(solo.deps)
  assert.deepEqual(solo.llamadas.map(l => l.chat_id), ['1', '1', '1', '1'])
  assert.match(solo.llamadas[1].text, /Así le llegarán las fichas al maestro/)
  assert.ok(botones(solo.llamadas[3]).some(x => x.callback_data === 't|1450'))
})

test('admin: ruta de visitas de un dia, con WhatsApp por cliente y horas fijadas en el calendario', async () => {
  const R1 = { desde: '08:00', hasta: '11:00' }, R2 = { desde: '11:00', hasta: '14:00' }
  const visita = (id, cliente, rango, punto, ubicacion) => ({ id, tipo: 'visita', fecha: '2026-10-31', inicio: rango.desde, cliente, rango, horario: `${rango.desde}–${rango.hasta}`, telefono: '+56 9 1111 2222', ubicacion, ...punto })
  const eventos = [
    visita('pa', 'Pedro Alto', R1, { lat: -33.6117, lng: -70.5758 }, 'Concha y Toro 100, Puente Alto'),
    visita('lf', 'Lucía Flores', R1, { lat: -33.5227, lng: -70.5986 }, 'Vicuña Mackenna 7000, La Florida'),
    visita('nu', 'Nora Ñuñez', R2, {}, 'Grecia 1500, Ñuñoa'),
  ]
  const { deps, llamadas } = crearDeps([], { eventos })
  const fijadas = [], buscadas = []
  deps.fijarHoraVisita = async f => { fijadas.push(f) }
  deps.geocodificar = async dir => { buscadas.push(dir); return { lat: -33.4569, lng: -70.5976 } }
  deps.guardarCoordenadas = async () => {}

  await atenderUpdate(boton(1, 'ru'), deps)
  assert.equal(botones(enviados(llamadas).at(-1))[0].callback_data, 'rv|20261031')
  await atenderUpdate(boton(1, 'rv|20261031'), deps)
  const ruta = enviados(llamadas).at(-1)
  assert.deepEqual(buscadas, ['Grecia 1500, Ñuñoa'])
  assert.match(ruta.text, /Ruta del sábado 31 de octubre · 3 visitas/)
  assert.match(ruta.text, /08–11 hrs\n1\. 08:00 · Pedro Alto · Puente Alto[\s\S]*2\. \d\d:\d\d · Lucía Flores[\s\S]*11–14 hrs\n3\. 11:00 · Nora Ñuñez/)
  const bs = botones(ruta)
  assert.match(bs[0].url, /^https:\/\/www\.google\.com\/maps\/dir\//)
  assert.equal(bs.filter(x => /wa\.me/.test(x.url || '')).length, 3)
  assert.match(decodeURIComponent(bs.find(x => /Nora/.test(x.text)).url), /llegaríamos aprox\. a las 11:00 hrs/)
  await atenderUpdate(boton(1, 'rf|20261031'), deps)
  assert.deepEqual(fijadas.map(f => [f.visitId, f.hora]), [['pa', '08:00'], ['lf', fijadas[1].hora], ['nu', '11:00']])
  assert.match(enviados(llamadas).at(-1).text, /Estas horas ya están en el calendario/)
})

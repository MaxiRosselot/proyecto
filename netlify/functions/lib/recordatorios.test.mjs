import test from 'node:test'
import assert from 'node:assert/strict'
import { prepararRecordatorios } from './recordatorios.mjs'

const instalacion = { tipo: 'instalacion', cliente: 'Ana Pérez', email: 'ana@example.cl', telefono: '+56 9 5555 6666', fecha: '2026-10-17', inicio: '10:00', fin: '13:30', ubicacion: 'Los Aromos 123', pago: { total: 238000, pagado: 119000, saldo: 119000 } }
const instalacionSinCorreo = { ...instalacion, cliente: 'Luis Rojas', email: '', telefono: '9 1234 5678', pago: { total: 100000, pagado: 0, saldo: 100000 } }
const visita = { tipo: 'visita', cliente: 'Pedro', email: 'pedro@example.cl', telefono: '', fecha: '2026-10-17', inicio: '11:00', fin: '11:15', ubicacion: '' }
const personal = { tipo: 'otro', cliente: '', titulo: 'Dentista', email: 'yo@example.cl', fecha: '2026-10-17', inicio: '09:00' }

test('recordatorio por correo a cada cliente con correo, nunca a eventos personales', () => {
  const { correosClientes } = prepararRecordatorios({ manana: '2026-10-17', eventosManana: [instalacion, instalacionSinCorreo, visita, personal] })
  assert.deepEqual(correosClientes.map(c => c.para), ['ana@example.cl', 'pedro@example.cl'])
  assert.match(correosClientes[0].asunto, /mañana instalamos tus repisas/)
  assert.match(correosClientes[0].texto, /entre las 10:00 y las 13:30 hrs/)
  assert.match(correosClientes[0].texto, /retraso máximo de 1 hora/)
  assert.match(correosClientes[1].asunto, /visita de medición/)
})

test('el resumen trae los links de WhatsApp y el saldo a cobrar', () => {
  const ahora = new Date('2026-10-16T13:00:00Z')
  const { resumen } = prepararRecordatorios({
    manana: '2026-10-17', eventosManana: [instalacion, instalacionSinCorreo, visita], ahora,
    cotizaciones: [{ cotNum: '1430', nombre: 'Viejo', status: 'por confirmar', creadoMs: ahora - 5 * 86400000 }],
    visitasPasadas: [{ cliente: 'Sin Cotizar', fecha: '2026-10-10', estado: 'realizada' }],
  })
  assert.match(resumen.asunto, /2 instalaciones, 1 visitas/)
  assert.match(resumen.texto, /Saldo a cobrar: \$119\.000 \(ya pagó \$119\.000\)/)
  assert.match(resumen.texto, /Sin correo: mándale el recordatorio por WhatsApp/)
  assert.match(resumen.texto, /WhatsApp: https:\/\/wa\.me\/56912345678\?text=/)
  assert.match(resumen.texto, /N° 1430 · Viejo · 5 días/)
  assert.match(resumen.texto, /Sin Cotizar · visita del 2026-10-10/)
})

test('sin nada para mañana no hay resumen', () => {
  assert.equal(prepararRecordatorios({ manana: '2026-10-17', eventosManana: [personal] }).resumen, null)
})

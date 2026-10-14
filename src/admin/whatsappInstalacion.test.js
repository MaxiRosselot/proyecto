import test from 'node:test'
import assert from 'node:assert/strict'
import { linkWhatsappInstalacion, mensajeInstalacion, telefonoWhatsapp } from './whatsappInstalacion.js'

test('normaliza telefonos chilenos para WhatsApp', () => {
  assert.equal(telefonoWhatsapp('+56 9 1234 5678'), '56912345678')
  assert.equal(telefonoWhatsapp('9 1234 5678'), '56912345678')
  assert.equal(telefonoWhatsapp('1234 5678'), '56912345678')
  assert.equal(telefonoWhatsapp(''), '')
})

test('el mensaje trae dia, hora, duracion y el aviso del retraso', () => {
  const texto = mensajeInstalacion({ nombre: 'Ana María Pérez', direccion: 'Los Aromos 123' }, { fecha: '2026-10-20', inicio: '10:00', fin: '13:30' })
  assert.match(texto, /^¡Hola Ana! Su hora ya está agendada/)
  assert.match(texto, /Martes, 20 de octubre/)
  assert.match(texto, /De 10:00 a 13:30 hrs \(duración aprox\. 3 h 30 min\)/)
  assert.match(texto, /📍 Los Aromos 123/)
  assert.match(texto, /retraso máximo de 1 hora, pero intentaremos llegar puntual/)
  const link = linkWhatsappInstalacion({ nombre: 'Ana', telefono: '+56 9 1234 5678' }, { fecha: '2026-10-20', inicio: '10:00', fin: '12:00' })
  assert.ok(link.startsWith('https://wa.me/56912345678?text='))
  assert.match(decodeURIComponent(link), /duración aprox\. 2 h\)/)
})

test('recordatorios del dia anterior para instalacion y visita', async () => {
  const { mensajeRecordatorio, linkWhatsappRecordatorio } = await import('./whatsappInstalacion.js')
  const inst = mensajeRecordatorio({ tipo: 'instalacion', cliente: 'Ana Pérez', fecha: '2026-10-17', inicio: '10:00', fin: '13:30', ubicacion: 'Los Aromos 123' })
  assert.match(inst, /^¡Hola Ana! Le recordamos que mañana, sábado, 17 de octubre, vamos a instalar sus repisas/)
  assert.match(inst, /Entre las 10:00 y las 13:30 hrs \(duración aprox\. 3 h 30 min\)/)
  assert.match(inst, /retraso máximo de 1 hora/)
  const visita = mensajeRecordatorio({ tipo: 'visita', cliente: 'Pedro', fecha: '2026-10-18', inicio: '10:00', fin: '10:15' })
  assert.match(visita, /visita de medición mañana, domingo, 18 de octubre, a las 10:00 hrs/)
  assert.ok(linkWhatsappRecordatorio({ tipo: 'visita', cliente: 'Pedro', telefono: '9 1111 2222', fecha: '2026-10-18', inicio: '10:00', fin: '10:15' }).startsWith('https://wa.me/56911112222?text='))
})

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

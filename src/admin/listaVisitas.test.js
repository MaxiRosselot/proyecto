import test from 'node:test'
import assert from 'node:assert/strict'
import { mensajeConfirmarVisita, mensajeVisitaReagendada, textoVisitas } from './listaVisitas.js'

test('la lista de visitas va por dia, en orden de hora y con todos los datos', () => {
  const texto = textoVisitas([
    { nombre: 'Bruno', start: '2026-10-18T15:00:00-03:00', direccion: 'Av. Siempre Viva 742, Ñuñoa', celular: '+56911111111' },
    { nombre: 'Ana', start: '2026-10-18T10:30:00-03:00', email: 'ana@ejemplo.cl', notas: 'Tocar timbre 2' },
    { nombre: 'Carla', start: '2026-10-25T11:00:00-03:00' },
  ])
  assert.ok(texto.startsWith('📅 *Domingo, 18 de octubre* (2 visitas)') || texto.startsWith('📅 *Domingo 18 de octubre* (2 visitas)'), texto.split('\n')[0])
  assert.ok(texto.indexOf('*1. 10:30 · Ana*') < texto.indexOf('*2. 15:00 · Bruno*'))
  assert.match(texto, /📍 Av\. Siempre Viva 742, Ñuñoa\n🗺️ https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Av\.%20Siempre/)
  assert.match(texto, /📞 \+56911111111/)
  assert.match(texto, /✉️ ana@ejemplo\.cl\n📝 Tocar timbre 2/)
  assert.match(texto, /———\n\n📅 \*Domingo,? 25 de octubre\* \(1 visita\)\n\n\*1\. 11:00 · Carla\*$/)
})

test('el mensaje para confirmar la visita pide 1 hora de flexibilidad y que avise si no puede', () => {
  const visita = { nombre: 'Ana María Pérez', start: '2026-10-18T10:30:00-03:00', direccion: 'Los Militares 5400' }
  const texto = mensajeConfirmarVisita(visita, new Date('2026-10-17T12:00:00-03:00'))
  assert.match(texto, /^Hola Ana! 👋 .*visita de mañana domingo 18 de octubre a las 10:30 en Los Militares 5400\./)
  assert.match(texto, /1 hora de flexibilidad/)
  assert.match(texto, /si no puedes, avísanos/)
  assert.match(mensajeConfirmarVisita(visita, new Date('2026-10-10T12:00:00-03:00')), /visita del domingo 18/)
})

test('el aviso de visita reagendada lleva la nueva fecha y hora', () => {
  const texto = mensajeVisitaReagendada({ nombre: 'Bruno Díaz', start: '2026-10-24T10:30:00-03:00', direccion: 'Calle 1' })
  assert.match(texto, /^Hola Bruno! 👋 .*reagendada para el sábado 24 de octubre a las 10:30 en Calle 1\./)
  assert.match(texto, /1 hora de flexibilidad/)
})

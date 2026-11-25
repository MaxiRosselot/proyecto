import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buscarClientes, leerLinkWhatsapp, linkWhatsappWeb, telefonoLegible } from './whatsappPanel.js'

test('lee links de WhatsApp del panel', () => {
  assert.deepEqual(leerLinkWhatsapp('https://wa.me/56912345678?text=Hola%20Ana'), { telefono: '56912345678', texto: 'Hola Ana' })
  assert.deepEqual(leerLinkWhatsapp('https://api.whatsapp.com/send?phone=56912345678&text=x'), { telefono: '56912345678', texto: 'x' })
  assert.deepEqual(leerLinkWhatsapp('https://wa.me/?text=solo%20texto'), { telefono: '', texto: 'solo texto' })
  assert.equal(leerLinkWhatsapp('https://repisasdonmaxi.cl/pagar'), null)
  assert.equal(leerLinkWhatsapp('no es link'), null)
})

test('arma el link para abrir el chat dentro de WhatsApp Web', () => {
  assert.equal(linkWhatsappWeb('9 1234 5678', 'Hola ¿cómo?'), 'https://web.whatsapp.com/send?phone=56912345678&text=Hola+%C2%BFc%C3%B3mo%3F')
  assert.equal(linkWhatsappWeb('+56 9 1234 5678'), 'https://web.whatsapp.com/send?phone=56912345678')
})

test('muestra el celular legible', () => {
  assert.equal(telefonoLegible('912345678'), '+56 9 1234 5678')
  assert.equal(telefonoLegible(''), '')
})

test('busca clientes por nombre sin tildes, N° o teléfono', () => {
  const qs = [
    { cotNum: '470', nombre: 'José Pérez', telefono: '+56 9 8765 4321', direccion: 'Los Aromos 12' },
    { cotNum: '471', nombre: 'Ana Soto', telefono: '912345678', direccion: 'Ñuñoa' },
  ]
  assert.deepEqual(buscarClientes(qs, 'jose').map(q => q.cotNum), ['470'])
  assert.deepEqual(buscarClientes(qs, '471').map(q => q.cotNum), ['471'])
  assert.deepEqual(buscarClientes(qs, '8765 4321').map(q => q.cotNum), ['470'])
  assert.deepEqual(buscarClientes(qs, 'nunoa').map(q => q.cotNum), ['471'])
  assert.deepEqual(buscarClientes(qs, '  '), [])
})

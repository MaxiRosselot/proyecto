import test from 'node:test'
import assert from 'node:assert/strict'
import { linkWhatsapp, mensajeCotizacion } from './mensajes.mjs'

test('mensaje de la cotizacion: numero, total, link al PDF y la oferta', () => {
  const texto = mensajeCotizacion({ nombre: 'Marta Díaz', cotNum: 1579, total: 303450, pdfUrl: 'https://drive.google.com/file/d/abc/view' })
  assert.match(texto, /^¡Hola Marta! Le envío su cotización N° 1579/)
  assert.match(texto, /Total: \$303\.450 con IVA incluido\./)
  assert.match(texto, /Puede verla aquí: https:\/\/drive\.google\.com\/file\/d\/abc\/view/)
  assert.match(texto, /48 horas, tiene un 10% de descuento adicional/)
})

test('sin link de Drive el mensaje no promete el PDF', () => {
  assert.doesNotMatch(mensajeCotizacion({ nombre: '', cotNum: 1, total: 1000 }), /verla aquí/)
})

test('el link abre el chat del cliente con el mensaje', () => {
  const link = linkWhatsapp('9 4451 0600', mensajeCotizacion({ nombre: 'Ana', cotNum: 2, total: 1000, pdfUrl: 'https://x.y/z' }))
  assert.match(link, /^https:\/\/wa\.me\/56944510600\?text=/)
  assert.match(decodeURIComponent(link), /https:\/\/x\.y\/z/)
})

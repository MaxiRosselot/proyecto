import test from 'node:test'
import assert from 'node:assert/strict'
import { mensajeConfirmarInstalacion, linkWhatsapp, mensajeCotizacion } from './mensajes.mjs'

test('mensaje de la cotizacion: numero, total, link al PDF y la oferta', () => {
  const texto = mensajeCotizacion({ nombre: 'Marta Díaz', cotNum: 1579, total: 303450, pdfUrl: 'https://drive.google.com/file/d/abc/view' })
  assert.match(texto, /^¡Hola Marta! Le envío su cotización N° 1579/)
  assert.match(texto, /Total: \$303\.450 con IVA incluido\./)
  assert.match(texto, /Puede verla aquí: https:\/\/drive\.google\.com\/file\/d\/abc\/view/)
  assert.match(texto, /Si paga por transferencia, tiene un 5% de descuento\./)
})

test('con su link el mensaje invita a elegir el dia y pagar', () => {
  const texto = mensajeCotizacion({ nombre: 'Ana', cotNum: 3, total: 1000, linkPago: 'https://donmaxi.example/reserva?c=3&t=x' })
  assert.match(texto, /elegir el día de su instalación y pagar \(total o abono del 50%\): https:\/\/donmaxi\.example\/reserva\?c=3&t=x/)
})

test('con el link fijo de Mercado Pago el mensaje invita a pagar en linea', () => {
  const texto = mensajeCotizacion({ nombre: 'Ana', cotNum: 3, total: 1000, linkPago: 'https://link.mercadopago.cl/repisasdonmaxi' })
  assert.match(texto, /Puede pagar en línea aquí \(total o abono del 50%\): https:\/\/link\.mercadopago\.cl\/repisasdonmaxi/)
  assert.doesNotMatch(texto, /elegir el día/)
})

test('sin link de Drive el mensaje no promete el PDF', () => {
  assert.doesNotMatch(mensajeCotizacion({ nombre: '', cotNum: 1, total: 1000 }), /verla aquí/)
})

test('el link abre el chat del cliente con el mensaje', () => {
  const link = linkWhatsapp('9 4451 0600', mensajeCotizacion({ nombre: 'Ana', cotNum: 2, total: 1000, pdfUrl: 'https://x.y/z' }))
  assert.match(link, /^https:\/\/wa\.me\/56944510600\?text=/)
  assert.match(decodeURIComponent(link), /https:\/\/x\.y\/z/)
})

test('el mensaje para confirmar la instalacion pide 1 hora de flexibilidad y que avise si no puede', () => {
  const inst = { fecha: '2026-10-21', inicio: '10:00', fin: '12:30' }
  const t = mensajeConfirmarInstalacion({ nombre: 'Paula Rojas', direccion: 'Los Leones 123' }, inst, new Date('2026-10-20T12:00:00-03:00'))
  assert.match(t, /^¡Hola Paula! 👋 .*confirmar su instalación de mañana miércoles 21 de octubre, de 10:00 a 12:30 hrs en Los Leones 123\./)
  assert.match(t, /1 hora de flexibilidad/)
  assert.match(t, /¿Nos confirma si estamos ok\? 🙏$/)
  assert.doesNotMatch(t, /si no puede/)
  assert.match(mensajeConfirmarInstalacion({ nombre: 'Paula' }, inst, new Date('2026-10-10T12:00:00-03:00')), /instalación del miércoles 21 de octubre/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { mensajeCobro, nombreRepisaCobro } from './mensajes.mjs'

test('el mensaje de cobro detalla los servicios y el total, sin datos bancarios', () => {
  const lineas = [{ nombre: '3 × Repisa 80 cm', monto: 150000 }, { nombre: 'Retiro y orden', monto: 30000 }]
  const texto = mensajeCobro({ nombre: 'Carlos Belmar', fecha: '2026-10-20' }, lineas, { subtotal: 162000, iva: 30780, total: 192780 }, { pagado: 50000, saldo: 142780 })
  assert.match(texto, /^¡Hola Carlos! .*instalación del martes,? 20 de octubre/)
  assert.match(texto, /• 3 × Repisa 80 cm: \$150\.000\n• Retiro y orden: \$30\.000\n• Descuento: −\$18\.000/)
  assert.match(texto, /Neto \$162\.000 \+ IVA \$30\.780 = \$192\.780\nYa pagado: \$50\.000\n\*Total a pagar: \$142\.780\*/)
  assert.doesNotMatch(texto, /RUT|Cta\.|BCI|transferir|mercadopago/i)
})

test('el cobro muestra el recargo de sabado y las medidas de cada repisa', () => {
  const lineas = [
    { nombre: nombreRepisaCobro({ largo: 1.2, prof: 0.45, alto: 2, niveles: 5, unidades: 1, valor: 50000 }), monto: 50000 },
    { nombre: nombreRepisaCobro({ largo: 1.5, prof: 0.5, alto: 2.2, niveles: 3, colgador: true, unidades: 1, valor: 120000 }), monto: 120000 },
    { nombre: nombreRepisaCobro({ largo: 1, prof: 0.4, alto: 2, niveles: 5, unidades: 2, valor: 25000 }), monto: 50000 },
  ]
  const texto = mensajeCobro({ nombre: 'Loreto Soto', fecha: '2026-11-21' }, lineas, { subtotal: 231000, iva: 43890, total: 274890, recargo: 11000, recargoPct: 5 }, { pagado: 0, saldo: 274890 })
  assert.match(texto, /• Repisa 1,2 m de largo × 45 cm de fondo × 2 m de alto · 5 niveles: \$50\.000/)
  assert.match(texto, /• Repisa 1,5 m de largo × 50 cm de fondo × 2,2 m de alto · 3 niveles · con colgador: \$120\.000/)
  assert.match(texto, /• 2 × Repisas 1 m de largo × 40 cm de fondo × 2 m de alto · 5 niveles: \$50\.000/)
  assert.match(texto, /• Recargo instalación en sábado \(5%\): \$11\.000\n\nNeto \$231\.000/)
  assert.doesNotMatch(texto, /Descuento/)
})

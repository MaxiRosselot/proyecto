import test from 'node:test'
import assert from 'node:assert/strict'
import { leerCSV, visitaDesdeFila, visitasDesdeCalendly } from './importar-calendly.mjs'
import { horaLocalAUTC } from './horarios.mjs'
import { comunaAproximada } from './zonas.mjs'

const ENCABEZADO = 'Invitee Name,Invitee Email,Start Date & Time,Location,Canceled,Question 1,Response 1,Question 2,Response 2,Marked as No-Show,Invitee UUID'
const fila = (...c) => c.map(x => (/[,"\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x)).join(',')
const CSV = [ENCABEZADO,
  fila('Ana Soto', 'ana@example.cl', '2025-03-08 10:00', "'+56 9 1111 2222", 'false', 'Ingrese su dirección (calle, número, comuna y n° dpto o casa)', 'Grecia 1500, depto 302, Ñuñoa', '', '', 'No', 'u1'),
  fila('Pedro Pérez', 'pedro@example.cl', '2025-04-12 11:30', 'Su ubicación', 'false', 'Ingrese su dirección', 'Los Aromos 6858 viracura', 'Número de teléfono', '+56 9 3333 4444', 'No', 'u2'),
  fila('Luis No', 'luis@example.cl', '2025-05-01 09:00', "'+56 9 5555 6666", 'false', 'Ingrese su dirección', 'Calle Larga 12', '', '', 'Yes', 'u3'),
  fila('Futura Cliente', 'futura@example.cl', '2026-12-05 10:00', "'+56 9 7777 8888", 'false', 'Ingrese su dirección', 'Av. Apoquindo 3000, Las Condes', '', '', 'No', 'u4'),
].join('\r\n')

test('lee el CSV de Calendly (comillas, comas y saltos de linea)', () => {
  const filas = leerCSV('﻿' + CSV)
  assert.equal(filas.length, 4)
  assert.equal(filas[0]['Response 1'], 'Grecia 1500, depto 302, Ñuñoa')
  assert.deepEqual(leerCSV('a,b\n"x\ny","z ""q"""')[0], { a: 'x\ny', b: 'z "q"' })
})

test('arma las filas de la hoja Visitas: estado, telefono, comuna y sin repetir', () => {
  const cotizaciones = [{ cotNum: 1450, nombre: 'Otro Nombre', email: 'ANA@example.cl', telefono: '' }]
  const { nuevas, resumen } = visitasDesdeCalendly(leerCSV(CSV), { cotizaciones, existentes: new Set(['calendly-u3']), ahora: new Date('2026-10-26T12:00:00Z') })
  assert.deepEqual(resumen.porEstado, { por_revisar: 2, agendada: 1 })
  assert.equal(resumen.conCotizacion, 1)
  assert.equal(resumen.repetidas, 1)
  const [ana, pedro, futura] = nuevas
  assert.deepEqual(ana.slice(0, 8), ['calendly-u1', 'Ana Soto', '2025-03-08', '10:00', 'ana@example.cl', '+56 9 1111 2222', 'Grecia 1500, depto 302, Ñuñoa', 'por_revisar'])
  assert.match(ana[8], /Tiene cotización N° 1450/) // pista, sin cambiar el estado
  assert.deepEqual([ana[10], ana[11]], ['Calendly', 'Ñuñoa'])
  assert.deepEqual([pedro[5], pedro[7], pedro[11]], ['+56 9 3333 4444', 'por_revisar', 'Vitacura']) // telefono de la pregunta 2, "viracura"
  assert.equal(futura[7], 'agendada')
  // El no-show queda por revisar, con la nota.
  const otra = visitasDesdeCalendly(leerCSV(CSV), { ahora: new Date('2026-10-26T12:00:00Z') }).nuevas.find(v => v[0] === 'calendly-u3')
  assert.equal(otra[7], 'por_revisar')
  assert.match(otra[8], /No se presentó/)
})

test('una fila de la hoja vuelve como visita del panel', () => {
  const v = visitaDesdeFila(['calendly-u1', 'Ana Soto', '2025-03-08', '10:00', 'ana@example.cl', '+56 9 1111 2222', 'Grecia 1500, Ñuñoa', 'realizada', 'Importada', '', 'Calendly', 'Ñuñoa', '-33.45', '-70.6'], horaLocalAUTC)
  assert.equal(v.start, new Date('2025-03-08T10:00:00-03:00').toISOString())
  assert.deepEqual([v.status, v.origen, v.comuna, v.lat, v.lng], ['realizada', 'Calendly', 'Ñuñoa', -33.45, -70.6])
  assert.equal(visitaDesdeFila(['x', 'Sin fecha', 'dom 1 nov'], horaLocalAUTC), null)
  assert.equal(visitaDesdeFila(['x', 'Sin ubicar', '2025-03-08', '10:00', '', '', 'Calle 1', 'realizada', '', '', 'Calendly', '', '-', '-'], horaLocalAUTC).lat, undefined)
})

test('comuna con errores de tipeo', () => {
  assert.equal(comunaAproximada('Los Aromos 6858 viracura'), 'Vitacura')
  assert.equal(comunaAproximada('Santa Rosa 100, La Reyna'), 'La Reina')
  assert.equal(comunaAproximada('Moneda 900, stgo'), 'Santiago')
  assert.equal(comunaAproximada('Av Perú 600, Viña del Mar'), null)
  assert.equal(comunaAproximada('Calle Larga 12, depto 4'), null)
})

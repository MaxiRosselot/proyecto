// netlify/functions/generate-quote.mjs
// Porta la lógica de server.py: lee cotizacion.xlsx, rellena celdas, devuelve xlsx
import { readFileSync } from 'fs'
import { join } from 'path'
import JSZip from 'jszip'

// En Netlify Functions con esbuild, los included_files quedan en /var/task/
// junto al bundle. LAMBDA_TASK_ROOT apunta a esa carpeta.
const FUNCTIONS_DIR = (process.env.LAMBDA_TASK_ROOT || '/var/task') + '/netlify/functions'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '2003'

// ── Helpers XML (equivalente a las funciones Python) ──────────────────────────

function escapeXml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Usa indexOf + slice en lugar de RegExp para evitar problemas de escaping
// cuando esbuild compila ESM → CJS
function findCellBounds(xml, cellRef) {
  // Busca <c r="CELLREF" ...> o <c r="CELLREF" .../>
  const open1 = '<c r=' + '"' + cellRef + '"'
  let start = xml.indexOf(open1)
  if (start === -1) return null
  // Buscar el cierre de la etiqueta de apertura
  let gt = xml.indexOf('>', start)
  if (gt === -1) return null
  // ¿Self-closing?
  if (xml[gt - 1] === '/') {
    return { start, end: gt + 1, selfClose: true, attrs: xml.slice(start + open1.length, gt - 1) }
  }
  // Con contenido: buscar </c>
  let closeTag = xml.indexOf('</c>', gt)
  if (closeTag === -1) return null
  return { start, end: closeTag + 4, selfClose: false, attrs: xml.slice(start + open1.length, gt) }
}

function setCellInlineString(xml, cellRef, text) {
  const bounds = findCellBounds(xml, cellRef)
  if (!bounds) throw new Error('Cell ' + cellRef + ' not found (inline)')
  const attrs = bounds.attrs.replace(/\s+t="[^"]*"/g, '')
  const replacement = '<c r=' + '"' + cellRef + '"' + attrs + ' t="inlineStr"><is><t>' + escapeXml(text) + '</t></is></c>'
  return xml.slice(0, bounds.start) + replacement + xml.slice(bounds.end)
}

function setCellValue(xml, cellRef, value) {
  const bounds = findCellBounds(xml, cellRef)
  if (!bounds) throw new Error('Cell ' + cellRef + ' not found (value)')
  const replacement = '<c r=' + '"' + cellRef + '"' + bounds.attrs + '><v>' + value + '</v></c>'
  return xml.slice(0, bounds.start) + replacement + xml.slice(bounds.end)
}

function clearCellValue(xml, cellRef) {
  const bounds = findCellBounds(xml, cellRef)
  if (!bounds) return xml // si no existe, no hacer nada
  const replacement = '<c r=' + '"' + cellRef + '"' + bounds.attrs + '/>'
  return xml.slice(0, bounds.start) + replacement + xml.slice(bounds.end)
}

function num(obj, key) {
  try {
    const v = obj?.[key] ?? 0
    return parseFloat(v) || 0
  } catch { return 0 }
}

// ── Generación del xlsx ───────────────────────────────────────────────────────

async function generateXlsx(data) {
const baseBytes = readFileSync(join(FUNCTIONS_DIR, 'cotizacion.xlsx'))
  const zip = await JSZip.loadAsync(baseBytes)
  let sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string')

  // Número cotización
  sheetXml = setCellValue(sheetXml, 'Q4', parseInt(data.cot_num ?? 1420))

  // Datos cliente
  sheetXml = setCellInlineString(sheetXml, 'L9',  data.nombre    ?? '-')
  sheetXml = setCellInlineString(sheetXml, 'L10', data.direccion ?? '-')
  sheetXml = setCellInlineString(sheetXml, 'L11', data.rut       ?? '-')
  sheetXml = setCellInlineString(sheetXml, 'L12', data.telefono  ?? '-')
  sheetXml = setCellInlineString(sheetXml, 'L13', data.email     ?? '-')

  // Repisas: filas 16-19
  let repisasList = data.repisas || []
  if (!repisasList.length) {
    if (data.repisa1) repisasList.push(data.repisa1)
    if (data.repisa2) repisasList.push(data.repisa2)
  }

  const reprisaRows = [16, 17, 18, 19]
  const reprisaCols = ['K', 'L', 'M', 'N', 'O', 'P']
  const reprisaKeys = ['largo', 'prof', 'alto', 'niveles', 'unidades', 'valor']

  for (let i = 0; i < reprisaRows.length; i++) {
    const rowNum = reprisaRows[i]
    if (i < repisasList.length) {
      const r = repisasList[i]
      for (let j = 0; j < reprisaCols.length; j++) {
        sheetXml = setCellValue(sheetXml, `${reprisaCols[j]}${rowNum}`, num(r, reprisaKeys[j]))
      }
      sheetXml = setCellValue(sheetXml, `Q${rowNum}`, num(r, 'unidades') * num(r, 'valor'))
    } else {
      for (const col of [...reprisaCols, 'Q']) {
        sheetXml = clearCellValue(sheetXml, `${col}${rowNum}`)
      }
    }
  }

  // Adicionales: filas 21-24
  const q1 = parseInt(data.qty_retiro_orden  ?? 0)
  const q2 = parseInt(data.qty_retiro_basura ?? 0)
  const q3 = parseInt(data.qty_cajas        ?? 0)
  const q4 = parseInt(data.qty_bici         ?? 0)

  const p1 = parseInt(data.precio_retiro_orden  ?? 40000)
  const p2 = parseInt(data.precio_retiro_basura ?? 30000)
  const p3 = parseInt(data.precio_cajas         ?? 15000)
  const p4 = parseInt(data.precio_bici          ?? 20000)

  sheetXml = setCellValue(sheetXml, 'O21', q1); sheetXml = setCellValue(sheetXml, 'P21', p1); sheetXml = setCellValue(sheetXml, 'Q21', q1 * p1)
  sheetXml = setCellValue(sheetXml, 'O22', q2); sheetXml = setCellValue(sheetXml, 'P22', p2); sheetXml = setCellValue(sheetXml, 'Q22', q2 * p2)
  sheetXml = setCellValue(sheetXml, 'O23', q3); sheetXml = setCellValue(sheetXml, 'P23', p3); sheetXml = setCellValue(sheetXml, 'Q23', q3 * p3)
  sheetXml = setCellValue(sheetXml, 'O24', q4); sheetXml = setCellValue(sheetXml, 'P24', p4); sheetXml = setCellValue(sheetXml, 'Q24', q4 * p4)

  // Totales
  const totRepisas = repisasList.slice(0, 4).reduce((s, r) => s + num(r, 'unidades') * num(r, 'valor'), 0)
  const totServicios = q1*p1 + q2*p2 + q3*p3 + q4*p4
  const subtotal = totRepisas + totServicios
  const iva = Math.round(subtotal * 0.19)
  const total = subtotal + iva

  sheetXml = setCellValue(sheetXml, 'P26', subtotal)
  sheetXml = setCellValue(sheetXml, 'P27', iva)
  sheetXml = setCellValue(sheetXml, 'P28', total)

  // Reescribir sheet1.xml en el zip
  zip.file('xl/worksheets/sheet1.xml', sheetXml)
  const outBytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  return { bytes: outBytes, subtotal, iva, total }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }

  const pwd = event.headers['x-admin-password']
  if (pwd !== ADMIN_PASSWORD) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'No autorizado' }) }
  }

  try {
    const data = JSON.parse(event.body || '{}')
    const { bytes, subtotal, iva, total } = await generateXlsx(data)

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="cotizacion.xlsx"`,
        'x-subtotal': String(subtotal),
        'x-iva': String(iva),
        'x-total': String(total),
      },
      body: bytes.toString('base64'),
      isBase64Encoded: true,
    }
  } catch (err) {
    console.error('generate-quote error:', err)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: String(err) }),
    }
  }
}

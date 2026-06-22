// netlify/functions/read-pdf-quote.mjs
// Recibe un PDF en base64, extrae texto de la página 1 y parsea los datos de cotización Don Maxi

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '2003'

// Helpers de parseo
function cleanNum(str) {
  if (!str) return 0
  // "$ 90.000" o "90,000" o "90.000" → 90000
  return parseFloat(str.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
}

function after(text, label) {
  // Extrae lo que viene después de un label en la misma línea o la siguiente
  const re = new RegExp(label + '[:\\s]*([^\\n]+)', 'i')
  const m = text.match(re)
  return m ? m[1].trim() : ''
}

function parsePdfText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // ── Cliente ──────────────────────────────────────────────────────────────
  const nombre    = after(text, 'NOMBRE')    || ''
  const direccion = after(text, 'DIRECCI[ÓO]N') || after(text, 'DIRECCION') || ''
  const telefono  = after(text, 'TEL[ÉE]FONO')  || after(text, 'TELEFONO')  || ''
  const email     = after(text, 'E-MAIL')    || after(text, 'EMAIL') || ''

  // N° cotización
  const cotMatch = text.match(/COTIZACI[ÓO]N\s*N[°º]?\s*[:\s]*(\d+)/i)
  const cotNum   = cotMatch ? parseInt(cotMatch[1]) : null

  // ── Repisas ──────────────────────────────────────────────────────────────
  // Buscar el bloque entre REPISAS y ADICIONALES
  const repisasStart = text.indexOf('LARGO')
  const adStart      = text.indexOf('ADICIONALES')
  const repisasBlock = repisasStart > -1 && adStart > repisasStart
    ? text.slice(repisasStart, adStart)
    : ''

  const repisas = []
  if (repisasBlock) {
    // Cada línea de repisa tiene: largo prof alto niveles unidades valor total
    // Ejemplo: "1,63 0,48 2 4 1 $ 90.000 $ 90.000"
    // o        "2.06 0.48 2 4 1 $ 140,000 $ 140,000"
    const numPat = /[\d]+[.,][\d]+|[\d]+/g
    const repisaLines = repisasBlock.split('\n').map(l => l.trim()).filter(l => {
      // La línea debe empezar con un número decimal (largo)
      return /^\d+[.,]\d+/.test(l)
    })

    for (const line of repisaLines.slice(0, 4)) {
      const nums = line.match(numPat)
      if (!nums || nums.length < 6) continue
      const parseN = s => parseFloat(s.replace(',', '.')) || 0
      const largo    = parseN(nums[0])
      const prof     = parseN(nums[1])
      const alto     = parseN(nums[2])
      const niveles  = parseN(nums[3])
      const unidades = parseN(nums[4])
      // valor: puede ser "90.000" con punto de miles, buscar el último número grande
      // nums[5] en adelante son valor y total — tomamos el penúltimo
      const allBig = nums.slice(5).map(n => cleanNum(n)).filter(n => n >= 1000)
      const valor  = allBig.length >= 1 ? allBig[0] : 0

      if (largo > 0 && unidades > 0) {
        repisas.push({ l: largo, p: prof, a: alto, n: niveles, u: unidades, v: valor })
      }
    }
  }

  // ── Adicionales ──────────────────────────────────────────────────────────
  // Buscar el bloque entre ADICIONALES y SUBTOTAL (no TOTAL, para evitar match en SUBTOTAL)
  const subStart  = text.search(/SUBTOTAL/i)
  const adBlock   = adStart > -1 && subStart > adStart
    ? text.slice(adStart, subStart)
    : (adStart > -1 ? text.slice(adStart, adStart + 400) : '')

  const adicionales = {
    qty_retiro_orden: 0,  precio_retiro_orden: 40000,
    qty_retiro_basura: 0, precio_retiro_basura: 30000,
    qty_cajas: 0,         precio_cajas: 15000,
    qty_bici: 0,          precio_bici: 20000,
  }

  if (adBlock) {
    // Cada línea tiene formato: "NOMBRE DEL SERVICIO  QTY  $ PRECIO  $ TOTAL"
    // La qty es un número entero pequeño (0-99) seguido de $ o espacios
    // Buscamos: número entero solo (la cantidad) luego precios con $
    const adLines = adBlock.split('\n').map(l => l.trim()).filter(Boolean)

    for (const line of adLines) {
      // Extraer qty: puede aparecer con $ en la misma línea o sin $
      // Patrón 1: número antes del primer $ → "SERVICIO  1  $ 40.000  $ 40.000"
      // Patrón 2: solo números separados por espacios → "SERVICIO  1  40.000  40.000"
      const precioNums = [...line.matchAll(/\$\s*([\d.,]+)/g)]
      let qty = 0
      let precio = 0

      if (precioNums.length >= 1) {
        // Hay símbolo $: buscar número entero antes del primer $
        const qtyMatch = line.match(/\b(\d{1,3})\s*\$/)
        qty    = qtyMatch ? parseInt(qtyMatch[1]) : 0
        precio = cleanNum(precioNums[0][1])
      } else {
        // Sin $: extraer todos los números y asumir [qty, precio, total] al final
        const allNums = line.match(/\b\d+[.,]?\d*\b/g) || []
        // Últimos 1-3 números son qty y precios
        if (allNums.length >= 2) {
          qty    = parseInt(allNums[allNums.length - 2]) || 0
          precio = cleanNum(allNums[allNums.length - 1])
        } else if (allNums.length === 1) {
          qty = parseInt(allNums[0]) || 0
        }
      }

      if (/RETIRO.*ORDEN|ORDEN.*ART/i.test(line)) {
        adicionales.qty_retiro_orden   = qty
        if (precio >= 1000) adicionales.precio_retiro_orden = precio
      } else if (/RETIRO.*BASURA|BASURA/i.test(line)) {
        adicionales.qty_retiro_basura  = qty
        if (precio >= 1000) adicionales.precio_retiro_basura = precio
      } else if (/CAJAS/i.test(line)) {
        adicionales.qty_cajas          = qty
        if (precio >= 1000) adicionales.precio_cajas = precio
      } else if (/BICI|SKI/i.test(line)) {
        adicionales.qty_bici           = qty
        if (precio >= 1000) adicionales.precio_bici = precio
      }
    }
  }

  // ── Totales ──────────────────────────────────────────────────────────────
  const subtotalMatch = text.match(/SUBTOTAL\s*NETO[^\d]*([\d.,]+)/i)
  const ivaMatch      = text.match(/\bIVA\b[^\d]*([\d.,]+)/i)
  const totalMatch    = text.match(/\bTOTAL\b[^\d]*([\d.,]+)/i)

  const subtotal = subtotalMatch ? cleanNum(subtotalMatch[1]) : 0
  const iva      = ivaMatch      ? cleanNum(ivaMatch[1])      : 0
  const total    = totalMatch    ? cleanNum(totalMatch[1])    : 0

  return {
    cotNum,
    nombre:    nombre.replace(/^-$/, '').trim(),
    direccion: direccion.replace(/^-$/, '').trim(),
    telefono:  telefono.replace(/^-$/, '').trim(),
    email:     email.replace(/^-$/, '').trim(),
    repisas,
    adicionales,
    subtotal,
    iva,
    total,
  }
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  if (event.headers['x-admin-password'] !== ADMIN_PASSWORD)
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'No autorizado' }) }

  try {
    const { pdfBase64 } = JSON.parse(event.body || '{}')
    if (!pdfBase64) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Falta pdfBase64' }) }

    const pdfBuffer = Buffer.from(pdfBase64, 'base64')

    // pdf-parse es CJS — importar dinámicamente
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default

    // Solo página 1
    const data = await pdfParse(pdfBuffer, {
      max: 1,
    })

    const parsed = parsePdfText(data.text)

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, ...parsed, rawText: data.text }),
    }
  } catch (err) {
    console.error('read-pdf-quote error:', err)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: String(err) }),
    }
  }
}

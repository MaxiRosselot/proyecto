// Dentro del panel, WhatsApp Web es "de otro sitio" y Chrome bota sus cookies (vienen marcadas
// SameSite=Lax): sin ellas no termina de iniciar sesion. Aqui se copian las cookies que WhatsApp
// manda a ese marco como cookies particionadas (solo valen dentro del panel), que Chrome si acepta.
// No toca las cookies de WhatsApp abierto en su propia pestaña.
const PANELES = ['https://repisasdonmaxi.cl', 'http://localhost', 'http://127.0.0.1']

function leerCookie(linea) {
  const [par, ...atributos] = linea.split(';').map(s => s.trim())
  const i = par.indexOf('=')
  if (i < 1) return null
  const c = { name: par.slice(0, i).trim(), value: par.slice(i + 1).trim(), path: '/', httpOnly: false }
  for (const a of atributos) {
    const [k, ...v] = a.split('='), valor = v.join('=').trim(), clave = k.trim().toLowerCase()
    if (clave === 'domain') c.domain = valor
    else if (clave === 'path') c.path = valor || '/'
    else if (clave === 'httponly') c.httpOnly = true
    else if (clave === 'max-age') c.maxAge = Number(valor)
    else if (clave === 'expires') c.expires = Date.parse(valor)
  }
  return c
}

function copiar(linea, url) {
  const c = leerCookie(linea)
  if (!c) return
  const vence = Number.isFinite(c.maxAge) ? Date.now() / 1000 + c.maxAge : Number.isFinite(c.expires) ? c.expires / 1000 : undefined
  const base = { url: 'https://' + new URL(url).hostname + c.path, name: c.name }
  for (const sitio of PANELES) {
    const partitionKey = { topLevelSite: sitio }
    if (vence !== undefined && vence <= Date.now() / 1000) { chrome.cookies.remove({ ...base, partitionKey }).catch(() => {}); continue }
    chrome.cookies.set({
      ...base, value: c.value, path: c.path, secure: true, httpOnly: c.httpOnly, sameSite: 'no_restriction',
      ...(c.domain ? { domain: c.domain } : {}), ...(vence !== undefined ? { expirationDate: vence } : {}), partitionKey,
    }).catch(() => {})
  }
}

chrome.webRequest.onHeadersReceived.addListener(d => {
  if (d.frameId === 0) return // WhatsApp en su propia pestaña: no se toca
  for (const h of d.responseHeaders || []) {
    if (h.name.toLowerCase() === 'set-cookie' && h.value) h.value.split('\n').forEach(l => copiar(l, d.url))
  }
}, { urls: ['https://web.whatsapp.com/*', 'https://*.whatsapp.com/*'] }, ['responseHeaders', 'extraHeaders'])

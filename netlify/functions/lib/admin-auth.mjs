// Sesion del panel admin.
//
// La contraseña vive solo en el servidor (ADMIN_PASSWORD). El navegador la manda una vez a
// admin-login y recibe un token firmado que vence; las demas funciones solo aceptan ese token.
// La firma usa ADMIN_SESSION_SECRET mezclado con la contraseña: cambiar cualquiera de los dos
// cierra todas las sesiones abiertas.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_HOURS = 12
export const MIN_PASSWORD_LENGTH = 12
export const MIN_SECRET_LENGTH = 32

// Las funciones las llama el mismo sitio, pero se deja el CORS abierto como estaba: el token
// no viaja en cookies, asi que otro sitio no puede usarlo sin tenerlo.
export const AUTH_HEADERS = 'Content-Type, Authorization'

// Sin configuracion valida no entra nadie: nunca hay una contraseña por defecto.
export function authConfigError(env = process.env) {
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < MIN_PASSWORD_LENGTH)
    return `ADMIN_PASSWORD debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`
  if (!env.ADMIN_SESSION_SECRET || env.ADMIN_SESSION_SECRET.length < MIN_SECRET_LENGTH)
    return `ADMIN_SESSION_SECRET debe tener al menos ${MIN_SECRET_LENGTH} caracteres`
  return null
}

function signingKey(env) {
  return createHmac('sha256', env.ADMIN_SESSION_SECRET).update(env.ADMIN_PASSWORD).digest()
}

function sign(payload, env) {
  return createHmac('sha256', signingKey(env)).update(payload).digest('base64url')
}

// Compara resumenes de igual largo para no filtrar por tiempo cuantos caracteres coinciden.
function sameText(a, b) {
  const ha = createHash('sha256').update(String(a)).digest()
  const hb = createHash('sha256').update(String(b)).digest()
  return timingSafeEqual(ha, hb)
}

export function passwordMatches(candidate, env = process.env) {
  if (authConfigError(env) || typeof candidate !== 'string') return false
  return sameText(candidate, env.ADMIN_PASSWORD)
}

export function issueSessionToken(env = process.env, now = Date.now()) {
  const expiresAt = now + SESSION_HOURS * 3600 * 1000
  const payload = Buffer.from(JSON.stringify({ exp: expiresAt })).toString('base64url')
  return { token: `${payload}.${sign(payload, env)}`, expiresAt }
}

export function verifySessionToken(token, env = process.env, now = Date.now()) {
  if (authConfigError(env) || typeof token !== 'string') return false
  const [payload, signature, ...rest] = token.split('.')
  if (!payload || !signature || rest.length) return false
  if (!sameText(signature, sign(payload, env))) return false
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return Number.isFinite(exp) && exp > now
  } catch { return false }
}

function bearer(event) {
  const headers = event?.headers || {}
  const value = headers.authorization || headers.Authorization || ''
  return value.startsWith('Bearer ') ? value.slice(7).trim() : ''
}

// Devuelve null si la llamada trae una sesion valida; si no, la respuesta que hay que devolver.
export function requireAdmin(event, corsHeaders = {}, env = process.env) {
  const configError = authConfigError(env)
  if (configError) {
    console.error('Auth admin sin configurar:', configError)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Acceso admin sin configurar en el servidor' }) }
  }
  if (!verifySessionToken(bearer(event), env))
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'No autorizado' }) }
  return null
}

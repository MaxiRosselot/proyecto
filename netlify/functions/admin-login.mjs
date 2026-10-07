// netlify/functions/admin-login.mjs
// Cambia la contraseña del panel por un token de sesion que vence en SESSION_HOURS.
import { AUTH_HEADERS, authConfigError, issueSessionToken, passwordMatches } from './lib/admin-auth.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': AUTH_HEADERS,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Frena los intentos seguidos. No reemplaza una contraseña larga: con 12+ caracteres
// aleatorios probar por fuerza bruta deja de ser viable aunque se paralelice.
const FAILED_LOGIN_DELAY_MS = 800

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Método no permitido' }) }

  const configError = authConfigError()
  if (configError) {
    console.error('admin-login sin configurar:', configError)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Acceso admin sin configurar en el servidor' }) }
  }

  let password = ''
  try { password = JSON.parse(event.body || '{}').password } catch { /* cae al rechazo */ }

  if (!passwordMatches(password)) {
    await new Promise(resolve => setTimeout(resolve, FAILED_LOGIN_DELAY_MS))
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Contraseña incorrecta' }) }
  }

  const { token, expiresAt } = issueSessionToken()
  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, token, expiresAt }) }
}

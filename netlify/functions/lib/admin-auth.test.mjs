import test from 'node:test'
import assert from 'node:assert/strict'
import { authConfigError, issueSessionToken, passwordMatches, requireAdmin, verifySessionToken } from './admin-auth.mjs'
import { handler as login } from '../admin-login.mjs'

const env = { ADMIN_PASSWORD: 'una-clave-larga-de-prueba', ADMIN_SESSION_SECRET: 'x'.repeat(40) }
const conToken = token => ({ headers: { authorization: `Bearer ${token}` } })

test('sin contraseña larga ni secreto no entra nadie', () => {
  assert.match(authConfigError({}), /ADMIN_PASSWORD/)
  assert.match(authConfigError({ ...env, ADMIN_PASSWORD: '2003' }), /ADMIN_PASSWORD/)
  assert.match(authConfigError({ ...env, ADMIN_SESSION_SECRET: 'corto' }), /ADMIN_SESSION_SECRET/)
  assert.equal(passwordMatches('2003', { ADMIN_PASSWORD: '2003' }), false)
  assert.equal(requireAdmin(conToken('lo-que-sea'), {}, {}).statusCode, 500)
})

test('la contraseña correcta da un token que vence', () => {
  assert.equal(passwordMatches(env.ADMIN_PASSWORD, env), true)
  assert.equal(passwordMatches('otra', env), false)
  const ahora = Date.now()
  const { token, expiresAt } = issueSessionToken(env, ahora)
  assert.equal(verifySessionToken(token, env, ahora), true)
  assert.equal(verifySessionToken(token, env, expiresAt + 1), false)
  assert.equal(requireAdmin(conToken(token), {}, env), null)
})

test('un token alterado, ajeno o de una contraseña anterior no sirve', () => {
  const { token } = issueSessionToken(env)
  const [payload, firma] = token.split('.')
  const lejos = Buffer.from(JSON.stringify({ exp: Date.now() + 1e12 })).toString('base64url')
  assert.equal(verifySessionToken(`${lejos}.${firma}`, env), false)
  assert.equal(verifySessionToken(`${payload}.${firma}x`, env), false)
  assert.equal(verifySessionToken(token, { ...env, ADMIN_PASSWORD: 'la-clave-nueva-larga' }), false)
  assert.equal(verifySessionToken(token, { ...env, ADMIN_SESSION_SECRET: 'y'.repeat(40) }), false)
  assert.equal(requireAdmin({ headers: {} }, {}, env).statusCode, 401)
  assert.equal(requireAdmin({ headers: { 'x-admin-password': env.ADMIN_PASSWORD } }, {}, env).statusCode, 401)
})

test('admin-login entrega el token solo con la contraseña correcta', async () => {
  const anterior = { ...process.env }
  Object.assign(process.env, env)
  try {
    const mal = await login({ httpMethod: 'POST', body: JSON.stringify({ password: '2003' }) })
    assert.equal(mal.statusCode, 401)
    const bien = await login({ httpMethod: 'POST', body: JSON.stringify({ password: env.ADMIN_PASSWORD }) })
    assert.equal(bien.statusCode, 200)
    assert.equal(verifySessionToken(JSON.parse(bien.body).token, env), true)
    assert.equal((await login({ httpMethod: 'GET' })).statusCode, 405)
  } finally {
    for (const k of Object.keys(env)) if (anterior[k] === undefined) delete process.env[k]; else process.env[k] = anterior[k]
  }
})

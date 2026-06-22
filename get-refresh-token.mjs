import { createServer } from 'http'
import { google } from 'googleapis'
import { exec } from 'child_process'

const CLIENT_ID     = process.argv[2]
const CLIENT_SECRET = process.argv[3]
const REDIRECT_URI  = 'http://localhost:3333/callback'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/spreadsheets',
]

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
})

console.log('\n🔑 Abriendo navegador para autorizar...')
console.log('Si no se abre solo, copia esta URL:\n')
console.log(authUrl + '\n')

// Intentar abrir el navegador automáticamente
exec(`cmd.exe /c start "" "${authUrl}"`, () => {})

// Servidor temporal para capturar el callback
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3333')
  const code = url.searchParams.get('code')
  if (!code) { res.end('No code'); return }

  try {
    const { tokens } = await oAuth2Client.getToken(code)
    res.end('<h2>✅ Listo! Puedes cerrar esta ventana.</h2>')
    console.log('\n✅ REFRESH TOKEN OBTENIDO:\n')
    console.log(tokens.refresh_token)
    console.log('\nCopia este valor y ponlo en Netlify como GOOGLE_REFRESH_TOKEN\n')
    server.close()
  } catch (err) {
    res.end('Error: ' + err.message)
    console.error(err)
    server.close()
  }
})

server.listen(3333, () => {
  console.log('Esperando autorización en http://localhost:3333 ...\n')
})

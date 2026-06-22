#!/usr/bin/env python3
import sys, urllib.parse, urllib.request, json
from http.server import HTTPServer, BaseHTTPRequestHandler

CLIENT_ID     = sys.argv[1]
CLIENT_SECRET = sys.argv[2]
REDIRECT_URI  = 'http://localhost:3333/callback'
SCOPES        = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/spreadsheets'

auth_url = (
    'https://accounts.google.com/o/oauth2/v2/auth?'
    + urllib.parse.urlencode({
        'client_id':     CLIENT_ID,
        'redirect_uri':  REDIRECT_URI,
        'response_type': 'code',
        'scope':         SCOPES,
        'access_type':   'offline',
        'prompt':        'consent',
    })
)

print('\n=== COPIA ESTA URL EN TU NAVEGADOR ===\n')
print(auth_url)
print('\n======================================\n')
print('Esperando callback en http://localhost:3333 ...\n')

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        code   = params.get('code', [None])[0]
        if not code:
            self.send_response(400); self.end_headers()
            self.wfile.write(b'No code'); return

        # Intercambiar code por tokens
        data = urllib.parse.urlencode({
            'code':          code,
            'client_id':     CLIENT_ID,
            'client_secret': CLIENT_SECRET,
            'redirect_uri':  REDIRECT_URI,
            'grant_type':    'authorization_code',
        }).encode()
        req  = urllib.request.Request('https://oauth2.googleapis.com/token', data=data)
        resp = urllib.request.urlopen(req)
        tokens = json.loads(resp.read())

        self.send_response(200); self.end_headers()
        self.wfile.write(b'<h2>Listo! Cierra esta ventana.</h2>')

        print('\n=== REFRESH TOKEN ===\n')
        print(tokens.get('refresh_token', 'ERROR: no vino refresh_token'))
        print('\n====================\n')
        raise SystemExit(0)

HTTPServer(('localhost', 3333), Handler).serve_forever()

# Agendador — Repisas Don Maxi

Agenda visitas en los días y horarios que se habilitan desde el panel (**Admin → Horarios**), con inicios cada **30 min**.  
La visita dura **15 min**. Se verifica disponibilidad real con Google Calendar.

## Requisitos
- Node 18+
- Cuenta Netlify
- Credenciales Google Calendar (OAuth2 con refresh token)

## Configuración
1. `npm i`
2. Configura variables de entorno en Netlify:
   - GOOGLE_CLIENT_ID
   - GOOGLE_CLIENT_SECRET
   - GOOGLE_REFRESH_TOKEN
   - CALENDAR_ID
   - DEFAULT_EVENT_DURATION_MIN=15
   - NOTIFY_EMAIL=repisas@donmaxi.cl
   - GOOGLE_SHEET_ID (hoja con la pestaña `Cotizaciones`) y PRECIOS_SHEET_ID
   - ADMIN_PASSWORD: contraseña del panel `/admin`, **mínimo 12 caracteres**. Sin ella nadie entra.
   - ADMIN_SESSION_SECRET: texto aleatorio de **32 caracteres o más** para firmar las sesiones
     (por ejemplo `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
     Cambiar esta variable o la contraseña cierra todas las sesiones abiertas.
   - VITE_REPISAS_3D_URL: dirección del configurador 3D (Vercel).
3. Sube `logo.png` y `og-cover.png` a `/public`.

## Horarios de visita

- En **Admin → Horarios** se define:
  - el **horario semanal**, que se repite cada semana (por ejemplo, domingo de 10:00 a 14:00);
  - las **fechas especiales**: abrir un sábado, cambiar el horario de un domingo o cerrar un día;
  - cuántas **semanas** hacia adelante ve el cliente (1 a 12).
- Se guarda en la pestaña **Horarios** de la planilla `GOOGLE_SHEET_ID`. La pestaña se crea sola la primera vez que se guarda.
- Mientras no exista la pestaña, se usa lo que estaba fijo antes: domingos de 08:00 a 20:00 (último inicio 19:30) y 4 semanas.
- La página pública muestra solo los días con horarios. El día de hoy ofrece solo horas que parten en una hora o más.
- `get-availability` y `create_event` validan cada hora contra el horario: una reserva fuera de él se rechaza aunque se arme a mano.
- Las visitas ya agendadas no se borran al cambiar el horario.
- Lógica y pruebas: `netlify/functions/lib/horarios.mjs`. Prueba E2E local: `node scripts/local-dev/verify-horarios.mjs`.

## Panel admin y cotizaciones

- La contraseña solo vive en el servidor. `admin-login` la valida y entrega un token que vence
  en 12 horas; las demás funciones rechazan cualquier llamada sin ese token.
- El número de cotización lo asigna el servidor (el mayor de la hoja + 1, partiendo en 1421).
  Una cotización existente nunca se sobrescribe. Si dos personas generan a la vez, la segunda
  recibe el siguiente número libre y el PDF se rehace con ese número.
- Cada cotización guarda su proyecto 3D en la columna **Q (Proyecto 3D)** de `Cotizaciones`.
  El encabezado se agrega solo la primera vez. Si el proyecto no cabe en una celda (50.000
  caracteres), se guarda comprimido. Después de escribir, la fila se relee y se verifica.
- En **Cotizaciones**, *Abrir en cotizador* recupera la cotización con su modelo. Al volver a
  generarla se actualiza la misma, sin cambiar su número, su estado ni su fecha de creación.
- La lista se ordena por fecha de creación, con las más nuevas arriba.
- Lógica y pruebas: `netlify/functions/lib/cotizaciones.mjs` y `lib/admin-auth.mjs`.
  Prueba E2E local: `node scripts/local-dev/verify-cotizaciones.mjs`.

## Desarrollo

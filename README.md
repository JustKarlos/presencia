# Ranking de Presencia para Kick

Ranking de asistencia para un canal de [Kick](https://kick.com). Los espectadores escriben `!presente` en el chat (una vez por hora, solo con el stream en vivo) y suman puntos y rachas diarias. El ranking se muestra en una página estática con actualización en tiempo real.

- **Frontend:** un solo `index.html` (Tailwind por CDN + `supabase-js`). Se aloja gratis en GitHub Pages o Vercel.
- **Base de datos:** Supabase (Postgres) con Row Level Security.
- **Chat:** webhooks oficiales de Kick, recibidos por una Edge Function de Supabase. No hace falta ningún servidor propio.

```
Chat de Kick → webhook de Kick → Edge Function (kick-webhook) → register_presente() → users
                                                                        ↑
                                         index.html (estático) lee el ranking en vivo
```

## Estructura del repositorio

```
.
├── index.html                           # página del ranking
├── schema.sql                           # tablas, RLS y función register_presente()
├── supabase/
│   └── functions/
│       └── kick-webhook/
│           └── index.ts                 # receptor de webhooks de Kick
├── .gitignore
└── README.md
```

> El archivo de la función debe estar en `supabase/functions/kick-webhook/index.ts` si vas a desplegar con la CLI de Supabase.

## Funcionamiento

- **Puntos:** cada `!presente` válido suma +1 a `total_checkins`.
- **Cooldown:** 1 hora entre check-ins por usuario. Se verifica en el servidor, dentro de una transacción con bloqueo de fila.
- **Avatar:** se toma de la foto de perfil que Kick envía en cada mensaje; si falta o no carga, se muestran las iniciales.
- **Racha:** días consecutivos con al menos un check-in (zona horaria `America/Argentina/Buenos_Aires`, editable en `schema.sql`).
- **Solo en directo:** si el canal está offline, el mensaje se ignora y no consume el cooldown.
- **Seguridad:** el navegador solo puede **leer**. La función `register_presente()` solo la puede ejecutar la Edge Function (con la service key), por lo que nadie puede sumarse puntos desde la consola del navegador.

## Instalación

### 1. Supabase

1. Creá un proyecto gratis en [supabase.com](https://supabase.com).
2. En **SQL Editor**, pegá y ejecutá todo `schema.sql`.
3. En **Project Settings → API**, copiá:
   - **Project URL**
   - **anon public key** (es pública y está pensada para ir en el frontend)

### 2. Aplicación en Kick

1. Entrá a [kick.com/settings/developer](https://kick.com/settings/developer) (requiere 2FA) y creá una app.
2. Completá:
   - **Redirect URI:** `https://TU-PROYECTO.supabase.co/functions/v1/kick-webhook/auth/callback`
   - **Webhook URL:** `https://TU-PROYECTO.supabase.co/functions/v1/kick-webhook` (y activá los webhooks)
   - **Scopes:** `user:read`, `channel:read`, `events:subscribe`
3. Copiá el **Client ID** y el **Client Secret**.

### 3. Edge Function

**Opción A: panel de Supabase (sin instalar nada)**

1. Edge Functions → *Create function* → nombre exacto: `kick-webhook`.
2. Pegá el contenido de `supabase/functions/kick-webhook/index.ts`.
3. **Desactivá "Verify JWT"** (Kick no envía un JWT de Supabase).
4. Desplegá.

**Opción B: CLI**

```bash
npm i -g supabase
supabase login
supabase link --project-ref TU-PROJECT-REF
supabase functions deploy kick-webhook --no-verify-jwt
```

### 4. Secrets de la función

En Edge Functions → **Secrets** (o con `supabase secrets set NOMBRE=valor`):

| Nombre | Valor | Obligatorio |
|---|---|---|
| `KICK_CLIENT_ID` | Client ID de tu app de Kick | sí |
| `KICK_CLIENT_SECRET` | Client Secret de tu app de Kick | sí |
| `BROADCASTER_SLUG` | Tu canal, por ejemplo `micanal` | sí |
| `SETUP_KEY` | Una clave larga inventada por vos (solo para el paso 5) | sí |
| `REQUIRE_LIVE` | `false` para contar también offline (solo pruebas) | no |
| `KICK_PUBLIC_KEY` | Clave pública PEM de Kick, si la descarga automática falla | no |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya están disponibles dentro de la función. No hace falta cargarlas.

### 5. Suscribirse a los eventos del chat (una sola vez)

Abrí en el navegador:

```
https://TU-PROYECTO.supabase.co/functions/v1/kick-webhook/auth/start?key=TU_SETUP_KEY
```

Iniciá sesión con la cuenta del streamer y aceptá los permisos. Si todo sale bien, verás `Subscription response 200`.

### 6. Configurar el frontend

Editá el bloque `CONFIG` al inicio de `index.html`:

```js
const CONFIG = {
  SUPABASE_URL:      "https://TU-PROYECTO.supabase.co",
  SUPABASE_ANON_KEY: "tu-anon-public-key",
  CHANNEL_NAME:      "micanal",
  LEADERBOARD_SIZE:  50,
};
```


## Solución de problemas

| Síntoma | Causa probable |
|---|---|
| `Rejected: invalid signature` en los logs | El algoritmo o formato de firma no coincide, o la clave pública no se pudo obtener. Probá cargar `KICK_PUBLIC_KEY` a mano. |
| `offline, ignored` | El chequeo de directo dice que el canal está offline. Para probar usá `REQUIRE_LIVE=false`. |
| `live check failed` | La API de Kick respondió con error. Revisá que la app tenga el scope `channel:read` y las credenciales sean correctas. |
| El paso 5 devuelve un error de cuenta | Mostrará los scopes y las respuestas de Kick. Iniciá sesión con la cuenta del streamer y revisá los scopes de la app. |
| El ranking no se actualiza solo | Verificá que `schema.sql` se ejecutó completo (incluye `alter publication supabase_realtime ...`). Igual hay refresco automático cada 60 s. |
| No llegan webhooks | Revisá que los webhooks estén activados en la app de Kick y que la URL sea exacta. Kick desuscribe la app tras fallos repetidos: repetí el paso 5. |

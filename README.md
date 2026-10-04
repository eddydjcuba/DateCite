# DateCite

MVP de app de citas romanticas seria para Latam con:

- `apps/api`: Express + TypeScript + SQLite + JWT
- `apps/web`: landing de lanzamiento + panel admin ligero
- `apps/mobile`: app Expo con onboarding, descubrir, matches, mensajes y perfil

## Como levantarlo hoy

1. Instala dependencias:

```bash
npm install
```

2. Prepara las URLs LAN para web y mobile:

```bash
npm run setup:lan
```

Este paso ahora tambien genera `apps/api/.env.local` con:

- `JWT_SECRET` aleatorio estable
- `ADMIN_TOKEN` aleatorio estable
- `PUBLIC_API_URL` apuntando a tu IP LAN
- `UPLOADS_PATH` para fotos reales en disco
- `CORS_ORIGIN` listo para `localhost` y tu IP LAN

3. Arranca la API:

```bash
npm run dev:api
```

4. Arranca la web:

```bash
npm run dev:web
```

La web de DateCite usa `5180` por defecto para evitar conflicto con otros dev servers en `5173`.

5. Arranca la app movil:

```bash
npm run dev:mobile
```

## Variables utiles

### API

Archivo de ejemplo: [apps/api/.env.example](/G:/datecite/apps/api/.env.example)

Archivo real para pruebas LAN: `apps/api/.env.local`

- `HOST=0.0.0.0`
- `PORT=4000`
- `JWT_SECRET=change-me`
- `ADMIN_TOKEN=change-me`
- `SQLITE_PATH=./data/datecite.db`
- `UPLOADS_PATH=./data/uploads`
- `PUBLIC_API_URL=http://localhost:4000`
- `CORS_ORIGIN=http://localhost:5180,http://127.0.0.1:5180`

### Web

Archivo de ejemplo: [apps/web/.env.example](/G:/datecite/apps/web/.env.example)

- `VITE_API_URL=http://localhost:4000`

### Mobile

Archivo de ejemplo: [apps/mobile/.env.example](/G:/datecite/apps/mobile/.env.example)

- `EXPO_PUBLIC_API_URL=http://localhost:4000`
- `EXPO_PUBLIC_EAS_PROJECT_ID=` opcional para push remoto con Expo

`npm run setup:lan` genera automaticamente:

- `apps/api/.env.local`
- `apps/web/.env.local`
- `apps/mobile/.env.local`

con la IP local de tu PC para probar desde telefono o desde otros equipos en la misma red.

## Android beta / Google Play

La configuracion de release de la app Expo vive en:

- [apps/mobile/app.json](/G:/datecite/apps/mobile/app.json)
- [apps/mobile/eas.json](/G:/datecite/apps/mobile/eas.json)
- [scripts/generate-mobile-assets.py](/G:/datecite/scripts/generate-mobile-assets.py)

Assets Android listos:

- [apps/mobile/assets/icon.png](/G:/datecite/apps/mobile/assets/icon.png)
- [apps/mobile/assets/adaptive-icon-foreground.png](/G:/datecite/apps/mobile/assets/adaptive-icon-foreground.png)
- [apps/mobile/assets/adaptive-icon-monochrome.png](/G:/datecite/apps/mobile/assets/adaptive-icon-monochrome.png)
- [apps/mobile/assets/notification-icon.png](/G:/datecite/apps/mobile/assets/notification-icon.png)
- [apps/mobile/assets/play-store-icon.png](/G:/datecite/apps/mobile/assets/play-store-icon.png)

Paginas publicas utiles para Play dentro del despliegue VPS:

- `https://TU-DOMINIO/privacy/`
- `https://TU-DOMINIO/support/`

### Lo que ya quedo preparado

- `android.package = com.darksoulart.conexia`
- `android.versionCode = 1`
- icono nativo + adaptive icon + icono de notificaciones
- splash nativo oscuro alineado a `Conexia`
- perfil `preview` para `APK`
- perfil `beta` para `AAB`
- perfiles de submit para `internal`, `closed` y `production`

### Comandos utiles

Desde la raiz:

```bash
npm run android:apk
```

Construye una `APK` para instalarla directo en testers o validar en dispositivo.

```bash
npm run android:beta
```

Construye un `AAB`, que es el formato correcto para Google Play.

```bash
npm run android:submit:internal
```

Sube el build a `internal testing` cuando ya tengas EAS y Play Console configurados.

```bash
npm run android:submit:closed
```

Lo deja listo para una pista cerrada tipo `alpha` en Google Play.

### Flujo recomendado para testers reales

1. Haz `internal testing` primero para validar instalacion, login, camara, microfono, ubicacion y push.
2. Si tu cuenta de Play es personal y fue creada despues del 13 de noviembre de 2023, ejecuta despues una prueba cerrada con al menos `12 testers` durante `14 dias` para poder pedir acceso a produccion.
3. Cuando ya tengas feedback real y estabilidad, sube una nueva `AAB` a la pista cerrada.

### Requisitos de Play que no dependen del codigo

- Si la app se queda solo en `internal testing`, Google Play la distribuye rapido y esa pista queda exenta de la seccion `Data safety`.
- Si pasas a `closed testing`, `open testing` o `production`, Play te pedira completar `Data safety`.
- Tambien vas a necesitar una politica de privacidad publica y accesible por URL.

### Bloqueos externos que no puedo cerrar por ti desde aqui

- login de tu cuenta Expo/EAS
- vinculacion del proyecto EAS
- cuenta de Google Play Console
- clave JSON de servicio para `eas submit`
- primera subida manual a Google Play si tu app nunca ha sido enviada antes
- publicacion real de la politica de privacidad en una URL accesible

### Nota importante antes del primer upload

Si quieres cambiar el identificador Android, hazlo ahora. Despues de la primera subida, `com.darksoulart.conexia` ya no deberia cambiarse.

Hay un borrador base en [docs/privacy-policy-draft.md](/G:/datecite/docs/privacy-policy-draft.md) para acelerar ese paso.
Tambien hay copy base de ficha en [docs/google-play-store-listing.md](/G:/datecite/docs/google-play-store-listing.md).
Y una base para `Data safety` en [docs/google-play-data-safety-notes.md](/G:/datecite/docs/google-play-data-safety-notes.md).

Para automatizar `eas submit`, coloca tu JSON de Google Play en:

- [credentials/README.md](/G:/datecite/credentials/README.md)

## Politica beta

- No hay cuentas demo sembradas en la base.
- No hay perfiles bot ni matches falsos.
- El primer acceso debe hacerse registrando usuarios reales.
- El admin token se toma de `apps/api/.env.local`.

## Despliegue VPS

Ruta pensada para beta cerrada en una VPS con IP publica:

- `deploy/docker-compose.vps.yml`: levanta `api` + `web`
- `deploy/docker/api.Dockerfile`: construye la API Node
- `deploy/docker/web.Dockerfile`: exporta `apps/mobile` a web estatica y monta `apps/web` en `/panel`
- `deploy/nginx/datecite.conf`: deja `Conexia` en `/`, panel web en `/panel`, API en `/api` y media en `/media`

### VPS Windows self-hosted

Para salir de Sites/Cloudflare en una VPS Windows sin D1/R2, usa la ruta nativa:

- API Node/Express en servicio Windows `ContigoApi`
- SQLite en `C:\Contigo\data\datecite.db`
- uploads locales en `C:\Contigo\data\uploads`
- Caddy con HTTPS y DuckDNS
- backup diario de `C:\Contigo\data`

Guia completa:

- [docs/windows-vps-self-hosted.md](/G:/datecite/docs/windows-vps-self-hosted.md)

Comando base en PowerShell administrador:

```powershell
.\deploy\windows\Install-ContigoWindows.ps1 `
  -AppRoot C:\Contigo `
  -PublicHostname tu-subdominio.duckdns.org `
  -DuckDnsDomain tu-subdominio `
  -DuckDnsToken TU_TOKEN_DUCKDNS
```

Firebase email/password queda disponible con `FIREBASE_WEB_API_KEY`:

- `POST /api/auth/firebase/register`
- `POST /api/auth/firebase/login`

Pagos manuales/VIP:

- `POST /api/billing/manual-payments`
- `PUT /api/admin/users/:id/plan` con `x-admin-token`

### 1. Genera el archivo de entorno del servidor

Desde la raiz del repo:

```bash
npm run setup:vps -- http://TU_IP_PUBLICA
```

Eso crea:

- `deploy/.env.production`

con:

- `JWT_SECRET`
- `ADMIN_TOKEN`
- `PUBLIC_API_URL`
- `CORS_ORIGIN`

Si mas adelante usas dominio con HTTPS, vuelve a correrlo con:

```bash
npm run setup:vps -- https://tu-dominio.com
```

### 2. Sube el repo a la VPS

Necesitas en la VPS:

- Docker
- Docker Compose plugin

### 3. Arranca la beta

En la VPS, dentro del repo:

```bash
docker compose -f deploy/docker-compose.vps.yml --env-file deploy/.env.production up -d --build
```

### 4. URLs que quedan activas

- App principal mobile web: `http://TU_IP_PUBLICA/`
- Panel web/admin: `http://TU_IP_PUBLICA/panel/`
- API health: `http://TU_IP_PUBLICA/health`
- API: `http://TU_IP_PUBLICA/api/...`
- Media: `http://TU_IP_PUBLICA/media/...`

### 5. Persistencia

La base y uploads quedan en:

- `deploy/volumes/api-data`

No borres esa carpeta si quieres conservar usuarios reales, fotos y conversaciones.

### Nota importante sobre IP publica y navegador

Con solo `http://IP_PUBLICA`, la beta web funciona para navegar, registro, login, match y chat.

Pero estas funciones del navegador pueden degradarse o bloquearse sin HTTPS:

- camara
- microfono
- ubicacion
- push web

Si quieres que la beta web tenga permisos serios en movil, lo correcto es:

1. usar dominio
2. poner HTTPS
3. volver a correr `setup:vps` con `https://tu-dominio.com`

Si la beta se va a probar desde Expo Go o una build nativa, esa limitacion web deja de ser el cuello principal.

## Despliegue solo API para la app movil

Si ya usas el puerto `80` para otra web, no necesitas publicar `Conexia` ahi.

Puedes dejar solo el backend de la app movil publicado en otro puerto, por ejemplo `4000`.

### Regla correcta

- el backend escucha en `0.0.0.0:4000`
- la app movil apunta a `http://97.69.12.41:4000`
- no uses `localhost` dentro de la APK final

### Preparar el entorno publico para API-only

```bash
npm run setup:vps -- http://97.69.12.41:4000
```

o si ya existe `deploy/.env.production`:

```bash
npm run setup:vps:api -- http://97.69.12.41:4000
```

### Compose API-only

Usa:

- [deploy/docker-compose.api-only.yml](/G:/datecite/deploy/docker-compose.api-only.yml)

Arranque:

```bash
docker compose -f deploy/docker-compose.api-only.yml --env-file deploy/.env.production up -d --build
```

### URL que debe usar la app movil

- `EXPO_PUBLIC_API_URL=http://97.69.12.41:4000`

### Que probar despues

- `http://97.69.12.41:4000/health`
- `http://97.69.12.41:4000/api/launch-config`

Si ambos responden desde fuera de tu red, ya puedes recompilar la APK apuntando al backend publico real.

## Que trae el MVP

- Registro con validacion 18+
- Login con JWT
- Persistencia segura de sesion en mobile
- Onboarding de perfil
- Subida real de fotos al server y URLs estables en perfiles
- Verificacion por selfie obligatoria antes de usar `Match`, `Chat` y `Actividad`
- Discover con compatibilidad y limite diario free
- Matches por like mutuo
- Chat libre entre matches
- Actividad con visitas recibidas, visitas hechas y likes recibidos
- Notificaciones in-app con no leidas para likes, match y mensajes
- Push notifications remotas con Expo cuando el dispositivo y el `projectId` estan configurados
- Reportar y bloquear
- Waitlist desde la web
- Metricas admin basicas

## Validacion hecha

- `npm run build`
- `npm run typecheck`
- Smoke test API:
  - `GET /health`
  - `GET /api/launch-config`
  - bloqueo a menor de edad
  - registro valido
  - discover
  - login demo
  - matches y mensajes
  - waitlist
  - metricas admin

Push remoto requiere telefono real. Si usas dev build o EAS, deja `EXPO_PUBLIC_EAS_PROJECT_ID` en `apps/mobile/.env.local` para registrar el token con tu proyecto.

## Siguiente fase recomendada

- Resize y compresion de fotos server-side
- Pagos para Plus
- Moderacion y verificacion avanzada
- Realtime chat

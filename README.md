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

## Credenciales demo

- Usuario demo: `mateo@datecite.app`
- Password demo: `DateCiteDemo123!`
- Admin demo: `admin@datecite.app`
- Admin token: revisar `apps/api/.env.local`

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

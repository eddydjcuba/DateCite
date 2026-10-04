# Contigo self-hosted en VPS Windows

Esta ruta usa la app Node existente: Express + SQLite + uploads locales. No depende de Cloudflare D1/R2.

## Requisitos

- Windows Server con puertos 80 y 443 abiertos.
- Node.js 22 o superior.
- NSSM en `C:\tools\nssm\nssm.exe`.
- Caddy en `C:\tools\caddy\caddy.exe`.
- Un subdominio DuckDNS apuntando a la VPS.

## Variables principales

Configura `deploy/.env.production`:

```env
HOST=0.0.0.0
PORT=4000
JWT_SECRET=pon-un-secreto-largo
ADMIN_TOKEN=pon-un-token-largo
SQLITE_PATH=./data/datecite.db
UPLOADS_PATH=./data/uploads
PUBLIC_API_URL=https://tu-subdominio.duckdns.org
CORS_ORIGIN=https://tu-subdominio.duckdns.org
FIREBASE_WEB_API_KEY=opcional-para-login-email-firebase
```

## Instalacion

Desde PowerShell como administrador:

```powershell
.\deploy\windows\Install-ContigoWindows.ps1 `
  -AppRoot C:\Contigo `
  -PublicHostname tu-subdominio.duckdns.org `
  -DuckDnsDomain tu-subdominio `
  -DuckDnsToken TU_TOKEN_DUCKDNS `
  -CaddyEmail admin@tu-dominio.com
```

El instalador:

- copia el repo a `C:\Contigo`
- instala dependencias
- compila API y web
- crea `ContigoApi` como servicio Windows con NSSM
- crea `ContigoCaddy` si existe `caddy.exe`
- crea tarea diaria `Contigo Daily Backup`
- crea tarea DuckDNS cada 5 minutos si pasas token y dominio

## Firebase email

El backend mantiene JWT propio para la app, pero puede registrar y validar el email/password contra Firebase:

- `POST /api/auth/firebase/register`
- `POST /api/auth/firebase/login`

Activalo con `FIREBASE_WEB_API_KEY`. Si no lo defines, el login local anterior sigue funcionando.

## Pagos manuales y VIP

El usuario puede crear una solicitud:

- `POST /api/billing/manual-payments`

El admin puede subir o bajar el plan:

- `PUT /api/admin/users/:id/plan`
- header `x-admin-token: ADMIN_TOKEN`
- body `{ "plan": "plus" }` o `{ "plan": "free" }`

## Backups

El backup comprime `C:\Contigo\data`, incluyendo SQLite y uploads:

```powershell
.\deploy\windows\Backup-Contigo.ps1 -AppRoot C:\Contigo
```

La tarea diaria conserva 14 dias por defecto.

## Llamadas

La base actual conserva audio/mensajes de voz y notificaciones. Llamadas en vivo requieren una capa adicional de WebRTC/signaling y TURN; con HTTPS por Caddy ya queda cubierto el requisito de navegador para camara/microfono, pero la senalizacion todavia no esta implementada.

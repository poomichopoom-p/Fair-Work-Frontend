# FairWork Frontend

Angular 21 employee, company, and admin workspace for the FairWork attendance API.

## Included flows

- Sign in and invitation-based registration
- Employee dashboard with location-verified clock in/out and break controls
- Attendance history, shift detail, event-based location checks, and correction requests
- Company correction review, weekly attendance report, and team invitations
- Manager read-only people, attendance, reports, audit, and correction queue
- Admin employee list, attendance records, weekly reports, audit log, and invitations
- Role-aware navigation; the API remains responsible for access enforcement

Location is requested only when an employee starts a clock in/out action. Coordinates are sent to the backend for validation and are not used for continuous tracking.

## Run locally

Requirements: Node.js 20+ and the FairWork backend running on `http://localhost:8080`.

```powershell
cd D:\miniProject\fairWork\frontend
npm install
npm start
```

Open `http://localhost:4200`. The Angular development server forwards `/api` requests to the backend using `proxy.conf.json`. Start the Spring Boot backend with its local database configuration before signing in.

## Production build

```powershell
npm run build
```

The optimized site is written to `dist/frontend`. Production hosting must route `/api` to the FairWork backend over HTTPS.

## Container deployment

The workspace `compose.yaml` builds the API and web containers and keeps PostgreSQL and the API off published host ports. See the [deployment runbook](../docs/ops/deployment-runbook.md) for required secrets, TLS proxy setup, health checks, encrypted backups, and release steps.


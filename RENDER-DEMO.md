# FairWork Free Render Demo

This deployment is for a disposable demo with fabricated data only. Render's free Postgres database expires 30 days after creation and has no backups. Do not enter real employee, location, or attendance data.

## Services

`render.yaml` defines the Angular/Nginx web service, Spring Boot API, and PostgreSQL database in Render's Singapore region. All three use the free plan. The web service proxies `/api` to the API over HTTPS, so the browser only talks to the web service origin.

The Render resources use the names below and receive their corresponding `onrender.com` URLs:

- Web: `https://fairwork-demo-web-20261109.onrender.com`
- API: `https://fairwork-demo-api-20261109.onrender.com`

If Render reports either service name is unavailable, change the resource name and update the matching API URL and `CORS_ALLOWED_ORIGINS` in `render.yaml` before creating the Blueprint.

## Create the demo

1. Push the `render-demo` branch of both FairWork GitHub repositories.
2. In Render, connect GitHub access to both `Fair-Work-Frontend` and the private `Fair-Work-backend-` repository.
3. Create a Blueprint from the frontend repository's `render.yaml` on branch `render-demo`.
4. Enter a fresh 64-character hexadecimal `JWT_SECRET` and a strong demo-only `BOOTSTRAP_ADMIN_PASSWORD` when Render prompts for secrets. Never commit these values or put them in chat. The configured bootstrap email is `demo-admin@example.invalid`.
5. Confirm every service and the database are on the **Free** plan, then create the Blueprint.
6. Wait for both web services to report healthy, then open the web URL above and sign in with the bootstrap email and the password you entered.

Generate a JWT secret locally in PowerShell without sending it anywhere:

```powershell
$bytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
$jwtSecret = [Convert]::ToHexString($bytes).ToLowerInvariant()
```

Render generates HTTPS for the `onrender.com` URLs; a custom domain is not required. Free web services can spin down while idle, and the database is temporary. Delete the demo resources when finished, or upgrade the database only after deciding on a paid plan and backup strategy.


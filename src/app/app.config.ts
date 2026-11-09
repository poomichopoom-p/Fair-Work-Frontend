import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors, type HttpInterceptorFn } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { catchError, finalize, shareReplay, switchMap, throwError, type Observable } from 'rxjs';

import { routes } from './app.routes';

interface StoredSession { accessToken: string; refreshToken: string; user: unknown; }
let refreshInFlight: Observable<string> | null = null;

const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (typeof sessionStorage === 'undefined') return next(request);
  if (/\/auth\/(login|register|refresh|logout)$/.test(request.url)) return next(request);
  const http = inject(HttpClient);
  try {
    const session = sessionStorage.getItem('fairwork.session');
    const credentials = session ? JSON.parse(session) as StoredSession : null;
    const authorizedRequest = credentials?.accessToken ? request.clone({ setHeaders: { Authorization: `Bearer ${credentials.accessToken}` } }) : request;
    return next(authorizedRequest).pipe(catchError((cause: unknown) => {
      if (!(cause instanceof HttpErrorResponse) || cause.status !== 401 || !credentials?.refreshToken) return throwError(() => cause);
      const latestRaw = sessionStorage.getItem('fairwork.session');
      const latest = latestRaw ? JSON.parse(latestRaw) as StoredSession : credentials;
      if (latest.accessToken && latest.accessToken !== credentials.accessToken) {
        return next(request.clone({ setHeaders: { Authorization: `Bearer ${latest.accessToken}` } }));
      }
      if (!latest.refreshToken) return throwError(() => cause);
      if (!refreshInFlight) {
        refreshInFlight = http.post<StoredSession>('/api/auth/refresh', { refreshToken: latest.refreshToken }).pipe(
          switchMap((updated) => {
            sessionStorage.setItem('fairwork.session', JSON.stringify(updated));
            return [updated.accessToken];
          }),
          catchError((refreshError: unknown) => { sessionStorage.removeItem('fairwork.session'); return throwError(() => refreshError); }),
          finalize(() => { refreshInFlight = null; }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
      }
      return refreshInFlight.pipe(switchMap((accessToken) => next(request.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } }))));
    }));
  } catch { return next(request); }
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(routes)
  ]
};


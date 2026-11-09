import { Component, computed, inject, signal, type WritableSignal } from '@angular/core';
import { DatePipe, DecimalPipe, UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import type { Observable } from 'rxjs';

interface UserSummary { id: number; name: string; email: string; role: 'EMPLOYEE' | 'MANAGER' | 'COMPANY' | 'ADMIN'; companyId: number | null; }
interface TokenResponse { accessToken: string; refreshToken: string; accessTokenExpiresInSeconds: number; user: UserSummary; }
interface Attendance { id: number; locationName?: string; status?: string; clockIn?: string; clockOut?: string | null; durationMinutes?: number; breakMinutes?: number; workingMinutes?: number; clockOutSource?: string; }
interface AttendanceDetail { attendance: Attendance; breaks: Array<{ id: number; breakStart: string; breakEnd?: string; durationMinutes?: number }>; locationEvents: Array<{ id: number; eventType: string; status: string; accuracyMeters?: number; distanceFromWorkplaceMeters?: number; recordedAt: string }>; }
interface Correction { id: number; attendanceId: number; requestedBy: number; requestedValues: Record<string, unknown>; reason: string; status: string; reviewReason?: string; requestedAt: string; }
interface Employee { id: number; name: string; email: string; role: string; companyId: number | null; createdAt?: string; }
interface ReportRow { userId: number; name: string; scheduledShifts: number; attendedShifts: number; completedAttendances: number; openAttendances: number; lateShifts: number; absentShifts: number; totalWorkingMinutes: number; totalBreakMinutes: number; weekStart?: string; weekEnd?: string; }
interface AuditEntry { id: number; actorId: number; action: string; entityType: string; entityId: number; reason?: string; createdAt: string; }

const SESSION_KEY = 'fairwork.session';

@Component({
  selector: 'app-root',
  imports: [FormsModule, DatePipe, DecimalPipe, UpperCasePipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly http = inject(HttpClient);
  readonly user = signal<UserSummary | null>(this.restoreSession());
  readonly page = signal('overview');
  readonly busy = signal(false);
  readonly notice = signal('');
  readonly error = signal('');
  readonly authMode = signal<'login' | 'register'>('login');
  readonly todayRows = signal<Attendance[]>([]);
  readonly attendanceDetail = signal<AttendanceDetail | null>(null);
  readonly history = signal<Attendance[]>([]);
  readonly corrections = signal<Correction[]>([]);
  readonly employees = signal<Employee[]>([]);
  readonly reports = signal<ReportRow[]>([]);
  readonly audit = signal<AuditEntry[]>([]);
  readonly loginForm = { email: '', password: '' };
  readonly registerForm = { name: '', email: '', password: '', invitationCode: '' };
  readonly invitationForm = { email: '', role: 'EMPLOYEE', companyId: '' };
  readonly invitationCode = signal('');
  readonly today = new Date();
  readonly correctionForm = { attendanceId: '', field: 'clockIn', requestedValue: '', reason: '' };
  readonly reviewInput = signal('');
  readonly isEmployee = computed(() => this.user()?.role === 'EMPLOYEE');
  readonly isCompany = computed(() => this.user()?.role === 'COMPANY');
  readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');
  readonly isManager = computed(() => this.user()?.role === 'MANAGER');
  readonly canViewCompany = computed(() => this.isCompany() || this.isManager() || this.isAdmin());
  readonly canManageRead = computed(() => this.isManager() || this.isAdmin());
  readonly canInvite = computed(() => this.isCompany() || this.isAdmin());
  readonly canReview = computed(() => this.isCompany() || this.isAdmin());
  readonly totalHours = computed(() => this.formatMinutes(this.reports().reduce((sum, row) => sum + row.totalWorkingMinutes, 0)));
  readonly openAttendance = computed(() => this.todayRows().find((row) => !row.clockOut) ?? null);
  readonly weekRange = this.getWeekRange();
  readonly reportFrom = signal(this.weekRange.from);
  readonly reportTo = signal(this.weekRange.to);
  readonly reportCompanyId = signal('');
  readonly reportUserId = signal('');
  readonly greeting = computed(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  });
  constructor() {
    if (this.user()) this.loadWorkspace();
  }

  private restoreSession(): UserSummary | null {
    try {
      const session = sessionStorage.getItem(SESSION_KEY);
      return session ? (JSON.parse(session) as TokenResponse).user : null;
    } catch { return null; }
  }

  private storeSession(session: TokenResponse): void {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    this.user.set(session.user);
  }

  private request<T>(method: 'get' | 'post' | 'patch', path: string, body?: unknown) {
    const url = `/api${path}`;
    return method === 'get' ? this.http.get<T>(url) : method === 'patch' ? this.http.patch<T>(url, body) : this.http.post<T>(url, body);
  }

  login(): void {
    this.run(this.request<TokenResponse>('post', '/auth/login', this.loginForm), (session) => {
      this.storeSession(session); this.notice.set('Welcome back. Your workspace is ready.'); this.loadWorkspace();
    });
  }

  register(): void {
    this.run(this.request<TokenResponse>('post', '/auth/register', this.registerForm), (session) => {
      this.storeSession(session); this.notice.set('Your account is ready.'); this.loadWorkspace();
    });
  }

  logout(): void {
    const session = this.session();
    if (session) this.request<void>('post', '/auth/logout', { refreshToken: session.refreshToken }).subscribe({ error: () => undefined });
    sessionStorage.removeItem(SESSION_KEY); this.user.set(null); this.resetData(); this.page.set('overview');
  }

  private session(): TokenResponse | null {
    try { const value = sessionStorage.getItem(SESSION_KEY); return value ? JSON.parse(value) as TokenResponse : null; } catch { return null; }
  }

  private run<T>(request: Observable<T>, success: (value: T) => void): void {
    this.busy.set(true); this.error.set(''); this.notice.set('');
    request.subscribe({ next: (value) => { this.busy.set(false); success(value as T); }, error: (cause: unknown) => { this.busy.set(false); this.error.set(this.message(cause)); } });
  }

  private loadWorkspace(): void {
    this.load('/attendance/today', this.todayRows);
    this.load('/attendance/history', this.history);
    if (this.isEmployee()) this.load('/attendance/corrections', this.corrections);
    if (this.canViewCompany()) {
      const prefix = this.isAdmin() ? '/admin' : '/company';
      this.load(`${prefix}/corrections?status=PENDING`, this.corrections);
      this.loadReports();
    }
    if (this.canManageRead()) {
      this.load('/admin/employees', this.employees);
    }
    if (this.canViewCompany()) {
      this.load('/admin/audit-logs', this.audit);
    }
  }

  private load<T>(path: string, target: WritableSignal<T[]>): void {
    this.request<T[]>('get', path).subscribe({ next: (rows) => target.set(rows ?? []), error: (cause: unknown) => {
      if (cause instanceof HttpErrorResponse && cause.status === 401) { this.error.set('Your session expired. Please sign in again.'); this.logout(); }
    } });
  }

  private resetData(): void { this.todayRows.set([]); this.history.set([]); this.corrections.set([]); this.employees.set([]); this.reports.set([]); this.audit.set([]); this.attendanceDetail.set(null); }

  selectPage(page: string): void { this.page.set(page); this.notice.set(''); this.error.set(''); if (page === 'attendance') { if (this.canManageRead()) this.loadAdminAttendance(); else this.load('/attendance/history', this.history); } }

  clock(action: 'clock-in' | 'clock-out'): void {
    if (!navigator.geolocation) { this.error.set('This browser does not support location access.'); return; }
    this.busy.set(true); this.error.set(''); this.notice.set('Waiting for your location…');
    navigator.geolocation.getCurrentPosition((position) => {
      const body = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy };
      this.request<Attendance>('post', `/attendance/${action}`, body).subscribe({ next: () => { this.busy.set(false); this.notice.set(action === 'clock-in' ? 'Clocked in. Your workplace location was verified.' : 'Clocked out.'); this.loadWorkspace(); }, error: (cause: unknown) => { this.busy.set(false); this.notice.set(''); this.error.set(this.message(cause)); } });
    }, (cause) => { this.busy.set(false); this.notice.set(''); this.error.set(cause.code === 1 ? 'Location access was blocked. Allow location access and try again.' : 'Could not get a location fix. Move to an area with a stronger GPS signal and try again.'); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }

  breakAction(action: 'start' | 'end'): void {
    const current = this.openAttendance(); if (!current) return;
    this.run(this.request('post', `/attendance/breaks/${action}`, { attendanceId: current.id }), () => { this.notice.set(action === 'start' ? 'Break started.' : 'Break ended.'); this.loadWorkspace(); });
  }

  submitCorrection(): void {
    const id = Number(this.correctionForm.attendanceId);
    if (!id) { this.error.set('Choose an attendance record first.'); return; }
    const { field, requestedValue, reason } = this.correctionForm;
    const instant = new Date(requestedValue);
    if (!Number.isFinite(instant.getTime())) { this.error.set('Choose a valid date and time.'); return; }
    this.run(this.request('post', `/attendance/${id}/corrections`, { field, requestedValue: instant.toISOString(), reason }), () => { this.notice.set('Correction request submitted for review.'); this.correctionForm.reason = ''; this.load('/attendance/corrections', this.corrections); });
  }

  createInvitation(): void {
    const body: { email: string; role: string; companyId?: number } = { email: this.invitationForm.email, role: this.invitationForm.role };
    if (this.isAdmin() && this.invitationForm.companyId) body.companyId = Number(this.invitationForm.companyId);
    this.run(this.request<{ invitationCode: string }>('post', '/auth/invitations', body), (result) => { this.invitationCode.set(result.invitationCode); this.notice.set('Invitation created. Share the code with the person securely.'); this.invitationForm.email = ''; });
  }

  reviewCorrection(correction: Correction, decision: 'approve' | 'reject'): void {
    const reviewReason = this.reviewInput().trim();
    if (!reviewReason) { this.error.set('Add a short review note before deciding.'); return; }
    const prefix = this.isAdmin() ? '/admin' : '/company';
    this.run(this.request('post', `${prefix}/corrections/${correction.id}/${decision}`, { reviewReason }), () => { this.notice.set(`Request ${decision === 'approve' ? 'approved' : 'rejected'}.`); this.reviewInput.set(''); this.loadWorkspace(); });
  }

  loadAdminAttendance(): void { this.run(this.request<Attendance[]>('get', '/admin/attendance'), (rows) => this.history.set(rows ?? [])); }
  showAttendanceDetail(id: number): void { this.run(this.request<AttendanceDetail>('get', `/attendance/${id}`), (detail) => this.attendanceDetail.set(detail)); }
  closeAttendanceDetail(): void { this.attendanceDetail.set(null); }
  refreshPeople(): void { this.load('/admin/employees', this.employees); }
  refreshAudit(): void { this.load('/admin/audit-logs', this.audit); }
  loadReports(): void {
    if (!this.canViewCompany()) return;
    if (!this.reportFrom() || !this.reportTo() || this.reportFrom() > this.reportTo()) { this.error.set('Choose a valid report date range.'); return; }
    const prefix = this.isAdmin() ? '/admin' : '/company';
    const params = new URLSearchParams({ from: this.reportFrom(), to: this.reportTo() });
    if (this.isAdmin() && this.reportCompanyId()) params.set('companyId', this.reportCompanyId());
    if (this.reportUserId()) params.set('userId', this.reportUserId());
    this.run(this.request<ReportRow[]>('get', `${prefix}/reports/attendance-weekly?${params.toString()}`), (rows) => this.reports.set(rows ?? []));
  }

  exportReport(): void {
    if (!this.canViewCompany()) return;
    if (!this.reportFrom() || !this.reportTo() || this.reportFrom() > this.reportTo()) { this.error.set('Choose a valid report date range.'); return; }
    const from = this.localDateBoundary(this.reportFrom(), false);
    const to = this.localDateBoundary(this.reportTo(), true);
    if (!from || !to) { this.error.set('Choose valid start and end dates.'); return; }
    const prefix = this.isAdmin() ? '/admin' : '/company';
    const params = new URLSearchParams({ from, to });
    if (this.isAdmin() && this.reportCompanyId()) params.set('companyId', this.reportCompanyId());
    if (this.reportUserId()) params.set('userId', this.reportUserId());
    this.run(this.http.get(`/api${prefix}/reports/attendance-export?${params.toString()}`, { responseType: 'blob' }), (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `fairwork-attendance-${this.reportFrom()}-${this.reportTo()}.csv`;
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.notice.set('Attendance CSV downloaded.');
    });
  }

  private localDateBoundary(value: string, end: boolean): string | null {
    const date = new Date(`${value}T00:00:00`);
    if (end) date.setDate(date.getDate() + 1);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  formatMinutes(value?: number): string {
    if (value == null) return '—';
    const minutes = Math.round(value); return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
  }

  formatValues(values: Record<string, unknown>): string {
    return Object.entries(values).map(([key, value]) => `${key}: ${String(value)}`).join(' · ') || '—';
  }

  private getWeekRange(): { from: string; to: string } {
    const date = new Date(); const day = (date.getDay() + 6) % 7; const monday = new Date(date); monday.setDate(date.getDate() - day); const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { from: iso(monday), to: iso(sunday) };
  }

  private message(cause: unknown): string {
    if (cause instanceof HttpErrorResponse) {
      const payload = cause.error as { message?: string; code?: string } | null;
      if (cause.status === 0) return 'Could not reach FairWork. Check that the backend is running, then try again.';
      return payload?.message || payload?.code || `Request failed (${cause.status}). Please try again.`;
    }
    return 'Something went wrong. Please try again.';
  }
}


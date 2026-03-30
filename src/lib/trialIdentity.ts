// ─── Cookie-based visitor identification & 14-day trial tracking ─────────────

const VISITOR_COOKIE = "pa_visitor_id";
const TRIAL_COOKIE = "pa_trial_start";
const TRIAL_DAYS = 14;

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days: number) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 86_400_000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

function generateUUID(): string {
  // crypto.randomUUID where available, fallback to manual
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Get or create a persistent visitor ID (cookie-based) */
export function getVisitorId(): string {
  let id = getCookie(VISITOR_COOKIE);
  if (!id) {
    id = generateUUID();
    setCookie(VISITOR_COOKIE, id, TRIAL_DAYS * 2); // keep cookie longer than trial
  }
  return id;
}

/** Get the trial start timestamp (Unix ms). Creates it on first call. */
export function getTrialStart(): number {
  const raw = getCookie(TRIAL_COOKIE);
  if (raw) {
    const ts = parseInt(raw, 10);
    if (!isNaN(ts)) return ts;
  }
  const now = Date.now();
  setCookie(TRIAL_COOKIE, String(now), TRIAL_DAYS * 2);
  return now;
}

/** Number of full days remaining in the trial (0 = expired) */
export function getTrialDaysRemaining(): number {
  const start = getTrialStart();
  const elapsed = Date.now() - start;
  const remaining = TRIAL_DAYS - elapsed / 86_400_000;
  return Math.max(0, Math.ceil(remaining));
}

/** Whether the 14-day trial has expired */
export function isTrialExpired(): boolean {
  return getTrialDaysRemaining() <= 0;
}

/** Max strategy cards for free/trial users */
export const FREE_STRATEGY_LIMIT = 3;

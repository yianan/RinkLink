import type { AccessTarget } from '../types';

const SIGNUP_ACCESS_REQUEST_KEY = 'rinklink.signupAccessRequest';

export type SignupAccessRequestDraft = {
  email?: string | null;
  target_type: string;
  target_id: string;
  target_name: string;
  target_context: string | null;
  notes: string | null;
  details?: Record<string, unknown> | null;
};

export function saveSignupAccessRequestDraft(target: AccessTarget, notes: string | null) {
  saveSignupAccessRequestDrafts([{
    target_type: target.type,
    target_id: target.id,
    target_name: target.name,
    target_context: target.context,
    notes,
    details: null,
  }]);
}

export function saveSignupAccessRequestDrafts(drafts: SignupAccessRequestDraft[], email?: string | null) {
  if (typeof window === 'undefined') return;
  const normalizedEmail = email?.trim().toLowerCase() || null;
  const serialized = JSON.stringify(drafts.map((draft) => ({
    ...draft,
    email: draft.email ?? normalizedEmail,
  })));
  window.localStorage.setItem(SIGNUP_ACCESS_REQUEST_KEY, serialized);
  window.sessionStorage.setItem(SIGNUP_ACCESS_REQUEST_KEY, serialized);
}

function normalizeDraft(value: Partial<SignupAccessRequestDraft>): SignupAccessRequestDraft | null {
  if (!value.target_type || !value.target_id || !value.target_name) return null;
  return {
    email: typeof value.email === 'string' ? value.email.trim().toLowerCase() : null,
    target_type: value.target_type,
    target_id: value.target_id,
    target_name: value.target_name,
    target_context: value.target_context ?? null,
    notes: value.notes ?? null,
    details: value.details ?? null,
  };
}

export function loadSignupAccessRequestDrafts(email?: string | null): SignupAccessRequestDraft[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(SIGNUP_ACCESS_REQUEST_KEY) ?? window.sessionStorage.getItem(SIGNUP_ACCESS_REQUEST_KEY);
  if (!raw) return [];
  try {
    const normalizedEmail = email?.trim().toLowerCase() || null;
    const parsed = JSON.parse(raw) as Partial<SignupAccessRequestDraft> | Partial<SignupAccessRequestDraft>[];
    const drafts = Array.isArray(parsed) ? parsed : [parsed];
    return drafts
      .map(normalizeDraft)
      .filter((draft): draft is SignupAccessRequestDraft => Boolean(draft))
      .filter((draft) => !normalizedEmail || !draft.email || draft.email === normalizedEmail);
  } catch {
    return [];
  }
}

export function loadSignupAccessRequestDraft(): SignupAccessRequestDraft | null {
  return loadSignupAccessRequestDrafts()[0] ?? null;
}

export function clearSignupAccessRequestDraft() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SIGNUP_ACCESS_REQUEST_KEY);
  window.sessionStorage.removeItem(SIGNUP_ACCESS_REQUEST_KEY);
}

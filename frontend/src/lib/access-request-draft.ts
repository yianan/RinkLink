import type { AccessTarget } from '../types';

const SIGNUP_ACCESS_REQUEST_KEY = 'rinklink.signupAccessRequest';

export type SignupAccessRequestDraft = {
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

export function saveSignupAccessRequestDrafts(drafts: SignupAccessRequestDraft[]) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(SIGNUP_ACCESS_REQUEST_KEY, JSON.stringify(drafts));
}

function normalizeDraft(value: Partial<SignupAccessRequestDraft>): SignupAccessRequestDraft | null {
  if (!value.target_type || !value.target_id || !value.target_name) return null;
  return {
    target_type: value.target_type,
    target_id: value.target_id,
    target_name: value.target_name,
    target_context: value.target_context ?? null,
    notes: value.notes ?? null,
    details: value.details ?? null,
  };
}

export function loadSignupAccessRequestDrafts(): SignupAccessRequestDraft[] {
  if (typeof window === 'undefined') return [];
  const raw = window.sessionStorage.getItem(SIGNUP_ACCESS_REQUEST_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<SignupAccessRequestDraft> | Partial<SignupAccessRequestDraft>[];
    const drafts = Array.isArray(parsed) ? parsed : [parsed];
    return drafts.map(normalizeDraft).filter((draft): draft is SignupAccessRequestDraft => Boolean(draft));
  } catch {
    return [];
  }
}

export function loadSignupAccessRequestDraft(): SignupAccessRequestDraft | null {
  return loadSignupAccessRequestDrafts()[0] ?? null;
}

export function clearSignupAccessRequestDraft() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(SIGNUP_ACCESS_REQUEST_KEY);
}

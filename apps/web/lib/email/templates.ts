// =============================================================================
// HSI Milestone 87 — transactional email templates (PURE).
//
// Plain-text-first messages for the beta-application and demo-request flows, plus
// acceptance/rejection notices. No marketing hype, no fabricated claims, and no
// secrets. Returns EmailMessage objects consumed by sendEmail(). PURE: no I/O.
// =============================================================================

import type { EmailMessage } from './resend';

const BRAND = 'Human Signal Index';

export interface BetaApplicationEmailData {
  name: string;
  email: string;
  role: string;
  reason: string;
  organization?: string | null;
}

export interface DemoRequestEmailData {
  name: string;
  email: string;
  organization: string;
  useCase: string;
}

/** Acknowledgement to the applicant. */
export function betaApplicationAck(d: BetaApplicationEmailData): EmailMessage {
  return {
    to: d.email,
    subject: `${BRAND} — beta application received`,
    text:
      `Hi ${d.name},\n\n` +
      `Thanks for applying to the ${BRAND} beta. We review applications in batches and will email you about next steps.\n\n` +
      `You don't need to do anything else for now.\n\n— The ${BRAND} team`,
  };
}

/** Internal notice to the beta team (reply-to the applicant). */
export function betaApplicationAdminNotice(d: BetaApplicationEmailData, adminTo: string): EmailMessage {
  return {
    to: adminTo,
    replyTo: d.email,
    subject: `New beta application — ${d.name}`,
    text:
      `New ${BRAND} beta application:\n\n` +
      `Name: ${d.name}\n` +
      `Email: ${d.email}\n` +
      `Role / background: ${d.role}\n` +
      `Organization: ${d.organization ?? '—'}\n` +
      `Reason: ${d.reason}\n`,
  };
}

/** Acknowledgement to the demo requester. */
export function demoRequestAck(d: DemoRequestEmailData): EmailMessage {
  return {
    to: d.email,
    subject: `${BRAND} — demo request received`,
    text:
      `Hi ${d.name},\n\n` +
      `Thanks for your interest in ${BRAND}. A member of the team will reach out to schedule a walkthrough.\n\n` +
      `— The ${BRAND} team`,
  };
}

/** Internal notice to the team for a demo request. */
export function demoRequestAdminNotice(d: DemoRequestEmailData, adminTo: string): EmailMessage {
  return {
    to: adminTo,
    replyTo: d.email,
    subject: `New demo request — ${d.organization}`,
    text:
      `New ${BRAND} demo request:\n\n` +
      `Name: ${d.name}\n` +
      `Email: ${d.email}\n` +
      `Organization: ${d.organization}\n` +
      `Use case: ${d.useCase}\n`,
  };
}

/** Acceptance notice (admin-triggered from the intake console). */
export function betaAcceptanceEmail(name: string, to: string): EmailMessage {
  return {
    to,
    subject: `${BRAND} — you're in the beta`,
    text:
      `Hi ${name},\n\n` +
      `You've been accepted into the ${BRAND} beta. Sign in to get started, and use the in-app issue and feedback tools to tell us what you find.\n\n` +
      `— The ${BRAND} team`,
  };
}

/** Decline notice (admin-triggered, respectful + final). */
export function betaRejectionEmail(name: string, to: string): EmailMessage {
  return {
    to,
    subject: `${BRAND} — beta application update`,
    text:
      `Hi ${name},\n\n` +
      `Thanks again for your interest in the ${BRAND} beta. We aren't able to offer you a spot in the current round, but we've kept your details and may reach out as the program expands.\n\n` +
      `— The ${BRAND} team`,
  };
}

// =============================================================================
// @hsi/operations-engine — ESCALATION.
//
// escalate / deEscalate change an advisory PRIORITY flag and record history.
// Escalations NEVER publish, approve, reject, modify evidence, or change a
// governance outcome — they only notify, prioritize, and flag. Pure.
// =============================================================================

import type { Escalation, EscalationHistoryEntry, EscalationLevel } from './types';

export const ESCALATION_ORDER: EscalationLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function escalationRank(level: EscalationLevel): number {
  return ESCALATION_ORDER.indexOf(level);
}

export class EscalationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EscalationError';
  }
}

function requireText(value: string, label: string): string {
  if (!value || value.trim().length === 0) throw new EscalationError(`${label} is required.`);
  return value.trim();
}

export interface EscalationResult {
  escalation: Escalation;
  history: EscalationHistoryEntry;
}

/** Raise (or change) the escalation level. The new level must be higher. */
export function escalate(
  current: EscalationLevel | null,
  to: EscalationLevel,
  input: { caseId: string; actor: string; reason: string },
  opts: { now: string },
): EscalationResult {
  const caseId = requireText(input.caseId, 'caseId');
  const actor = requireText(input.actor, 'actor');
  const reason = requireText(input.reason, 'reason');
  if (current !== null && escalationRank(to) <= escalationRank(current)) {
    throw new EscalationError(`Escalating must raise the level (current ${current}).`);
  }
  return {
    escalation: { caseId, level: to, raisedBy: actor, reason, at: opts.now, active: true },
    history: { caseId, action: 'escalated', from: current, to, actor, reason, at: opts.now },
  };
}

/** Lower (or clear) the escalation level. `to=null` clears the escalation. */
export function deEscalate(
  current: EscalationLevel,
  to: EscalationLevel | null,
  input: { caseId: string; actor: string; reason: string },
  opts: { now: string },
): EscalationResult {
  const caseId = requireText(input.caseId, 'caseId');
  const actor = requireText(input.actor, 'actor');
  const reason = requireText(input.reason, 'reason');
  if (to !== null && escalationRank(to) >= escalationRank(current)) {
    throw new EscalationError(`De-escalating must lower the level (current ${current}).`);
  }
  return {
    escalation: {
      caseId, level: to ?? 'LOW', raisedBy: actor, reason, at: opts.now,
      active: to !== null,
    },
    history: { caseId, action: 'de-escalated', from: current, to, actor, reason, at: opts.now },
  };
}

/** Time-ordered escalation history for a case. */
export function escalationHistory(history: EscalationHistoryEntry[], caseId: string): EscalationHistoryEntry[] {
  return history.filter((h) => h.caseId === caseId).sort((a, b) => a.at.localeCompare(b.at));
}

/** Build advisory notifications for an escalation (notify-only; never acts). */
export function escalationNotifications(esc: Escalation, recipients: string[]): {
  caseId: string;
  level: EscalationLevel;
  recipient: string;
  message: string;
  advisory: true;
}[] {
  return recipients.map((recipient) => ({
    caseId: esc.caseId,
    level: esc.level,
    recipient,
    message: `Case ${esc.caseId} escalated to ${esc.level}: ${esc.reason}`,
    advisory: true as const,
  }));
}

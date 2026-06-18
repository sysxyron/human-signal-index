import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NOTIFICATION_TYPES, SEVERITIES, isValidType, isValidSeverity, isValidDigest, severityRank,
  defaultPreferences, prefKeyForType, shouldDeliver, markReadPatch, markUnreadPatch, archivePatch,
  isUnread, isArchived, isActive, canViewNotification, canMutateNotification, canViewAllNotifications,
  summarizeNotifications, buildExecutiveAlerts, emptyStats,
  type NotificationRecord, type NotificationType, type NotificationSeverity, type NotificationPreferences,
} from './types';

function rec(over: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: over.id ?? 'n1', userId: over.userId ?? 'u1', organizationId: null,
    type: over.type ?? 'SYSTEM_ALERT', severity: over.severity ?? 'INFO',
    title: 't', body: null, link: null, entityType: null, entityId: null, metadata: {},
    readAt: over.readAt ?? null, archivedAt: over.archivedAt ?? null,
    createdBy: null, createdAt: '2026-06-01T00:00:00Z', createdLabel: 'Jun 1, 2026', ...over,
  };
}

// ---- vocabulary ------------------------------------------------------------

test('14 notification types and 4 severities', () => {
  assert.equal(NOTIFICATION_TYPES.length, 14);
  assert.equal(SEVERITIES.length, 4);
  for (const t of ['SOURCE_FAILURE', 'REVIEW_REQUIRED', 'FORECAST_TRIGGER', 'SECURITY_EVENT', 'BETA_FEEDBACK'] as const) {
    assert.ok((NOTIFICATION_TYPES as readonly string[]).includes(t));
  }
});

test('validators reject junk', () => {
  assert.ok(isValidType('SOURCE_FAILURE'));
  assert.ok(!isValidType('NOPE'));
  assert.ok(isValidSeverity('CRITICAL'));
  assert.ok(!isValidSeverity('low'));
  assert.ok(isValidDigest('daily'));
  assert.ok(!isValidDigest('yearly'));
});

test('severityRank orders INFO < NOTICE < WARNING < CRITICAL', () => {
  assert.ok(severityRank('INFO') < severityRank('NOTICE'));
  assert.ok(severityRank('NOTICE') < severityRank('WARNING'));
  assert.ok(severityRank('WARNING') < severityRank('CRITICAL'));
});

// ---- preferences + delivery gating -----------------------------------------

test('prefKeyForType maps every type to a category', () => {
  assert.equal(prefKeyForType('SOURCE_FAILURE'), 'source_alerts');
  assert.equal(prefKeyForType('REVIEW_REQUIRED'), 'review_alerts');
  assert.equal(prefKeyForType('PUBLICATION_PUBLISHED'), 'publication_alerts');
  assert.equal(prefKeyForType('FORECAST_TRIGGER'), 'forecast_alerts');
  assert.equal(prefKeyForType('SYSTEM_ALERT'), 'system_alerts');
  for (const t of NOTIFICATION_TYPES) assert.ok(prefKeyForType(t as NotificationType));
});

test('shouldDeliver respects in-app, critical-only, and category toggles', () => {
  const p = defaultPreferences();
  assert.ok(shouldDeliver(p, 'SOURCE_FAILURE', 'WARNING'));

  const off: NotificationPreferences = { ...p, inAppEnabled: false };
  assert.ok(!shouldDeliver(off, 'SOURCE_FAILURE', 'WARNING'));

  const critOnly: NotificationPreferences = { ...p, criticalOnly: true };
  assert.ok(!shouldDeliver(critOnly, 'SOURCE_FAILURE', 'WARNING'));
  assert.ok(shouldDeliver(critOnly, 'SOURCE_FAILURE', 'CRITICAL'));

  const noSource: NotificationPreferences = { ...p, sourceAlerts: false };
  assert.ok(!shouldDeliver(noSource, 'SOURCE_FAILURE', 'WARNING'));
  assert.ok(shouldDeliver(noSource, 'REVIEW_REQUIRED', 'INFO'));
});

test('SECURITY_EVENT is never suppressed, even with everything off', () => {
  const p: NotificationPreferences = { ...defaultPreferences(), inAppEnabled: false, criticalOnly: true, systemAlerts: false };
  assert.ok(shouldDeliver(p, 'SECURITY_EVENT', 'INFO'));
});

// ---- lifecycle -------------------------------------------------------------

test('lifecycle patches set the right timestamps', () => {
  const now = '2026-06-15T12:00:00Z';
  assert.deepEqual(markReadPatch(now), { read_at: now, updated_at: now });
  assert.deepEqual(markUnreadPatch(now), { read_at: null, updated_at: now });
  assert.deepEqual(archivePatch(now), { archived_at: now, updated_at: now });
});

test('isUnread / isArchived / isActive', () => {
  assert.ok(isUnread(rec()));
  assert.ok(!isUnread(rec({ readAt: 'x' })));
  assert.ok(!isUnread(rec({ archivedAt: 'x' })));
  assert.ok(isArchived(rec({ archivedAt: 'x' })));
  assert.ok(isActive(rec()));
  assert.ok(!isActive(rec({ archivedAt: 'x' })));
});

// ---- access model (RBAC mirrored in code) ----------------------------------

test('owner sees/mutates own; others cannot; admin sees all', () => {
  const n = rec({ userId: 'owner' });
  assert.ok(canViewNotification({ userId: 'owner', isAdmin: false }, n));
  assert.ok(!canViewNotification({ userId: 'intruder', isAdmin: false }, n));
  assert.ok(canViewNotification({ userId: 'someadmin', isAdmin: true }, n));
  assert.ok(!canViewNotification({ userId: null, isAdmin: false }, n));

  assert.ok(canMutateNotification({ userId: 'owner', isAdmin: false }, n));
  assert.ok(!canMutateNotification({ userId: 'intruder', isAdmin: false }, n));

  assert.ok(canViewAllNotifications({ userId: 'a', isAdmin: true }));
  assert.ok(!canViewAllNotifications({ userId: 'owner', isAdmin: false }));
});

// ---- stats -----------------------------------------------------------------

test('summarizeNotifications computes unread/read/archived + breakdowns', () => {
  const stats = summarizeNotifications([
    rec({ id: '1', severity: 'CRITICAL', type: 'SOURCE_FAILURE' }),               // active, unread
    rec({ id: '2', severity: 'INFO', type: 'SYSTEM_ALERT', readAt: 'x' }),        // active, read
    rec({ id: '3', severity: 'WARNING', type: 'REVIEW_REQUIRED' }),               // active, unread
    rec({ id: '4', severity: 'CRITICAL', type: 'SECURITY_EVENT', archivedAt: 'x' }), // archived → excluded from active
  ]);
  assert.equal(stats.total, 3);
  assert.equal(stats.unread, 2);
  assert.equal(stats.read, 1);
  assert.equal(stats.archived, 1);
  assert.equal(stats.bySeverity.CRITICAL, 1); // archived critical not counted
  assert.equal(stats.bySeverity.WARNING, 1);
  assert.equal(stats.byType.SOURCE_FAILURE, 1);
  assert.equal(stats.byType.SECURITY_EVENT, 0);
});

test('emptyStats has all keys zeroed (no fabricated counts)', () => {
  const s = emptyStats();
  assert.equal(s.total, 0);
  for (const sev of SEVERITIES) assert.equal(s.bySeverity[sev], 0);
  for (const t of NOTIFICATION_TYPES) assert.equal(s.byType[t as NotificationType], 0);
});

// ---- executive alerts ------------------------------------------------------

test('buildExecutiveAlerts maps stats to six computed categories + live extras', () => {
  const stats = summarizeNotifications([
    rec({ id: '1', severity: 'CRITICAL', type: 'SOURCE_FAILURE' }),
    rec({ id: '2', severity: 'WARNING', type: 'REVIEW_REQUIRED' }),
    rec({ id: '3', severity: 'NOTICE', type: 'FORECAST_TRIGGER' }),
    rec({ id: '4', severity: 'WARNING', type: 'SECURITY_EVENT' }),
  ]);
  const cats = buildExecutiveAlerts(stats, { sourceFailuresLive: 5, reviewBacklogLive: 2 });
  const by = Object.fromEntries(cats.map((c) => [c.key, c]));
  assert.equal(cats.length, 6);
  assert.equal(by.critical.count, 1);
  assert.equal(by.critical.tone, 'CRITICAL');
  assert.equal(by.source.count, 1 + 5);   // SOURCE_FAILURE + live failing sources
  assert.equal(by.review.count, 1 + 2);   // REVIEW_REQUIRED + live backlog
  assert.equal(by.forecast.count, 1);
  assert.equal(by.trust.count, 1);
});

test('buildExecutiveAlerts: empty stats → all zero, tone INFO (no fabrication)', () => {
  const cats = buildExecutiveAlerts(emptyStats());
  for (const c of cats) { assert.equal(c.count, 0); assert.equal(c.tone, 'INFO'); }
});

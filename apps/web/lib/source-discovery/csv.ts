// =============================================================================
// HSI Phase 70.3 — CSV parsing + row validation (PURE, deterministic). Handles
// quoted fields, embedded commas/quotes, and CRLF. Validates + normalizes rows
// into CandidateInput; invalid rows carry explicit errors. No I/O, no fabrication.
// =============================================================================

import { CSV_COLUMNS, isSourceType, formatError, type CandidateInput, type RowValidation, type ImportError } from './types';

/** Best-effort source_type suggestion for an unrecognized value (diagnostics aid). */
export function suggestType(raw: Record<string, string>): string {
  const blob = `${raw.source_type ?? ''} ${raw.source_name ?? ''} ${raw.primary_url ?? ''} ${raw.feed_or_api_url ?? ''}`.toLowerCase();
  if (/youtube|youtu\.be|channel/.test(blob)) return 'youtube';
  if (/reddit/.test(blob)) return 'social';
  if (/podcast/.test(blob)) return 'podcast';
  if (/\brss\b|feed|\.xml|atom/.test(blob)) return 'rss';
  if (/\.gov\b|government/.test(blob)) return 'government';
  if (/court|tribunal/.test(blob)) return 'court';
  if (/arxiv|research|\.edu\b/.test(blob)) return 'research';
  if (/\bapi\b/.test(blob)) return 'api';
  if (/threat|malware|phish|abuse/.test(blob)) return 'threat_feed';
  return 'website';
}

/** Parse CSV text into a matrix of cells (RFC-4180-ish: quotes + escaped quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/** Split header + data rows into header-keyed objects (unknown columns ignored). */
export function toObjects(matrix: string[][]): Record<string, string>[] {
  if (matrix.length === 0) return [];
  const headers = matrix[0].map((h) => h.trim().toLowerCase());
  return matrix.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (cells[i] ?? '').trim(); });
    return obj;
  });
}

function num(v: string): number | null { if (!v) return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
function splitTags(v: string): string[] { return v ? v.split(/[;,]/).map((t) => t.trim()).filter(Boolean) : []; }

/** Validate + normalize one CSV row, emitting coded diagnostics. */
export function validateRow(raw: Record<string, string>): RowValidation {
  const errs: ImportError[] = [];
  const name = (raw.source_name ?? '').trim();
  const primaryUrl = (raw.primary_url ?? '').trim() || null;
  const feedUrl = (raw.feed_or_api_url ?? '').trim() || null;
  const sourceType = (raw.source_type ?? '').trim().toLowerCase() || null;

  if (!name) errs.push({ code: 'MISSING_REQUIRED_FIELD', reason: 'source_name is required.', suggestedFix: 'Provide a source name.' });
  if (!primaryUrl && !feedUrl) errs.push({ code: 'INVALID_URL', reason: 'Primary URL is missing or malformed.', suggestedFix: 'Provide primary_url or feed_or_api_url.' });
  if (primaryUrl && !/^https?:\/\//i.test(primaryUrl)) errs.push({ code: 'INVALID_URL', reason: `primary_url "${primaryUrl}" is not http(s).`, suggestedFix: 'Use an https:// URL.' });
  if (feedUrl && !/^https?:\/\//i.test(feedUrl)) errs.push({ code: 'INVALID_URL', reason: `feed_or_api_url "${feedUrl}" is not http(s).`, suggestedFix: 'Use an https:// URL.' });
  if (sourceType && !isSourceType(sourceType)) errs.push({ code: 'UNSUPPORTED_SOURCE_TYPE', reason: `Source type "${raw.source_type}" is not recognized.`, suggestedFix: `Suggested type: ${suggestType(raw)}.` });

  const risk = num(raw.baseline_risk_1_5 ?? '');
  if (risk != null && (risk < 1 || risk > 5)) errs.push({ code: 'BAD_RISK_SCORE', reason: 'baseline_risk_1_5 must be between 1 and 5.', suggestedFix: 'Use a value 1–5 (or leave blank).' });
  const interval = num(raw.capture_interval_minutes ?? '');
  if (interval != null && interval <= 0) errs.push({ code: 'BAD_INTERVAL', reason: 'capture_interval_minutes must be a positive number.', suggestedFix: 'Use a positive integer (or leave blank).' });

  if (errs.length > 0) return { valid: false, errors: errs.map(formatError), normalized: null };

  const normalized: CandidateInput = {
    sourceName: name, sourceType, category: (raw.category ?? '').trim() || null,
    primaryUrl, feedOrApiUrl: feedUrl, platform: (raw.platform ?? '').trim() || null,
    captureIntervalMinutes: interval, baselineRisk: risk, contentSelector: (raw.content_selector ?? '').trim() || null,
    priority: (raw.priority ?? '').trim() || null, ingestionMode: (raw.ingestion_mode ?? '').trim() || null,
    tags: splitTags(raw.tags ?? ''), description: (raw.description ?? '').trim() || null,
    corroborationRule: (raw.corroboration_rule ?? '').trim() || null, notes: (raw.notes ?? '').trim() || null,
  };
  return { valid: true, errors: [], normalized };
}

export const KNOWN_CSV_COLUMNS = CSV_COLUMNS;

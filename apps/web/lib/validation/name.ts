// =============================================================================
// HSI Security Hotfix — centralized human-name validation (PURE, isomorphic).
//
// ONE validator for every place a person/organization display name is accepted
// (sign up, profile, beta/demo intake, org creation, …). It REJECTS dangerous
// input rather than silently mutating it, and returns a friendly, non-technical
// message plus a machine-readable reason code for server-side logging.
//
// PURITY: no imports, no I/O, no process.env, no Date.now(). Safe to import from
// both client ('use client') and server modules. It never throws.
//
// THREAT MODEL: the field eventually lands in a DB column and is rendered as a
// person's name. React auto-escapes on render, but defense-in-depth means we also
// refuse HTML/script/event-handler/URL-scheme payloads and obvious URL-encoded
// XSS at the input boundary, and we cap length to stop resource/abuse cases.
// =============================================================================

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 60;

/** The single friendly message shown to users for any invalid name. */
export const NAME_VALIDATION_MESSAGE =
  'Please enter a valid name using letters, numbers, spaces, apostrophes, hyphens, or periods.';

/** Machine-readable reason for server logs (never shown raw to the user). */
export type NameRejectReason =
  | 'empty'
  | 'too_short'
  | 'too_long'
  | 'disallowed_char'
  | 'html_like'
  | 'event_handler'
  | 'script_scheme'
  | 'encoded_payload';

export type NameValidationResult =
  | { ok: true; value: string }
  | { ok: false; reason: NameRejectReason; message: string };

// Structural characters that have no place in a human name and are the building
// blocks of HTML/script/template injection. Rejected outright.
// (Includes quotes, brackets, braces, parens, angle brackets, ;, =, backslash,
//  slash and backtick — matching the hotfix spec.)
const FORBIDDEN_CHARS = /[<>{}[\]();=\\/`"]/;

// Allow-list: Unicode letters (\p{L}), marks (\p{M}, for combining accents),
// numbers (\p{N}), space, apostrophe (straight + curly), hyphen, and period.
// Anything outside this set (including control chars / newlines used for email
// header injection, emoji, symbols) is rejected.
const ALLOWED_NAME = /^[\p{L}\p{M}\p{N} '’.\-]+$/u;

// HTML-ish tokens, event handlers, and scripting schemes/sinks. Matched on a
// lower-cased, URL-decoded copy so encoded variants are caught too.
const HTML_LIKE = /<\s*(img|script|svg|iframe|object|embed|a|body|style|link|meta|video|audio|input|form|math|details|template)\b/;
const EVENT_HANDLER = /\bon[a-z]+\s*=/; // onerror=, onload=, onclick=, onmouseover=, …
const SCRIPT_SCHEME = /(javascript:|data:|vbscript:|eval\(|function\(|document\.|window\.|atob\(|settimeout\(|setinterval\()/;

/** Best-effort, non-throwing repeated percent-decode (to unmask %3Cscript%3E etc). */
function safeDecode(input: string): string {
  let current = input;
  for (let i = 0; i < 3; i += 1) {
    if (!current.includes('%')) break;
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      break; // malformed escape — stop; the raw form is still checked separately
    }
  }
  return current;
}

/**
 * Validate a human/display/organization name. Trims first, then enforces length,
 * an allow-list of characters, and explicit denials for HTML / event handlers /
 * scripting schemes / URL-encoded payloads. Returns the trimmed value on success.
 *
 * NOTE: callers decide whether a name is required. For OPTIONAL names, treat an
 * empty input as "skip validation" (see validateOptionalName) — this function
 * always rejects empty.
 */
export function validateName(raw: unknown): NameValidationResult {
  const reject = (reason: NameRejectReason): NameValidationResult => ({
    ok: false,
    reason,
    message: NAME_VALIDATION_MESSAGE,
  });

  if (typeof raw !== 'string') return reject('empty');
  const value = raw.trim();

  if (value.length === 0) return reject('empty');
  if (value.length < NAME_MIN_LENGTH) return reject('too_short');
  if (value.length > NAME_MAX_LENGTH) return reject('too_long');

  // Inspect both the raw (trimmed) value and a URL-decoded copy, lower-cased, so
  // encoded payloads (%3Cscript%3E, %22%3E%3Cimg…) are caught the same as plain.
  const decoded = safeDecode(value);
  const probes = [value.toLowerCase(), decoded.toLowerCase()];

  // If decoding revealed characters that weren't in the original, that alone is
  // suspicious for a name (names don't contain percent-encoding).
  if (decoded !== value && FORBIDDEN_CHARS.test(decoded)) return reject('encoded_payload');

  for (const p of probes) {
    if (HTML_LIKE.test(p)) return reject('html_like');
    if (EVENT_HANDLER.test(p)) return reject('event_handler');
    if (SCRIPT_SCHEME.test(p)) return reject('script_scheme');
  }

  // Structural punctuation / quotes anywhere → reject.
  if (FORBIDDEN_CHARS.test(value) || FORBIDDEN_CHARS.test(decoded)) return reject('disallowed_char');

  // Final allow-list gate (also rejects control chars, newlines, emoji, symbols).
  if (!ALLOWED_NAME.test(value)) return reject('disallowed_char');

  return { ok: true, value };
}

/**
 * Optional-name variant: a blank/undefined input is allowed and returns
 * { ok:true, value:null }. A NON-blank input must pass full validation.
 */
export function validateOptionalName(
  raw: unknown,
): { ok: true; value: string | null } | { ok: false; reason: NameRejectReason; message: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw === 'string' && raw.trim().length === 0) return { ok: true, value: null };
  const res = validateName(raw);
  return res.ok ? { ok: true, value: res.value } : res;
}

/** Convenience boolean for call sites that only need a yes/no. */
export function isValidName(raw: unknown): boolean {
  return validateName(raw).ok;
}

// -----------------------------------------------------------------------------
// Organization name — same injection defenses, slightly broader character set.
// Org names legitimately contain "&" and "," (e.g. "Smith & Co.", "AT&T",
// "University of California, Berkeley") which a personal name never does, and can
// run longer. It shares the EXACT same forbidden-char / HTML / handler / scheme /
// encoded-payload denials so the XSS surface is identical — only the allow-list
// and max length differ. This keeps validation centralized (no separate system).
// -----------------------------------------------------------------------------

export const ORG_NAME_MAX_LENGTH = 100;

// letters/marks/numbers/space plus & , . ' - (and curly apostrophe).
const ALLOWED_ORG_NAME = /^[\p{L}\p{M}\p{N} &,'’.\-]+$/u;

export function validateOrgName(raw: unknown): NameValidationResult {
  const reject = (reason: NameRejectReason): NameValidationResult => ({
    ok: false,
    reason,
    message: ORG_NAME_VALIDATION_MESSAGE,
  });

  if (typeof raw !== 'string') return reject('empty');
  const value = raw.trim();
  if (value.length === 0) return reject('empty');
  if (value.length < NAME_MIN_LENGTH) return reject('too_short');
  if (value.length > ORG_NAME_MAX_LENGTH) return reject('too_long');

  const decoded = safeDecode(value);
  const probes = [value.toLowerCase(), decoded.toLowerCase()];
  if (decoded !== value && FORBIDDEN_CHARS.test(decoded)) return reject('encoded_payload');
  for (const p of probes) {
    if (HTML_LIKE.test(p)) return reject('html_like');
    if (EVENT_HANDLER.test(p)) return reject('event_handler');
    if (SCRIPT_SCHEME.test(p)) return reject('script_scheme');
  }
  if (FORBIDDEN_CHARS.test(value) || FORBIDDEN_CHARS.test(decoded)) return reject('disallowed_char');
  if (!ALLOWED_ORG_NAME.test(value)) return reject('disallowed_char');
  return { ok: true, value };
}

export const ORG_NAME_VALIDATION_MESSAGE =
  'Please enter a valid organization name using letters, numbers, spaces, and basic punctuation (& , . \' -).';

/** Optional org-name variant (blank → { ok:true, value:null }). */
export function validateOptionalOrgName(
  raw: unknown,
): { ok: true; value: string | null } | { ok: false; reason: NameRejectReason; message: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw === 'string' && raw.trim().length === 0) return { ok: true, value: null };
  const res = validateOrgName(raw);
  return res.ok ? { ok: true, value: res.value } : res;
}

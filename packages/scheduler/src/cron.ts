/**
 * @hsi/scheduler — minimal but correct 5-field cron parser.
 *
 * Fields (UTC): minute hour day-of-month month day-of-week
 *   minute      0-59
 *   hour        0-23
 *   day-of-month 1-31
 *   month       1-12
 *   day-of-week 0-6 (0 = Sunday; 7 is normalised to 0)
 *
 * Supported per field: `*`, single value, lists `1,2,3`, ranges `1-5`,
 * steps `* /5` and `1-30/2`.
 *
 * Macros: `@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`/`@annually`,
 * and `@every_Nm` / `@every_Nh` (e.g. `@every_15m`, `@every_2h`).
 *
 * Everything is pure and UTC-based; iteration is bounded so `nextRunAfter`
 * always terminates. Throws {@link CronParseError} on malformed input.
 */

/** Thrown for any malformed cron expression. */
export class CronParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CronParseError';
  }
}

/** Parsed cron specification: explicit allowed values per field (UTC). */
export interface CronSpec {
  /** Original (post-macro-expansion) expression. */
  expression: string;
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
  /** True when day-of-month was `*` (affects DOM/DOW OR semantics). */
  domStar: boolean;
  /** True when day-of-week was `*`. */
  dowStar: boolean;
}

interface FieldRange {
  min: number;
  max: number;
  name: string;
}

const RANGES: Record<'minute' | 'hour' | 'dom' | 'month' | 'dow', FieldRange> = {
  minute: { min: 0, max: 59, name: 'minute' },
  hour: { min: 0, max: 23, name: 'hour' },
  dom: { min: 1, max: 31, name: 'day-of-month' },
  month: { min: 1, max: 12, name: 'month' },
  dow: { min: 0, max: 6, name: 'day-of-week' },
};

const MACROS: Record<string, string> = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
};

/** Expand a `@every_Nm` / `@every_Nh` macro into a 5-field expression. */
function expandEveryMacro(token: string): string | null {
  const m = /^@every_(\d+)(m|h)$/.exec(token);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  if (!Number.isInteger(n) || n <= 0) {
    throw new CronParseError(`invalid interval in macro "${token}"`);
  }
  if (unit === 'm') {
    if (n > 59) {
      throw new CronParseError(
        `@every minute interval must be 1-59, got ${n}`,
      );
    }
    return `*/${n} * * * *`;
  }
  // hours
  if (n > 23) {
    throw new CronParseError(`@every hour interval must be 1-23, got ${n}`);
  }
  return `0 */${n} * * *`;
}

/** Parse one cron field into the set of allowed integer values. */
function parseField(raw: string, range: FieldRange): {
  values: Set<number>;
  isStar: boolean;
} {
  const out = new Set<number>();
  let sawStar = false;
  const parts = raw.split(',');
  if (parts.length === 0 || raw.trim() === '') {
    throw new CronParseError(`empty ${range.name} field`);
  }

  for (const partRaw of parts) {
    const part = partRaw.trim();
    if (part === '') {
      throw new CronParseError(`empty list item in ${range.name} field`);
    }

    let stepStr: string | undefined;
    let rangeStr = part;
    const slash = part.indexOf('/');
    if (slash !== -1) {
      rangeStr = part.slice(0, slash);
      stepStr = part.slice(slash + 1);
    }

    let step = 1;
    if (stepStr !== undefined) {
      step = Number(stepStr);
      if (!Number.isInteger(step) || step <= 0) {
        throw new CronParseError(
          `invalid step "${stepStr}" in ${range.name} field`,
        );
      }
    }

    let lo: number;
    let hi: number;
    if (rangeStr === '*') {
      sawStar = true;
      lo = range.min;
      hi = range.max;
    } else if (rangeStr.includes('-')) {
      const [aStr, bStr] = rangeStr.split('-');
      lo = Number(aStr);
      hi = Number(bStr);
      if (!Number.isInteger(lo) || !Number.isInteger(hi)) {
        throw new CronParseError(
          `invalid range "${rangeStr}" in ${range.name} field`,
        );
      }
    } else {
      lo = Number(rangeStr);
      hi = lo;
      if (!Number.isInteger(lo)) {
        throw new CronParseError(
          `invalid value "${rangeStr}" in ${range.name} field`,
        );
      }
    }

    // Normalise day-of-week 7 -> 0 (Sunday).
    if (range.name === 'day-of-week') {
      if (lo === 7) lo = 0;
      if (hi === 7) hi = 0;
    }

    if (lo < range.min || hi > range.max || lo > hi) {
      throw new CronParseError(
        `value out of range in ${range.name} field: "${part}" (allowed ${range.min}-${range.max})`,
      );
    }

    for (let v = lo; v <= hi; v += step) out.add(v);
  }

  if (out.size === 0) {
    throw new CronParseError(`no values produced for ${range.name} field`);
  }
  return { values: out, isStar: sawStar && parts.length === 1 };
}

/** Parse a cron expression (or macro) into a {@link CronSpec}. */
export function parseCron(expr: string): CronSpec {
  if (typeof expr !== 'string' || expr.trim() === '') {
    throw new CronParseError('empty cron expression');
  }
  let normalized = expr.trim();

  if (normalized.startsWith('@')) {
    const everyExpansion = expandEveryMacro(normalized);
    if (everyExpansion) {
      normalized = everyExpansion;
    } else if (MACROS[normalized]) {
      normalized = MACROS[normalized];
    } else {
      throw new CronParseError(`unknown macro "${expr}"`);
    }
  }

  const fields = normalized.split(/\s+/);
  if (fields.length !== 5) {
    throw new CronParseError(
      `expected 5 fields, got ${fields.length} in "${expr}"`,
    );
  }

  const minute = parseField(fields[0], RANGES.minute);
  const hour = parseField(fields[1], RANGES.hour);
  const dom = parseField(fields[2], RANGES.dom);
  const month = parseField(fields[3], RANGES.month);
  const dow = parseField(fields[4], RANGES.dow);

  return {
    expression: normalized,
    minute: minute.values,
    hour: hour.values,
    dayOfMonth: dom.values,
    month: month.values,
    dayOfWeek: dow.values,
    domStar: fields[2].trim() === '*',
    dowStar: fields[4].trim() === '*',
  };
}

/** Does the given UTC date-time match the spec (to the minute)? */
function matches(spec: CronSpec, d: Date): boolean {
  if (!spec.minute.has(d.getUTCMinutes())) return false;
  if (!spec.hour.has(d.getUTCHours())) return false;
  if (!spec.month.has(d.getUTCMonth() + 1)) return false;

  const domMatch = spec.dayOfMonth.has(d.getUTCDate());
  const dowMatch = spec.dayOfWeek.has(d.getUTCDay());

  // Standard cron semantics: if both DOM and DOW are restricted, the entry
  // matches when EITHER matches; otherwise the restricted one must match.
  if (!spec.domStar && !spec.dowStar) {
    return domMatch || dowMatch;
  }
  if (!spec.domStar) return domMatch;
  if (!spec.dowStar) return dowMatch;
  return true; // both star
}

const MAX_LOOKAHEAD_MINUTES = 366 * 24 * 60;

/**
 * Return the ISO timestamp of the next minute strictly after `afterISO` that
 * matches `expr`. Bounded to ~366 days of look-ahead so it always terminates.
 *
 * @throws CronParseError if the expression is invalid.
 * @throws RangeError if `afterISO` is not a valid timestamp or no match is
 *         found within the look-ahead window.
 */
export function nextRunAfter(expr: string, afterISO: string): string {
  const spec = parseCron(expr);
  const startMs = Date.parse(afterISO);
  if (Number.isNaN(startMs)) {
    throw new RangeError(`nextRunAfter: invalid ISO timestamp "${afterISO}"`);
  }

  // Advance to the start of the next minute (strictly after `after`).
  const d = new Date(startMs);
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(d.getUTCMinutes() + 1);

  for (let i = 0; i < MAX_LOOKAHEAD_MINUTES; i++) {
    if (matches(spec, d)) {
      return d.toISOString();
    }
    d.setUTCMinutes(d.getUTCMinutes() + 1);
  }
  throw new RangeError(
    `nextRunAfter: no match for "${expr}" within ${MAX_LOOKAHEAD_MINUTES} minutes`,
  );
}

/**
 * Is the rule due at `atISO`? True when `atISO` matches the cron schedule and
 * (when `lastRunISO` is provided) we have not already run for the matching
 * minute. Pure.
 */
export function isDue(expr: string, atISO: string, lastRunISO?: string): boolean {
  const spec = parseCron(expr);
  const atMs = Date.parse(atISO);
  if (Number.isNaN(atMs)) {
    throw new RangeError(`isDue: invalid ISO timestamp "${atISO}"`);
  }
  const at = new Date(atMs);
  if (!matches(spec, at)) return false;

  if (lastRunISO !== undefined) {
    const lastMs = Date.parse(lastRunISO);
    if (!Number.isNaN(lastMs)) {
      // Truncate both to the minute; if we already ran this minute, not due.
      const atMinute = Math.floor(atMs / 60000);
      const lastMinute = Math.floor(lastMs / 60000);
      if (lastMinute >= atMinute) return false;
    }
  }
  return true;
}

function listSummary(values: Set<number>, max: number): string {
  if (values.size === max + 1 || values.size === max) return 'every';
  return Array.from(values)
    .sort((a, b) => a - b)
    .join(',');
}

/** Produce a short human-readable description of a cron expression. */
export function describeCron(expr: string): string {
  const spec = parseCron(expr);
  const min = listSummary(spec.minute, 59);
  const hr = listSummary(spec.hour, 23);
  const parts: string[] = [];

  if (min === 'every') parts.push('every minute');
  else parts.push(`at minute ${min}`);

  if (hr !== 'every') parts.push(`of hour ${hr}`);

  if (!spec.domStar) {
    parts.push(
      `on day-of-month ${Array.from(spec.dayOfMonth).sort((a, b) => a - b).join(',')}`,
    );
  }
  if (spec.month.size !== 12) {
    parts.push(
      `in month ${Array.from(spec.month).sort((a, b) => a - b).join(',')}`,
    );
  }
  if (!spec.dowStar) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    parts.push(
      `on ${Array.from(spec.dayOfWeek).sort((a, b) => a - b).map((d) => days[d]).join(',')}`,
    );
  }
  return parts.join(' ');
}

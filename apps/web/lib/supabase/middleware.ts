// =============================================================================
// Supabase session refresh for Next.js middleware (@supabase/ssr).
//
// `updateSession(request)` follows the official @supabase/ssr App Router
// middleware pattern: it creates a server client wired to read/write cookies on
// BOTH the request and the response, calls `supabase.auth.getUser()` to refresh
// the (possibly expired) session, and returns the response carrying the
// refreshed cookies. The root middleware then layers route protection on top.
//
// Env-tolerant: never throws on empty Supabase env (the sandbox). getUser() is
// wrapped in try/catch so an unconfigured/unreachable backend yields a null user
// (anonymous) instead of a 500.
// =============================================================================

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseUrl } from './env';

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

export interface UpdateSessionResult {
  /** The response carrying any refreshed Supabase auth cookies. */
  response: NextResponse;
  /** The authenticated user for this request, or null when anonymous. */
  user: User | null;
}

export async function updateSession(
  request: NextRequest,
): Promise<UpdateSessionResult> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        // Write to the request (so downstream sees fresh cookies) and rebuild
        // the response with the same cookies attached — the documented pattern.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // IMPORTANT: do not run code between createServerClient and getUser() — this
  // call is what refreshes the auth token and triggers the setAll cookie writes.
  let user: User | null = null;
  try {
    const {
      data: { user: refreshed },
    } = await supabase.auth.getUser();
    user = refreshed ?? null;
  } catch {
    user = null;
  }

  return { response, user };
}

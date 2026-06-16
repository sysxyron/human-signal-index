// =============================================================================
// HSI Phase 41 — Compliance export endpoint (Deliverable L). ADMIN-ONLY.
//
//   GET /api/admin/compliance/export?type=<export_type>&format=csv|json
//
// Admin gating + audit are enforced inside generateExport() (requireAdmin reads
// the cookie session; every export is logged to compliance_audit_exports +
// security_audit_events). Output is guardrail-checked (no certification claim can
// ship). No service-role key in client code. force-dynamic, nodejs runtime.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { generateExport } from '@/lib/compliance/persistence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') ?? '';
  const format = (searchParams.get('format') ?? 'csv').toLowerCase();
  if (format !== 'csv' && format !== 'json') {
    return NextResponse.json({ ok: false, error: 'format must be csv or json.' }, { status: 400 });
  }

  const res = await generateExport(type, format);
  if (!res.ok) {
    const status = res.code === 'AUTH_REQUIRED' ? 401 : res.code === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json({ ok: false, error: res.error }, { status });
  }

  return new NextResponse(res.data.body, {
    status: 200,
    headers: {
      'content-type': res.data.contentType,
      'content-disposition': `attachment; filename="${res.data.filename}"`,
      'cache-control': 'no-store',
    },
  });
}

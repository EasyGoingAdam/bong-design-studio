import { NextRequest, NextResponse } from 'next/server';
import { cfpFetch, getCfpConfig } from '@/lib/cfp-client';

/**
 * Proxy: GET /api/cfp/designs.csv?...
 *
 * Streams a CSV export of designs. Same filters as /designs (status,
 * source, glycerinColor, q, submittedOnly, since, until, sort, order)
 * — passed straight through. Useful for ops audits + ad-hoc reporting
 * (paste into spreadsheet, run pivot tables).
 */
export async function GET(req: NextRequest) {
  if (!getCfpConfig()) {
    return NextResponse.json({ error: 'CFP_API_KEY not configured' }, { status: 503 });
  }
  const qs = req.nextUrl.search;
  try {
    const upstream = await cfpFetch(`/designs.csv${qs}`);
    if (!upstream.ok) {
      const errBody = await upstream.text();
      return new NextResponse(errBody, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const disposition = upstream.headers.get('content-disposition')
      || `attachment; filename="cfp-designs-${new Date().toISOString().slice(0, 10)}.csv"`;
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': disposition,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Stream failed' },
      { status: 502 }
    );
  }
}

import { NextResponse } from 'next/server';
import { getShipstationToken } from '@/lib/shipstation';

// GET /api/production/shipstation/status — whether a token is configured.
// Never returns the token itself.
export async function GET() {
  try {
    const token = await getShipstationToken();
    return NextResponse.json({ configured: !!token });
  } catch {
    return NextResponse.json({ configured: false });
  }
}

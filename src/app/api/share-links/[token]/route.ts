import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Revoke (or update) a share link by its token. Only the studio team
 * authenticated against the workflow board hits this endpoint.
 *   DELETE — soft-delete via revoked=true
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { error } = await supabaseAdmin
    .from('share_links')
    .update({ revoked: true })
    .eq('token', token);

  if (error) {
    console.error('Share link revoke failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

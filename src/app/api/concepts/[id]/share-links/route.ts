import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Manage share links for a concept.
 *
 *   POST   /api/concepts/[id]/share-links  — mint a new public token
 *   GET    /api/concepts/[id]/share-links  — list all share links
 *
 * The token is the public identifier — we use 32 hex chars (16 bytes)
 * which is more than enough entropy. Store untouched in the DB; the
 * public URL becomes /preview/<token>.
 */

function newToken(): string {
  return randomBytes(16).toString('hex');
}

interface CreateBody {
  expiresInDays?: number;     // optional expiry — defaults to no expiry
  allowComments?: boolean;     // defaults to true
  titleOverride?: string;      // optional public title (overrides concept name)
  createdBy?: string;          // designer name
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: CreateBody = {};
  try {
    body = await request.json();
  } catch {
    /* allow empty body */
  }

  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data, error } = await supabaseAdmin
    .from('share_links')
    .insert({
      concept_id: id,
      token: newToken(),
      created_by: body.createdBy || '',
      expires_at: expiresAt,
      allow_comments: body.allowComments ?? true,
      title_override: body.titleOverride || '',
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Share link create failed:', error);
    return NextResponse.json({ error: error?.message || 'Failed to create share link' }, { status: 500 });
  }

  return NextResponse.json(serialize(data), { status: 201 });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from('share_links')
    .select('*')
    .eq('concept_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Share link list failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json((data ?? []).map(serialize));
}

function serialize(row: Record<string, unknown>) {
  return {
    id: row.id,
    conceptId: row.concept_id,
    token: row.token,
    createdAt: row.created_at,
    createdBy: row.created_by ?? '',
    expiresAt: row.expires_at ?? null,
    viewCount: row.view_count ?? 0,
    revoked: !!row.revoked,
    allowComments: row.allow_comments ?? true,
    titleOverride: row.title_override ?? '',
  };
}

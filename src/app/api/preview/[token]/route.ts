import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * PUBLIC, no-auth endpoint — fetches a sanitized concept preview by
 * share-link token. Increments view_count atomically. Returns 404 for
 * revoked / expired / unknown tokens.
 *
 * The response intentionally contains ONLY the fields a customer should
 * see — no internal metadata (designer, status, mfg notes, ai history,
 * persona reviews). Just: name, hero images, description, marketing
 * story, optional tagline.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const { data: link, error: linkErr } = await supabaseAdmin
    .from('share_links')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (linkErr || !link) {
    return NextResponse.json({ error: 'Preview not found' }, { status: 404 });
  }
  if (link.revoked) {
    return NextResponse.json({ error: 'This preview has been revoked.' }, { status: 410 });
  }
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'This preview has expired.' }, { status: 410 });
  }

  const { data: concept, error: conceptErr } = await supabaseAdmin
    .from('concepts')
    .select('id, name, description, intended_audience, coil_image_url, base_image_url, combined_image_url, product_mockup_url, marketing_graphic_url, marketing_story, marketing_tagline, tags, collection, coil_only')
    .eq('id', link.concept_id)
    .maybeSingle();

  if (conceptErr || !concept) {
    return NextResponse.json({ error: 'Concept not available' }, { status: 404 });
  }

  // Increment view counter — fire and forget
  supabaseAdmin
    .from('share_links')
    .update({ view_count: (link.view_count ?? 0) + 1 })
    .eq('token', token)
    .then(() => undefined);

  // Sanitized payload — public-safe fields only
  return NextResponse.json({
    title: link.title_override || concept.name,
    description: concept.description ?? '',
    intendedAudience: concept.intended_audience ?? '',
    collection: concept.collection ?? '',
    tags: concept.tags ?? [],
    coilOnly: !!concept.coil_only,
    coilImageUrl: concept.coil_image_url ?? '',
    baseImageUrl: concept.base_image_url ?? '',
    combinedImageUrl: concept.combined_image_url ?? '',
    productMockupUrl: concept.product_mockup_url ?? '',
    marketingGraphicUrl: concept.marketing_graphic_url ?? '',
    marketingStory: concept.marketing_story ?? '',
    marketingTagline: concept.marketing_tagline ?? '',
    allowComments: !!link.allow_comments,
    conceptId: concept.id,
  });
}

/**
 * POST — public visitor leaves a comment. Stored in the existing
 * comments table tagged with "External: <name>" so the team can spot
 * external feedback in the concept's Comments tab.
 */
interface CommentBody {
  visitorName?: string;
  visitorEmail?: string;
  text?: string;
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = (await request.json().catch(() => ({}))) as CommentBody;
  if (!body.text?.trim()) {
    return NextResponse.json({ error: 'Comment text required' }, { status: 400 });
  }

  const { data: link } = await supabaseAdmin
    .from('share_links')
    .select('concept_id, allow_comments, revoked, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (!link || link.revoked) return NextResponse.json({ error: 'Preview unavailable' }, { status: 404 });
  if (!link.allow_comments) return NextResponse.json({ error: 'Comments disabled for this preview' }, { status: 403 });
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Preview expired' }, { status: 410 });
  }

  const visitorName = (body.visitorName?.trim() || 'Anonymous').slice(0, 60);
  const visitorEmail = (body.visitorEmail?.trim() || '').slice(0, 120);
  const tagged = visitorEmail
    ? `External: ${visitorName} <${visitorEmail}>`
    : `External: ${visitorName}`;

  const { error } = await supabaseAdmin
    .from('comments')
    .insert({
      concept_id: link.concept_id,
      user_id: 'external',
      user_name: tagged,
      text: body.text.trim().slice(0, 2000),
      created_at: new Date().toISOString(),
    });

  if (error) {
    console.error('External comment insert failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { requireBotKey, BOT_STATUSES } from '@/lib/bot-api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/bot — self-describing manifest for the Grok bot. Also a ping/auth
 * check: a 200 means the key works. Returns the full endpoint contract so the
 * bot can discover what it can read and write.
 */
export async function GET(request: NextRequest) {
  const denied = requireBotKey(request);
  if (denied) return denied;

  const origin = request.nextUrl.origin;
  return NextResponse.json({
    ok: true,
    name: 'Bong Design Studio — Bot API',
    version: 1,
    description:
      'Bulk read/write API so a bot can learn what laser-etched designs sell, create designs, record performance, and approve favorites.',
    auth: 'Authorization: Bearer <BOT_API_KEY>  (or  x-bot-key: <BOT_API_KEY>)',
    statuses: BOT_STATUSES,
    endpoints: {
      'GET /api/bot': 'This manifest + auth check.',
      'GET /api/bot/designs':
        'Bulk export of designs (specs + latest performance). Query: status, collection, updatedSince (ISO), limit (<=500), offset.',
      'POST /api/bot/designs':
        'Bulk create/update designs. { designs: [{ externalId?, id?, name, description?, tags?, status?, coilOnly?, coilImageUrl?, coilDimensions?, source? }] }. Matches on id or externalId.',
      'POST /api/bot/designs/generate':
        'Generate a real coil image for a design and save it. { conceptId? | externalId?, prompt?, size? }.',
      'POST /api/bot/ideas':
        'AI brainstorm laser-etch design ideas. { prompt?, count? (1..12), create? }. create=true also saves them as ideation concepts.',
      'POST /api/bot/performance':
        'Bulk record sales/sell-through/rating. { records: [{ conceptId? | externalId?, unitsSold?, revenue?, sellThroughRate?, rating?, periodStart?, periodEnd?, metrics?, notes? }] }.',
      'GET /api/bot/performance': 'Read recent performance rows. Query: conceptId?, limit.',
      'POST /api/bot/decisions':
        'Bulk approve/rate/highlight/prioritize/archive. { decisions: [{ conceptId? | externalId?, action?, status?, highlighted?, priority?, rating?, notes? }] }. action: approve|ready|manufactured|review|reject|archive|highlight|unhighlight|rate. priority: urgent|high|medium|low.',
      'GET /api/bot/production': 'Read the production queue + machines. Query: status?, limit.',
      'POST /api/bot/production':
        'Create/update production jobs. { jobs: [{ id?, conceptId? | externalId?, title?, status?, priority?, machineId?, scheduledDate?, quantity?, notes? }] }.',
      'GET /api/bot/messages':
        'Pull messages from the manufacturing team. Default = unread human messages (marks them read); ?all=true for the whole thread.',
      'POST /api/bot/messages': 'Reply into the team chat thread. { text, metadata? }.',
    },
    identifiers: {
      conceptId: 'This app\'s design id (uuid).',
      externalId:
        'The bot\'s own product id. Set it on create/update; then reference designs by externalId everywhere.',
    },
    exampleBaseUrl: `${origin}/api/bot`,
  });
}

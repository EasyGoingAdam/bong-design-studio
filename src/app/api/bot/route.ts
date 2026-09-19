import { NextRequest, NextResponse } from 'next/server';
import { requireBotKey, BOT_STATUSES } from '@/lib/bot-api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/bot — self-describing manifest for the Grok bot. Also a ping/auth
 * check: a 200 means the key works. Returns the full endpoint contract so the
 * bot can discover what it can read and write.
 */
export async function GET(request: NextRequest) {
  const denied = await requireBotKey(request);
  if (denied) return denied;

  const origin = request.nextUrl.origin;
  return NextResponse.json({
    ok: true,
    name: 'Bong Design Studio — Bot API',
    version: 1,
    description:
      'Bulk read/write API so a bot can learn what laser-etched designs sell, create designs, record performance, and approve favorites.',
    auth: 'Authorization: Bearer <password>  (or  x-bot-key: <password>). Ask the operator for the password.',
    statuses: BOT_STATUSES,
    endpoints: {
      'GET /api/bot': 'This manifest + auth check.',
      'GET /api/bot/tools': 'The endpoints as an OpenAI/Grok function-calling tools array (register these as tools).',
      'GET /api/bot/stats': 'Studio KPIs: design + production counts, performance totals.',
      'GET /api/bot/search': 'Find designs by name/description/tag. Query: q, limit.',
      'GET /api/bot/calendar': 'Upcoming holidays/events to design drops for. Query: days.',
      'GET /api/bot/designs':
        'Bulk export of designs (specs + latest performance). Query: status, collection, updatedSince (ISO), limit (<=500), offset.',
      'POST /api/bot/designs':
        'Bulk create/update designs (coil AND base). { designs: [{ externalId?, id?, name, description?, tags?, status?, coilOnly?, coilImageUrl?, baseImageUrl?, collection?, coilDimensions?, baseDimensions?, source? }] }. Matches on id or externalId.',
      'GET /api/bot/design':
        'Full deep view of ONE design: fields, coil + base specs, all comments, complete performance history. Query: conceptId? | externalId?.',
      'POST /api/bot/designs/generate':
        'Generate real etch artwork (coil AND/OR base) and save it. { conceptId? | externalId?, part? (coil|base|both, default coil), prompt?, coilPrompt?, basePrompt?, baseShape? (circle|oval|square|rectangle), size? }.',
      'POST /api/bot/designs/variations':
        'Generate several alternative takes on a design to choose from. { conceptId? | externalId?, part? (coil|base), count? (1..6), prompt?, applyIndex? (save one onto the design), size? }.',
      'POST /api/bot/designs/marketing':
        'Generate taglines + product story for a design. { conceptId? | externalId?, apply? }.',
      'POST /api/bot/ideas':
        'AI brainstorm laser-etch design ideas. { prompt?, count? (1..12), create? }. create=true also saves them as ideation concepts.',
      'POST /api/bot/autopilot':
        'Daily design engine: studies best-selling tags + upcoming events, brainstorms N on-trend designs, saves them, and (optionally) generates artwork for coil/base/both. { count? (1..12), generateArt?, part? (coil|base|both), size?, theme?, eventWindowDays? }. Point a daily scheduler here to create designs every day.',
      'POST /api/bot/organize':
        'Bulk-organize the catalog: move designs into collections and add/remove/replace tags. { items: [{ conceptId? | externalId?, collection?, addTags?, removeTags?, setTags?, coilOnly? }] }.',
      'GET /api/bot/tags': 'The catalog\'s tag vocabulary with usage counts. Query: limit.',
      'GET /api/bot/collections': 'Every collection with design counts + status breakdown.',
      'POST /api/bot/performance':
        'Bulk record sales/sell-through/rating + a sell verdict. { records: [{ conceptId? | externalId?, unitsSold?, revenue?, sellThroughRate?, rating?, velocity? (fast|steady|slow|none), sold? (bool), daysToFirstSale?, periodStart?, periodEnd?, metrics?, notes? }] }. velocity/sold/daysToFirstSale are stored as future reference.',
      'GET /api/bot/performance': 'Read recent performance rows. Query: conceptId?, limit.',
      'GET /api/bot/insights':
        'Aggregated "what\'s working": top sellers, top-rated, best sell-through, and which tags/collections perform. Query: topN (<=50).',
      'GET /api/bot/reference':
        'Design reference library keyed by how each design sold: velocity buckets (fast/steady/slow/none) + which tags move quickly, so the bot learns what sells and leans future ideas that way. Query: topN (<=200), velocity (filter to one bucket).',
      'POST /api/bot/decisions':
        'Bulk approve/rate/highlight/prioritize/archive. { decisions: [{ conceptId? | externalId?, action?, status?, highlighted?, priority?, rating?, notes? }] }. action: approve|ready|manufactured|review|reject|archive|highlight|unhighlight|rate. priority: urgent|high|medium|low.',
      'GET /api/bot/production': 'Read the production queue + machines. Query: status?, limit.',
      'POST /api/bot/production':
        'Create/update/drive production jobs — mirrors the Production cockpit the tech uses. { jobs: [{ id?, conceptId? | externalId?, title?, status?, action? (start|resume|pause|complete|hold|rework|schedule|backlog), priority?, machineId?, scheduledDate?, quantity?, quantityCompleted?, quantityFailed?, qcResult? (pass|fail), qcNotes?, reworkReason?, holdReason?, notes? }] }.',
      'GET /api/bot/comments': 'Read notes on a design. Query: conceptId? | externalId?.',
      'POST /api/bot/comments': 'Leave a note on a design (visible to the team). { conceptId? | externalId?, text, author? }.',
      'GET /api/bot/messages':
        'Pull messages from the manufacturing team. Default = unread human messages (marks them read); ?all=true for the whole thread.',
      'POST /api/bot/messages': 'Reply into the team chat thread. { text, metadata? }.',
    },
    webhook:
      'Set BOT_WEBHOOK_URL to receive instant POSTs (with Authorization: Bearer <password>). Events: { type: "chat.message", message } when the team sends a message; { type: "design.approved", conceptId, status } on approval; { type: "production.completed", jobId } when a job finishes. Otherwise poll GET /api/bot/messages.',
    identifiers: {
      conceptId: 'This app\'s design id (uuid).',
      externalId:
        'The bot\'s own product id. Set it on create/update; then reference designs by externalId everywhere.',
    },
    exampleBaseUrl: `${origin}/api/bot`,
  });
}

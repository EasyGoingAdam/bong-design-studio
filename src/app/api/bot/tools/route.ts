import { NextRequest, NextResponse } from 'next/server';
import { requireBotKey } from '@/lib/bot-api';

export const dynamic = 'force-dynamic';

type Props = Record<string, { type: string; description?: string; enum?: string[] }>;

function tool(name: string, method: string, path: string, description: string, properties: Props, required: string[] = []) {
  return {
    type: 'function',
    // Tell the operator how to execute the call.
    endpoint: { method, path },
    function: {
      name,
      description: `${description} (HTTP ${method} ${path})`,
      parameters: { type: 'object', properties, required },
    },
  };
}

const idRef: Props = {
  conceptId: { type: 'string', description: 'Studio design id (uuid).' },
  externalId: { type: 'string', description: "The bot's own product id." },
};

/**
 * GET /api/bot/tools — the endpoints as an OpenAI/Grok function-calling tools
 * array, so the bot can register them as structured tools. Each entry includes
 * an `endpoint` {method, path} the operator's runner uses to make the HTTP call.
 */
export async function GET(request: NextRequest) {
  const denied = requireBotKey(request);
  if (denied) return denied;

  const tools = [
    tool('get_designs', 'GET', '/api/bot/designs', 'List designs with specs + latest performance.', {
      status: { type: 'string' }, collection: { type: 'string' }, updatedSince: { type: 'string' }, limit: { type: 'number' }, offset: { type: 'number' },
    }),
    tool('search_designs', 'GET', '/api/bot/search', 'Find designs by name/description/tag.', { q: { type: 'string' }, limit: { type: 'number' } }, ['q']),
    tool('create_designs', 'POST', '/api/bot/designs', 'Create/update designs in bulk.', { designs: { type: 'array', description: 'array of { externalId?, id?, name, description?, tags?, status?, coilImageUrl?, coilDimensions? }' } }, ['designs']),
    tool('generate_artwork', 'POST', '/api/bot/designs/generate', 'Generate real coil artwork onto a design.', { ...idRef, prompt: { type: 'string' }, size: { type: 'string', enum: ['1024x1024', '1536x1024', '1024x1536'] } }),
    tool('brainstorm_ideas', 'POST', '/api/bot/ideas', 'AI brainstorm laser-etch design ideas.', { prompt: { type: 'string' }, count: { type: 'number' }, create: { type: 'boolean' } }),
    tool('run_autopilot', 'POST', '/api/bot/autopilot', 'Daily design engine: study what sells + upcoming events, create N on-trend designs, optionally generate artwork. Run once a day.', { count: { type: 'number' }, generateArt: { type: 'boolean' }, size: { type: 'string', enum: ['1024x1024', '1536x1024', '1024x1536'] }, theme: { type: 'string' }, eventWindowDays: { type: 'number' } }),
    tool('generate_marketing', 'POST', '/api/bot/designs/marketing', 'Generate taglines + product story for a design.', { ...idRef, apply: { type: 'boolean' } }),
    tool('record_performance', 'POST', '/api/bot/performance', 'Record sales/sell-through/rating for designs.', { records: { type: 'array', description: 'array of { conceptId?|externalId?, unitsSold?, revenue?, sellThroughRate?, rating?, metrics? }' } }, ['records']),
    tool('get_insights', 'GET', '/api/bot/insights', "Top sellers / top-rated / which tags & collections perform.", { topN: { type: 'number' } }),
    tool('get_reference', 'GET', '/api/bot/reference', 'Design reference library: which designs sold and how fast (fast/steady/slow/none) + which tags move quickly.', { topN: { type: 'number' }, velocity: { type: 'string', enum: ['fast', 'steady', 'slow', 'none'] } }),
    tool('get_stats', 'GET', '/api/bot/stats', 'Studio KPIs: design + production counts, performance totals.', {}),
    tool('make_decisions', 'POST', '/api/bot/decisions', 'Approve / highlight / prioritize / archive designs in bulk.', { decisions: { type: 'array', description: 'array of { conceptId?|externalId?, action?, status?, highlighted?, priority?, rating? }' } }, ['decisions']),
    tool('get_production', 'GET', '/api/bot/production', 'Read the production queue + machines.', { status: { type: 'string' }, limit: { type: 'number' } }),
    tool('update_production', 'POST', '/api/bot/production', 'Create/update production jobs.', { jobs: { type: 'array', description: 'array of { id?, conceptId?|externalId?, title?, status?, priority?, quantity? }' } }, ['jobs']),
    tool('get_calendar', 'GET', '/api/bot/calendar', 'Upcoming holidays/events to design drops for.', { days: { type: 'number' } }),
    tool('get_comments', 'GET', '/api/bot/comments', 'Read notes on a design.', idRef),
    tool('add_comment', 'POST', '/api/bot/comments', 'Leave a note on a design (visible to the team).', { ...idRef, text: { type: 'string' } }, ['text']),
    tool('get_messages', 'GET', '/api/bot/messages', 'Pull chat messages from the team (marks unread as read).', { all: { type: 'boolean' } }),
    tool('send_message', 'POST', '/api/bot/messages', 'Reply into the team chat thread.', { text: { type: 'string' } }, ['text']),
  ];

  return NextResponse.json({
    baseUrl: request.nextUrl.origin,
    auth: 'Send Authorization: Bearer <BOT_API_KEY> with every call. GET params go in the query string; POST params in the JSON body.',
    tools,
  });
}

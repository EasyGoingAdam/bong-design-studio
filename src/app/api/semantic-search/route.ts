import { NextRequest, NextResponse } from 'next/server';

/**
 * Natural-language semantic search over the concept library.
 *
 * Front-end sends the query + a trimmed list of concepts (bare essentials
 * only — we can't fit every field within context). GPT-4o-mini scores each
 * 0-10 and returns matches with short reasons. We drop anything scoring <5.
 */
const SYSTEM = `You are helping a design team search their B&W laser-etch concept library.

Given a natural-language query and a list of concepts, score each concept 0-10 on how well it matches the query's intent:
- 9-10: strong direct match (query language matches concept language)
- 6-8: partial / thematic match (same mood, theme family, or aesthetic)
- 3-5: loose tangential match
- 0-2: no meaningful match (exclude entirely)

Return ONLY this JSON:
{
  "matches": [
    { "id": "<concept id verbatim>", "score": <integer 0-10>, "reason": "<one short sentence>" }
  ]
}

Rules:
- Only include concepts scoring >= 5
- Order by score descending
- Use the concept id VERBATIM as given — never modify it
- Keep "reason" to one short sentence`;

interface TrimmedConcept {
  id: string;
  name: string;
  desc: string;
  tags: string[];
  style: string;
  theme: string;
  audience: string;
  status: string;
}

export async function POST(req: NextRequest) {
  try {
    const { query, concepts, apiKey } = await req.json();
    if (!query?.trim()) {
      return NextResponse.json({ error: 'query required' }, { status: 400 });
    }
    if (!Array.isArray(concepts) || concepts.length === 0) {
      return NextResponse.json({ matches: [] });
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key required' }, { status: 400 });
    }

    // Cap at 200 to stay within context and keep latency reasonable. If the
    // library gets bigger, we'd want embeddings instead — this is linear.
    const trimmed: TrimmedConcept[] = concepts.slice(0, 200).map((c: Record<string, unknown>) => ({
      id: String(c.id || ''),
      name: String(c.name || ''),
      desc: String(c.description || '').slice(0, 150),
      tags: Array.isArray(c.tags) ? (c.tags as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 10) : [],
      style: String(c.style || ''),
      theme: String(c.theme || ''),
      audience: String(c.audience || '').slice(0, 100),
      status: String(c.status || ''),
    }));

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: `Query: "${query.trim()}"\n\nConcepts:\n${JSON.stringify(trimmed)}`,
          },
        ],
        max_tokens: 1500,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: err?.error?.message || `OpenAI error ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    let parsed: { matches?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Model returned invalid JSON' }, { status: 500 });
    }

    const validIds = new Set(trimmed.map((c) => c.id));
    const matches = Array.isArray(parsed.matches)
      ? parsed.matches
          .filter((m): m is { id: string; score: number; reason: string } => {
            const mm = m as { id?: unknown; score?: unknown; reason?: unknown };
            return typeof mm.id === 'string' && validIds.has(mm.id) && typeof mm.score === 'number';
          })
          .map((m) => ({
            id: m.id,
            score: Math.max(0, Math.min(10, Math.round(m.score))),
            reason: typeof m.reason === 'string' ? m.reason : '',
          }))
          .filter((m) => m.score >= 5)
          .sort((a, b) => b.score - a.score)
      : [];

    return NextResponse.json({ matches });
  } catch (err) {
    console.error('Semantic search error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 }
    );
  }
}

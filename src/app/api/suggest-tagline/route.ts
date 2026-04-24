import { NextRequest, NextResponse } from 'next/server';

/**
 * Generate a short marketing tagline for a concept's marketing graphic.
 * Returns 3 variations so users can pick the one that fits best.
 */
const SYSTEM = `You are a senior copywriter for a premium bong/smoking-accessory brand. You write short, punchy marketing taglines that go on product marketing graphics.

Given a product name, concept description, style, theme, and audience, produce 3 tagline OPTIONS.

Each tagline must:
- Be 2-7 words maximum (these overlay on a product photo)
- Evoke vibe / mood — not spec-sheet descriptions
- Avoid cliché marketing speak ("premium quality", "one of a kind", "unleash your")
- Feel like something Aesop, Hiut Denim, or Tracksmith would write — confident, lowercase-comfortable, a little poetic
- Be distinct from each other in tone

Return ONLY this JSON:
{
  "taglines": [
    "<tagline 1>",
    "<tagline 2>",
    "<tagline 3>"
  ]
}`;

export async function POST(req: NextRequest) {
  try {
    const { productName, description, style, theme, audience, apiKey } = await req.json();
    if (!productName?.trim()) {
      return NextResponse.json({ error: 'productName required' }, { status: 400 });
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key required' }, { status: 400 });
    }

    const userPrompt = [
      `Product name: ${productName}`,
      description ? `Description: ${description}` : '',
      style ? `Style: ${style}` : '',
      theme ? `Theme: ${theme}` : '',
      audience ? `Audience: ${audience}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 300,
        temperature: 0.9,
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
    let parsed: { taglines?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Model returned invalid JSON' }, { status: 500 });
    }

    const taglines = Array.isArray(parsed.taglines)
      ? parsed.taglines
          .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
          .map((t) => t.trim())
          .slice(0, 3)
      : [];

    return NextResponse.json({ taglines });
  } catch (err) {
    console.error('Suggest tagline error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Tagline suggestion failed' },
      { status: 500 }
    );
  }
}

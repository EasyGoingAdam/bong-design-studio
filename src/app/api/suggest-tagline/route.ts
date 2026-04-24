import { NextRequest, NextResponse } from 'next/server';
import { callOpenAIChat, parseJsonResponse, openAIErrorResponse } from '@/lib/openai';

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
    if (!productName?.trim()) return NextResponse.json({ error: 'productName required' }, { status: 400 });

    const userPrompt = [
      `Product name: ${productName}`,
      description ? `Description: ${description}` : '',
      style ? `Style: ${style}` : '',
      theme ? `Theme: ${theme}` : '',
      audience ? `Audience: ${audience}` : '',
    ].filter(Boolean).join('\n');

    const raw = await callOpenAIChat({
      apiKey,
      jsonMode: true,
      maxTokens: 300,
      temperature: 0.9,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userPrompt },
      ],
    });

    const parsed = parseJsonResponse<{ taglines?: unknown }>(raw);
    const taglines = Array.isArray(parsed.taglines)
      ? parsed.taglines
          .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
          .map((t) => t.trim())
          .slice(0, 3)
      : [];

    return NextResponse.json({ taglines });
  } catch (err) {
    const { body, status } = openAIErrorResponse(err);
    console.error('Suggest tagline error:', err);
    return NextResponse.json(body, { status });
  }
}

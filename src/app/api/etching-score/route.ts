import { NextRequest, NextResponse } from 'next/server';

/**
 * Score a generated image for laser-etching viability on glass.
 * Uses GPT-4o-mini with vision. Returns score 1-10 + specific issues + strengths.
 * This is a one-shot check — not cached server-side.
 */
const SYSTEM = `You are a laser-etching production expert reviewing a black-and-white design intended for laser etching on glass.

Score the image 1-10 on how production-ready it is for laser etching. Be HONEST and SPECIFIC.

VIABILITY CRITERIA (penalize heavily when broken):
- Pure black on pure white only — NO gray wash, NO shading, NO color
- Solid continuous lines, no broken or dotted edges
- Line weights ≥ 0.3mm at actual print size (thicker is safer)
- Negative space between elements ≥ 0.4mm
- No micro-details that won't resolve at etch size
- Strong silhouette and clear focal hierarchy
- No gradients, halftones, or photographic shading
- Artwork fills frame edge-to-edge (no borders, no padding)

Return ONLY this JSON:
{
  "score": <integer 1-10>,
  "issues": [<1-3 short specific problems, reference WHERE in the image>],
  "strengths": [<1-2 short things it does well>]
}

Example issues: "Top-right corner has gray wash that won't resolve", "Hatching between leaves is under 0.3mm", "Outer border creates padding — remove it".
Example strengths: "Strong silhouette with clear focal point", "Clean line hierarchy throughout".`;

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, apiKey } = await req.json();
    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key required' }, { status: 400 });
    }
    if (imageUrl.startsWith('data:')) {
      return NextResponse.json(
        { error: 'Image must be a public URL, not a data URI. Save the concept first so it uploads to storage.' },
        { status: 400 }
      );
    }

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
            content: [
              { type: 'text', text: 'Score this image for laser-etching production viability.' },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 400,
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
    let parsed: { score?: number; issues?: unknown; strengths?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Model returned invalid JSON' }, { status: 500 });
    }

    const score = Math.max(1, Math.min(10, Math.round(Number(parsed.score) || 5)));
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.filter((s): s is string => typeof s === 'string').slice(0, 3)
      : [];
    const strengths = Array.isArray(parsed.strengths)
      ? parsed.strengths.filter((s): s is string => typeof s === 'string').slice(0, 2)
      : [];

    return NextResponse.json({ score, issues, strengths });
  } catch (err) {
    console.error('Etching score error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scoring failed' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';

/**
 * Suggest 4 contextual, image-specific edits for a laser-etch design.
 * Used by the Edit Image modal to populate dynamic chips above the static ones.
 */
const SYSTEM = `You are a laser-etch art director reviewing a specific black-and-white design image.

Suggest EXACTLY 4 concrete, actionable edits that would improve THIS image for laser etching on glass.

Rules:
- Reference what you actually see (mention specific areas, subjects, zones)
- Each suggestion must be a complete instruction that an image-edit model can follow
- Focus on engraving production problems: gray washes, fine detail that won't resolve, weak contrast, cluttered zones, weak silhouettes, broken lines, borders
- DO NOT suggest adding color — this is pure black and white
- Prefer removals and simplifications over additions

Return ONLY this JSON:
{
  "suggestions": [
    { "label": "<3-5 word chip label, imperative>", "prompt": "<full instruction referencing the image>" },
    ... (exactly 4 items)
  ]
}

Example label: "Clean top-right noise"
Example prompt: "Remove the speckled noise texture in the top-right corner and replace with clean negative space."`;

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
        { error: 'Image must be a public URL. Save the concept first.' },
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
              { type: 'text', text: 'Suggest 4 specific edits that would make this design more production-ready for laser etching.' },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 600,
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
    let parsed: { suggestions?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Model returned invalid JSON' }, { status: 500 });
    }

    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .filter((s): s is { label: string; prompt: string } => {
            return !!s && typeof (s as { label?: unknown }).label === 'string' && typeof (s as { prompt?: unknown }).prompt === 'string';
          })
          .slice(0, 4)
      : [];

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error('Suggest edits error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Suggestion failed' },
      { status: 500 }
    );
  }
}

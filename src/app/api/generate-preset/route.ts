import { NextRequest, NextResponse } from 'next/server';

/**
 * Generate a complete DesignPreset from a natural-language description.
 * Used by the Preset Library's "Generate from description" modal.
 */
const SYSTEM = `You are a design-system expert creating reusable DESIGN PRESETS for a black-and-white laser-etch design studio serving a premium bong brand.

Users describe a style in plain English. You return a complete preset config that prefills a new concept.

Respond with ONLY this JSON (all fields required):
{
  "name": "<2-5 word preset name, Title Case>",
  "description": "<one concise sentence describing the vibe>",
  "category": "<MUST be one of: geometric | floral | celestial | minimalist | cultural | nature | abstract | seasonal | custom>",
  "tags": [<3-5 lowercase single-word or hyphenated tags>],
  "stylePrompt": "<phrase describing visual STYLE — line work, composition approach, aesthetic tradition>",
  "themePrompt": "<phrase describing SUBJECT matter / iconography>",
  "coilInstructions": "<how to compose a rectangular/cylindrical sleeve wrap in this style, one sentence>",
  "baseInstructions": "<how to compose a circular base piece in this style, one sentence>",
  "complexityLevel": <integer 1-5>,
  "relationship": "<MUST be one of: exact_match | mirror | thematic | loose | complementary | contrast | continuation | independent>",
  "patternDensity": "<MUST be one of: low | medium | high | very_high>",
  "intendedAudience": "<one-sentence audience description>"
}

RULES:
- ALL prompts must target pure black-on-white laser-etch output — NO color language, NO gradients, NO photographic terms
- stylePrompt should describe HOW it's drawn (line weight, geometry, art-historical reference)
- themePrompt should describe WHAT is drawn (subject matter)
- Make the preset reusable: avoid one-off specifics; favor language that will generate varied but on-brand concepts`;

export async function POST(req: NextRequest) {
  try {
    const { description, apiKey } = await req.json();
    if (!description?.trim()) {
      return NextResponse.json({ error: 'description required' }, { status: 400 });
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key required' }, { status: 400 });
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Create a preset for: ${description.trim()}` },
        ],
        max_tokens: 900,
        temperature: 0.8,
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
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Model returned invalid JSON' }, { status: 500 });
    }

    // Validate + sanitize every field. Fall back to safe defaults so the UI
    // never receives a half-baked preset that would crash saveUserPreset.
    const validCategories = ['geometric', 'floral', 'celestial', 'minimalist', 'cultural', 'nature', 'abstract', 'seasonal', 'custom'];
    const validRelationships = ['exact_match', 'mirror', 'thematic', 'loose', 'complementary', 'contrast', 'continuation', 'independent'];
    const validDensities = ['low', 'medium', 'high', 'very_high'];

    const category = validCategories.includes(parsed.category as string) ? parsed.category : 'custom';
    const relationship = validRelationships.includes(parsed.relationship as string) ? parsed.relationship : 'thematic';
    const patternDensity = validDensities.includes(parsed.patternDensity as string) ? parsed.patternDensity : 'medium';

    const preset = {
      name: typeof parsed.name === 'string' ? parsed.name : 'Untitled Preset',
      description: typeof parsed.description === 'string' ? parsed.description : '',
      category,
      tags: Array.isArray(parsed.tags)
        ? (parsed.tags as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 5)
        : [],
      stylePrompt: typeof parsed.stylePrompt === 'string' ? parsed.stylePrompt : '',
      themePrompt: typeof parsed.themePrompt === 'string' ? parsed.themePrompt : '',
      coilInstructions: typeof parsed.coilInstructions === 'string' ? parsed.coilInstructions : '',
      baseInstructions: typeof parsed.baseInstructions === 'string' ? parsed.baseInstructions : '',
      complexityLevel: Math.max(1, Math.min(5, Math.round(Number(parsed.complexityLevel) || 3))),
      relationship,
      patternDensity,
      intendedAudience: typeof parsed.intendedAudience === 'string' ? parsed.intendedAudience : '',
    };

    return NextResponse.json({ preset });
  } catch (err) {
    console.error('Generate preset error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 }
    );
  }
}

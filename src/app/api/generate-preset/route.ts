import { NextRequest, NextResponse } from 'next/server';
import { callOpenAIChat, parseJsonResponse, openAIErrorResponse } from '@/lib/openai';

/**
 * Generate a complete DesignPreset from a natural-language description.
 * Used by the Preset Library's "Generate from description" modal.
 */

// Keep these enums in sync with lib/presets.ts + lib/types.ts.
// TODO: pull directly from types if/when we expose enum arrays there.
const VALID_CATEGORIES = ['geometric', 'floral', 'celestial', 'minimalist', 'cultural', 'nature', 'abstract', 'seasonal', 'custom'] as const;
const VALID_RELATIONSHIPS = ['exact_match', 'mirror', 'thematic', 'loose', 'complementary', 'contrast', 'continuation', 'independent'] as const;
const VALID_DENSITIES = ['low', 'medium', 'high', 'very_high'] as const;

const SYSTEM = `You are a design-system expert creating reusable DESIGN PRESETS for a black-and-white laser-etch design studio serving a premium bong brand.

Users describe a style in plain English. You return a complete preset config that prefills a new concept.

Respond with ONLY this JSON (all fields required):
{
  "name": "<2-5 word preset name, Title Case>",
  "description": "<one concise sentence describing the vibe>",
  "category": "<MUST be one of: ${VALID_CATEGORIES.join(' | ')}>",
  "tags": [<3-5 lowercase single-word or hyphenated tags>],
  "stylePrompt": "<phrase describing visual STYLE — line work, composition approach, aesthetic tradition>",
  "themePrompt": "<phrase describing SUBJECT matter / iconography>",
  "coilInstructions": "<how to compose a rectangular/cylindrical sleeve wrap in this style, one sentence>",
  "baseInstructions": "<how to compose a circular base piece in this style, one sentence>",
  "complexityLevel": <integer 1-5>,
  "relationship": "<MUST be one of: ${VALID_RELATIONSHIPS.join(' | ')}>",
  "patternDensity": "<MUST be one of: ${VALID_DENSITIES.join(' | ')}>",
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
    if (!description?.trim()) return NextResponse.json({ error: 'description required' }, { status: 400 });

    const raw = await callOpenAIChat({
      apiKey,
      jsonMode: true,
      maxTokens: 900,
      temperature: 0.8,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Create a preset for: ${description.trim()}` },
      ],
    });

    const parsed = parseJsonResponse<Record<string, unknown>>(raw);

    const category = (VALID_CATEGORIES as readonly string[]).includes(parsed.category as string) ? parsed.category : 'custom';
    const relationship = (VALID_RELATIONSHIPS as readonly string[]).includes(parsed.relationship as string) ? parsed.relationship : 'thematic';
    const patternDensity = (VALID_DENSITIES as readonly string[]).includes(parsed.patternDensity as string) ? parsed.patternDensity : 'medium';

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
    const { body, status } = openAIErrorResponse(err);
    console.error('Generate preset error:', err);
    return NextResponse.json(body, { status });
  }
}

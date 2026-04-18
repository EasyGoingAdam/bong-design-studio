import { NextRequest, NextResponse } from 'next/server';
import { PERSONAS, Persona } from '@/lib/personas';
import { supabaseAdmin } from '@/lib/supabase';

interface ReviewInput {
  apiKey: string;
  conceptId?: string;
  name?: string;
  description?: string;
  style?: string;
  theme?: string;
  tags?: string[];
  coilImageUrl?: string;
  baseImageUrl?: string;
}

interface ManufacturedRef {
  name: string;
  description: string;
  style: string;
  theme: string;
  tags: string[];
}

interface ReviewResult {
  score: number;
  comment: string;
  similarTo?: string; // name of a manufactured design this is similar to, if any
  error?: string;
}

function buildManufacturedContext(manufactured: ManufacturedRef[]): string {
  if (manufactured.length === 0) return '';

  const list = manufactured
    .slice(0, 15) // last 15 manufactured designs is plenty
    .map((m, i) => {
      const tagline = [m.style, m.theme].filter(Boolean).join(' — ');
      const tags = m.tags?.length ? ` [${m.tags.slice(0, 5).join(', ')}]` : '';
      return `${i + 1}. "${m.name}"${tagline ? ' — ' + tagline : ''}${tags}${m.description ? `. ${m.description.slice(0, 160)}` : ''}`;
    })
    .join('\n');

  return `\n\nREFERENCE LIBRARY — designs we have ACTUALLY manufactured recently (these are the ones that made it to production, so you know the team trusts designs in this direction):\n${list}\n\nWhen reviewing the new design, if it is very similar to one of these already-manufactured designs, CALL IT OUT in your comment (e.g. "this feels like a reshuffle of <name>"). Your job is to help catch repetition and push for fresh directions. If the design is genuinely distinct, reward that.\n\nAfter your comment, if it is similar to one of the manufactured designs, include a "similarTo" field in your JSON response with the exact name of the design it resembles. Otherwise omit that field.`;
}

async function reviewWithPersona(
  input: ReviewInput,
  persona: Persona,
  manufacturedContext: string
): Promise<ReviewResult> {
  const contextText = [
    input.name ? `Design name: "${input.name}"` : null,
    input.description ? `Description: ${input.description}` : null,
    input.style ? `Style: ${input.style}` : null,
    input.theme ? `Theme: ${input.theme}` : null,
    input.tags?.length ? `Tags: ${input.tags.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = [
    {
      type: 'text',
      text: contextText
        ? `Here is a laser etching design to review:\n\n${contextText}\n\nScore it 1-10 and give your reaction.`
        : 'Here is a laser etching design to review. Score it 1-10 and give your reaction.',
    },
  ];

  if (input.coilImageUrl && !input.coilImageUrl.startsWith('data:')) {
    userContent.push({ type: 'image_url', image_url: { url: input.coilImageUrl } });
  }
  if (input.baseImageUrl && !input.baseImageUrl.startsWith('data:')) {
    userContent.push({ type: 'image_url', image_url: { url: input.baseImageUrl } });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: persona.systemPrompt + manufacturedContext },
          { role: 'user', content: userContent },
        ],
        temperature: 0.85,
        max_tokens: 250,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { score: 0, comment: '', error: err?.error?.message || `OpenAI error ${response.status}` };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return { score: 0, comment: '', error: 'Empty response' };

    try {
      const parsed = JSON.parse(content);
      const score = Math.max(1, Math.min(10, Number(parsed.score) || 0));
      const comment = String(parsed.comment || '').trim();
      const similarTo = parsed.similarTo ? String(parsed.similarTo).trim() : undefined;
      if (!score || !comment) return { score: 0, comment: '', error: 'Malformed review' };
      return { score, comment, similarTo };
    } catch {
      return { score: 0, comment: '', error: 'Failed to parse review' };
    }
  } catch (err) {
    return { score: 0, comment: '', error: err instanceof Error ? err.message : 'Review failed' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ReviewInput;

    if (!body.apiKey) {
      return NextResponse.json({ error: 'OpenAI API key required' }, { status: 400 });
    }
    if (!body.coilImageUrl && !body.baseImageUrl && !body.description && !body.name) {
      return NextResponse.json({ error: 'Nothing to review' }, { status: 400 });
    }

    // Fetch the latest manufactured designs so personas can compare.
    // Exclude the current concept (if any) so we're not comparing it to itself.
    let manufactured: ManufacturedRef[] = [];
    try {
      const query = supabaseAdmin
        .from('concepts')
        .select('id, name, description, tags, concept_specs(design_style_name, design_theme)')
        .eq('status', 'manufactured')
        .order('updated_at', { ascending: false })
        .limit(20);

      const { data } = await query;
      manufactured = (data || [])
        .filter((c) => c.id !== body.conceptId)
        .map((c) => {
          // concept_specs is returned as array (one-to-one relation)
          const specsArr = c.concept_specs as unknown as Array<{ design_style_name?: string; design_theme?: string }> | null;
          const specs = Array.isArray(specsArr) ? specsArr[0] : specsArr;
          return {
            name: c.name,
            description: c.description || '',
            style: specs?.design_style_name || '',
            theme: specs?.design_theme || '',
            tags: c.tags || [],
          };
        });
    } catch (err) {
      console.error('Failed to load manufactured context:', err);
      // non-fatal — proceed without context
    }

    const manufacturedContext = buildManufacturedContext(manufactured);

    // Run both persona reviews in parallel with shared manufactured context
    const [fan, skeptic] = await Promise.all(
      PERSONAS.map((p) => reviewWithPersona(body, p, manufacturedContext))
    );

    const fingerprint = [body.coilImageUrl || '', body.baseImageUrl || ''].join('|');
    const reviewedAt = new Date().toISOString();

    // Cache the review on the concept if we have a conceptId
    if (body.conceptId) {
      try {
        await supabaseAdmin
          .from('concepts')
          .update({
            persona_reviews: {
              fan,
              skeptic,
              fingerprint,
              reviewedAt,
              manufacturedCount: manufactured.length,
            },
          })
          .eq('id', body.conceptId);
      } catch (err) {
        console.error('Failed to cache review:', err);
      }
    }

    return NextResponse.json({
      fan,
      skeptic,
      reviewedAt,
      manufacturedCount: manufactured.length,
      personas: {
        fan: { name: PERSONAS[0].name, label: PERSONAS[0].label, description: PERSONAS[0].description },
        skeptic: { name: PERSONAS[1].name, label: PERSONAS[1].label, description: PERSONAS[1].description },
      },
    });
  } catch (err) {
    console.error('Review route error:', err);
    return NextResponse.json({ error: 'Failed to review design' }, { status: 500 });
  }
}

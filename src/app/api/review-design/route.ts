import { NextRequest, NextResponse } from 'next/server';
import { PERSONAS, Persona } from '@/lib/personas';

interface ReviewInput {
  apiKey: string;
  name?: string;
  description?: string;
  style?: string;
  theme?: string;
  tags?: string[];
  coilImageUrl?: string;
  baseImageUrl?: string;
}

interface ReviewResult {
  score: number;
  comment: string;
  error?: string;
}

async function reviewWithPersona(input: ReviewInput, persona: Persona): Promise<ReviewResult> {
  const contextText = [
    input.name ? `Design name: "${input.name}"` : null,
    input.description ? `Description: ${input.description}` : null,
    input.style ? `Style: ${input.style}` : null,
    input.theme ? `Theme: ${input.theme}` : null,
    input.tags?.length ? `Tags: ${input.tags.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  // Build multimodal user message. If we have image URLs, include them so GPT-4o can actually see the designs.
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
        model: 'gpt-4o-mini', // vision-capable + cheap
        messages: [
          { role: 'system', content: persona.systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.85,
        max_tokens: 200,
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
      if (!score || !comment) return { score: 0, comment: '', error: 'Malformed review' };
      return { score, comment };
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

    // Run both persona reviews in parallel
    const [fan, skeptic] = await Promise.all(
      PERSONAS.map((p) => reviewWithPersona(body, p))
    );

    return NextResponse.json({
      fan,
      skeptic,
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

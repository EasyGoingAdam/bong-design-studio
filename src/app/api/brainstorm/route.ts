import { NextRequest, NextResponse } from 'next/server';

// Compact system prompt — saves ~40% tokens vs previous version
const SYSTEM_PROMPT = `You brainstorm laser-etched B&W glass product designs. Products have a COIL (cylindrical sleeve) and BASE (circular piece). Designs must work as high-contrast black-and-white artwork.

Respond with JSON: {"concepts": [{"name":"...","collection":"...","description":"2 sentences","theme":"...","style":"...","tags":["..."],"audience":"...","priority":"medium","lifecycle":"evergreen","complexity":3,"density":"medium","coordination":"thematic","coilNotes":"...","baseNotes":"..."}]}

Be creative, diverse, never repeat. Each concept must be completely different.`;

export async function POST(request: NextRequest) {
  try {
    const { prompt, apiKey, count = 3 } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 });
    }

    const seed = Math.random().toString(36).substring(2, 8);
    const userMessage = prompt
      ? `${count} unique concepts for: "${prompt}". All different. [${seed}]`
      : `${count} wildly diverse concepts. Mix different styles/themes/cultures. Surprise me. [${seed}]`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 1.0,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData?.error?.message || `OpenAI API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 });
    }

    let concepts;
    try {
      const parsed = JSON.parse(content);
      concepts = Array.isArray(parsed) ? parsed : (parsed.concepts || []);
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    if (!Array.isArray(concepts) || concepts.length === 0) {
      return NextResponse.json({ error: 'No concepts generated' }, { status: 500 });
    }

    return NextResponse.json({ concepts });
  } catch (error) {
    console.error('Brainstorm error:', error);
    return NextResponse.json({ error: 'Failed to brainstorm concepts' }, { status: 500 });
  }
}

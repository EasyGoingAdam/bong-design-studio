import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `You write short, compelling marketing stories for laser-etched glass product designs. Each story should be 2-3 sentences that feel personal, relatable, and warm — like a friend telling you about something they love.

The story should:
- Tell where the designer found inspiration (travel, nature, culture, personal experience, a feeling)
- Capture a mood or moment that customers can relate to
- Make the reader want to own this piece and make it part of their lifestyle
- Feel authentic, not corporate — conversational and real
- Reference the actual design elements naturally

Write ONLY the story text. No quotes, no labels, no markdown. Just the story.`;

export async function POST(request: NextRequest) {
  try {
    const { conceptName, description, style, theme, tags, audience, apiKey } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 400 });
    }

    const userMessage = `Write a marketing story for this design:
Name: ${conceptName || 'Untitled'}
Description: ${description || 'No description'}
Style: ${style || 'Not specified'}
Theme: ${theme || 'Not specified'}
Tags: ${(tags || []).join(', ') || 'None'}
Audience: ${audience || 'General'}`;

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
        temperature: 0.9,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return NextResponse.json({ error: err?.error?.message || `API error: ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    const story = data.choices?.[0]?.message?.content?.trim();

    if (!story) {
      return NextResponse.json({ error: 'No story generated' }, { status: 500 });
    }

    return NextResponse.json({ story });
  } catch {
    return NextResponse.json({ error: 'Failed to generate story' }, { status: 500 });
  }
}

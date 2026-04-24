import { NextRequest, NextResponse } from 'next/server';
import { callOpenAIChat, openAIErrorResponse } from '@/lib/openai';

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

    const userMessage = `Write a marketing story for this design:
Name: ${conceptName || 'Untitled'}
Description: ${description || 'No description'}
Style: ${style || 'Not specified'}
Theme: ${theme || 'Not specified'}
Tags: ${(tags || []).join(', ') || 'None'}
Audience: ${audience || 'General'}`;

    const story = (
      await callOpenAIChat({
        apiKey,
        maxTokens: 200,
        temperature: 0.9,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      })
    ).trim();

    if (!story) return NextResponse.json({ error: 'No story generated' }, { status: 500 });

    return NextResponse.json({ story });
  } catch (err) {
    const { body, status } = openAIErrorResponse(err);
    console.error('Generate story error:', err);
    return NextResponse.json(body, { status });
  }
}

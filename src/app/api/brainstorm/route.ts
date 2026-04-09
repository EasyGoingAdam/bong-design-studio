import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `You are a creative design director for a brand that makes laser-etched glass products. Each product has two parts:
- COIL: A cylindrical sleeve (45mm tall x 120mm wrap circumference) that wraps around the piece
- BASE: A circular piece (65mm diameter) viewed from above

Designs are laser-etched in black and white onto glass using a laser etching machine. The designs need to work as high-contrast black-and-white artwork suitable for laser etching.

When brainstorming design concepts, consider:
- The coil and base should have a coordinated visual relationship
- Designs range from simple geometric to highly detailed illustrations
- Popular categories: geometric, floral, abstract smoke, snake/creature, patriotic, luxury/baroque, limited edition drops, holiday/seasonal, tribal, psychedelic, minimalist, Japanese-inspired, skull/dark, nature/botanical
- Each concept should have a distinct creative identity and target audience
- Consider production feasibility (very fine details can be hard to etch cleanly)

Return ONLY a valid JSON array. No markdown, no code fences, no explanation. Each object in the array must have exactly these fields:
{
  "name": "short evocative design name",
  "collection": "series/collection name",
  "description": "2-3 sentences describing the visual concept for both coil and base",
  "theme": "one-line theme description",
  "style": "design style name",
  "tags": ["array", "of", "relevant", "tags"],
  "audience": "target audience description",
  "priority": "medium",
  "lifecycle": "evergreen or seasonal or limited_edition",
  "complexity": 3,
  "density": "medium",
  "coordination": "thematic",
  "coilNotes": "specific notes for the coil piece design",
  "baseNotes": "specific notes for the base piece design"
}`;

export async function POST(request: NextRequest) {
  try {
    const { prompt, apiKey, count = 3 } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 });
    }

    // Add randomness seed to ensure different results every time
    const seed = Math.random().toString(36).substring(2, 10);
    const timeStamp = new Date().toISOString();

    const userMessage = prompt
      ? `Generate ${count} unique design concepts inspired by: "${prompt}". Be wildly creative and unexpected. Every concept must be completely different from each other. Seed: ${seed} Time: ${timeStamp}`
      : `Generate ${count} unique and creative design concepts. Be wildly diverse — mix completely different styles, themes, cultures, and aesthetics. Surprise me with original ideas I would never think of. Seed: ${seed} Time: ${timeStamp}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 1.2,
        max_tokens: 3000,
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

    // Parse the JSON response, handling potential markdown code fences
    let concepts;
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      concepts = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response', raw: content }, { status: 500 });
    }

    return NextResponse.json({ concepts });
  } catch (error) {
    console.error('Brainstorm error:', error);
    return NextResponse.json({ error: 'Failed to brainstorm concepts' }, { status: 500 });
  }
}

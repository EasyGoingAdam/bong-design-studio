import { NextRequest, NextResponse } from 'next/server';
import { callOpenAIChat, parseJsonResponse, openAIErrorResponse } from '@/lib/openai';
import { ENGRAVING_RULES } from '@/lib/prompt-builder';

/**
 * Score a generated image for laser-etching viability on glass.
 * Uses GPT-4o-mini with vision. Returns score 1-10 + issues + strengths.
 * One-shot — not cached server-side.
 */
const SYSTEM = `You are a laser-etching production expert reviewing a black-and-white design intended for laser etching on glass.

Score the image 1-10 on how production-ready it is for laser etching. Be HONEST and SPECIFIC.

VIABILITY CRITERIA (penalize heavily when broken):
${ENGRAVING_RULES.forReview.map((r) => `- ${r}`).join('\n')}

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
    if (!imageUrl) return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });
    if (imageUrl.startsWith('data:')) {
      return NextResponse.json(
        { error: 'Image must be a public URL, not a data URI. Save the concept first so it uploads to storage.' },
        { status: 400 }
      );
    }

    const raw = await callOpenAIChat({
      apiKey,
      jsonMode: true,
      maxTokens: 400,
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
    });

    const parsed = parseJsonResponse<{ score?: number; issues?: unknown; strengths?: unknown }>(raw);
    const score = Math.max(1, Math.min(10, Math.round(Number(parsed.score) || 5)));
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.filter((s): s is string => typeof s === 'string').slice(0, 3)
      : [];
    const strengths = Array.isArray(parsed.strengths)
      ? parsed.strengths.filter((s): s is string => typeof s === 'string').slice(0, 2)
      : [];

    return NextResponse.json({ score, issues, strengths });
  } catch (err) {
    const { body, status } = openAIErrorResponse(err);
    console.error('Etching score error:', err);
    return NextResponse.json(body, { status });
  }
}

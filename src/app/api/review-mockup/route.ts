import { NextRequest, NextResponse } from 'next/server';
import { callOpenAIChat, parseJsonResponse, openAIErrorResponse } from '@/lib/openai';

/**
 * Specialized vision review for AI-rendered PRODUCT MOCKUPS.
 *
 * Distinct from /api/etching-score — that one grades a raw design for
 * laser-etch viability. This one grades the rendered *photograph-like* mockup
 * for believability: did the model preserve the product shape, did it apply
 * the design correctly, does it look like real etched glass or like a bad
 * paste-on?
 *
 * Returns a photorealism score, an application-quality score, issues,
 * strengths, and an `autoFixInstruction` — a single concrete sentence that
 * can be fed straight back into /api/mockup-product as `editInstruction` to
 * regenerate with the fix applied.
 */
const SYSTEM = `You are a senior visual QA reviewer for AI-rendered product mockups of laser-etched glass products.

You are looking at a rendered mockup image — an AI-generated photo of a glass product with an etched design applied. Your job is to critique it and give a concrete fix.

Grade on TWO axes 1-10:
1. photorealismScore — does it look like a real photograph of a real product, or does it look like an AI render / illustration?
2. applicationScore — is the etched design applied correctly? Does it follow glass curvature? Is it visible but not overpowering? Does it look like real etched glass?

Be strict. 10 means "ready for a product listing"; 5 means "usable with tweaks"; 3 or below means "regenerate".

Return ONLY this JSON:
{
  "photorealismScore": <integer 1-10>,
  "applicationScore": <integer 1-10>,
  "issues": [<1-4 short specific problems, reference WHERE in the image>],
  "strengths": [<1-2 short things it does well>],
  "autoFixInstruction": "<ONE concrete imperative sentence that would fix the biggest issue, in the same style gpt-image-1 expects — e.g. 'Reduce the opacity of the etched design on the left side so the glass transparency reads through, and sharpen the design edges where they meet the curvature.'>"
}

Example issues:
- "Design appears painted-on, not etched — lacks frost depth"
- "Product shape distorted — neck is thinner than in source"
- "Design is upside-down relative to natural product orientation"
- "Background has weird artifacts in the upper-right corner"

Keep autoFixInstruction under 30 words. Imperative voice.`;

export async function POST(req: NextRequest) {
  try {
    const { mockupUrl, apiKey } = await req.json();
    if (!mockupUrl) return NextResponse.json({ error: 'mockupUrl required' }, { status: 400 });
    if (mockupUrl.startsWith('data:')) {
      return NextResponse.json({ error: 'Mockup must be a public URL (save it first).' }, { status: 400 });
    }

    const raw = await callOpenAIChat({
      apiKey,
      jsonMode: true,
      maxTokens: 500,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Review this product mockup. Be strict.' },
            { type: 'image_url', image_url: { url: mockupUrl } },
          ],
        },
      ],
    });

    const parsed = parseJsonResponse<Record<string, unknown>>(raw);
    const photorealismScore = Math.max(1, Math.min(10, Math.round(Number(parsed.photorealismScore) || 5)));
    const applicationScore = Math.max(1, Math.min(10, Math.round(Number(parsed.applicationScore) || 5)));
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.filter((s): s is string => typeof s === 'string').slice(0, 4)
      : [];
    const strengths = Array.isArray(parsed.strengths)
      ? parsed.strengths.filter((s): s is string => typeof s === 'string').slice(0, 2)
      : [];
    const autoFixInstruction = typeof parsed.autoFixInstruction === 'string' ? parsed.autoFixInstruction : '';

    return NextResponse.json({ photorealismScore, applicationScore, issues, strengths, autoFixInstruction });
  } catch (err) {
    const { body, status } = openAIErrorResponse(err);
    console.error('Review mockup error:', err);
    return NextResponse.json(body, { status });
  }
}

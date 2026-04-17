import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const SYSTEM_PROMPT = `You brainstorm laser-etched B&W glass product designs. Products have a COIL (cylindrical sleeve) and BASE (circular piece). Designs must work as high-contrast black-and-white artwork.

Respond with JSON: {"concepts": [{"name":"...","collection":"...","description":"2 sentences","theme":"...","style":"...","tags":["..."],"audience":"...","priority":"medium","lifecycle":"evergreen","complexity":3,"density":"medium","coordination":"thematic","coilNotes":"...","baseNotes":"..."}]}

Be creative, diverse, never repeat. Each concept must be completely different from the others AND from any concepts listed in the "AVOID" block.`;

export async function POST(request: NextRequest) {
  try {
    const { prompt, apiKey, count = 3 } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 });
    }

    // Fetch existing ideas to exclude duplicates
    const { data: existingIdeas } = await supabaseAdmin
      .from('brainstorm_ideas')
      .select('name')
      .order('created_at', { ascending: false })
      .limit(500); // last 500 to avoid bloating prompt

    const existingNames = (existingIdeas || []).map((r) => r.name).filter(Boolean);

    // Build AVOID block (truncate if huge)
    const avoidList = existingNames.slice(0, 100).join(', ');
    const avoidBlock = avoidList
      ? `\n\nAVOID (do NOT produce concepts with these names or close variations): ${avoidList}`
      : '';

    const seed = Math.random().toString(36).substring(2, 8);
    const requested = Math.min(Math.max(Number(count) || 3, 1), 10);
    const userMessage = prompt
      ? `${requested} unique concepts for: "${prompt}". All different from each other. [${seed}]${avoidBlock}`
      : `${requested} wildly diverse concepts. Mix different styles/themes/cultures. Surprise me. [${seed}]${avoidBlock}`;

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
        max_tokens: 4000,
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
    if (!content) return NextResponse.json({ error: 'No response from AI' }, { status: 500 });

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

    // Client-side dedup: filter out any that match existing names (case-insensitive)
    const existingNamesLower = new Set(existingNames.map((n) => n.toLowerCase().trim()));
    const uniqueConcepts = concepts.filter((c) =>
      c.name && !existingNamesLower.has(String(c.name).toLowerCase().trim())
    );

    // Save unique ones to the archive
    if (uniqueConcepts.length > 0) {
      const rows = uniqueConcepts.map((i) => ({
        name: i.name || 'Untitled',
        collection: i.collection || '',
        description: i.description || '',
        theme: i.theme || '',
        style: i.style || '',
        tags: i.tags || [],
        audience: i.audience || '',
        priority: i.priority || 'medium',
        lifecycle: i.lifecycle || 'evergreen',
        complexity: i.complexity || 3,
        density: i.density || 'medium',
        coordination: i.coordination || 'thematic',
        coil_notes: i.coilNotes || '',
        base_notes: i.baseNotes || '',
        source_prompt: prompt || '',
      }));

      const { data: inserted } = await supabaseAdmin
        .from('brainstorm_ideas')
        .insert(rows)
        .select();

      // Return ideas WITH their db ids so we can mark as used later
      const withIds = (inserted || []).map((row, idx) => ({
        ...uniqueConcepts[idx],
        id: row.id,
      }));
      return NextResponse.json({ concepts: withIds, filteredOut: concepts.length - uniqueConcepts.length });
    }

    return NextResponse.json({ concepts: [], filteredOut: concepts.length });
  } catch (error) {
    console.error('Brainstorm error:', error);
    return NextResponse.json({ error: 'Failed to brainstorm concepts' }, { status: 500 });
  }
}

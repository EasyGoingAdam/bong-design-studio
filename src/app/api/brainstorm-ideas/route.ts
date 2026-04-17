import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

interface DbIdea {
  id: string;
  name: string;
  collection: string;
  description: string;
  theme: string;
  style: string;
  tags: string[];
  audience: string;
  priority: string;
  lifecycle: string;
  complexity: number;
  density: string;
  coordination: string;
  coil_notes: string;
  base_notes: string;
  source_prompt: string;
  used_at: string | null;
  concept_id: string | null;
  created_at: string;
}

function dbToFrontend(row: DbIdea) {
  return {
    id: row.id,
    name: row.name,
    collection: row.collection,
    description: row.description,
    theme: row.theme,
    style: row.style,
    tags: row.tags || [],
    audience: row.audience,
    priority: row.priority,
    lifecycle: row.lifecycle,
    complexity: row.complexity,
    density: row.density,
    coordination: row.coordination,
    coilNotes: row.coil_notes,
    baseNotes: row.base_notes,
    sourcePrompt: row.source_prompt,
    usedAt: row.used_at,
    conceptId: row.concept_id,
    createdAt: row.created_at,
  };
}

// GET all archived brainstorm ideas (newest first)
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('brainstorm_ideas')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json((data || []).map(dbToFrontend));
  } catch {
    return NextResponse.json({ error: 'Failed to fetch brainstorm ideas' }, { status: 500 });
  }
}

// POST a batch of new ideas
export async function POST(request: NextRequest) {
  try {
    const { ideas, sourcePrompt } = await request.json();
    if (!Array.isArray(ideas) || ideas.length === 0) {
      return NextResponse.json({ error: 'No ideas provided' }, { status: 400 });
    }

    const rows = ideas.map((i) => ({
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
      source_prompt: sourcePrompt || '',
    }));

    const { data, error } = await supabaseAdmin
      .from('brainstorm_ideas')
      .insert(rows)
      .select();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json((data || []).map(dbToFrontend));
  } catch {
    return NextResponse.json({ error: 'Failed to save ideas' }, { status: 500 });
  }
}

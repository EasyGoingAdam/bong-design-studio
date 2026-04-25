import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Helper: convert snake_case DB rows -> camelCase frontend Concept type
// ---------------------------------------------------------------------------
export function dbConceptToFrontend(
  concept: Record<string, unknown>,
  specs: Record<string, unknown> | null,
  coilSpecs: Record<string, unknown> | null,
  baseSpecs: Record<string, unknown> | null,
  versions: Record<string, unknown>[],
  comments: Record<string, unknown>[],
  approvals: Record<string, unknown>[],
  generations: Record<string, unknown>[],
  mfgRecord: Record<string, unknown> | null
) {
  return {
    id: concept.id,
    name: concept.name,
    collection: concept.collection,
    status: concept.status,
    createdAt: concept.created_at,
    updatedAt: concept.updated_at,
    designer: concept.designer,
    tags: concept.tags ?? [],
    description: concept.description ?? '',
    intendedAudience: concept.intended_audience ?? '',
    manufacturingNotes: concept.manufacturing_notes ?? '',
    marketingStory: concept.marketing_story ?? '',
    personaReviews: concept.persona_reviews ?? undefined,
    archivedAt: concept.archived_at ?? undefined,
    coilImageUrl: concept.coil_image_url ?? '',
    baseImageUrl: concept.base_image_url ?? '',
    combinedImageUrl: concept.combined_image_url ?? '',
    productPhotoUrl: concept.product_photo_url ?? '',
    marketingGraphicUrl: concept.marketing_graphic_url ?? '',
    marketingTagline: concept.marketing_tagline ?? '',
    blankProductUrl: concept.blank_product_url ?? '',
    productMockupUrl: concept.product_mockup_url ?? '',
    productMockupAngles: Array.isArray(concept.product_mockup_angles) ? concept.product_mockup_angles : [],
    coilOnly: concept.coil_only ?? false,
    source: concept.source ?? '',
    externalId: concept.external_id ?? '',
    externalUrl: concept.external_url ?? '',
    submitterEmail: concept.submitter_email ?? '',
    submitterName: concept.submitter_name ?? '',
    priority: concept.priority ?? 'medium',
    lifecycleType: concept.lifecycle_type ?? 'evergreen',
    specs: specs
      ? {
          designStyleName: specs.design_style_name ?? '',
          designTheme: specs.design_theme ?? '',
          patternDensity: specs.pattern_density ?? 'medium',
          laserComplexity: specs.laser_complexity ?? 3,
          estimatedEtchingTime: specs.estimated_etching_time ?? '',
          surfaceCoverage: specs.surface_coverage ?? 50,
          lineThickness: specs.line_thickness ?? '',
          bwContrastGuidance: specs.bw_contrast_guidance ?? '',
          symmetryRequirement: specs.symmetry_requirement ?? 'none',
          coordinationMode: specs.coordination_mode ?? 'thematic',
          productionFeasibility: specs.production_feasibility ?? 3,
          riskNotes: specs.risk_notes ?? '',
        }
      : {
          designStyleName: '',
          designTheme: '',
          patternDensity: 'medium',
          laserComplexity: 3,
          estimatedEtchingTime: '',
          surfaceCoverage: 50,
          lineThickness: '',
          bwContrastGuidance: '',
          symmetryRequirement: 'none',
          coordinationMode: 'thematic',
          productionFeasibility: 3,
          riskNotes: '',
        },
    coilSpecs: coilSpecs
      ? {
          dimensions: coilSpecs.dimensions ?? '',
          printableArea: coilSpecs.printable_area ?? '',
          notes: coilSpecs.notes ?? '',
        }
      : { dimensions: '', printableArea: '', notes: '' },
    baseSpecs: baseSpecs
      ? {
          dimensions: baseSpecs.dimensions ?? '',
          printableArea: baseSpecs.printable_area ?? '',
          notes: baseSpecs.notes ?? '',
        }
      : { dimensions: '', printableArea: '', notes: '' },
    versions: versions.map((v) => ({
      id: v.id,
      conceptId: v.concept_id,
      versionNumber: v.version_number,
      coilImageUrl: v.coil_image_url ?? '',
      baseImageUrl: v.base_image_url ?? '',
      combinedImageUrl: v.combined_image_url ?? '',
      prompt: v.prompt ?? '',
      notes: v.notes ?? '',
      createdAt: v.created_at,
    })),
    comments: comments.map((c) => ({
      id: c.id,
      conceptId: c.concept_id,
      userId: c.user_name ?? '',
      userName: c.user_name ?? '',
      text: c.text ?? '',
      createdAt: c.created_at,
    })),
    approvalLogs: approvals.map((a) => ({
      id: a.id,
      conceptId: a.concept_id,
      userId: a.user_name ?? '',
      userName: a.user_name ?? '',
      action: a.action,
      fromStage: a.from_stage,
      toStage: a.to_stage,
      notes: a.notes ?? '',
      createdAt: a.created_at,
    })),
    aiGenerations: generations.map((g) => ({
      id: g.id,
      conceptId: g.concept_id,
      prompt: g.prompt ?? '',
      coilPrompt: g.coil_prompt ?? '',
      basePrompt: g.base_prompt ?? '',
      mode: g.mode ?? 'concept_art',
      coilImageUrl: g.coil_image_url ?? '',
      baseImageUrl: g.base_image_url ?? '',
      combinedImageUrl: g.combined_image_url ?? '',
      createdAt: g.created_at,
      variationOf: g.variation_of ?? undefined,
      model: g.model ?? undefined,
      provider: g.provider ?? undefined,
    })),
    manufacturingRecord: mfgRecord
      ? {
          conceptId: mfgRecord.concept_id,
          machineReadyNotes: mfgRecord.machine_ready_notes ?? '',
          targetMaterial: mfgRecord.target_material ?? '',
          etchingSettings: mfgRecord.etching_settings ?? '',
          estimatedProductionTime: mfgRecord.estimated_production_time ?? '',
          batchName: mfgRecord.batch_name ?? '',
          dateSentToProduction: mfgRecord.date_sent_to_production ?? '',
          dateManufactured: mfgRecord.date_manufactured ?? '',
          quantityProduced: mfgRecord.quantity_produced ?? 0,
          qcNotes: mfgRecord.qc_notes ?? '',
        }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// GET /api/concepts  — fetch all concepts with related data
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    // Fetch all concepts
    const { data: concepts, error: conceptsErr } = await supabaseAdmin
      .from('concepts')
      .select('*')
      .order('created_at', { ascending: false });

    if (conceptsErr) {
      return NextResponse.json({ error: conceptsErr.message }, { status: 500 });
    }

    if (!concepts || concepts.length === 0) {
      return NextResponse.json([]);
    }

    const conceptIds = concepts.map((c) => c.id);

    // Parallel fetch all related tables
    const [specsRes, coilRes, baseRes, versionsRes, commentsRes, approvalsRes, gensRes, mfgRes] =
      await Promise.all([
        supabaseAdmin.from('concept_specs').select('*').in('concept_id', conceptIds),
        supabaseAdmin.from('coil_specs').select('*').in('concept_id', conceptIds),
        supabaseAdmin.from('base_specs').select('*').in('concept_id', conceptIds),
        supabaseAdmin.from('concept_versions').select('*').in('concept_id', conceptIds).order('version_number', { ascending: true }),
        supabaseAdmin.from('comments').select('*').in('concept_id', conceptIds).order('created_at', { ascending: true }),
        supabaseAdmin.from('approval_logs').select('*').in('concept_id', conceptIds).order('created_at', { ascending: true }),
        supabaseAdmin.from('ai_generations').select('*').in('concept_id', conceptIds).order('created_at', { ascending: true }),
        supabaseAdmin.from('manufacturing_records').select('*').in('concept_id', conceptIds),
      ]);

    // Index related data by concept_id for O(1) lookup
    const specsMap = new Map((specsRes.data ?? []).map((s) => [s.concept_id, s]));
    const coilMap = new Map((coilRes.data ?? []).map((s) => [s.concept_id, s]));
    const baseMap = new Map((baseRes.data ?? []).map((s) => [s.concept_id, s]));
    const mfgMap = new Map((mfgRes.data ?? []).map((m) => [m.concept_id, m]));

    const groupBy = (rows: Record<string, unknown>[], key: string) => {
      const map = new Map<string, Record<string, unknown>[]>();
      for (const row of rows) {
        const k = row[key] as string;
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(row);
      }
      return map;
    };

    const versionsMap = groupBy(versionsRes.data ?? [], 'concept_id');
    const commentsMap = groupBy(commentsRes.data ?? [], 'concept_id');
    const approvalsMap = groupBy(approvalsRes.data ?? [], 'concept_id');
    const gensMap = groupBy(gensRes.data ?? [], 'concept_id');

    const result = concepts.map((c) =>
      dbConceptToFrontend(
        c,
        specsMap.get(c.id) ?? null,
        coilMap.get(c.id) ?? null,
        baseMap.get(c.id) ?? null,
        versionsMap.get(c.id) ?? [],
        commentsMap.get(c.id) ?? [],
        approvalsMap.get(c.id) ?? [],
        gensMap.get(c.id) ?? [],
        mfgMap.get(c.id) ?? null
      )
    );

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/concepts  — create a new concept
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const now = new Date().toISOString();

    // Insert concept
    const { data: concept, error: conceptErr } = await supabaseAdmin
      .from('concepts')
      .insert({
        name: body.name ?? 'Untitled Concept',
        collection: body.collection ?? '',
        status: body.status ?? 'ideation',
        designer: body.designer ?? '',
        tags: body.tags ?? [],
        description: body.description ?? '',
        intended_audience: body.intendedAudience ?? '',
        manufacturing_notes: body.manufacturingNotes ?? '',
        marketing_story: body.marketingStory ?? '',
        coil_image_url: body.coilImageUrl ?? '',
        base_image_url: body.baseImageUrl ?? '',
        combined_image_url: body.combinedImageUrl ?? '',
        product_photo_url: body.productPhotoUrl ?? '',
        marketing_graphic_url: body.marketingGraphicUrl ?? '',
        marketing_tagline: body.marketingTagline ?? '',
        blank_product_url: body.blankProductUrl ?? '',
        product_mockup_url: body.productMockupUrl ?? '',
        product_mockup_angles: body.productMockupAngles ?? [],
        coil_only: body.coilOnly ?? false,
        source: body.source ?? '',
        external_id: body.externalId ?? '',
        external_url: body.externalUrl ?? '',
        submitter_email: body.submitterEmail ?? '',
        submitter_name: body.submitterName ?? '',
        priority: body.priority ?? 'medium',
        lifecycle_type: body.lifecycleType ?? 'evergreen',
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (conceptErr || !concept) {
      return NextResponse.json({ error: conceptErr?.message ?? 'Failed to create concept' }, { status: 500 });
    }

    const conceptId = concept.id;
    const specs = body.specs ?? {};
    const coilSpecs = body.coilSpecs ?? {};
    const baseSpecs = body.baseSpecs ?? {};

    // Insert specs in parallel
    const [specsRes, coilRes, baseRes] = await Promise.all([
      supabaseAdmin
        .from('concept_specs')
        .insert({
          concept_id: conceptId,
          design_style_name: specs.designStyleName ?? '',
          design_theme: specs.designTheme ?? '',
          pattern_density: specs.patternDensity ?? 'medium',
          laser_complexity: specs.laserComplexity ?? 3,
          estimated_etching_time: specs.estimatedEtchingTime ?? '',
          surface_coverage: specs.surfaceCoverage ?? 50,
          line_thickness: specs.lineThickness ?? '',
          bw_contrast_guidance: specs.bwContrastGuidance ?? '',
          symmetry_requirement: specs.symmetryRequirement ?? 'none',
          coordination_mode: specs.coordinationMode ?? 'thematic',
          production_feasibility: specs.productionFeasibility ?? 3,
          risk_notes: specs.riskNotes ?? '',
        })
        .select()
        .single(),
      supabaseAdmin
        .from('coil_specs')
        .insert({
          concept_id: conceptId,
          dimensions: coilSpecs.dimensions ?? '',
          printable_area: coilSpecs.printableArea ?? '',
          notes: coilSpecs.notes ?? '',
        })
        .select()
        .single(),
      supabaseAdmin
        .from('base_specs')
        .insert({
          concept_id: conceptId,
          dimensions: baseSpecs.dimensions ?? '',
          printable_area: baseSpecs.printableArea ?? '',
          notes: baseSpecs.notes ?? '',
        })
        .select()
        .single(),
    ]);

    const result = dbConceptToFrontend(
      concept,
      specsRes.data,
      coilRes.data,
      baseRes.data,
      [],
      [],
      [],
      [],
      null
    );

    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

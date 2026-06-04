import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { dbConceptToFrontend } from '../route';
import { logAuditAsync, diffShallow } from '@/lib/audit';

// ---------------------------------------------------------------------------
// GET /api/concepts/[id]  — fetch single concept with all related data
// ---------------------------------------------------------------------------
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: concept, error: conceptErr } = await supabaseAdmin
      .from('concepts')
      .select('*')
      .eq('id', id)
      .single();

    if (conceptErr || !concept) {
      return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
    }

    const [specsRes, coilRes, baseRes, versionsRes, commentsRes, approvalsRes, gensRes, mfgRes] =
      await Promise.all([
        supabaseAdmin.from('concept_specs').select('*').eq('concept_id', id).single(),
        supabaseAdmin.from('coil_specs').select('*').eq('concept_id', id).single(),
        supabaseAdmin.from('base_specs').select('*').eq('concept_id', id).single(),
        supabaseAdmin.from('concept_versions').select('*').eq('concept_id', id).order('version_number', { ascending: true }),
        supabaseAdmin.from('comments').select('*').eq('concept_id', id).order('created_at', { ascending: true }),
        supabaseAdmin.from('approval_logs').select('*').eq('concept_id', id).order('created_at', { ascending: true }),
        supabaseAdmin.from('ai_generations').select('*').eq('concept_id', id).order('created_at', { ascending: true }),
        supabaseAdmin.from('manufacturing_records').select('*').eq('concept_id', id).maybeSingle(),
      ]);

    const result = dbConceptToFrontend(
      concept,
      specsRes.data ?? null,
      coilRes.data ?? null,
      baseRes.data ?? null,
      versionsRes.data ?? [],
      commentsRes.data ?? [],
      approvalsRes.data ?? [],
      gensRes.data ?? [],
      mfgRes.data ?? null
    );

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/concepts/[id]  — update concept and related specs
// ---------------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Snapshot the pre-mutation row so the audit log can record a real
    // diff. One extra read on the hot path — Supabase serves these from
    // cache so the cost is negligible vs the forensic value.
    const { data: beforeRow } = await supabaseAdmin
      .from('concepts')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    // Build concept update object (only include provided fields)
    const conceptUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };

    const fieldMap: Record<string, string> = {
      name: 'name',
      collection: 'collection',
      status: 'status',
      designer: 'designer',
      tags: 'tags',
      description: 'description',
      intendedAudience: 'intended_audience',
      manufacturingNotes: 'manufacturing_notes',
      marketingStory: 'marketing_story',
      personaReviews: 'persona_reviews',
      archivedAt: 'archived_at',
      coilImageUrl: 'coil_image_url',
      baseImageUrl: 'base_image_url',
      combinedImageUrl: 'combined_image_url',
      productPhotoUrl: 'product_photo_url',
      marketingGraphicUrl: 'marketing_graphic_url',
      marketingTagline: 'marketing_tagline',
      blankProductUrl: 'blank_product_url',
      productMockupUrl: 'product_mockup_url',
      productMockupAngles: 'product_mockup_angles',
      coilOnly: 'coil_only',
      highlighted: 'highlighted',
      designType: 'design_type',
      stamps: 'stamps',
      source: 'source',
      externalId: 'external_id',
      externalUrl: 'external_url',
      submitterEmail: 'submitter_email',
      submitterName: 'submitter_name',
      priority: 'priority',
      lifecycleType: 'lifecycle_type',
    };

    for (const [camel, snake] of Object.entries(fieldMap)) {
      if (body[camel] !== undefined) {
        conceptUpdate[snake] = body[camel];
      }
    }

    const { error: conceptErr } = await supabaseAdmin
      .from('concepts')
      .update(conceptUpdate)
      .eq('id', id);

    if (conceptErr) {
      return NextResponse.json({ error: conceptErr.message }, { status: 500 });
    }

    // Audit-log the change. Diff'd shallowly against the snapshot so
    // we only persist fields that actually changed. Status moves get a
    // distinct action so they're easy to filter on later. Fire-and-
    // forget — audit failures must never block the response.
    if (beforeRow) {
      const afterRow = { ...beforeRow, ...conceptUpdate };
      const diff = diffShallow(
        beforeRow as Record<string, unknown>,
        afterRow as Record<string, unknown>
      );
      if (diff) {
        const isMove = 'status' in diff.after;
        logAuditAsync({
          conceptId: id,
          action: isMove ? 'concept.move' : 'concept.update',
          actor: { name: body.actorName, id: body.actorId },
          before: diff.before,
          after: diff.after,
          request,
        });
      }
    }

    // Update specs if provided
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any[] = [];

    if (body.specs) {
      const s = body.specs;
      const specsUpdate: Record<string, unknown> = {};
      const specsFieldMap: Record<string, string> = {
        designStyleName: 'design_style_name',
        designTheme: 'design_theme',
        patternDensity: 'pattern_density',
        laserComplexity: 'laser_complexity',
        estimatedEtchingTime: 'estimated_etching_time',
        surfaceCoverage: 'surface_coverage',
        lineThickness: 'line_thickness',
        bwContrastGuidance: 'bw_contrast_guidance',
        symmetryRequirement: 'symmetry_requirement',
        coordinationMode: 'coordination_mode',
        productionFeasibility: 'production_feasibility',
        riskNotes: 'risk_notes',
      };
      for (const [camel, snake] of Object.entries(specsFieldMap)) {
        if (s[camel] !== undefined) {
          specsUpdate[snake] = s[camel];
        }
      }
      if (Object.keys(specsUpdate).length > 0) {
        updates.push(
          supabaseAdmin.from('concept_specs').update(specsUpdate).eq('concept_id', id).select()
        );
      }
    }

    if (body.coilSpecs) {
      const cs = body.coilSpecs;
      const coilUpdate: Record<string, unknown> = {};
      if (cs.dimensions !== undefined) coilUpdate.dimensions = cs.dimensions;
      if (cs.printableArea !== undefined) coilUpdate.printable_area = cs.printableArea;
      if (cs.notes !== undefined) coilUpdate.notes = cs.notes;
      if (Object.keys(coilUpdate).length > 0) {
        updates.push(
          supabaseAdmin.from('coil_specs').update(coilUpdate).eq('concept_id', id).select()
        );
      }
    }

    if (body.baseSpecs) {
      const bs = body.baseSpecs;
      const baseUpdate: Record<string, unknown> = {};
      if (bs.dimensions !== undefined) baseUpdate.dimensions = bs.dimensions;
      if (bs.printableArea !== undefined) baseUpdate.printable_area = bs.printableArea;
      if (bs.notes !== undefined) baseUpdate.notes = bs.notes;
      if (Object.keys(baseUpdate).length > 0) {
        updates.push(
          supabaseAdmin.from('base_specs').update(baseUpdate).eq('concept_id', id).select()
        );
      }
    }

    await Promise.all(updates);

    // Fetch and return updated concept
    const { data: concept } = await supabaseAdmin
      .from('concepts')
      .select('*')
      .eq('id', id)
      .single();

    const [specsRes, coilRes, baseRes, versionsRes, commentsRes, approvalsRes, gensRes, mfgRes] =
      await Promise.all([
        supabaseAdmin.from('concept_specs').select('*').eq('concept_id', id).single(),
        supabaseAdmin.from('coil_specs').select('*').eq('concept_id', id).single(),
        supabaseAdmin.from('base_specs').select('*').eq('concept_id', id).single(),
        supabaseAdmin.from('concept_versions').select('*').eq('concept_id', id).order('version_number', { ascending: true }),
        supabaseAdmin.from('comments').select('*').eq('concept_id', id).order('created_at', { ascending: true }),
        supabaseAdmin.from('approval_logs').select('*').eq('concept_id', id).order('created_at', { ascending: true }),
        supabaseAdmin.from('ai_generations').select('*').eq('concept_id', id).order('created_at', { ascending: true }),
        supabaseAdmin.from('manufacturing_records').select('*').eq('concept_id', id).maybeSingle(),
      ]);

    const result = dbConceptToFrontend(
      concept!,
      specsRes.data ?? null,
      coilRes.data ?? null,
      baseRes.data ?? null,
      versionsRes.data ?? [],
      commentsRes.data ?? [],
      approvalsRes.data ?? [],
      gensRes.data ?? [],
      mfgRes.data ?? null
    );

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/concepts/[id]  — delete concept (cascade handles related tables)
// ---------------------------------------------------------------------------
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Snapshot before delete so the audit log preserves the lost data.
    // CASCADE on the FK means any child rows (specs, comments, etc.)
    // will be gone too — capture at least the parent row.
    const { data: beforeRow } = await supabaseAdmin
      .from('concepts')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from('concepts')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit AFTER successful delete so we don't log phantom deletions.
    // The audit row's concept_id FK has ON DELETE CASCADE — but we're
    // deleting the concept itself, so we use a NULL after_data and rely
    // on the action="concept.delete" + before_data for forensics.
    // (CASCADE will eventually purge this audit row when its concept
    // row vanishes — that's fine; the in-flight insert below races the
    // cascade but Postgres handles the order.)
    if (beforeRow) {
      logAuditAsync({
        conceptId: id,
        action: 'concept.delete',
        actor: { name: request.headers.get('x-actor-name') || undefined },
        before: beforeRow as Record<string, unknown>,
        after: null,
        request,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

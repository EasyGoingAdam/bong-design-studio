import { supabaseAdmin } from './supabase';
import { log } from './log';
import {
  ProductionJob,
  Machine,
  ProductionScheduleDay,
} from './types';

/**
 * Server-side mapping between snake_case DB rows and camelCase frontend
 * types for the manufacturing tables, plus a defensive insert/update that
 * strips columns the production schema is missing (mirrors the concepts
 * route — lets the feature degrade gracefully if the migration lags).
 */

export function dbMachineToFrontend(r: Record<string, unknown>): Machine {
  return {
    id: r.id as string,
    name: (r.name as string) ?? '',
    active: (r.active as boolean) ?? true,
    dailyPieceTarget: (r.daily_piece_target as number) ?? 4,
    dailyHours: Number(r.daily_hours ?? 8),
    notes: (r.notes as string) ?? '',
    position: (r.position as number) ?? 0,
  };
}

export function dbJobToFrontend(r: Record<string, unknown>): ProductionJob {
  return {
    id: r.id as string,
    title: (r.title as string) ?? '',
    sourceType: ((r.source_type as string) ?? 'manual') as ProductionJob['sourceType'],
    sourceId: (r.source_id as string) ?? '',
    conceptId: (r.concept_id as string) ?? undefined,
    orderId: (r.order_id as string) ?? '',
    shipstationOrderId: (r.shipstation_order_id as string) ?? '',
    productType: (r.product_type as string) ?? '',
    sku: (r.sku as string) ?? '',
    quantity: (r.quantity as number) ?? 1,
    complexity: ((r.complexity as string) ?? 'medium') as ProductionJob['complexity'],
    setupComplexity: ((r.setup_complexity as string) ?? 'medium') as ProductionJob['setupComplexity'],
    alignmentDifficulty: ((r.alignment_difficulty as string) ?? 'medium') as ProductionJob['alignmentDifficulty'],
    detailLevel: (r.detail_level as string) ?? 'medium',
    etchingZones: (r.etching_zones as number) ?? 1,
    repeatDesign: (r.repeat_design as boolean) ?? false,
    estimatedSetupMinutes: (r.estimated_setup_minutes as number) ?? 0,
    estimatedRunMinutes: (r.estimated_run_minutes as number) ?? 0,
    estimatedFinishMinutes: (r.estimated_finish_minutes as number) ?? 0,
    estimatedTotalMinutes: (r.estimated_total_minutes as number) ?? 0,
    actualStartTime: (r.actual_start_time as string) ?? undefined,
    actualEndTime: (r.actual_end_time as string) ?? undefined,
    actualTotalMinutes: (r.actual_total_minutes as number) ?? undefined,
    pausedAt: (r.paused_at as string) ?? undefined,
    accumulatedMinutes: (r.accumulated_minutes as number) ?? 0,
    machineId: (r.machine_id as string) ?? undefined,
    operatorId: (r.operator_id as string) ?? '',
    operatorName: (r.operator_name as string) ?? '',
    scheduledDate: (r.scheduled_date as string) ?? undefined,
    scheduledPosition: (r.scheduled_position as number) ?? 0,
    status: ((r.status as string) ?? 'backlog') as ProductionJob['status'],
    priority: ((r.priority as string) ?? 'medium') as ProductionJob['priority'],
    dueDate: (r.due_date as string) ?? undefined,
    shipByDate: (r.ship_by_date as string) ?? undefined,
    orderDate: (r.order_date as string) ?? undefined,
    rush: (r.rush as boolean) ?? false,
    revenueValue: Number(r.revenue_value ?? 0),
    inventoryAvailable: (r.inventory_available as boolean) ?? true,
    designName: (r.design_name as string) ?? '',
    designImageUrl: (r.design_image_url as string) ?? '',
    customerName: (r.customer_name as string) ?? '',
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    notes: (r.notes as string) ?? '',
    designNotes: (r.design_notes as string) ?? '',
    overrideReason: (r.override_reason as string) ?? '',
    lockedScheduleId: (r.locked_schedule_id as string) ?? undefined,
    quantityCompleted: (r.quantity_completed as number) ?? 0,
    quantityFailed: (r.quantity_failed as number) ?? 0,
    reworkReason: (r.rework_reason as string) ?? '',
    scrapCount: (r.scrap_count as number) ?? 0,
    aiConfidence: r.ai_confidence != null ? Number(r.ai_confidence) : undefined,
    aiReasoning: (r.ai_reasoning as string) ?? '',
    createdAt: (r.created_at as string) ?? '',
    updatedAt: (r.updated_at as string) ?? '',
  };
}

export function dbScheduleDayToFrontend(r: Record<string, unknown>): ProductionScheduleDay {
  return {
    id: r.id as string,
    date: r.date as string,
    locked: (r.locked as boolean) ?? false,
    lockedAt: (r.locked_at as string) ?? undefined,
    lockedBy: (r.locked_by as string) ?? '',
    notes: (r.notes as string) ?? '',
    closed: (r.closed as boolean) ?? false,
    closedAt: (r.closed_at as string) ?? undefined,
    closedBy: (r.closed_by as string) ?? '',
    closeout: (r.closeout as ProductionScheduleDay['closeout']) ?? undefined,
    aiSummary: r.ai_summary ?? undefined,
    createdAt: (r.created_at as string) ?? '',
    updatedAt: (r.updated_at as string) ?? '',
  };
}

/** camelCase job patch → snake_case row. Only defined keys are included. */
export function jobToDbRow(j: Partial<ProductionJob>): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => { if (v !== undefined) map[k] = v; };
  set('title', j.title);
  set('source_type', j.sourceType);
  set('source_id', j.sourceId);
  set('concept_id', j.conceptId);
  set('order_id', j.orderId);
  set('shipstation_order_id', j.shipstationOrderId);
  set('product_type', j.productType);
  set('sku', j.sku);
  set('quantity', j.quantity);
  set('complexity', j.complexity);
  set('setup_complexity', j.setupComplexity);
  set('alignment_difficulty', j.alignmentDifficulty);
  set('detail_level', j.detailLevel);
  set('etching_zones', j.etchingZones);
  set('repeat_design', j.repeatDesign);
  set('estimated_setup_minutes', j.estimatedSetupMinutes);
  set('estimated_run_minutes', j.estimatedRunMinutes);
  set('estimated_finish_minutes', j.estimatedFinishMinutes);
  set('estimated_total_minutes', j.estimatedTotalMinutes);
  set('actual_start_time', j.actualStartTime);
  set('actual_end_time', j.actualEndTime);
  set('actual_total_minutes', j.actualTotalMinutes);
  set('paused_at', j.pausedAt);
  set('accumulated_minutes', j.accumulatedMinutes);
  set('machine_id', j.machineId);
  set('operator_id', j.operatorId);
  set('operator_name', j.operatorName);
  set('scheduled_date', j.scheduledDate);
  set('scheduled_position', j.scheduledPosition);
  set('status', j.status);
  set('priority', j.priority);
  set('due_date', j.dueDate);
  set('ship_by_date', j.shipByDate);
  set('order_date', j.orderDate);
  set('rush', j.rush);
  set('revenue_value', j.revenueValue);
  set('inventory_available', j.inventoryAvailable);
  set('design_name', j.designName);
  set('design_image_url', j.designImageUrl);
  set('customer_name', j.customerName);
  set('tags', j.tags);
  set('notes', j.notes);
  set('design_notes', j.designNotes);
  set('override_reason', j.overrideReason);
  set('locked_schedule_id', j.lockedScheduleId);
  set('quantity_completed', j.quantityCompleted);
  set('quantity_failed', j.quantityFailed);
  set('rework_reason', j.reworkReason);
  set('scrap_count', j.scrapCount);
  set('ai_confidence', j.aiConfidence);
  set('ai_reasoning', j.aiReasoning);
  return map;
}

const COLUMN_NOT_FOUND_RE = /Could not find the '([^']+)' column/i;

/** Insert a row, stripping columns the schema is missing (then retry). */
export async function insertWithFallback(
  table: string,
  row: Record<string, unknown>,
): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> {
  const attempt = { ...row };
  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabaseAdmin.from(table).insert(attempt).select().single();
    if (!error) return { data, error: null };
    const m = error.message.match(COLUMN_NOT_FOUND_RE);
    if (!m || !(m[1] in attempt)) {
      log.error('production.insert.fail', { table, err: error.message });
      return { data: null, error };
    }
    log.warn('production.insert.column_missing', { table, column: m[1] });
    delete attempt[m[1]];
    if (Object.keys(attempt).length === 0) return { data: null, error };
  }
  return { data: null, error: { message: 'Retry exhausted' } };
}

/** Update a row by id, stripping missing columns (then retry). */
export async function updateWithFallback(
  table: string,
  id: string,
  row: Record<string, unknown>,
): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> {
  const attempt = { ...row };
  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabaseAdmin.from(table).update(attempt).eq('id', id).select().single();
    if (!error) return { data, error: null };
    const m = error.message.match(COLUMN_NOT_FOUND_RE);
    if (!m || !(m[1] in attempt)) {
      log.error('production.update.fail', { table, err: error.message });
      return { data: null, error };
    }
    delete attempt[m[1]];
    if (Object.keys(attempt).length === 0) return { data: null, error };
  }
  return { data: null, error: { message: 'Retry exhausted' } };
}

/** Append an audit-log row. Fire-and-forget friendly. */
export async function logProduction(entry: {
  productionJobId?: string;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  userId?: string;
  userName?: string;
  reason?: string;
}): Promise<void> {
  try {
    await supabaseAdmin.from('production_logs').insert({
      production_job_id: entry.productionJobId ?? null,
      action: entry.action,
      old_value: entry.oldValue ?? null,
      new_value: entry.newValue ?? null,
      user_id: entry.userId ?? '',
      user_name: entry.userName ?? '',
      reason: entry.reason ?? '',
    });
  } catch (err) {
    log.warn('production.log.fail', { err });
  }
}

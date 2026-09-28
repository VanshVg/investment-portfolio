import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types.generated'
import type { HoldingCategory } from '@/lib/validation/holdings'

export interface RuleSet {
  byCategory: Map<HoldingCategory, number[]>
  byHolding: Map<string, number[]>
}

/**
 * Every active rule, read once per sweep rather than per instance. There are at
 * most a handful of category defaults plus one row per overridden holding, so
 * this is far cheaper than a lookup inside the loop.
 */
export async function loadReminderRules(client: SupabaseClient<Database>): Promise<RuleSet> {
  const { data, error } = await client
    .from('reminder_rules')
    .select('category, holding_id, days_before')
    .eq('is_active', true)
  if (error) throw new Error(`loadReminderRules failed: ${error.message}`)

  const byCategory = new Map<HoldingCategory, number[]>()
  const byHolding = new Map<string, number[]>()
  for (const rule of data ?? []) {
    // The schema's XOR check constraint guarantees exactly one of these is set.
    if (rule.holding_id) byHolding.set(rule.holding_id, rule.days_before)
    else if (rule.category) byCategory.set(rule.category as HoldingCategory, rule.days_before)
  }
  return { byCategory, byHolding }
}

/** A holding-specific rule replaces the category default outright. */
export function windowsFor(
  rules: RuleSet,
  target: { category: HoldingCategory; holdingId: string },
): number[] {
  return rules.byHolding.get(target.holdingId) ?? rules.byCategory.get(target.category) ?? []
}

/**
 * The widest window anyone has configured. The sweep uses it to bound its scan:
 * an instance further out than this cannot have fired a window, so reading it
 * would be work with no possible outcome.
 */
export function maxWindow(rules: RuleSet): number {
  let widest = 0
  for (const windows of [...rules.byCategory.values(), ...rules.byHolding.values()]) {
    for (const days of windows) if (days > widest) widest = days
  }
  return widest
}

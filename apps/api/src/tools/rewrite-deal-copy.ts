import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Database } from '@api/modules/platform-admin/transaction'
import {
  type DealCopyField,
  type DealCopyRewrite,
  REPO_ROOT,
  readDealCopyBatch,
} from '@api/tools/deal-copy/batch'

// Applies one deal copy batch (see deal-copy/batch.ts and .claude/skills/tidy-deals/SKILL.md):
// short titles, plain descriptions, terms as a few points, and a category and cuisine.
//
//   pnpm deals:rewrite-copy --batch apps/api/deal-copy-batches/<file>.json            dry run
//   pnpm deals:rewrite-copy --batch apps/api/deal-copy-batches/<file>.json --apply    write
//   pnpm deals:rewrite-copy --batch apps/api/deal-copy-batches/<file>.json --apply --revert
//
// A field is only written when it still holds the value the batch expects, so edits made in the
// meantime are never overwritten. Material edits (including revert/category/cuisine) advance
// the version once per changed deal, withdraw publication and require fresh review and scope.
const APPLY_FLAG = '--apply'
const REVERT_FLAG = '--revert'
const BATCH_FLAG = '--batch'
const PREVIEW_CHARS = 70

type Value = string | null
type Step = {
  readonly id: string
  readonly field: DealCopyField
  readonly to: Value
  readonly starts: readonly Value[]
}

// The write guard. In MongoDB an empty optional field may be null or missing altogether.
const holds = (field: DealCopyField, value: Value) =>
  value === null ? { OR: [{ [field]: null }, { [field]: { isSet: false } }] } : { [field]: value }

const preview = (value: Value) => {
  if (value === null) return '(empty)'
  return value.length > PREVIEW_CHARS ? `${value.slice(0, PREVIEW_CHARS - 1)}…` : value
}

// Forward, a field may still hold the original or an earlier rewrite; revert only undoes this
// batch, back to the original.
const toStep = (rewrite: DealCopyRewrite, revert: boolean): Step =>
  revert
    ? { id: rewrite.id, field: rewrite.field, to: rewrite.from, starts: [rewrite.to] }
    : {
        id: rewrite.id,
        field: rewrite.field,
        to: rewrite.to,
        starts: [rewrite.from, ...(rewrite.previously ?? [])],
      }

const planChanges = async (db: Database, rewrites: readonly DealCopyRewrite[], revert: boolean) => {
  const steps = rewrites.map((rewrite) => toStep(rewrite, revert))
  const deals = await db.deal.findMany({
    where: { id: { in: [...new Set(steps.map((step) => step.id))] } },
    select: {
      id: true,
      contentVersion: true,
      title: true,
      description: true,
      terms: true,
      category: true,
      cuisine: true,
    },
  })
  const dealsById = new Map(deals.map((deal) => [deal.id, deal]))
  const exists = (step: Step) => dealsById.has(step.id)
  const current = (step: Step): Value => dealsById.get(step.id)?.[step.field] ?? null
  const startsHere = (step: Step) =>
    exists(step) && current(step) !== step.to && step.starts.includes(current(step))
  return {
    changes: steps.filter(startsHere).map((step) => ({
      ...step,
      from: current(step),
      contentVersion: dealsById.get(step.id)?.contentVersion ?? 0,
    })),
    alreadyDone: steps.filter((step) => exists(step) && current(step) === step.to).length,
    skipped: steps
      .filter((step) => !startsHere(step) && !(exists(step) && current(step) === step.to))
      .map((step) => ({
        id: step.id,
        field: step.field,
        current: exists(step) ? preview(current(step)) : '(deal missing)',
      })),
  }
}

const batchPath = (args: readonly string[]): string => {
  const index = args.indexOf(BATCH_FLAG)
  const path = index >= 0 ? args[index + 1] : undefined
  if (!path) throw new Error(`Pass ${BATCH_FLAG} <path to a deal copy batch JSON file>`)
  return resolve(REPO_ROOT, path)
}

export const rewriteDealCopy = async (
  db: Database,
  rewrites: readonly DealCopyRewrite[],
  options: { apply: boolean; revert?: boolean },
) => {
  const { apply } = options
  const { changes, alreadyDone, skipped } = await planChanges(db, rewrites, options.revert ?? false)
  if (skipped.length > 0) {
    console.log('Skipped (field no longer holds the expected value):')
    console.table(skipped)
  }
  if (alreadyDone > 0) console.log(`${alreadyDone} field(s) already up to date.`)
  if (changes.length === 0) {
    console.log('No deal copy needs changing.')
    return
  }
  console.log('Material edits withdraw publication and require fresh review and outlet scope.')
  console.table(
    changes.map((change) => ({
      id: change.id,
      field: change.field,
      from: preview(change.from),
      to: preview(change.to),
    })),
  )
  if (!apply) {
    console.log(`Dry run: ${changes.length} field(s) would change. Re-run with ${APPLY_FLAG}.`)
    return
  }
  // All fields for a deal form one material revision. Guard both the planned version and
  // every old value; a concurrent edit rolls back the entire batch rather than overwriting it.
  const byDeal = new Map<string, typeof changes>()
  for (const change of changes) {
    const edits = byDeal.get(change.id) ?? []
    if (edits.some((edit) => edit.field === change.field)) {
      throw new Error(`Conflicting rewrites for ${change.id}/${change.field}`)
    }
    edits.push(change)
    byDeal.set(change.id, edits)
  }
  await db.$transaction(
    [...byDeal].map(([id, edits]) =>
      db.deal.update({
        where: {
          id,
          contentVersion: edits[0].contentVersion,
          AND: edits.map((change) => holds(change.field, change.from)),
        },
        data: {
          ...Object.fromEntries(edits.map((change) => [change.field, change.to])),
          contentVersion: { increment: 1 },
          scopeConfirmation: { unset: true },
          reviewStatus: 'PENDING',
          reviewedVersion: null,
          reviewedById: null,
          reviewedAt: null,
          reviewNote: null,
          publishedAt: null,
        },
      }),
    ),
  )
  console.log(`Updated ${changes.length} field(s).`)
}

// Importing the writer never constructs the ambient client or dispatches the CLI.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { db } = await import('@broke-oclock/db')
  try {
    const args = process.argv.slice(2)
    const batch = readDealCopyBatch(batchPath(args))
    await rewriteDealCopy(db, batch.rewrites, {
      apply: args.includes(APPLY_FLAG),
      revert: args.includes(REVERT_FLAG),
    })
  } catch (error) {
    console.error('Rewriting deal copy failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  } finally {
    await db.$disconnect()
  }
}

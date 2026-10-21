import { resolve } from 'node:path'
import {
  type DealCopyField,
  type DealCopyRewrite,
  REPO_ROOT,
  readDealCopyBatch,
} from '@api/tools/deal-copy/batch'
import { db } from '@broke-oclock/db'

// Applies one deal copy batch (see deal-copy/batch.ts and .claude/skills/tidy-deals/SKILL.md):
// short titles, plain descriptions, terms as a few points, and a category and cuisine.
//
//   pnpm deals:rewrite-copy --batch apps/api/deal-copy-batches/<file>.json            dry run
//   pnpm deals:rewrite-copy --batch apps/api/deal-copy-batches/<file>.json --apply    write
//   pnpm deals:rewrite-copy --batch apps/api/deal-copy-batches/<file>.json --apply --revert
//
// A field is only written when it still holds the value the batch expects, so edits made in the
// meantime are never overwritten. As with reclassify-categories, the content version is left
// alone so approved deals stay published and no review is reopened.
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

const planChanges = async (rewrites: readonly DealCopyRewrite[], revert: boolean) => {
  const steps = rewrites.map((rewrite) => toStep(rewrite, revert))
  const deals = await db.deal.findMany({
    where: { id: { in: [...new Set(steps.map((step) => step.id))] } },
    select: {
      id: true,
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
    changes: steps.filter(startsHere).map((step) => ({ ...step, from: current(step) })),
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

const main = async (args: readonly string[]) => {
  const apply = args.includes(APPLY_FLAG)
  const batch = readDealCopyBatch(batchPath(args))
  const { changes, alreadyDone, skipped } = await planChanges(
    batch.rewrites,
    args.includes(REVERT_FLAG),
  )
  if (skipped.length > 0) {
    console.log('Skipped (field no longer holds the expected value):')
    console.table(skipped)
  }
  if (alreadyDone > 0) console.log(`${alreadyDone} field(s) already up to date.`)
  if (changes.length === 0) {
    console.log('No deal copy needs changing.')
    return
  }
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
  await db.$transaction(
    changes.map((change) =>
      db.deal.update({
        where: { id: change.id, ...holds(change.field, change.from) },
        data: { [change.field]: change.to },
      }),
    ),
  )
  console.log(`Updated ${changes.length} field(s).`)
}

try {
  await main(process.argv.slice(2))
} catch (error) {
  console.error('Rewriting deal copy failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await db.$disconnect()
}

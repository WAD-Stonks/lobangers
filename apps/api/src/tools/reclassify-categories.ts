import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { legacyVersionWhere, normalizeVersion } from '@api/modules/platform-admin/operation-version'
import type { Database } from '@api/modules/platform-admin/transaction'
import {
  classifyDealCategory,
  DEFAULT_DEAL_CATEGORY,
} from '@broke-oclock/contracts/deal-categories'

// One-off backfill: every imported deal was stored as FOOD before the parser classified
// categories. Dry run by default; pass --apply to write. Category is material content:
// changed deals advance a version, lose publication/scope and require fresh moderation.
const APPLY_FLAG = '--apply'
const TITLE_PREVIEW_CHARS = 60

// Later imports stored the default in lower case ("food"), which no category code matches.
const UNCLASSIFIED = [DEFAULT_DEAL_CATEGORY, DEFAULT_DEAL_CATEGORY.toLowerCase()]

const planChanges = async (db: Database) => {
  const deals = await db.deal.findMany({
    where: {
      category: { in: UNCLASSIFIED },
      OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
    },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      contentVersion: true,
      operationVersion: true,
    },
    orderBy: { createdAt: 'asc' },
  })
  return deals.flatMap((deal) => {
    const category = classifyDealCategory(deal.title, deal.description)
    return category === deal.category
      ? []
      : [{ ...deal, previousCategory: deal.category, category }]
  })
}

export const reclassifyCategories = async (db: Database, apply: boolean) => {
  const changes = await planChanges(db)
  if (changes.length === 0) {
    console.log('No deals need reclassifying.')
    return
  }
  console.log('Material edits withdraw publication and require fresh review and outlet scope.')
  console.table(
    changes.map((change) => ({
      id: change.id,
      category: change.category,
      title: change.title.slice(0, TITLE_PREVIEW_CHARS),
    })),
  )
  if (!apply) {
    console.log(
      `Dry run: ${changes.length} deal(s) would change. Re-run with ${APPLY_FLAG} to write.`,
    )
    return
  }
  await db.$transaction(
    changes.map((change) =>
      db.deal.update({
        where: {
          id: change.id,
          contentVersion: change.contentVersion,
          category: change.previousCategory,
          title: change.title,
          description: change.description,
          AND: [
            legacyVersionWhere('operationVersion', normalizeVersion(change.operationVersion)),
            { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
          ],
        },
        data: {
          category: change.category,
          contentVersion: { increment: 1 },
          operationVersion: normalizeVersion(change.operationVersion) + 1,
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
  console.log(`Updated ${changes.length} deal(s).`)
}

// Importing the writer never constructs the ambient client or dispatches the CLI.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { db } = await import('@broke-oclock/db')
  try {
    await reclassifyCategories(db, process.argv.includes(APPLY_FLAG))
  } catch (error) {
    console.error('Reclassification failed:', error)
    process.exitCode = 1
  } finally {
    await db.$disconnect()
  }
}

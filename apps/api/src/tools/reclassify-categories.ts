import {
  classifyDealCategory,
  DEFAULT_DEAL_CATEGORY,
} from '@broke-oclock/contracts/deal-categories'
import { db } from '@broke-oclock/db'

// One-off backfill: every imported deal was stored as FOOD before the parser classified
// categories. Dry run by default; pass --apply to write. Only the category changes. The content
// version is left alone so approved deals stay published and no review is reopened.
const APPLY_FLAG = '--apply'
const TITLE_PREVIEW_CHARS = 60

// Later imports stored the default in lower case ("food"), which no category code matches.
const UNCLASSIFIED = [DEFAULT_DEAL_CATEGORY, DEFAULT_DEAL_CATEGORY.toLowerCase()]

const planChanges = async () => {
  const deals = await db.deal.findMany({
    where: {
      category: { in: UNCLASSIFIED },
      OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
    },
    select: { id: true, title: true, description: true, category: true },
    orderBy: { createdAt: 'asc' },
  })
  return deals.flatMap((deal) => {
    const category = classifyDealCategory(deal.title, deal.description)
    return category === deal.category ? [] : [{ id: deal.id, title: deal.title, category }]
  })
}

const main = async (apply: boolean) => {
  const changes = await planChanges()
  if (changes.length === 0) {
    console.log('No deals need reclassifying.')
    return
  }
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
      db.deal.update({ where: { id: change.id }, data: { category: change.category } }),
    ),
  )
  console.log(`Updated ${changes.length} deal(s).`)
}

try {
  await main(process.argv.includes(APPLY_FLAG))
} catch (error) {
  console.error('Reclassification failed:', error)
  process.exitCode = 1
} finally {
  await db.$disconnect()
}

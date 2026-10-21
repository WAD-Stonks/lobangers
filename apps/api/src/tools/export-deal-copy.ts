import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { REPO_ROOT, readAllDealCopyBatches } from '@api/tools/deal-copy/batch'
import { db } from '@broke-oclock/db'

// Step 1 of the deal tidy-up (.claude/skills/tidy-deals/SKILL.md): writes the imported deals no
// committed batch has touched yet, with the source article text, to a local JSON file. Read-only.
//
//   pnpm deals:copy-export                 deals not yet in any batch
//   pnpm deals:copy-export --all           every imported deal
//   pnpm deals:copy-export --out <path>    somewhere other than .local/deal-copy/
const ALL_FLAG = '--all'
const OUT_FLAG = '--out'
const SOURCE_TEXT_CHARS = 4000
const DEFAULT_OUT_DIR = resolve(REPO_ROOT, '.local/deal-copy')

// Crude text extraction for a reader, never for rendering: the snapshot is untrusted HTML.
const plainText = (html: string) =>
  html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&#\d+;|&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const snapshotHtml = (snapshot: string): string | null => {
  try {
    const post = JSON.parse(snapshot) as { content?: { rendered?: unknown } }
    const html = post.content?.rendered
    return typeof html === 'string' ? html : null
  } catch {
    return null
  }
}

// Older imports pinned the WordPress post JSON in the snapshot. Newer ones pin a fact summary
// there and keep the article HTML on the imported post instead. Telegram posts carry no text.
const sourceText = (snapshot: string, rawContent: string | undefined): string | null => {
  const html =
    snapshotHtml(snapshot) ?? (rawContent?.trimStart().startsWith('<') ? rawContent : null)
  return html ? plainText(html).slice(0, SOURCE_TEXT_CHARS) || null : null
}

const outPath = (args: readonly string[]) => {
  const index = args.indexOf(OUT_FLAG)
  const given = index >= 0 ? args[index + 1] : undefined
  if (given) return resolve(REPO_ROOT, given)
  return resolve(DEFAULT_OUT_DIR, `export-${new Date().toISOString().slice(0, 10)}.json`)
}

const main = async (args: readonly string[]) => {
  const tidied = new Set(
    readAllDealCopyBatches().flatMap((batch) => batch.rewrites.map((rewrite) => rewrite.id)),
  )
  const deals = await db.deal.findMany({
    where: { origin: 'IMPORTED', OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      reviewStatus: true,
      title: true,
      description: true,
      terms: true,
      category: true,
      cuisine: true,
      offerType: true,
      priceMinor: true,
      discountPercent: true,
      validUntil: true,
      rawValidityText: true,
      merchant: { select: { name: true } },
      sources: {
        select: {
          sourceUrl: true,
          sourceContentSnapshot: true,
          importedPost: { select: { rawContent: true } },
        },
        take: 1,
      },
    },
  })
  const pending = args.includes(ALL_FLAG) ? deals : deals.filter((deal) => !tidied.has(deal.id))
  const items = pending.map(({ sources, merchant, validUntil, ...deal }) => ({
    ...deal,
    merchant: merchant?.name ?? null,
    validUntil: validUntil?.toISOString() ?? null,
    source: sources[0]
      ? {
          url: sources[0].sourceUrl,
          untrustedText: sourceText(
            sources[0].sourceContentSnapshot,
            sources[0].importedPost?.rawContent,
          ),
        }
      : null,
  }))
  const path = outPath(args)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(
    path,
    `${JSON.stringify({ exportedAt: new Date().toISOString(), items }, null, 2)}\n`,
  )
  console.log(`Exported ${items.length} of ${deals.length} imported deal(s) to ${path}`)
}

try {
  await main(process.argv.slice(2))
} catch (error) {
  console.error('Exporting deal copy failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await db.$disconnect()
}

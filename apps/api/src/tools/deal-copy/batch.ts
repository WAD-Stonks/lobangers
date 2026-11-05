import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEAL_CATEGORIES } from '@broke-oclock/contracts/deal-categories'
import { DEAL_COPY_LIMITS, splitTerms } from '@broke-oclock/contracts/deal-copy'
import { DEAL_CUISINES } from '@broke-oclock/contracts/deal-cuisines'
import { z } from 'zod'

export const DEAL_COPY_BATCH_DIR = fileURLToPath(
  new URL('../../../deal-copy-batches/', import.meta.url),
)

export const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url))

const OBJECT_ID = /^[0-9a-f]{24}$/
const { titleChars, descriptionChars, termsPoints, termsPointChars } = DEAL_COPY_LIMITS

const trimmed = (max: number, label: string) =>
  z
    .string()
    .min(1, `${label} is empty`)
    .max(max, `${label} is longer than ${max} characters`)
    .refine((value) => value === value.trim(), `${label} has leading or trailing spaces`)

const terms = z
  .string()
  .min(1)
  .superRefine((value, context) => {
    const points = splitTerms(value)
    if (points.length > termsPoints)
      context.addIssue({
        code: 'custom',
        message: `Terms have ${points.length} points; at most ${termsPoints}`,
      })
    for (const point of points)
      if (point.length > termsPointChars)
        context.addIssue({
          code: 'custom',
          message: `Terms point over ${termsPointChars} characters: "${point}"`,
        })
  })

const base = {
  id: z.string().regex(OBJECT_ID, 'Deal id must be a 24-character ObjectId'),
  from: z.string().nullable(),
  previously: z.array(z.string()).optional(),
}

const rewriteSchema = z.discriminatedUnion('field', [
  z.object({ ...base, field: z.literal('title'), to: trimmed(titleChars, 'Title') }),
  z.object({
    ...base,
    field: z.literal('description'),
    to: trimmed(descriptionChars, 'Description'),
  }),
  z.object({ ...base, field: z.literal('terms'), to: terms }),
  z.object({
    ...base,
    field: z.literal('category'),
    to: z.enum(DEAL_CATEGORIES, { error: `Category must be one of ${DEAL_CATEGORIES.join(', ')}` }),
  }),
  z.object({
    ...base,
    field: z.literal('cuisine'),
    to: z
      .enum(DEAL_CUISINES, { error: `Cuisine must be one of ${DEAL_CUISINES.join(', ')}` })
      .nullable(),
  }),
])

const batchSchema = z.object({
  note: z.string().min(1),
  rewrites: z.array(rewriteSchema).min(1),
})

export type DealCopyRewrite = z.infer<typeof rewriteSchema>
export type DealCopyField = DealCopyRewrite['field']
export type DealCopyBatch = z.infer<typeof batchSchema>

export const parseDealCopyBatch = (input: unknown): DealCopyBatch => {
  const result = batchSchema.safeParse(input)
  if (result.success) return result.data
  const issues = result.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
  throw new Error(`Invalid deal copy batch:\n${issues.join('\n')}`)
}

export const readDealCopyBatch = (path: string): DealCopyBatch =>
  parseDealCopyBatch(JSON.parse(readFileSync(path, 'utf8')) as unknown)

export const readAllDealCopyBatches = (): readonly DealCopyBatch[] =>
  readdirSync(DEAL_COPY_BATCH_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => readDealCopyBatch(join(DEAL_COPY_BATCH_DIR, name)))

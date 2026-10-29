import { catalogueVenueSelect } from '@api/modules/deals/catalogue-select'
import { dayOf, endAfterDay, startOfDay } from '@api/modules/deals/deal-dates'
import { isSelectableCatalogueVenue } from '@api/modules/deals/outlet-eligibility'
import { DomainError } from '@api/modules/domain-error'
import { activeRecord } from '@api/modules/platform-admin/venues'
import type { SubmitDealBody } from '@broke-oclock/contracts/deal-forms'
import type { db } from '@broke-oclock/db'

type Database = typeof db

const unsetOrNull = (field: string) => ({ OR: [{ [field]: null }, { [field]: { isSet: false } }] })

// A community member shares a deal. It is saved as PENDING and stays hidden until an admin
// approves it. The stalls must be ones the stall search offers, all of one merchant, and the
// photo must be a file this same user uploaded and has not used on another deal.
export const submitCommunityDeal = async (
  database: Database,
  userId: string,
  input: SubmitDealBody,
  now: Date,
) => {
  if (input.endDate < dayOf(now))
    throw new DomainError('BAD_REQUEST', 'The last day cannot be in the past')

  const venues = await database.venue.findMany({
    where: { id: { in: input.stallIds }, ...activeRecord },
    select: catalogueVenueSelect,
  })
  const usable = venues.filter(
    (venue) => isSelectableCatalogueVenue(venue) && !venue.merchant.deletedAt,
  )
  if (usable.length !== input.stallIds.length)
    throw new DomainError('PRECONDITION_FAILED', 'One of the stalls is no longer available')
  const merchantIds = new Set(usable.map((venue) => venue.merchantId))
  if (merchantIds.size !== 1)
    throw new DomainError(
      'BAD_REQUEST',
      'All stalls must belong to the same merchant. Submit separate deals for different shops.',
    )
  const [merchantId] = merchantIds

  try {
    return await database.$transaction(async (tx) => {
      const deal = await tx.deal.create({
        data: {
          title: input.title,
          description: input.description,
          category: input.category,
          cuisine: input.cuisine,
          offerType: input.offerType,
          discountPercent: input.discountPercent,
          priceMinor: input.priceCents,
          terms: input.terms,
          validFrom: startOfDay(input.startDate),
          validUntil: endAfterDay(input.endDate),
          applicability: 'SELECTED_OUTLETS',
          origin: 'USER_SUBMITTED',
          reviewStatus: 'PENDING',
          merchantId,
          submittedById: userId,
          venues: { create: input.stallIds.map((venueId) => ({ venueId })) },
        },
        select: { id: true },
      })
      // Claim the photo only if it is still this user's unused upload.
      const claimed = await tx.uploadedFile.updateMany({
        where: {
          key: input.photoKey,
          uploaderId: userId,
          AND: [unsetOrNull('dealId'), unsetOrNull('deletedAt')],
        },
        data: { dealId: deal.id },
      })
      if (claimed.count !== 1)
        throw new DomainError('BAD_REQUEST', 'The photo was not found. Please upload it again.')
      return deal
    })
  } catch (error) {
    // A concurrent claim of the same photo surfaces as a write conflict.
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2034')
      throw new DomainError('CONFLICT', 'The photo was used by another submission')
    throw error
  }
}

import { findPublicDealPin } from '@api/modules/deals/public-deals'
import { createPublicRestHandler, type RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { dealShareDates, dealShareVenue } from '@broke-oclock/contracts/deal-copy'
import { Router } from 'express'

// Chat apps fetch a shared deal link to draw its preview card. The web host sends those fetches
// here (see apps/web/vercel.json), and this answers with the deal's picture, name, outlet and dates.
// People who land here anyway are sent straight on to the deal page.
const PREVIEW_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=600'
const OBJECT_ID = /^[a-f\d]{24}$/i

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`)

type Preview = { title: string; description: string; url: string; image: string; imageAlt: string }

export const previewPage = ({ title, description, url, image, imageAlt }: Preview) => {
  const [t, d, u, i, a] = [title, description, url, image, imageAlt].map(escapeHtml)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${t}</title>
<meta name="description" content="${d}" />
<link rel="canonical" href="${u}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="LoBangers" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:url" content="${u}" />
<meta property="og:image" content="${i}" />
<meta property="og:image:alt" content="${a}" />
<meta name="twitter:card" content="summary_large_image" />
<meta http-equiv="refresh" content="0; url=${u}" />
</head>
<body><a href="${u}">${t}</a></body>
</html>`
}

export const createShareRouter = (dependencies: RestDependencies): Router => {
  const router = Router()
  router.get(
    '/share/deals/:dealId',
    createPublicRestHandler(dependencies, async (request, response, context) => {
      const origin = dependencies.config.webOrigin
      const dealId = String(request.params.dealId)
      const at = typeof request.query.at === 'string' ? request.query.at : undefined
      const deal = OBJECT_ID.test(dealId)
        ? await findPublicDealPin(context.db, dealId, new Date(), dependencies.config.community)
        : null
      response.set('Cache-Control', PREVIEW_CACHE_CONTROL)
      response.type('html')
      if (!deal) {
        // Gone or never public: the site's own card, pointing at all deals.
        response.status(404).send(
          previewPage({
            title: 'LoBangers',
            description: 'Good food, better prices, all around Singapore.',
            url: `${origin}/deals`,
            image: `${origin}/og-image.png`,
            imageAlt: 'Lobangers logo with the line Bang for your buck.',
          }),
        )
        return
      }
      const venue = deal.venues.find((outlet) => outlet.id === at) ?? deal.venues[0]
      const url = new URL(`/deals/${deal.id}`, origin)
      if (venue) url.searchParams.set('at', venue.id)
      const photo = deal.images[0]
      response.send(
        previewPage({
          title: deal.title,
          description: [
            venue && dealShareVenue(venue.name),
            dealShareDates(deal.validFrom, deal.validUntil),
            'Only on Lobangers',
          ]
            .filter(Boolean)
            .join(' · '),
          url: url.href,
          image: photo?.url ?? deal.imageUrl ?? `${origin}/og-image.png`,
          imageAlt: photo?.alt ?? deal.imageAltText ?? deal.title,
        }),
      )
    }),
  )
  router.all('/share/deals/:dealId', methodNotAllowed('GET'))
  return router
}

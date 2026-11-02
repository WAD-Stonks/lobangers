import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

// Observe entry-module loading without replacing router resolution or route records.
const loaded = vi.hoisted(() => ({ landing: vi.fn(), map: vi.fn(), admin: vi.fn() }))
vi.mock('@web/pages/LandingPage.vue', () => {
  loaded.landing()
  return { default: { template: '<main>Synthetic landing module</main>' } }
})
vi.mock('@web/pages/MapShell.vue', () => {
  loaded.map()
  return { default: { template: '<RouterView />' } }
})
vi.mock('@web/pages/AdminOverviewPage.vue', () => {
  loaded.admin()
  return { default: { template: '<main>Synthetic admin module</main>' } }
})

vi.mock('@web/modules/browse-map/BrowseListPanel.vue', () => ({
  default: { template: '<p>Synthetic results module</p>' },
}))
vi.mock('@web/modules/browse-map/DealPanel.vue', () => ({
  default: { template: '<p>Synthetic deal module</p>' },
}))
const { default: routes } = await import('@web/router/routes')

it('loads only the matched entry and retains the map shell across its child routes', async () => {
  expect(loaded.landing).not.toHaveBeenCalled()
  expect(loaded.map).not.toHaveBeenCalled()
  expect(loaded.admin).not.toHaveBeenCalled()

  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/admin')
  expect(loaded.admin).toHaveBeenCalledTimes(1)
  expect(loaded.landing).not.toHaveBeenCalled()
  expect(loaded.map).not.toHaveBeenCalled()

  await router.push('/browse')
  const shell = router.currentRoute.value.matched[0]
  expect(loaded.map).toHaveBeenCalledTimes(1)
  expect(loaded.landing).not.toHaveBeenCalled()
  await router.push('/deals/111111111111111111111111')
  expect(router.currentRoute.value.matched[0]).toBe(shell)
  expect(loaded.map).toHaveBeenCalledTimes(1)

  await router.push('/')
  expect(loaded.landing).toHaveBeenCalledTimes(1)
  expect(router.currentRoute.value.name).toBe('landing')
})

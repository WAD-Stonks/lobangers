import { pageTitle, trackPageTitle } from '@web/router/page-title'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const Blank = defineComponent({ render: () => null })

describe('pageTitle', () => {
  it('names the page before the brand', () => {
    expect(pageTitle({ meta: { title: 'Sign in' }, name: 'sign-in' })).toBe('Sign in · Lobangers')
  })

  it('falls back to the panel label for map panels', () => {
    expect(pageTitle({ meta: { panelLabel: 'Saved deals' }, name: 'saved' })).toBe(
      'Saved deals · Lobangers',
    )
  })

  it('prefers an explicit title over the panel label', () => {
    expect(
      pageTitle({ meta: { title: 'Food deals', panelLabel: 'Results' }, name: 'browse' }),
    ).toBe('Food deals · Lobangers')
  })

  it('keeps the plain brand when a route has no title', () => {
    expect(pageTitle({ meta: {}, name: 'landing' })).toBe('Lobangers')
  })
})

describe('trackPageTitle', () => {
  afterEach(() => {
    document.title = ''
  })

  it('updates document.title after each navigation', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: Blank },
        { path: '/saved', component: Blank, meta: { panelLabel: 'Saved deals' } },
      ],
    })
    trackPageTitle(router)

    await router.push('/saved')
    expect(document.title).toBe('Saved deals · Lobangers')

    await router.push('/')
    expect(document.title).toBe('Lobangers')
  })
})

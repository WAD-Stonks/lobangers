import { mount } from '@vue/test-utils'
import CommunityFreshnessScene from '@web/modules/landing/CommunityFreshnessScene.vue'
import {
  communityTimeline,
  deriveCommunityStatus,
  SAMPLE_REPORT_TIME,
  sampleReports,
} from '@web/modules/landing/community-freshness'
import { samples } from '@web/modules/landing/deals'
import HawkerStallModel from '@web/modules/landing/HawkerStallModel.vue'
import { hawkerPhotoAnchor, hawkerProject } from '@web/modules/landing/hawker-projection'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

describe('illustrative community evidence', () => {
  it('uses recent observations rather than the lifetime positive percentage', () => {
    expect(deriveCommunityStatus(sampleReports)).toMatchObject({
      status: 'Likely Still On',
      recent: 3,
      older: 2,
    })
    const conflict = sampleReports
      .slice(0, 3)
      .concat({ ...sampleReports[3], observedAt: SAMPLE_REPORT_TIME - 60_000 })
    expect(deriveCommunityStatus(conflict).status).toBe('Uncertain')
  })
  it('requires multiple consistent recent observations for either directional status', () => {
    expect(deriveCommunityStatus(sampleReports.slice(0, 1)).status).toBe('Uncertain')
    const ended = sampleReports.slice(0, 2).map((r) => ({ ...r, kind: 'ended' as const }))
    expect(deriveCommunityStatus(ended).status).toBe('Reported Ended')
  })
  it('does not use old or future-dated observations as recent evidence', () => {
    expect(deriveCommunityStatus(sampleReports.slice(3)).status).toBe('No Recent Reports')
    expect(
      deriveCommunityStatus([{ ...sampleReports[0], observedAt: SAMPLE_REPORT_TIME + 60_000 }])
        .recent,
    ).toBe(0)
    expect(deriveCommunityStatus([]).status).toBe('No Recent Reports')
  })
})

describe('community scene continuity', () => {
  it('projects fixtures and the photo stand through the same front-left basis', () => {
    const origin = hawkerProject(0, 0, 0)
    const back = hawkerProject(0, 0, 60)
    const raised = hawkerProject(0, 60, 0)
    expect(back.x).toBeLessThan(origin.x)
    expect(back.y).toBeLessThan(origin.y)
    expect(raised.x).toBe(origin.x)
    expect(raised.y).toBeLessThan(origin.y)
    expect(hawkerPhotoAnchor).toEqual(hawkerProject(0, 104, 24))
  })
  it('reverses assembly and status frames without a separate playback state', () => {
    const frame = communityTimeline(0.83)
    expect(frame.base).toBe(1)
    expect(frame.pulse).toBe(1)
    expect(frame.flip).toBeGreaterThan(0.5)
    expect(communityTimeline(0.83)).toEqual(frame)
    expect(communityTimeline(0.1).base).toBe(0)
    expect(communityTimeline(0, true).cta).toBe(1)
  })
  it('overlaps the same selected card with the 3D sign and restores it when reversing', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
    })
    const wrapper = mount(CommunityFreshnessScene, {
      props: {
        deal: samples[4],
        area: 'Novena',
        storyProgress: 0.78,
        offer: 1,
        reduced: false,
        viewport: { width: 1440, height: 900 },
      },
      global: { plugins: [router] },
    })
    const card = wrapper.get('.shared-deal-sign').element
    wrapper.getComponent(HawkerStallModel).vm.$emit('ready', true)
    await wrapper.setProps({ storyProgress: 0.85 })
    const opacity = Number((card as HTMLElement).style.opacity)
    expect(opacity).toBeGreaterThan(0)
    expect(opacity).toBeLessThan(1)
    await wrapper.setProps({ storyProgress: 0.9 })
    expect((card as HTMLElement).style.opacity).toBe('0')
    expect(wrapper.text()).toContain('Everyday Chicken Rice · Novena')
    expect(wrapper.get('.shared-deal-sign').attributes('aria-hidden')).toBe('true')
    await wrapper.setProps({ storyProgress: 0.78 })
    expect(wrapper.get('.shared-deal-sign').element).toBe(card)
    expect((card as HTMLElement).style.opacity).toBe('1')
    wrapper.unmount()
  })
  it('keeps one deal card and food image while scrubbing both directions', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
    })
    const wrapper = mount(CommunityFreshnessScene, {
      props: {
        deal: samples[3],
        area: 'Tampines',
        storyProgress: 0.78,
        offer: 1,
        reduced: false,
        viewport: { width: 1440, height: 900 },
      },
      global: { plugins: [router] },
    })
    const card = wrapper.get('.shared-deal-sign').element
    const photo = wrapper.get('.community-food-photo').element
    expect(wrapper.get('.community-food-display').find('img').element).toBe(photo)
    expect(wrapper.findAll('[data-stall-layer]')).toHaveLength(6)
    for (const p of [0.81, 0.85, 0.92, 0.99, 0.86, 0.78]) {
      await wrapper.setProps({ storyProgress: p })
      expect(wrapper.get('.shared-deal-sign').element).toBe(card)
      expect(wrapper.get('.community-food-photo').element).toBe(photo)
      expect(wrapper.findAll('.shared-deal-sign')).toHaveLength(1)
      expect(wrapper.get('.shared-deal-sign').text()).toContain('Sunday Scoops')
      expect(wrapper.get('.shared-deal-sign').attributes('style')).toContain('opacity: 1')
    }
    await wrapper.setProps({ storyProgress: 0.985 })
    expect(wrapper.find('.join-community[inert]').exists()).toBe(false)
    await wrapper.get('.community-signup').trigger('click')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/register')
    await wrapper.setProps({ reduced: true, storyProgress: 0 })
    expect(wrapper.classes()).toContain('is-static')
    expect(wrapper.find('.join-community[inert]').exists()).toBe(false)
    expect(wrapper.get('.community-signup').attributes('href')).toBe('/register')
    expect(wrapper.get('.community-explore').attributes('href')).toBe('/browse')
    expect(wrapper.findAll('.community-report')).toHaveLength(5)
    wrapper.unmount()
  })
})

<script setup lang="ts">
import ThemeToggle from '@web/components/ThemeToggle.vue'
import { useMapPreferences } from '@web/modules/map-shell/map-preferences'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { MENU_LINK_ICONS, useMenuLinks } from '@web/modules/map-shell/use-menu-links'
import { useShellNavigation } from '@web/modules/map-shell/use-shell-navigation'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

// The site menu's rows on the Account page, for layouts with a bottom nav (which drop the menu
// button). Rows the bottom nav or the Account tabs already cover (Map, All deals, Saved, Share,
// Submitted) are left out; Squad has its own header button.
const navigationTo = useShellNavigation()
const mapPreferences = useMapPreferences()
const { user, activeCodeCount, codesText, menuGroups, logOut } = useMenuLinks()

const COVERED_GROUPS = ['Your activity', 'Explore']
const links = computed(() =>
  menuGroups.value.filter((group) => !COVERED_GROUPS.includes(group.label)).flatMap((group) => group.links),
)
</script>

<template>
  <nav class="account-more" aria-label="More" data-testid="account-more">
    <RouterLink v-if="user" class="account-more__row" :to="navigationTo({ name: 'codes' })" data-testid="account-codes-link">
      <ShellIcon name="ticket" :size="22" />
      <span class="account-more__text"><strong>My codes</strong><span class="lb-meta">{{ codesText }}</span></span>
      <span v-if="activeCodeCount > 0" class="lb-badge" aria-hidden="true">{{ activeCodeCount }}</span>
    </RouterLink>
    <RouterLink class="account-more__row" :to="navigationTo({ name: 'squad-join' })" data-testid="account-squad-join">
      <ShellIcon name="user" :size="22" />Join a Squad room with a code
    </RouterLink>
    <RouterLink v-for="link in links" :key="link.to" class="account-more__row" :to="navigationTo(link.to)">
      <ShellIcon :name="MENU_LINK_ICONS[link.to] || 'list'" :size="22" />{{ link.label }}
    </RouterLink>
    <ThemeToggle class="account-more__theme" />
    <button v-if="mapPreferences" class="account-more__row" type="button" data-testid="account-map-tutorial" @click="mapPreferences.startTutorial()">
      <ShellIcon name="help" :size="22" />Map tutorial
    </button>
    <button v-if="user" class="account-more__row account-more__logout" type="button" data-testid="account-log-out" @click="logOut">
      <ShellIcon name="logout" :size="22" />Log out
    </button>
  </nav>
</template>

<style scoped>
.account-more {
  display: flex;
  flex-direction: column;
}

/* Same rows as the brand menu, so the two read as one list. */
.account-more__row {
  display: flex;
  align-items: center;
  gap: 20px;
  width: 100%;
  min-height: 52px;
  padding: 10px 12px;
  font: 500 1rem/1.4 var(--font-sans);
  color: var(--ink);
  text-align: left;
  text-decoration: none;
  background: transparent;
  border: 0;
  border-radius: 12px;
  cursor: pointer;
}

.account-more__row:hover {
  color: var(--ink);
  background: var(--paper-hover);
}

.account-more__row:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: -2px;
}

.account-more__text {
  display: grid;
  flex: 1;
  min-width: 0;
}

.account-more__theme {
  margin-top: 4px;
  padding-block: 8px;
  border-top: 1px solid var(--hairline);
  border-radius: 0;
}

.account-more__logout {
  color: var(--coral-deep);
}
</style>

<script setup lang="ts">
import type { CitationDetail } from '@broke-oclock/contracts/ingestion-evidence'
import { BButton } from '@broke-oclock/ui'

defineProps<{ detail: CitationDetail; pending: boolean }>()
defineEmits<{ more: [] }>()

const safe = (value: string | null) => {
  try {
    const url = new URL(value ?? '')
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}
</script>

<template>
  <article aria-label="Citation detail" class="border p-3 text-break">
    <h4 class="h6">Pinned citation {{ detail.citation.id }}</h4>
    <p>{{ detail.format }} · {{ detail.availability }} · {{ detail.snapshotBytes }} UTF-8 bytes</p>
    <p>
      {{ detail.hashVerified ? 'Pinned snapshot hash verified' : 'WARNING: pinned snapshot hash does not verify' }}
    </p>
    <p v-if="detail.parseError">{{ detail.parseError }}</p>
    <p v-if="!detail.snapshot">
      Complete content unavailable. Unknown or oversized evidence is not reconstructed.
    </p>
    <details v-if="detail.parsed">
      <summary>Parsed display (not original evidence)</summary>
      <pre class="evidence-text">{{ JSON.stringify(detail.parsed, null, 2) }}</pre>
    </details>
    <details v-if="detail.snapshot">
      <summary>Exact immutable snapshot (escaped text)</summary>
      <pre class="evidence-text">{{ detail.snapshot }}</pre>
    </details>
    <h5 class="h6">Captured image provenance</h5>
    <p v-if="!detail.images.length">No images on this page.</p>
    <ul>
      <li v-for="image in detail.images" :key="image.id">
        {{ image.sha256 }} · {{ image.status }} · {{ image.mimeType }} · {{ image.sizeBytes }} bytes ·
        {{ image.altText ?? 'No alt text' }}<br />
        Source: {{ image.sourceUrl }}<br />
        Final URL: {{ image.finalUrl ?? 'Unavailable (historical provenance not recorded)' }}<br />
        <a
          v-if="safe(image.url)"
          :href="safe(image.url) ?? undefined"
          target="_blank"
          rel="noopener noreferrer"
        >Open hosted image</a>
      </li>
    </ul>
    <BButton v-if="detail.nextImageCursor" :disabled="pending" @click="$emit('more')">
      More image provenance
    </BButton>
  </article>
</template>

<style scoped>
.evidence-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 28rem;
  overflow: auto;
}
</style>

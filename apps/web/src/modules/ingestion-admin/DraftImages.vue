<script setup lang="ts">
import type { IngestionDraft } from '@broke-oclock/contracts/ingestion'
import DealImage from '@web/components/DealImage.vue'
import { safeMediaUrl, supportedImageMime } from '@web/lib/media-url'

defineProps<{ images: IngestionDraft['images']; title: string }>()
</script>

<template>
  <section class="mb-4" aria-label="Imported image evidence">
    <h4 class="h6">Imported images</h4>
    <p v-if="!images?.length">No imported images supplied.</p>
    <div v-else class="draft-images">
      <figure v-for="image in images" :key="image.sha256" class="m-0">
        <DealImage :url="image.status === 'HOSTED' && supportedImageMime(image.mimeType) ? image.url : null" :alt="image.altText?.trim() || title" />
        <figcaption class="small text-break mt-2">
          <p class="mb-1">Storage status: {{ image.status }}</p>
          <p class="mb-1">SHA-256: {{ image.sha256 }}</p>
          <a v-if="safeMediaUrl(image.sourceUrl)" data-testid="image-source" :href="safeMediaUrl(image.sourceUrl) ?? undefined" target="_blank" rel="noopener noreferrer">Original image source</a>
          <span v-else>Source link unavailable (unsafe or invalid URL).</span>
        </figcaption>
      </figure>
    </div>
  </section>
</template>

<style scoped>
.draft-images {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  gap: 1rem;
}
</style>

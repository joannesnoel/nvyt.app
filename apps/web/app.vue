<script setup lang="ts">
const config = useRuntimeConfig()
const appUrl = config.public.appUrl as string
const ogImageUrl = `${appUrl}/og-image.webp`

useHead({
  title: 'nvyt - Event & Ticketing Platform',
  meta: [
    { name: 'description', content: 'Create and manage events, sell tickets, and track contributions with nvyt.' },
  ],
  link: [
    { rel: 'icon', type: 'image/png', href: '/logo.png' },
  ],
})

useSeoMeta({
  ogImage: ogImageUrl,
  ogImageType: 'image/webp',
  twitterImage: ogImageUrl,
  twitterCard: 'summary_large_image',
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

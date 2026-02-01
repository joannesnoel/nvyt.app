<script setup lang="ts">
const config = useRuntimeConfig()
const appUrl = config.public.appUrl as string
const ogImageUrl = `${appUrl}/og-image.webp`

const defaultTitle = 'nvyt - Event & Ticketing Platform'
const defaultDescription = 'Create and manage events, sell tickets, and track contributions with nvyt.'

useHead({
  title: defaultTitle,
  meta: [
    { name: 'description', content: defaultDescription },
  ],
  link: [
    { rel: 'icon', type: 'image/png', href: '/logo.png' },
  ],
})

useSeoMeta({
  ogTitle: defaultTitle,
  ogDescription: defaultDescription,
  ogUrl: appUrl,
  ogType: 'website',
  ogSiteName: 'nvyt',
  ogImage: ogImageUrl,
  ogImageType: 'image/webp',
  twitterImage: ogImageUrl,
  twitterCard: 'summary_large_image',
  twitterTitle: defaultTitle,
  twitterDescription: defaultDescription,
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

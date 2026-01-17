<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const route = useRoute()
const eventId = computed(() => route.params.id as string)
const toast = useToast()
const { getThumbnailUrl } = useYoutubeThumbnail()

// Fetch event data
const { data: eventResponse, pending } = await useFetch(
  () => `/api/v1/events/by-id/${eventId.value}`,
  { watch: [eventId] }
)
const event = computed(() => eventResponse.value?.data)

// Panel state for mobile
const panelExpanded = ref(false)
const isMobile = ref(false)

// Check if mobile on mount
onMounted(() => {
  const checkMobile = () => {
    isMobile.value = window.innerWidth < 640
  }
  checkMobile()
  window.addEventListener('resize', checkMobile)
  onBeforeUnmount(() => window.removeEventListener('resize', checkMobile))
})

// Theme management
const selectedTheme = ref<'light' | 'dark' | null>(null) // null = Auto
const savedTheme = ref<'light' | 'dark' | null>(null) // Track what's saved in DB
const colorMode = useColorMode()
const originalColorMode = ref<string | null>(null) // User's original color mode preference
const isInitialized = ref(false)

// Color template management
type ColorTemplate = 'green' | 'lime' | 'cyan' | 'blue' | 'indigo' | 'violet' | 'purple' | 'pink' | 'red' | 'orange' | 'amber'
const selectedColor = ref<ColorTemplate>('green')
const savedColor = ref<ColorTemplate>('green')

// Color palette configuration with light/dark variants
const colorPalette: { name: ColorTemplate; label: string; light: string; dark: string }[] = [
  { name: 'green', label: 'Green', light: 'bg-green-700', dark: 'bg-green-300' },
  { name: 'lime', label: 'Lime', light: 'bg-lime-700', dark: 'bg-lime-300' },
  { name: 'cyan', label: 'Cyan', light: 'bg-cyan-700', dark: 'bg-cyan-300' },
  { name: 'blue', label: 'Blue', light: 'bg-blue-700', dark: 'bg-blue-300' },
  { name: 'indigo', label: 'Indigo', light: 'bg-indigo-700', dark: 'bg-indigo-300' },
  { name: 'violet', label: 'Violet', light: 'bg-violet-700', dark: 'bg-violet-300' },
  { name: 'purple', label: 'Purple', light: 'bg-purple-700', dark: 'bg-purple-300' },
  { name: 'pink', label: 'Pink', light: 'bg-pink-700', dark: 'bg-pink-300' },
  { name: 'red', label: 'Red', light: 'bg-red-700', dark: 'bg-red-300' },
  { name: 'orange', label: 'Orange', light: 'bg-orange-700', dark: 'bg-orange-300' },
  { name: 'amber', label: 'Amber', light: 'bg-amber-700', dark: 'bg-amber-300' },
]

// Color template mapping to Tailwind RGB values
const colorTemplateMap: Record<string, { 50: string; 100: string; 200: string; 300: string; 400: string; 500: string; 600: string; 700: string; 800: string; 900: string; 950: string }> = {
  green: { 50: '240 253 244', 100: '220 252 231', 200: '187 247 208', 300: '134 239 172', 400: '74 222 128', 500: '34 197 94', 600: '22 163 74', 700: '21 128 61', 800: '22 101 52', 900: '20 83 45', 950: '5 46 22' },
  lime: { 50: '247 254 231', 100: '236 252 203', 200: '217 249 157', 300: '190 242 100', 400: '163 230 53', 500: '132 204 22', 600: '101 163 13', 700: '77 124 15', 800: '63 98 18', 900: '54 83 20', 950: '26 46 5' },
  cyan: { 50: '236 254 255', 100: '207 250 254', 200: '165 243 252', 300: '103 232 249', 400: '34 211 238', 500: '6 182 212', 600: '8 145 178', 700: '14 116 144', 800: '21 94 117', 900: '22 78 99', 950: '8 51 68' },
  blue: { 50: '239 246 255', 100: '219 234 254', 200: '191 219 254', 300: '147 197 253', 400: '96 165 250', 500: '59 130 246', 600: '37 99 235', 700: '29 78 216', 800: '30 64 175', 900: '30 58 138', 950: '23 37 84' },
  indigo: { 50: '238 242 255', 100: '224 231 255', 200: '199 210 254', 300: '165 180 252', 400: '129 140 248', 500: '99 102 241', 600: '79 70 229', 700: '67 56 202', 800: '55 48 163', 900: '49 46 129', 950: '30 27 75' },
  violet: { 50: '245 243 255', 100: '237 233 254', 200: '221 214 254', 300: '196 181 253', 400: '167 139 250', 500: '139 92 246', 600: '124 58 237', 700: '109 40 217', 800: '91 33 182', 900: '76 29 149', 950: '46 16 101' },
  purple: { 50: '250 245 255', 100: '243 232 255', 200: '233 213 255', 300: '216 180 254', 400: '192 132 252', 500: '168 85 247', 600: '147 51 234', 700: '126 34 206', 800: '107 33 168', 900: '88 28 135', 950: '59 7 100' },
  pink: { 50: '253 242 248', 100: '252 231 243', 200: '251 207 232', 300: '249 168 212', 400: '244 114 182', 500: '236 72 153', 600: '219 39 119', 700: '190 24 93', 800: '157 23 77', 900: '131 24 67', 950: '80 7 36' },
  red: { 50: '254 242 242', 100: '254 226 226', 200: '254 202 202', 300: '252 165 165', 400: '248 113 113', 500: '239 68 68', 600: '220 38 38', 700: '185 28 28', 800: '153 27 27', 900: '127 29 29', 950: '69 10 10' },
  orange: { 50: '255 247 237', 100: '255 237 213', 200: '254 215 170', 300: '253 186 116', 400: '251 146 60', 500: '249 115 22', 600: '234 88 12', 700: '194 65 12', 800: '154 52 18', 900: '124 45 18', 950: '67 20 7' },
  amber: { 50: '255 251 235', 100: '254 243 199', 200: '253 230 138', 300: '252 211 77', 400: '251 191 36', 500: '245 158 11', 600: '217 119 6', 700: '180 83 9', 800: '146 64 14', 900: '120 53 15', 950: '69 26 3' },
}

// Computed CSS for color template preview (always set explicitly to ensure proper switching)
const colorTemplateStyle = computed(() => {
  const colors = colorTemplateMap[selectedColor.value] || colorTemplateMap.green

  return `
    :root {
      --color-primary-50: ${colors[50]};
      --color-primary-100: ${colors[100]};
      --color-primary-200: ${colors[200]};
      --color-primary-300: ${colors[300]};
      --color-primary-400: ${colors[400]};
      --color-primary-500: ${colors[500]};
      --color-primary-600: ${colors[600]};
      --color-primary-700: ${colors[700]};
      --color-primary-800: ${colors[800]};
      --color-primary-900: ${colors[900]};
      --color-primary-950: ${colors[950]};
    }
  `
})

// Inject color template styles for preview
useHead({
  style: [
    {
      key: 'preview-color-template',
      innerHTML: colorTemplateStyle,
    },
  ],
})

// Initialize selected theme and color from event data (only once)
watch(event, (newEvent) => {
  if (newEvent && !isInitialized.value) {
    const theme = newEvent.theme ?? null
    selectedTheme.value = theme
    savedTheme.value = theme
    const color = (newEvent.colorTemplate as ColorTemplate) || 'green'
    selectedColor.value = color
    savedColor.value = color
    isInitialized.value = true
  }
}, { immediate: true })

// Preview theme - computed based on selection
const previewTheme = computed(() => {
  if (selectedTheme.value === 'light') return 'light'
  if (selectedTheme.value === 'dark') return 'dark'
  // Auto (null) - use current system preference
  return colorMode.value
})

// Apply preview theme
watch(previewTheme, (theme) => {
  if (originalColorMode.value === null) {
    originalColorMode.value = colorMode.preference
  }
  colorMode.preference = theme
}, { immediate: true })

// Restore original color mode on unmount
onBeforeUnmount(() => {
  if (originalColorMode.value !== null) {
    colorMode.preference = originalColorMode.value
  }
})

// Auto-save appearance when theme changes
watch(selectedTheme, async (newTheme) => {
  if (!isInitialized.value || !event.value) return
  if (newTheme === savedTheme.value) return

  try {
    await $fetch(`/api/v1/events/${eventId.value}`, {
      method: 'PATCH',
      body: { theme: newTheme },
    })
    savedTheme.value = newTheme
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to save theme',
      color: 'red',
    })
    // Revert on error
    selectedTheme.value = savedTheme.value
  }
})

// Auto-save appearance when color changes
watch(selectedColor, async (newColor) => {
  if (!isInitialized.value || !event.value) return
  if (newColor === savedColor.value) return

  try {
    await $fetch(`/api/v1/events/${eventId.value}`, {
      method: 'PATCH',
      body: { colorTemplate: newColor },
    })
    savedColor.value = newColor
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to save color',
      color: 'red',
    })
    // Revert on error
    selectedColor.value = savedColor.value
  }
})

// YouTube embed URL helper
const youtubeEmbedUrl = computed(() => {
  const url = event.value?.promoVideoUrl
  if (!url) return null

  let videoId: string | null = null
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  if (watchMatch?.[1]) videoId = watchMatch[1]
  if (!videoId) {
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
    if (shortMatch?.[1]) videoId = shortMatch[1]
  }
  if (!videoId) {
    const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)
    if (embedMatch?.[1]) videoId = embedMatch[1]
  }

  if (videoId) {
    const params = new URLSearchParams({
      autoplay: '0',
      mute: '1',
      loop: '1',
      playlist: videoId,
      controls: '1',
      showinfo: '0',
      rel: '0',
      modestbranding: '1',
    })
    return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
  }
  return null
})

// Format date
function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="min-h-screen">
    <!-- Floating Control Panel -->
    <div class="fixed bottom-4 right-4 sm:top-20 sm:bottom-auto z-50">
      <!-- Collapsed state (mobile) -->
      <div v-if="!panelExpanded" class="sm:hidden">
        <UButton
          color="primary"
          size="lg"
          icon="i-heroicons-paint-brush"
          class="shadow-xl rounded-full"
          @click="panelExpanded = true"
        />
      </div>

      <!-- Expanded panel -->
      <UCard v-show="panelExpanded || !isMobile" class="w-56 sm:w-64 shadow-xl">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Preview</h3>
            <div class="flex gap-1">
              <UButton
                class="sm:hidden"
                color="gray"
                variant="ghost"
                size="xs"
                icon="i-heroicons-minus"
                @click="panelExpanded = false"
              />
              <UButton
                :to="`/dashboard/events/${eventId}`"
                color="gray"
                variant="ghost"
                size="xs"
                icon="i-heroicons-x-mark"
              />
            </div>
          </div>
        </template>

        <div class="space-y-3">
          <!-- Theme Selector -->
          <div>
            <p class="text-xs text-gray-500 mb-2">Theme</p>
            <div class="flex gap-1">
              <UButton
                :color="selectedTheme === null ? 'primary' : 'gray'"
                :variant="selectedTheme === null ? 'solid' : 'ghost'"
                size="xs"
                @click="selectedTheme = null"
              >
                <UIcon name="i-heroicons-computer-desktop" class="w-4 h-4" />
                <span class="hidden sm:inline ml-1">Auto</span>
              </UButton>
              <UButton
                :color="selectedTheme === 'light' ? 'primary' : 'gray'"
                :variant="selectedTheme === 'light' ? 'solid' : 'ghost'"
                size="xs"
                @click="selectedTheme = 'light'"
              >
                <UIcon name="i-heroicons-sun" class="w-4 h-4" />
                <span class="hidden sm:inline ml-1">Light</span>
              </UButton>
              <UButton
                :color="selectedTheme === 'dark' ? 'primary' : 'gray'"
                :variant="selectedTheme === 'dark' ? 'solid' : 'ghost'"
                size="xs"
                @click="selectedTheme = 'dark'"
              >
                <UIcon name="i-heroicons-moon" class="w-4 h-4" />
                <span class="hidden sm:inline ml-1">Dark</span>
              </UButton>
            </div>
          </div>

          <!-- Color Selector -->
          <div>
            <p class="text-xs text-gray-500 mb-2">Accent Color</p>
            <div class="grid grid-cols-7 sm:grid-cols-7 gap-1.5">
              <button
                v-for="color in colorPalette"
                :key="color.name"
                :class="[
                  'w-6 h-6 rounded-full transition-all overflow-hidden relative',
                  selectedColor === color.name
                    ? 'ring-2 ring-offset-2 ring-gray-900 dark:ring-white dark:ring-offset-gray-800'
                    : 'hover:scale-110'
                ]"
                :title="color.label"
                @click="selectedColor = color.name"
              >
                <!-- Light mode half (top-left) -->
                <span
                  :class="['absolute inset-0', color.light]"
                  style="clip-path: polygon(0 0, 100% 0, 0 100%);"
                />
                <!-- Dark mode half (bottom-right) -->
                <span
                  :class="['absolute inset-0', color.dark]"
                  style="clip-path: polygon(100% 0, 100% 100%, 0 100%);"
                />
              </button>
            </div>
          </div>

          <!-- Links -->
          <div class="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <UButton
              :to="`/dashboard/events/${eventId}/edit`"
              color="gray"
              variant="ghost"
              size="xs"
              class="flex-1"
            >
              <UIcon name="i-heroicons-pencil-square" class="w-3 h-3 sm:mr-1" />
              <span class="hidden sm:inline">Edit</span>
            </UButton>
            <UButton
              :to="`/events/${event?.slug}`"
              target="_blank"
              color="gray"
              variant="ghost"
              size="xs"
              class="flex-1"
            >
              <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3 h-3 sm:mr-1" />
              <span class="hidden sm:inline">Open</span>
            </UButton>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Loading -->
    <div v-if="pending" class="py-20 text-center">
      <USkeleton class="h-64 w-full max-w-4xl mx-auto mb-8" />
      <USkeleton class="h-8 w-1/3 mx-auto mb-4" />
      <USkeleton class="h-4 w-1/4 mx-auto" />
    </div>

    <!-- Preview Content -->
    <template v-else-if="event">
      <!-- Full-width YouTube Video -->
      <div v-if="event.mediaType === 'video' && youtubeEmbedUrl" class="relative w-full -mt-16 z-10 bg-gray-100 dark:bg-black">
        <div class="max-w-[1920px] mx-auto relative" style="padding-bottom: clamp(400px, 56.25%, 1080px);">
          <iframe
            :src="youtubeEmbedUrl"
            :title="event.title"
            class="absolute top-0 left-0 w-full h-full"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          ></iframe>
        </div>
      </div>

      <!-- Full-width Cover Image -->
      <div v-else-if="event.coverImage" class="relative w-full -mt-16 z-10 bg-gray-100 dark:bg-gray-900">
        <div class="max-w-[1920px] mx-auto relative" style="padding-bottom: clamp(400px, 56.25%, 1080px);">
          <img
            :src="event.coverImage"
            :alt="event.title"
            class="absolute top-0 left-0 w-full h-full object-cover"
          >
        </div>
      </div>

      <!-- Content Area -->
      <div class="relative z-20 bg-gray-50 dark:bg-gray-950 py-12" :class="{ '-mt-24': event.coverImage || (event.mediaType === 'video' && youtubeEmbedUrl) }">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 sm:p-8" :class="{ '-mt-28 lg:-mt-40': event.coverImage || (event.mediaType === 'video' && youtubeEmbedUrl) }">

            <!-- Event Header -->
            <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
              <div>
                <div v-if="event.visibility === 'private'" class="flex items-center gap-2 mb-2">
                  <UBadge color="gray" variant="soft">
                    <UIcon name="i-heroicons-lock-closed" class="w-3 h-3 mr-1" />
                    Private
                  </UBadge>
                </div>
                <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
                  {{ event.title }}
                </h1>
                <p class="text-gray-600 dark:text-gray-400 mt-2">
                  Organized by {{ event.organizationName || event.organizer?.name }}
                </p>
              </div>

              <!-- Action Button (demo) -->
              <div class="flex flex-col gap-2">
                <!-- Tickets mode -->
                <template v-if="event.registrationMode === 'tickets'">
                  <UButton color="primary" size="lg" class="pointer-events-none">
                    <UIcon name="i-heroicons-ticket" class="w-5 h-5 mr-2" />
                    Get Tickets
                  </UButton>
                </template>
                <!-- Open mode -->
                <template v-else-if="event.registrationMode === 'open'">
                  <UBadge color="green" size="lg" class="justify-center">
                    <UIcon name="i-heroicons-check-circle" class="w-4 h-4 mr-1" />
                    Open Event - Just Show Up!
                  </UBadge>
                  <p class="text-sm text-gray-500 text-center">
                    No registration required
                  </p>
                </template>
                <!-- RSVP mode (default) -->
                <template v-else>
                  <UButton color="primary" size="lg" class="pointer-events-none">
                    <UIcon name="i-heroicons-hand-raised" class="w-5 h-5 mr-2" />
                    RSVP to this Event
                  </UButton>
                </template>
                <p class="text-xs text-gray-400 text-center">Preview mode</p>
              </div>
            </div>

            <!-- Event Details Grid -->
            <div class="grid md:grid-cols-3 gap-8">
              <!-- Main Content -->
              <div class="md:col-span-2 space-y-8">
                <!-- Description -->
                <UCard>
                  <template #header>
                    <h2 class="font-semibold text-gray-900 dark:text-white">About this Event</h2>
                  </template>
                  <div class="prose dark:prose-invert max-w-none">
                    <p v-if="event.description" class="whitespace-pre-wrap">{{ event.description }}</p>
                    <p v-else class="text-gray-500">No description provided.</p>
                  </div>
                </UCard>
              </div>

              <!-- Sidebar -->
              <div class="space-y-4">
                <!-- Date & Time -->
                <UCard>
                  <div class="flex items-start gap-3">
                    <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                      <UIcon name="i-heroicons-calendar-days" class="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p class="font-medium text-gray-900 dark:text-white">Date & Time</p>
                      <p class="text-sm text-gray-600 dark:text-gray-400">
                        {{ formatDate(event.startDate) }}
                      </p>
                      <p v-if="event.endDate" class="text-sm text-gray-500">
                        to {{ formatDate(event.endDate) }}
                      </p>
                    </div>
                  </div>
                </UCard>

                <!-- Location -->
                <UCard v-if="event.location">
                  <div class="flex items-start gap-3">
                    <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                      <UIcon name="i-heroicons-map-pin" class="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p class="font-medium text-gray-900 dark:text-white">Location</p>
                      <p class="text-sm text-gray-600 dark:text-gray-400">
                        {{ event.location }}
                      </p>
                    </div>
                  </div>
                </UCard>

                <!-- Capacity -->
                <UCard>
                  <div class="flex items-start gap-3">
                    <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                      <UIcon name="i-heroicons-users" class="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p class="font-medium text-gray-900 dark:text-white">Capacity</p>
                      <p class="text-sm text-gray-600 dark:text-gray-400">
                        {{ event.maxAttendees ? `${event.maxAttendees} spots` : 'Unlimited' }}
                      </p>
                    </div>
                  </div>
                </UCard>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Not Found -->
    <div v-else class="text-center py-20">
      <UIcon name="i-heroicons-exclamation-triangle" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Event Not Found</h1>
      <p class="text-gray-600 dark:text-gray-400 mb-6">
        This event doesn't exist or you don't have access to it.
      </p>
      <UButton to="/dashboard" color="primary">Back to Dashboard</UButton>
    </div>
  </div>
</template>

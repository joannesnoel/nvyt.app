<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const route = useRoute()
const eventId = computed(() => route.params.id as string)
const toast = useToast()
const { getThumbnailUrl } = useYoutubeThumbnail()

// Fetch event data
const { data: eventResponse, pending, refresh } = await useFetch(
  () => `/api/v1/events/by-id/${eventId.value}`,
  { watch: [eventId] }
)
const event = computed(() => eventResponse.value?.data)

// Event Media state
const coverImage = ref('')
const promoVideoUrl = ref('')
const mediaType = ref<'image' | 'video'>('image')
const savedCoverImage = ref('')
const savedPromoVideoUrl = ref('')
const savedMediaType = ref<'image' | 'video'>('image')
const mediaInitialized = ref(false)

// Publish/Unpublish state
const isUpdating = ref(false)
const showPublishModal = ref(false)
const showUnpublishModal = ref(false)

// Fetch verification status for ticket-mode events
const { data: verificationResponse, refresh: refreshVerification } = await useFetch(
  () => `/api/v1/events/${eventId.value}/verification`,
  {
    watch: [eventId],
    immediate: true,
  }
)
const verification = computed(() => verificationResponse.value?.data)

// Verification modal
const showVerificationModal = ref(false)

// Update event status
async function updateEventStatus(status: 'draft' | 'published' | 'cancelled') {
  isUpdating.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}`, {
      method: 'PATCH',
      body: { status },
    })
    toast.add({
      title: 'Event Updated',
      description: `Event is now ${status}`,
      color: 'green',
    })
    await refresh()
  } catch (e: any) {
    // Check if this is a verification error
    if (e.data?.data?.code === 'VERIFICATION_REQUIRED' || e.data?.data?.code === 'VERIFICATION_NOT_APPROVED') {
      showVerificationModal.value = true
      await refreshVerification()
    }
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to update event',
      color: 'red',
    })
  } finally {
    isUpdating.value = false
  }
}

function confirmPublish() {
  showPublishModal.value = false
  updateEventStatus('published')
}

function confirmUnpublish() {
  showUnpublishModal.value = false
  updateEventStatus('draft')
}

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

// Font family management
type FontFamily = 'system' | 'inter' | 'roboto' | 'opensans' | 'lato' | 'montserrat' | 'poppins' | 'nunito' | 'raleway' | 'worksans' | 'dmsans' | 'quicksand' | 'playfair' | 'merriweather' | 'sourceserif' | 'librebaskerville' | 'crimsontext' | 'ebgaramond' | 'cormorant' | 'oswald' | 'bebasnueve' | 'anton' | 'archivoblack' | 'dancingscript' | 'greatvibes' | 'pacifico' | 'sacramento' | 'satisfy' | 'lobster'
const selectedTitleFont = ref<FontFamily>('system')
const savedTitleFont = ref<FontFamily>('system')
const selectedHeadingFont = ref<FontFamily>('system')
const savedHeadingFont = ref<FontFamily>('system')
const selectedBodyFont = ref<FontFamily>('system')
const savedBodyFont = ref<FontFamily>('system')

// Font palette configuration
const fontPalette: { name: FontFamily; label: string; family: string; category: 'sans' | 'serif' | 'display' | 'script' }[] = [
  // System
  { name: 'system', label: 'System Default', family: 'Inter, system-ui, sans-serif', category: 'sans' },
  // Display (most impactful for headings)
  { name: 'oswald', label: 'Oswald', family: '"Oswald", sans-serif', category: 'display' },
  { name: 'bebasnueve', label: 'Bebas Neue', family: '"Bebas Neue", sans-serif', category: 'display' },
  { name: 'anton', label: 'Anton', family: '"Anton", sans-serif', category: 'display' },
  { name: 'archivoblack', label: 'Archivo Black', family: '"Archivo Black", sans-serif', category: 'display' },
  // Script (elegant, handwritten)
  { name: 'dancingscript', label: 'Dancing Script', family: '"Dancing Script", cursive', category: 'script' },
  { name: 'greatvibes', label: 'Great Vibes', family: '"Great Vibes", cursive', category: 'script' },
  { name: 'pacifico', label: 'Pacifico', family: '"Pacifico", cursive', category: 'script' },
  { name: 'sacramento', label: 'Sacramento', family: '"Sacramento", cursive', category: 'script' },
  { name: 'satisfy', label: 'Satisfy', family: '"Satisfy", cursive', category: 'script' },
  { name: 'lobster', label: 'Lobster', family: '"Lobster", cursive', category: 'script' },
  // Sans-serif
  { name: 'inter', label: 'Inter', family: '"Inter", sans-serif', category: 'sans' },
  { name: 'roboto', label: 'Roboto', family: '"Roboto", sans-serif', category: 'sans' },
  { name: 'opensans', label: 'Open Sans', family: '"Open Sans", sans-serif', category: 'sans' },
  { name: 'lato', label: 'Lato', family: '"Lato", sans-serif', category: 'sans' },
  { name: 'montserrat', label: 'Montserrat', family: '"Montserrat", sans-serif', category: 'sans' },
  { name: 'poppins', label: 'Poppins', family: '"Poppins", sans-serif', category: 'sans' },
  { name: 'nunito', label: 'Nunito', family: '"Nunito", sans-serif', category: 'sans' },
  { name: 'raleway', label: 'Raleway', family: '"Raleway", sans-serif', category: 'sans' },
  { name: 'worksans', label: 'Work Sans', family: '"Work Sans", sans-serif', category: 'sans' },
  { name: 'dmsans', label: 'DM Sans', family: '"DM Sans", sans-serif', category: 'sans' },
  { name: 'quicksand', label: 'Quicksand', family: '"Quicksand", sans-serif', category: 'sans' },
  // Serif
  { name: 'playfair', label: 'Playfair Display', family: '"Playfair Display", serif', category: 'serif' },
  { name: 'merriweather', label: 'Merriweather', family: '"Merriweather", serif', category: 'serif' },
  { name: 'sourceserif', label: 'Source Serif', family: '"Source Serif Pro", serif', category: 'serif' },
  { name: 'librebaskerville', label: 'Libre Baskerville', family: '"Libre Baskerville", serif', category: 'serif' },
  { name: 'crimsontext', label: 'Crimson Text', family: '"Crimson Text", serif', category: 'serif' },
  { name: 'ebgaramond', label: 'EB Garamond', family: '"EB Garamond", serif', category: 'serif' },
  { name: 'cormorant', label: 'Cormorant Garamond', family: '"Cormorant Garamond", serif', category: 'serif' },
]

// Filtered font palettes for each dropdown
const titleFontPalette = computed(() => [
  fontPalette.find(f => f.name === 'system')!,
  ...fontPalette.filter(f => f.category === 'script'),
])
const headingFontPalette = computed(() => [
  fontPalette.find(f => f.name === 'system')!,
  ...fontPalette.filter(f => f.category === 'display'),
])
const bodyFontPalette = computed(() => [
  fontPalette.find(f => f.name === 'system')!,
  ...fontPalette.filter(f => f.category === 'sans' && f.name !== 'system'),
  ...fontPalette.filter(f => f.category === 'serif'),
])

// Google Fonts URL mapping
const fontUrlMap: Record<FontFamily, string> = {
  system: '',
  // Display
  oswald: 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap',
  bebasnueve: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap',
  anton: 'https://fonts.googleapis.com/css2?family=Anton&display=swap',
  archivoblack: 'https://fonts.googleapis.com/css2?family=Archivo+Black&display=swap',
  // Script
  dancingscript: 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600;700&display=swap',
  greatvibes: 'https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap',
  pacifico: 'https://fonts.googleapis.com/css2?family=Pacifico&display=swap',
  sacramento: 'https://fonts.googleapis.com/css2?family=Sacramento&display=swap',
  satisfy: 'https://fonts.googleapis.com/css2?family=Satisfy&display=swap',
  lobster: 'https://fonts.googleapis.com/css2?family=Lobster&display=swap',
  // Sans-serif
  inter: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  roboto: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap',
  opensans: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap',
  lato: 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap',
  montserrat: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap',
  poppins: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap',
  nunito: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap',
  raleway: 'https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700&display=swap',
  worksans: 'https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700&display=swap',
  dmsans: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap',
  quicksand: 'https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap',
  // Serif
  playfair: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap',
  merriweather: 'https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&display=swap',
  sourceserif: 'https://fonts.googleapis.com/css2?family=Source+Serif+Pro:wght@400;600;700&display=swap',
  librebaskerville: 'https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&display=swap',
  crimsontext: 'https://fonts.googleapis.com/css2?family=Crimson+Text:wght@400;600;700&display=swap',
  ebgaramond: 'https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600;700&display=swap',
  cormorant: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&display=swap',
}

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

// Computed CSS for font family preview
const fontFamilyStyle = computed(() => {
  const titleConfig = fontPalette.find(f => f.name === selectedTitleFont.value) || fontPalette[0]
  const headingConfig = fontPalette.find(f => f.name === selectedHeadingFont.value) || fontPalette[0]
  const bodyConfig = fontPalette.find(f => f.name === selectedBodyFont.value) || fontPalette[0]

  const styles: string[] = []

  // Apply title font to h1 (main event title)
  if (selectedTitleFont.value !== 'system') {
    styles.push(`
      h1 {
        font-family: ${titleConfig.family} !important;
      }
    `)
  }

  // Apply heading font to h2-h6 and buttons (with larger font size for display fonts)
  if (selectedHeadingFont.value !== 'system') {
    styles.push(`
      h2, h3, h4, h5, h6 {
        font-family: ${headingConfig.family} !important;
      }
      h2 { font-size: 1.375rem !important; }
      h3 { font-size: 1.15rem !important; }
      h4 { font-size: 1.05rem !important; }
      button, [role="button"], .btn, [class*="UButton"] {
        font-family: ${headingConfig.family} !important;
        font-size: 1.1rem !important;
      }
    `)
  }

  // Apply body font to body text (excluding buttons)
  if (selectedBodyFont.value !== 'system') {
    styles.push(`
      body, p, span, div, li, td, th, label, input, textarea {
        font-family: ${bodyConfig.family};
      }
    `)
  }

  return styles.join('\n')
})

// Google Font links for selected fonts
const fontLinks = computed(() => {
  const links: { rel: string; href: string }[] = []
  const usedUrls = new Set<string>()

  const titleUrl = fontUrlMap[selectedTitleFont.value]
  const headingUrl = fontUrlMap[selectedHeadingFont.value]
  const bodyUrl = fontUrlMap[selectedBodyFont.value]

  if (titleUrl && !usedUrls.has(titleUrl)) {
    links.push({ rel: 'stylesheet', href: titleUrl })
    usedUrls.add(titleUrl)
  }
  if (headingUrl && !usedUrls.has(headingUrl)) {
    links.push({ rel: 'stylesheet', href: headingUrl })
    usedUrls.add(headingUrl)
  }
  if (bodyUrl && !usedUrls.has(bodyUrl)) {
    links.push({ rel: 'stylesheet', href: bodyUrl })
    usedUrls.add(bodyUrl)
  }

  return links
})

// Inject styles for preview
useHead({
  style: [
    {
      key: 'preview-color-template',
      innerHTML: colorTemplateStyle,
    },
    {
      key: 'preview-font-family',
      innerHTML: fontFamilyStyle,
    },
  ],
  link: fontLinks,
})

// Initialize selected theme, color, and fonts from event data (only once)
watch(event, (newEvent) => {
  if (newEvent && !isInitialized.value) {
    const theme = newEvent.theme ?? null
    selectedTheme.value = theme
    savedTheme.value = theme
    const color = (newEvent.colorTemplate as ColorTemplate) || 'green'
    selectedColor.value = color
    savedColor.value = color
    const titleFont = (newEvent.titleFontFamily as FontFamily) || 'system'
    selectedTitleFont.value = titleFont
    savedTitleFont.value = titleFont
    const headingFont = (newEvent.fontFamily as FontFamily) || 'system'
    selectedHeadingFont.value = headingFont
    savedHeadingFont.value = headingFont
    const bodyFont = (newEvent.bodyFontFamily as FontFamily) || 'system'
    selectedBodyFont.value = bodyFont
    savedBodyFont.value = bodyFont
    isInitialized.value = true
  }
  // Initialize media state
  if (newEvent && !mediaInitialized.value) {
    coverImage.value = newEvent.coverImage || ''
    savedCoverImage.value = newEvent.coverImage || ''
    promoVideoUrl.value = newEvent.promoVideoUrl || ''
    savedPromoVideoUrl.value = newEvent.promoVideoUrl || ''
    mediaType.value = newEvent.mediaType || 'image'
    savedMediaType.value = newEvent.mediaType || 'image'
    mediaInitialized.value = true
  }
}, { immediate: true })

// Auto-save media when cover image changes
watch(coverImage, async (newValue) => {
  if (!mediaInitialized.value || !event.value) return
  if (newValue === savedCoverImage.value) return

  try {
    await $fetch(`/api/v1/events/${eventId.value}`, {
      method: 'PATCH',
      body: { coverImage: newValue || '' },
    })
    savedCoverImage.value = newValue
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to save cover image',
      color: 'red',
    })
    coverImage.value = savedCoverImage.value
  }
})

// Auto-save media when promo video URL changes (debounced for typing)
let promoVideoTimeout: ReturnType<typeof setTimeout> | null = null
watch(promoVideoUrl, async (newValue) => {
  if (!mediaInitialized.value || !event.value) return
  if (newValue === savedPromoVideoUrl.value) return

  // Clear previous timeout
  if (promoVideoTimeout) clearTimeout(promoVideoTimeout)

  // Debounce save for 500ms
  promoVideoTimeout = setTimeout(async () => {
    try {
      await $fetch(`/api/v1/events/${eventId.value}`, {
        method: 'PATCH',
        body: { promoVideoUrl: newValue || '' },
      })
      savedPromoVideoUrl.value = newValue
    } catch (e: any) {
      toast.add({
        title: 'Error',
        description: e.data?.message || 'Failed to save promo video',
        color: 'red',
      })
      promoVideoUrl.value = savedPromoVideoUrl.value
    }
  }, 500)
})

// Auto-save media type when it changes
watch(mediaType, async (newValue) => {
  if (!mediaInitialized.value || !event.value) return
  if (newValue === savedMediaType.value) return

  try {
    await $fetch(`/api/v1/events/${eventId.value}`, {
      method: 'PATCH',
      body: { mediaType: newValue },
    })
    savedMediaType.value = newValue
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to save media type',
      color: 'red',
    })
    mediaType.value = savedMediaType.value
  }
})

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

// Auto-save appearance when title font changes
watch(selectedTitleFont, async (newFont) => {
  if (!isInitialized.value || !event.value) return
  if (newFont === savedTitleFont.value) return

  try {
    await $fetch(`/api/v1/events/${eventId.value}`, {
      method: 'PATCH',
      body: { titleFontFamily: newFont },
    })
    savedTitleFont.value = newFont
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to save title font',
      color: 'red',
    })
    // Revert on error
    selectedTitleFont.value = savedTitleFont.value
  }
})

// Auto-save appearance when heading font changes
watch(selectedHeadingFont, async (newFont) => {
  if (!isInitialized.value || !event.value) return
  if (newFont === savedHeadingFont.value) return

  try {
    await $fetch(`/api/v1/events/${eventId.value}`, {
      method: 'PATCH',
      body: { fontFamily: newFont },
    })
    savedHeadingFont.value = newFont
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to save heading font',
      color: 'red',
    })
    // Revert on error
    selectedHeadingFont.value = savedHeadingFont.value
  }
})

// Auto-save appearance when body font changes
watch(selectedBodyFont, async (newFont) => {
  if (!isInitialized.value || !event.value) return
  if (newFont === savedBodyFont.value) return

  try {
    await $fetch(`/api/v1/events/${eventId.value}`, {
      method: 'PATCH',
      body: { bodyFontFamily: newFont },
    })
    savedBodyFont.value = newFont
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to save body font',
      color: 'red',
    })
    // Revert on error
    selectedBodyFont.value = savedBodyFont.value
  }
})

// YouTube embed URL helper (uses reactive promoVideoUrl)
const youtubeEmbedUrl = computed(() => {
  const url = promoVideoUrl.value
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
      autoplay: '1',
      mute: '1',
      loop: '1',
      playlist: videoId,
      controls: '1',
      showinfo: '0',
      rel: '0',
      modestbranding: '1',
      playsinline: '1',
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

// Format currency
function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount)
}

// Get category color for contributions
function getCategoryColor(category: string) {
  const colors: Record<string, string> = {
    food: 'orange',
    drinks: 'blue',
    supplies: 'green',
    equipment: 'purple',
    other: 'gray',
  }
  return colors[category] || 'gray'
}
</script>

<template>
  <div class="min-h-screen">
    <!-- Backdrop for dismissing panel (mobile only) -->
    <div
      v-if="panelExpanded && isMobile"
      class="fixed inset-0 z-40"
      @click="panelExpanded = false"
    />

    <!-- Floating Control Panel -->
    <div class="fixed bottom-4 right-4 sm:top-20 sm:bottom-auto z-50 flex flex-col items-end gap-3">
      <!-- Collapsed state (mobile) -->
      <div v-if="!panelExpanded" class="sm:hidden flex flex-col items-end gap-3">
        <UButton
          color="primary"
          size="xl"
          icon="i-heroicons-paint-brush"
          class="shadow-xl rounded-full !p-4"
          @click="panelExpanded = true"
        />
        <UButton
          :to="`/dashboard/events/${eventId}`"
          color="green"
          size="xl"
          icon="i-heroicons-check"
          class="shadow-xl rounded-full !p-4"
        />
      </div>

      <!-- Expanded panel -->
      <UCard v-show="panelExpanded || !isMobile" class="w-56 sm:w-64 shadow-xl max-h-[80vh] overflow-y-auto">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Customize</h3>
            <UButton
              class="sm:hidden"
              color="gray"
              variant="ghost"
              size="xs"
              icon="i-heroicons-minus"
              @click="panelExpanded = false"
            />
          </div>
        </template>

        <div class="space-y-3">
          <!-- Event Media Section -->
          <div>
            <p class="text-xs text-gray-500 mb-2">Event Media</p>
            <!-- Media Type Toggle -->
            <div class="flex gap-1 mb-2">
              <UButton
                :color="mediaType === 'image' ? 'primary' : 'gray'"
                :variant="mediaType === 'image' ? 'solid' : 'ghost'"
                size="xs"
                @click="mediaType = 'image'"
              >
                <UIcon name="i-heroicons-photo" class="w-3 h-3" />
                <span class="ml-1">Image</span>
              </UButton>
              <UButton
                :color="mediaType === 'video' ? 'primary' : 'gray'"
                :variant="mediaType === 'video' ? 'solid' : 'ghost'"
                size="xs"
                @click="mediaType = 'video'"
              >
                <UIcon name="i-heroicons-play-circle" class="w-3 h-3" />
                <span class="ml-1">Video</span>
              </UButton>
            </div>
            <!-- Cover Image Upload -->
            <div v-if="mediaType === 'image'">
              <ImageUpload
                v-model="coverImage"
                folder="events"
                placeholder="Upload cover image"
                :compact="true"
                cropper-title="Adjust Cover Image"
                :aspect-ratio="16 / 9"
              />
            </div>
            <!-- YouTube Video URL -->
            <div v-else>
              <UInput
                v-model="promoVideoUrl"
                placeholder="YouTube URL..."
                size="xs"
                icon="i-heroicons-play-circle"
              />
              <p class="text-xs text-gray-400 mt-1">Paste YouTube URL</p>
            </div>
          </div>

          <!-- Theme Selector -->
          <div>
            <p class="text-xs text-gray-500 mb-2">Theme</p>
            <div class="flex gap-1">
              <UButton
                :color="selectedTheme === 'light' ? 'primary' : 'gray'"
                :variant="selectedTheme === 'light' ? 'solid' : 'ghost'"
                size="xs"
                @click="selectedTheme = 'light'"
              >
                <UIcon name="i-heroicons-sun" class="w-3 h-3" />
                <span class="ml-1">Light</span>
              </UButton>
              <UButton
                :color="selectedTheme === 'dark' ? 'primary' : 'gray'"
                :variant="selectedTheme === 'dark' ? 'solid' : 'ghost'"
                size="xs"
                @click="selectedTheme = 'dark'"
              >
                <UIcon name="i-heroicons-moon" class="w-3 h-3" />
                <span class="ml-1">Dark</span>
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

          <!-- Font Selectors -->
          <div class="space-y-2">
            <p class="text-xs text-gray-500">Fonts</p>
            <!-- Title Font (Script fonts) -->
            <div>
              <p class="text-xs text-gray-400 mb-1">Title</p>
              <USelectMenu
                v-model="selectedTitleFont"
                :options="titleFontPalette"
                value-attribute="name"
                option-attribute="label"
                size="xs"
                class="w-full"
              >
                <template #label>
                  <span :style="{ fontFamily: fontPalette.find(f => f.name === selectedTitleFont)?.family }">
                    {{ fontPalette.find(f => f.name === selectedTitleFont)?.label }}
                  </span>
                </template>
                <template #option="{ option }">
                  <span :style="{ fontFamily: option.family }">{{ option.label }}</span>
                  <UBadge v-if="option.category === 'script'" size="xs" color="pink" variant="soft" class="ml-2">Script</UBadge>
                </template>
              </USelectMenu>
            </div>
            <!-- Heading Font (Display fonts) -->
            <div>
              <p class="text-xs text-gray-400 mb-1">Headings</p>
              <USelectMenu
                v-model="selectedHeadingFont"
                :options="headingFontPalette"
                value-attribute="name"
                option-attribute="label"
                size="xs"
                class="w-full"
              >
                <template #label>
                  <span :style="{ fontFamily: fontPalette.find(f => f.name === selectedHeadingFont)?.family }">
                    {{ fontPalette.find(f => f.name === selectedHeadingFont)?.label }}
                  </span>
                </template>
                <template #option="{ option }">
                  <span :style="{ fontFamily: option.family }">{{ option.label }}</span>
                  <UBadge v-if="option.category === 'display'" size="xs" color="primary" variant="soft" class="ml-2">Display</UBadge>
                </template>
              </USelectMenu>
            </div>
            <!-- Body Font (Sans-serif & Serif) -->
            <div>
              <p class="text-xs text-gray-400 mb-1">Body</p>
              <USelectMenu
                v-model="selectedBodyFont"
                :options="bodyFontPalette"
                value-attribute="name"
                option-attribute="label"
                size="xs"
                class="w-full"
              >
                <template #label>
                  <span :style="{ fontFamily: fontPalette.find(f => f.name === selectedBodyFont)?.family }">
                    {{ fontPalette.find(f => f.name === selectedBodyFont)?.label }}
                  </span>
                </template>
                <template #option="{ option }">
                  <span :style="{ fontFamily: option.family }">{{ option.label }}</span>
                  <UBadge v-if="option.category === 'serif'" size="xs" color="gray" variant="soft" class="ml-2">Serif</UBadge>
                </template>
              </USelectMenu>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Action buttons (below panel when expanded or on desktop) -->
      <div v-show="panelExpanded || !isMobile" class="flex flex-col gap-2">
        <!-- Publish/Unpublish -->
        <UButton
          v-if="event?.status === 'draft'"
          color="green"
          size="lg"
          icon="i-heroicons-rocket-launch"
          class="shadow-xl"
          :loading="isUpdating"
          @click="showPublishModal = true"
        >
          Publish
        </UButton>
        <UButton
          v-else-if="event?.status === 'published'"
          color="yellow"
          variant="outline"
          size="lg"
          icon="i-heroicons-pause"
          class="shadow-xl"
          :loading="isUpdating"
          @click="showUnpublishModal = true"
        >
          Unpublish
        </UButton>
        <!-- Done button -->
        <UButton
          :to="`/dashboard/events/${eventId}`"
          color="primary"
          variant="outline"
          size="lg"
          icon="i-heroicons-check"
          class="shadow-xl"
        >
          Done
        </UButton>
      </div>
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
      <div v-if="mediaType === 'video' && youtubeEmbedUrl" class="relative w-full -mt-16 z-10 bg-gray-100 dark:bg-black">
        <div class="max-w-[1920px] mx-auto relative" style="padding-bottom: clamp(400px, 56.25%, 1080px);">
          <iframe
            :src="youtubeEmbedUrl"
            :title="event.title"
            class="absolute top-0 left-0 w-full h-full"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          ></iframe>
          <!-- Color tint overlay -->
          <div
            class="absolute inset-0 pointer-events-none mix-blend-multiply dark:mix-blend-screen"
            :style="{ backgroundColor: `rgb(var(--color-primary-500) / 0.15)` }"
          />
        </div>
      </div>

      <!-- Full-width Cover Image -->
      <div v-else-if="coverImage" class="relative w-full -mt-16 z-10 bg-gray-100 dark:bg-gray-900">
        <div class="max-w-[1920px] mx-auto relative" style="padding-bottom: clamp(400px, 56.25%, 1080px);">
          <img
            :src="coverImage"
            :alt="event.title"
            class="absolute top-0 left-0 w-full h-full object-cover"
          >
          <!-- Color tint overlay -->
          <div
            class="absolute inset-0 pointer-events-none mix-blend-multiply dark:mix-blend-screen"
            :style="{ backgroundColor: `rgb(var(--color-primary-500) / 0.15)` }"
          />
        </div>
      </div>

      <!-- Placeholder when no media -->
      <div v-else class="relative w-full -mt-16 z-10">
        <div class="max-w-[1920px] mx-auto relative" style="padding-bottom: clamp(400px, 56.25%, 1080px);">
          <!-- Abstract pattern placeholder based on color -->
          <div
            class="absolute top-0 left-0 w-full h-full"
            :style="{
              background: `linear-gradient(135deg, rgb(var(--color-primary-100)) 0%, rgb(var(--color-primary-200)) 50%, rgb(var(--color-primary-300)) 100%)`
            }"
          >
            <!-- Pattern overlay -->
            <div class="absolute inset-0 opacity-20 dark:opacity-10" style="background-image: url(&quot;data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E&quot;); background-size: 30px 30px;"></div>
            <!-- Center text -->
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="text-center">
                <UIcon name="i-heroicons-photo" class="w-16 h-16 mx-auto mb-4" :style="{ color: 'rgb(var(--color-primary-600))' }" />
                <p class="text-lg font-medium" :style="{ color: 'rgb(var(--color-primary-700))' }">Add a cover image or video</p>
                <p class="text-sm" :style="{ color: 'rgb(var(--color-primary-600))' }">Use the panel on the right to upload</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Content Area -->
      <div class="relative z-20 bg-gray-50 dark:bg-gray-950 py-12 -mt-24">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 sm:p-8 -mt-28 lg:-mt-40">

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

                <!-- Contribution List -->
                <UCard v-if="event.contributionsEnabled && event.contributionItems?.length">
                  <template #header>
                    <div class="flex items-center justify-between">
                      <h2 class="font-semibold text-gray-900 dark:text-white">Contribution List</h2>
                      <p class="text-sm text-gray-500">Sign up to bring something!</p>
                    </div>
                  </template>
                  <div class="space-y-3">
                    <div
                      v-for="item in event.contributionItems"
                      :key="item.id"
                      class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                      :class="{ 'opacity-60': item.isFullyClaimed }"
                    >
                      <div class="flex items-start justify-between gap-3">
                        <div class="flex-1">
                          <div class="flex items-center gap-2 mb-1">
                            <p class="font-medium text-gray-900 dark:text-white">{{ item.name }}</p>
                            <UBadge :color="getCategoryColor(item.category) as any" variant="soft" size="xs">
                              {{ item.category }}
                            </UBadge>
                            <UBadge v-if="item.isFullyClaimed" color="green" variant="soft" size="xs">
                              Complete
                            </UBadge>
                          </div>
                          <p v-if="item.description" class="text-sm text-gray-500 mb-2">{{ item.description }}</p>
                          <div class="flex items-center gap-3 text-sm">
                            <span :class="item.isFullyClaimed ? 'text-green-600' : 'text-gray-600 dark:text-gray-400'">
                              {{ item.quantityClaimed || 0 }}/{{ item.quantityNeeded }} claimed
                            </span>
                          </div>
                        </div>
                        <div class="flex-shrink-0">
                          <UButton
                            v-if="!item.isFullyClaimed"
                            color="primary"
                            size="sm"
                            class="pointer-events-none"
                          >
                            I'll bring this
                          </UButton>
                        </div>
                      </div>
                      <UProgress
                        :value="((item.quantityClaimed || 0) / item.quantityNeeded) * 100"
                        :color="item.isFullyClaimed ? 'green' : 'primary'"
                        size="xs"
                        class="mt-2"
                      />
                    </div>
                  </div>
                </UCard>

                <!-- Announcements Section -->
                <UCard>
                  <template #header>
                    <div class="flex items-center gap-3">
                      <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                        <UIcon name="i-heroicons-megaphone" class="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h2 class="font-semibold text-gray-900 dark:text-white">Announcements</h2>
                        <p class="text-sm text-gray-500">Latest updates from the organizer</p>
                      </div>
                    </div>
                  </template>
                  <!-- Real announcements -->
                  <div v-if="event.announcements?.length" class="space-y-4">
                    <div
                      v-for="announcement in event.announcements"
                      :key="announcement.id"
                      class="relative"
                    >
                      <div class="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2 mb-1">
                            <UIcon
                              v-if="announcement.isPinned"
                              name="i-heroicons-bookmark-solid"
                              class="w-4 h-4 text-primary flex-shrink-0"
                            />
                            <h3 class="font-semibold text-gray-900 dark:text-white">
                              {{ announcement.title }}
                            </h3>
                          </div>
                          <p class="text-xs text-gray-500 mb-2">
                            {{ new Date(announcement.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
                          </p>
                          <p class="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                            {{ announcement.content }}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <!-- Sample placeholder when no announcements -->
                  <div v-else class="space-y-4 opacity-60">
                    <div class="relative">
                      <div class="absolute -top-2 -right-2 z-10">
                        <UBadge color="gray" variant="soft" size="xs">Sample</UBadge>
                      </div>
                      <div class="p-4 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50">
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2 mb-1">
                            <UIcon name="i-heroicons-bookmark-solid" class="w-4 h-4 text-primary flex-shrink-0" />
                            <h3 class="font-semibold text-gray-900 dark:text-white">Welcome to our event!</h3>
                          </div>
                          <p class="text-xs text-gray-500 mb-2">Jan 1, 2025</p>
                          <p class="text-gray-600 dark:text-gray-400">We're excited to have you join us. Stay tuned for more updates as the event approaches!</p>
                        </div>
                      </div>
                    </div>
                    <p class="text-xs text-center text-gray-400">
                      <NuxtLink :to="`/dashboard/events/${eventId}/announcements`" class="hover:text-primary">
                        Add announcements to keep attendees informed
                      </NuxtLink>
                    </p>
                  </div>
                </UCard>

                <!-- FAQs Section -->
                <UCard>
                  <template #header>
                    <div class="flex items-center gap-3">
                      <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                        <UIcon name="i-heroicons-question-mark-circle" class="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h2 class="font-semibold text-gray-900 dark:text-white">Frequently Asked Questions</h2>
                        <p class="text-sm text-gray-500">{{ event.faqs?.length || 0 }} question{{ event.faqs?.length !== 1 ? 's' : '' }}</p>
                      </div>
                    </div>
                  </template>
                  <!-- Real FAQs -->
                  <div v-if="event.faqs?.length" class="space-y-3">
                    <div
                      v-for="(faq, index) in event.faqs"
                      :key="faq.id"
                      class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
                    >
                      <UAccordion
                        :items="[{ label: faq.question, content: faq.answer, slot: 'faq-' + index }]"
                        :ui="{
                          wrapper: '',
                          item: { base: '', padding: '' },
                        }"
                      >
                        <template #default="{ open }">
                          <button
                            class="w-full flex items-start gap-3 p-4 text-left transition-colors"
                            :class="open ? 'bg-gray-50 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'"
                          >
                            <div
                              class="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
                              :class="open ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'"
                            >
                              {{ index + 1 }}
                            </div>
                            <span class="flex-1 font-medium text-gray-900 dark:text-white">
                              {{ faq.question }}
                            </span>
                            <UIcon
                              name="i-heroicons-chevron-down"
                              class="w-5 h-5 text-gray-400 transition-transform flex-shrink-0 mt-0.5"
                              :class="{ 'rotate-180 text-primary': open }"
                            />
                          </button>
                        </template>
                        <template #[`faq-${index}`]>
                          <div class="px-4 pb-4 pt-2">
                            <div class="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{{ faq.answer }}</div>
                          </div>
                        </template>
                      </UAccordion>
                    </div>
                  </div>
                  <!-- Sample placeholder when no FAQs -->
                  <div v-else class="space-y-3 opacity-60">
                    <div class="relative rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
                      <div class="absolute -top-2 -right-2 z-10">
                        <UBadge color="gray" variant="soft" size="xs">Sample</UBadge>
                      </div>
                      <div class="w-full flex items-start gap-3 p-4 text-left">
                        <div class="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                          1
                        </div>
                        <span class="flex-1 font-medium text-gray-900 dark:text-white">
                          What should I bring to the event?
                        </span>
                        <UIcon name="i-heroicons-chevron-down" class="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                      </div>
                    </div>
                    <div class="relative rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
                      <div class="w-full flex items-start gap-3 p-4 text-left">
                        <div class="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                          2
                        </div>
                        <span class="flex-1 font-medium text-gray-900 dark:text-white">
                          Is parking available?
                        </span>
                        <UIcon name="i-heroicons-chevron-down" class="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                      </div>
                    </div>
                    <p class="text-xs text-center text-gray-400">
                      <NuxtLink :to="`/dashboard/events/${eventId}/faqs`" class="hover:text-primary">
                        Add FAQs to answer common questions
                      </NuxtLink>
                    </p>
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

                <!-- Capacity (for RSVP mode) -->
                <UCard v-if="event.registrationMode === 'rsvp'">
                  <div class="flex items-start gap-3">
                    <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                      <UIcon name="i-heroicons-users" class="w-5 h-5 text-primary" />
                    </div>
                    <div class="flex-1">
                      <p class="font-medium text-gray-900 dark:text-white">Attendees</p>
                      <p class="text-sm text-gray-600 dark:text-gray-400">
                        {{ event.attendeeCount || 0 }}
                        <span v-if="event.maxAttendees"> / {{ event.maxAttendees }}</span>
                        <span v-else> attending</span>
                      </p>
                      <div v-if="event.maxAttendees" class="mt-2">
                        <UProgress
                          :value="((event.attendeeCount || 0) / event.maxAttendees) * 100"
                          :color="(event.attendeeCount || 0) >= event.maxAttendees ? 'red' : 'primary'"
                          size="sm"
                        />
                      </div>
                    </div>
                  </div>
                </UCard>

                <!-- Registration Info (for Open mode) -->
                <UCard v-if="event.registrationMode === 'open'">
                  <div class="flex items-start gap-3">
                    <div class="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                      <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p class="font-medium text-gray-900 dark:text-white">Open Event</p>
                      <p class="text-sm text-gray-600 dark:text-gray-400">
                        No registration required. Everyone is welcome!
                      </p>
                    </div>
                  </div>
                </UCard>

                <!-- Ticket Types (for Tickets mode) -->
                <UCard v-if="event.registrationMode === 'tickets' && event.ticketTypes?.length">
                  <template #header>
                    <h3 class="font-semibold text-gray-900 dark:text-white">Tickets</h3>
                  </template>
                  <div class="space-y-3">
                    <div
                      v-for="ticket in event.ticketTypes"
                      :key="ticket.id"
                      class="flex items-center justify-between"
                    >
                      <div>
                        <p class="font-medium text-gray-900 dark:text-white">{{ ticket.name }}</p>
                        <p class="text-sm text-gray-500">
                          {{ ticket.quantity ? `${ticket.quantity - (ticket.quantitySold || 0)} left` : 'Unlimited' }}
                        </p>
                      </div>
                      <p class="font-semibold text-primary">
                        {{ Number(ticket.price) === 0 ? 'Free' : formatCurrency(Number(ticket.price)) }}
                      </p>
                    </div>
                  </div>
                  <template #footer>
                    <UButton
                      color="primary"
                      block
                      class="pointer-events-none"
                    >
                      Get Tickets
                    </UButton>
                  </template>
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

    <!-- Publish Confirmation Modal -->
    <UModal v-model="showPublishModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <UIcon name="i-heroicons-rocket-launch" class="w-5 h-5 text-green-600" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Publish Event
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <p class="text-gray-600 dark:text-gray-400">
            Are you ready to publish <span class="font-semibold text-gray-900 dark:text-white">{{ event?.title }}</span>?
          </p>

          <div class="space-y-2">
            <h4 class="font-medium text-gray-900 dark:text-white">Once published:</h4>
            <ul class="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li v-if="event?.visibility === 'public'">Your event will be visible to the public</li>
              <li v-else>Your event will be accessible via invite link</li>
              <li v-if="event?.registrationMode === 'tickets'">Attendees will be able to purchase tickets</li>
              <li v-else>Attendees will be able to RSVP</li>
              <li>You can still edit event details after publishing</li>
            </ul>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showPublishModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="green"
              :loading="isUpdating"
              @click="confirmPublish"
            >
              Publish Event
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Unpublish Confirmation Modal -->
    <UModal v-model="showUnpublishModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <UIcon name="i-heroicons-pause" class="w-5 h-5 text-yellow-600" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Unpublish Event
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <p class="text-gray-600 dark:text-gray-400">
            Are you sure you want to unpublish <span class="font-semibold text-gray-900 dark:text-white">{{ event?.title }}</span>?
          </p>

          <div class="space-y-2">
            <h4 class="font-medium text-gray-900 dark:text-white">What happens when you unpublish:</h4>
            <ul class="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>The public event page will no longer be accessible</li>
              <li>New RSVPs and ticket purchases will be disabled</li>
              <li>Existing attendees will keep their tickets/RSVPs</li>
              <li>You can republish the event at any time</li>
            </ul>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showUnpublishModal = false"
            >
              Keep Published
            </UButton>
            <UButton
              color="yellow"
              :loading="isUpdating"
              @click="confirmUnpublish"
            >
              Unpublish Event
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Verification Required Modal -->
    <UModal v-model="showVerificationModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <UIcon name="i-heroicons-shield-check" class="w-5 h-5 text-yellow-600" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Verification Required
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <p class="text-gray-600 dark:text-gray-400">
            Events selling paid tickets require business verification before they can be published.
            This helps ensure a safe and trustworthy experience for ticket buyers.
          </p>

          <div v-if="verification?.status === 'rejected'" class="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p class="text-sm font-medium text-red-800 dark:text-red-200">
              Your verification was rejected:
            </p>
            <p class="text-sm text-red-600 dark:text-red-300 mt-1">
              {{ verification?.verification?.rejectionReason || 'Please resubmit with valid documents.' }}
            </p>
          </div>

          <div class="space-y-2">
            <h4 class="font-medium text-gray-900 dark:text-white">What you'll need:</h4>
            <ul class="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>Business registration documents (DTI/SEC for Philippines)</li>
              <li>Valid government-issued business license</li>
              <li>Business registration number</li>
            </ul>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showVerificationModal = false"
            >
              Close
            </UButton>
            <UButton
              :to="`/dashboard/events/${eventId}/verification`"
              color="primary"
              @click="showVerificationModal = false"
            >
              {{ verification?.status === 'not_submitted' ? 'Start Verification' : 'View Verification' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

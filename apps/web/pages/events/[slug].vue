<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const route = useRoute()
const slug = computed(() => route.params.slug as string)
const token = computed(() => route.query.token as string | undefined)
const inviteToken = computed(() => route.query.invite as string | undefined)

const toast = useToast()
const { user, isLoading: authLoading } = useAuth()
const { trackBeginCheckout } = useAnalytics()

// Theme management - apply event's theme preference
const colorMode = useColorMode()
const originalTheme = ref<string | null>(null)

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

// Font family mapping
type FontFamily = 'system' | 'inter' | 'roboto' | 'opensans' | 'lato' | 'montserrat' | 'poppins' | 'nunito' | 'raleway' | 'worksans' | 'dmsans' | 'quicksand' | 'playfair' | 'merriweather' | 'sourceserif' | 'librebaskerville' | 'crimsontext' | 'ebgaramond' | 'cormorant' | 'oswald' | 'bebasnueve' | 'anton' | 'archivoblack' | 'dancingscript' | 'greatvibes' | 'pacifico' | 'sacramento' | 'satisfy' | 'lobster'
const fontFamilyMap: Record<FontFamily, string> = {
  system: 'Inter, system-ui, sans-serif',
  // Display
  oswald: '"Oswald", sans-serif',
  bebasnueve: '"Bebas Neue", sans-serif',
  anton: '"Anton", sans-serif',
  archivoblack: '"Archivo Black", sans-serif',
  // Script
  dancingscript: '"Dancing Script", cursive',
  greatvibes: '"Great Vibes", cursive',
  pacifico: '"Pacifico", cursive',
  sacramento: '"Sacramento", cursive',
  satisfy: '"Satisfy", cursive',
  lobster: '"Lobster", cursive',
  // Sans-serif
  inter: '"Inter", sans-serif',
  roboto: '"Roboto", sans-serif',
  opensans: '"Open Sans", sans-serif',
  lato: '"Lato", sans-serif',
  montserrat: '"Montserrat", sans-serif',
  poppins: '"Poppins", sans-serif',
  nunito: '"Nunito", sans-serif',
  raleway: '"Raleway", sans-serif',
  worksans: '"Work Sans", sans-serif',
  dmsans: '"DM Sans", sans-serif',
  quicksand: '"Quicksand", sans-serif',
  // Serif
  playfair: '"Playfair Display", serif',
  merriweather: '"Merriweather", serif',
  sourceserif: '"Source Serif Pro", serif',
  librebaskerville: '"Libre Baskerville", serif',
  crimsontext: '"Crimson Text", serif',
  ebgaramond: '"EB Garamond", serif',
  cormorant: '"Cormorant Garamond", serif',
}

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

// Fetch event data - use $fetch for proper SSR support
const { data: eventResponse, status, refresh, error: fetchError } = await useAsyncData(
  `event-${route.params.slug}`,
  () => $fetch<{ success: boolean; data: any }>(`/api/v1/events/by-slug/${route.params.slug}`, {
    query: { token: route.query.token || undefined },
  }).catch((err) => {
    // Return null on error so we can handle it gracefully
    console.error('Failed to fetch event:', err)
    return null
  }),
  {
    watch: [slug, token],
  }
)

const pending = computed(() => status.value === 'pending')
const event = computed(() => eventResponse.value?.data)
const apiError = computed(() => {
  if (fetchError.value) {
    return (fetchError.value as any).data?.message || fetchError.value.message || 'Failed to load event'
  }
  if (status.value === 'success' && !eventResponse.value) {
    return 'Failed to load event'
  }
  return null
})
const isOrganizer = computed(() => event.value?.isOrganizer)

// Computed CSS for color template (skip 'green' to use NuxtUI default)
const colorTemplateStyle = computed(() => {
  const colorTemplate = event.value?.colorTemplate || 'green'
  if (colorTemplate === 'green') return ''

  const colors = colorTemplateMap[colorTemplate] || colorTemplateMap.green

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

// Computed CSS for font families (title, heading, and body)
const fontFamilyStyle = computed(() => {
  const titleFont = (event.value?.titleFontFamily as FontFamily) || 'system'
  const headingFont = (event.value?.fontFamily as FontFamily) || 'system'
  const bodyFont = (event.value?.bodyFontFamily as FontFamily) || 'system'

  const styles: string[] = []

  // Apply title font to h1 (main event title)
  if (titleFont !== 'system') {
    const titleFamily = fontFamilyMap[titleFont] || fontFamilyMap.system
    styles.push(`
      h1 {
        font-family: ${titleFamily} !important;
      }
    `)
  }

  // Apply heading font to h2-h6 and buttons (with larger font size for display fonts)
  if (headingFont !== 'system') {
    const headingFamily = fontFamilyMap[headingFont] || fontFamilyMap.system
    styles.push(`
      h2, h3, h4, h5, h6 {
        font-family: ${headingFamily} !important;
      }
      h2 { font-size: 1.375rem !important; }
      h3 { font-size: 1.15rem !important; }
      h4 { font-size: 1.05rem !important; }
      button, [role="button"], .btn, [class*="UButton"] {
        font-family: ${headingFamily} !important;
        font-size: 1.1rem !important;
      }
    `)
  }

  // Apply body font to body text (excluding buttons)
  if (bodyFont !== 'system') {
    const bodyFamily = fontFamilyMap[bodyFont] || fontFamilyMap.system
    styles.push(`
      body, p, span, div, li, td, th, label, input, textarea {
        font-family: ${bodyFamily};
      }
    `)
  }

  return styles.join('\n')
})

// Google Font links for title, heading and body fonts
const fontLinks = computed(() => {
  const titleFont = (event.value?.titleFontFamily as FontFamily) || 'system'
  const headingFont = (event.value?.fontFamily as FontFamily) || 'system'
  const bodyFont = (event.value?.bodyFontFamily as FontFamily) || 'system'

  const links: { rel: string; href: string }[] = []
  const usedUrls = new Set<string>()

  const titleUrl = fontUrlMap[titleFont]
  const headingUrl = fontUrlMap[headingFont]
  const bodyUrl = fontUrlMap[bodyFont]

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

// Inject styles
useHead({
  style: [
    {
      key: 'event-color-template',
      innerHTML: colorTemplateStyle,
    },
    {
      key: 'event-font-family',
      innerHTML: fontFamilyStyle,
    },
  ],
  link: fontLinks,
})

// SEO meta tags for social sharing
const config = useRuntimeConfig()
const { getThumbnailUrl } = useYoutubeThumbnail()
const ogTitle = computed(() => event.value?.title || 'Event')
const ogDescription = computed(() => {
  const desc = event.value?.description || 'Join this event on nvyt'
  // Truncate to 160 characters for optimal social preview
  return desc.length > 160 ? desc.substring(0, 157) + '...' : desc
})
const ogImage = computed(() => {
  // If media type is video and we have a promo video URL, use the YouTube thumbnail
  if (event.value?.mediaType === 'video' && event.value?.promoVideoUrl) {
    const thumbnail = getThumbnailUrl(event.value.promoVideoUrl)
    if (thumbnail) return thumbnail
  }
  // Fallback to cover image
  return event.value?.coverImage || ''
})
const ogUrl = computed(() => `${config.public.appUrl}/events/${route.params.slug}`)

useSeoMeta({
  title: ogTitle,
  description: ogDescription,
  ogTitle,
  ogDescription,
  ogImage,
  ogUrl,
  ogType: 'website',
  ogSiteName: 'nvyt',
  twitterCard: 'summary_large_image',
  twitterTitle: ogTitle,
  twitterDescription: ogDescription,
  twitterImage: ogImage,
})
const userAttendee = computed(() => event.value?.userAttendee)

// YouTube embed URL helper
const youtubeEmbedUrl = computed(() => {
  const url = event.value?.promoVideoUrl
  if (!url) return null

  let videoId: string | null = null

  // Standard watch URL: youtube.com/watch?v=VIDEO_ID
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  if (watchMatch) videoId = watchMatch[1]

  // Short URL: youtu.be/VIDEO_ID
  if (!videoId) {
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
    if (shortMatch) videoId = shortMatch[1]
  }

  // Embed URL: youtube.com/embed/VIDEO_ID
  if (!videoId) {
    const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)
    if (embedMatch) videoId = embedMatch[1]
  }

  if (videoId) {
    const params = new URLSearchParams({
      autoplay: '1',
      mute: '1',
      loop: '1',
      playlist: videoId,
      controls: '0',
      showinfo: '0',
      rel: '0',
      modestbranding: '1',
      playsinline: '1',
      enablejsapi: '1',
    })
    return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
  }

  return null
})

// RSVP state
const rsvpLoading = ref(false)
const showRsvpModal = ref(false)
const rsvpGuestForm = ref({
  name: '',
  email: '',
})

function openRsvpModal() {
  rsvpGuestForm.value = { name: '', email: '' }
  showRsvpModal.value = true
}

// Cancel RSVP confirmation modal
const showCancelRsvpModal = ref(false)
const cancelRsvpConfirmText = ref('')
const CANCEL_CONFIRM_PHRASE = 'CANCEL'

function openCancelRsvpModal() {
  cancelRsvpConfirmText.value = ''
  showCancelRsvpModal.value = true
}

function closeCancelRsvpModal() {
  showCancelRsvpModal.value = false
  cancelRsvpConfirmText.value = ''
}

async function confirmCancelRsvp() {
  if (cancelRsvpConfirmText.value !== CANCEL_CONFIRM_PHRASE) return
  closeCancelRsvpModal()
  await cancelRsvp()
}

// Ticket purchase state
const showTicketModal = ref(false)
const ticketCart = ref<Record<string, number>>({})
const isCheckingOut = ref(false)

// Guest checkout state
const showGuestForm = ref(false)
const guestForm = ref({
  name: '',
  email: '',
})

// Checkout error state
const checkoutError = ref<string | null>(null)

// Payment provider state
type PaymentProvider = 'paymongo' | 'paypal'
const selectedPaymentProvider = ref<PaymentProvider>('paymongo')

// PayPal configuration check (uses config from SEO meta section)
const isPayPalConfigured = computed(() => !!config.public.paypalClientId)

// Requirements state
const requirementResponses = ref<Record<string, boolean | undefined>>({})

function openTicketModal() {
  // Initialize cart with 0 for each ticket type
  if (event.value?.ticketTypes) {
    const cart: Record<string, number> = {}
    for (const tt of event.value.ticketTypes) {
      cart[tt.id] = 0
    }
    ticketCart.value = cart
  }
  // Reset guest form
  showGuestForm.value = false
  guestForm.value = { name: '', email: '' }
  // Clear any previous error
  checkoutError.value = null
  // Reset payment provider state
  selectedPaymentProvider.value = 'paymongo'
  // Initialize requirement responses (all checkboxes start unchecked)
  if (event.value?.requirements) {
    const responses: Record<string, boolean | undefined> = {}
    for (const req of event.value.requirements) {
      responses[req.id] = false
    }
    requirementResponses.value = responses
  }
  showTicketModal.value = true
}

function updateTicketQuantity(ticketTypeId: string, delta: number) {
  const tt = event.value?.ticketTypes?.find((t: any) => t.id === ticketTypeId)
  if (!tt) return

  const current = ticketCart.value[ticketTypeId] || 0
  const newValue = current + delta

  // Validate min/max
  if (newValue < 0) return
  if (newValue > tt.maxPerOrder) return

  // Check tier quantity limit first, then overall ticket quantity
  if (tt.tierQuantityRemaining !== null && newValue > tt.tierQuantityRemaining) return
  if (tt.quantity && newValue > (tt.quantity - tt.quantitySold)) return

  ticketCart.value[ticketTypeId] = newValue
}

const cartTotal = computed(() => {
  if (!event.value?.ticketTypes) return 0
  let total = 0
  for (const [id, qty] of Object.entries(ticketCart.value)) {
    const tt = event.value.ticketTypes.find((t: any) => t.id === id)
    if (tt && qty > 0) {
      // Use active price (from tier or base)
      const price = parseFloat(tt.activePrice ?? tt.price)
      total += price * qty
    }
  }
  return total
})

// Processing fee constants (same as backend)
const PROCESSING_FEE_RATE = 0.035 // 3.5%

// Calculate fee breakdown for display
const feeBreakdown = computed(() => {
  const subtotal = cartTotal.value
  const adminFeeRate = event.value?.adminFeeRate ?? 0

  if (subtotal <= 0) {
    return { subtotal: 0, processingFee: 0, adminFee: 0, totalFees: 0, total: 0 }
  }

  // Processing fee: 3.5%
  const processingFee = Math.round(subtotal * PROCESSING_FEE_RATE * 100) / 100

  // Admin fee: additional percentage set per event
  const adminFee = Math.round(subtotal * adminFeeRate * 100) / 100

  const totalFees = Math.round((processingFee + adminFee) * 100) / 100
  const total = Math.round((subtotal + totalFees) * 100) / 100

  return { subtotal, processingFee, adminFee, totalFees, total }
})

const cartItemCount = computed(() => {
  return Object.values(ticketCart.value).reduce((a, b) => a + b, 0)
})

// Check if all requirements are satisfied (all checkboxes must be checked)
const requirementsSatisfied = computed(() => {
  if (!event.value?.requirements?.length) return true

  for (const req of event.value.requirements) {
    if (requirementResponses.value[req.id] !== true) {
      return false
    }
  }
  return true
})

// Check if a specific ticket type is currently on sale
function isTicketOnSale(ticket: any): boolean {
  if (ticket.status !== 'active') return false
  if (ticket.isSoldOut) return false

  // If a tier is currently active, the ticket is on sale
  if (!ticket.isBaseTier && ticket.activeTierName) {
    return true
  }

  const now = new Date()

  // Check ticket type's sales window
  if (ticket.salesStart && new Date(ticket.salesStart) > now) return false
  if (ticket.salesEnd && new Date(ticket.salesEnd) < now) return false

  return true
}

// Get the display price for a ticket (upcoming tier price if not on sale, otherwise active price)
function getDisplayPrice(ticket: any): string {
  // If ticket is on sale, show active price
  if (isTicketOnSale(ticket)) {
    return ticket.activePrice ?? ticket.price
  }

  // If not on sale yet but has upcoming tier, show that tier's price
  if (ticket.nextTier?.price) {
    return ticket.nextTier.price
  }

  // Fallback to active/base price
  return ticket.activePrice ?? ticket.price
}

// Get sales status message for a ticket
function getTicketSalesStatus(ticket: any): { status: 'on_sale' | 'not_started' | 'ended' | 'sold_out' | 'disabled', message: string, upcomingTier?: string } {
  if (ticket.status !== 'active') {
    return { status: 'disabled', message: 'Not available' }
  }
  if (ticket.isSoldOut) {
    return { status: 'sold_out', message: 'Sold out' }
  }

  // If a tier is currently active, ticket is on sale
  if (!ticket.isBaseTier && ticket.activeTierName) {
    return { status: 'on_sale', message: '' }
  }

  const now = new Date()

  // Check if sales haven't started yet (and no active tier)
  if (ticket.salesStart && new Date(ticket.salesStart) > now) {
    // If there's a next tier, show when that tier starts instead
    const startDate = ticket.nextTier?.startsAt
      ? new Date(ticket.nextTier.startsAt)
      : new Date(ticket.salesStart)

    const tierName = ticket.nextTier?.name ? ` (${ticket.nextTier.name})` : ''

    return {
      status: 'not_started',
      message: `Sales start ${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${tierName}`
    }
  }

  if (ticket.salesEnd && new Date(ticket.salesEnd) < now) {
    return { status: 'ended', message: 'Sales ended' }
  }

  // Sales window is open - ticket is on sale
  // But if using base price and there's an upcoming tier, include that info
  if (ticket.isBaseTier && ticket.nextTier) {
    const tierStart = new Date(ticket.nextTier.startsAt)
    if (tierStart > now) {
      return {
        status: 'on_sale',
        message: '',
        upcomingTier: `${ticket.nextTier.name} starts ${tierStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
      }
    }
  }

  return { status: 'on_sale', message: '' }
}

// Check if any ticket is currently on sale
const hasTicketsOnSale = computed(() => {
  if (!event.value?.ticketTypes?.length) return false
  return event.value.ticketTypes.some((t: any) => isTicketOnSale(t))
})

// Check if event is sold out (capacity reached)
const isEventSoldOut = computed(() => {
  if (!event.value) return false
  if (event.value.maxAttendees === null) return false

  // For ticket-based events, use ticketCount
  if (event.value.registrationMode === 'tickets') {
    return (event.value.ticketCount ?? 0) >= event.value.maxAttendees
  }

  // For RSVP events, use attendeeCount
  return (event.value.attendeeCount ?? 0) >= event.value.maxAttendees
})

// Calculate remaining capacity
const remainingCapacity = computed(() => {
  if (!event.value || event.value.maxAttendees === null) return null

  if (event.value.registrationMode === 'tickets') {
    return event.value.maxAttendees - (event.value.ticketCount ?? 0)
  }

  return event.value.maxAttendees - (event.value.attendeeCount ?? 0)
})

function validateRequirements(): boolean {
  if (!event.value?.requirements?.length) return true

  for (const req of event.value.requirements) {
    if (requirementResponses.value[req.id] !== true) {
      toast.add({
        title: 'Requirements',
        description: `You must agree to: "${req.text}"`,
        color: 'yellow',
      })
      return false
    }
  }
  return true
}

async function checkout() {
  if (!event.value) return
  if (cartItemCount.value === 0) {
    toast.add({
      title: 'No Tickets Selected',
      description: 'Please select at least one ticket.',
      color: 'yellow',
    })
    return
  }

  // Validate requirements
  if (!validateRequirements()) return

  // For PayPal, redirect directly - no guest form needed
  if (selectedPaymentProvider.value === 'paypal' && cartTotal.value > 0) {
    await checkoutWithPayPal()
    return
  }

  // For PayMongo or free tickets, need guest info if not logged in
  if (!user.value) {
    if (!showGuestForm.value) {
      showGuestForm.value = true
      return
    }

    // Validate guest form
    if (!guestForm.value.name || guestForm.value.name.length < 2) {
      toast.add({
        title: 'Name Required',
        description: 'Please enter your name (at least 2 characters).',
        color: 'yellow',
      })
      return
    }
    if (!guestForm.value.email || !guestForm.value.email.includes('@')) {
      toast.add({
        title: 'Valid Email Required',
        description: 'Please enter a valid email address.',
        color: 'yellow',
      })
      return
    }
  }

  isCheckingOut.value = true
  try {
    const items = Object.entries(ticketCart.value)
      .filter(([_, qty]) => qty > 0)
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }))

    // Track begin_checkout event in Google Analytics
    trackBeginCheckout({
      value: feeBreakdown.value.total,
      currency: 'PHP',
      items: items.map(({ ticketTypeId, quantity }) => {
        const tt = event.value!.ticketTypes?.find((t: any) => t.id === ticketTypeId)
        return {
          item_id: ticketTypeId,
          item_name: tt?.name || 'Ticket',
          price: parseFloat(tt?.price || '0'),
          quantity,
          item_category: event.value!.title,
        }
      }),
    })

    // Build requirement responses array
    const reqResponses = event.value.requirements?.length
      ? Object.entries(requirementResponses.value).map(([requirementId, response]) => ({
          requirementId,
          response: response ?? false,
        }))
      : undefined

    const response = await $fetch('/api/v1/orders/checkout', {
      method: 'POST',
      body: {
        eventId: event.value.id,
        items,
        customerName: user.value?.name || guestForm.value.name,
        customerEmail: user.value?.email || guestForm.value.email,
        isGuest: !user.value,
        paymentProvider: selectedPaymentProvider.value,
        requirementResponses: reqResponses,
      },
    }) as any

    if (response.data.checkoutUrl) {
      // Redirect to PayMongo checkout
      window.location.href = response.data.checkoutUrl
    } else {
      // Free tickets or completed
      if (response.data.accountSetupRequired) {
        toast.add({
          title: 'Tickets Confirmed!',
          description: 'Check your email to set up your account and access your tickets.',
          color: 'green',
          timeout: 8000,
        })
      } else {
        toast.add({
          title: 'Tickets Confirmed!',
          description: 'Your free tickets have been confirmed.',
          color: 'green',
        })
      }
      showTicketModal.value = false

      // Check if registration is required
      if (response.data.registrationRequired) {
        navigateTo(`/orders/${response.data.order.orderNumber}/register`)
      } else {
        navigateTo(`/orders/${response.data.order.orderNumber}/success`)
      }
    }
  } catch (e: any) {
    console.error('Checkout error:', e)

    // Handle account exists error
    if (e.data?.data?.code === 'ACCOUNT_EXISTS_WITH_PASSWORD') {
      toast.add({
        title: 'Account Exists',
        description: 'An account with this email already exists. Please log in.',
        color: 'yellow',
        timeout: 8000,
      })
      showTicketModal.value = false
      navigateTo(`/login?redirect=/events/${event.value?.slug}`)
      return
    }

    // Extract error message from various possible locations
    const errorMessage = e.data?.message || e.statusMessage || e.message || 'Failed to process checkout. Please try again.'

    // Set inline error for visibility in the modal
    checkoutError.value = errorMessage

    toast.add({
      title: 'Checkout Failed',
      description: errorMessage,
      color: 'red',
      timeout: 6000,
    })

    // Refresh event data to get updated availability
    await refresh()
  } finally {
    isCheckingOut.value = false
  }
}

// PayPal redirect flow - initiate and redirect to PayPal
async function checkoutWithPayPal() {
  if (!event.value) return

  isCheckingOut.value = true
  checkoutError.value = null

  try {
    const items = Object.entries(ticketCart.value)
      .filter(([_, qty]) => qty > 0)
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }))

    // Track begin_checkout event
    trackBeginCheckout({
      value: feeBreakdown.value.total,
      currency: 'PHP',
      items: items.map(({ ticketTypeId, quantity }) => {
        const tt = event.value!.ticketTypes?.find((t: any) => t.id === ticketTypeId)
        return {
          item_id: ticketTypeId,
          item_name: tt?.name || 'Ticket',
          price: parseFloat(tt?.price || '0'),
          quantity,
          item_category: event.value!.title,
        }
      }),
    })

    // Initiate PayPal checkout
    const response = await $fetch('/api/v1/paypal/initiate', {
      method: 'POST',
      body: {
        eventId: event.value.id,
        items,
      },
    }) as any

    if (response.data?.approvalUrl) {
      // Redirect to PayPal
      window.location.href = response.data.approvalUrl
    } else {
      throw new Error('Failed to initiate PayPal checkout')
    }
  } catch (e: any) {
    console.error('PayPal checkout error:', e)
    checkoutError.value = e.data?.message || e.message || 'Failed to initiate PayPal checkout'
    toast.add({
      title: 'Checkout Failed',
      description: checkoutError.value,
      color: 'red',
    })
    isCheckingOut.value = false
  }
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount)
}

async function handleRsvp(isGuest = false) {
  if (!event.value) return

  // If guest and form not filled, validate
  if (isGuest) {
    if (!rsvpGuestForm.value.name || rsvpGuestForm.value.name.length < 2) {
      toast.add({
        title: 'Name Required',
        description: 'Please enter your name (at least 2 characters).',
        color: 'yellow',
      })
      return
    }
    if (!rsvpGuestForm.value.email || !rsvpGuestForm.value.email.includes('@')) {
      toast.add({
        title: 'Valid Email Required',
        description: 'Please enter a valid email address.',
        color: 'yellow',
      })
      return
    }
  }

  rsvpLoading.value = true
  try {
    const response = await $fetch(`/api/v1/events/${event.value.id}/rsvp`, {
      method: 'POST',
      body: isGuest
        ? {
            isGuest: true,
            guestName: rsvpGuestForm.value.name,
            guestEmail: rsvpGuestForm.value.email,
            inviteToken: inviteToken.value,
          }
        : {
            inviteToken: inviteToken.value,
          },
    }) as any

    // Close modal if open
    showRsvpModal.value = false

    if (response.data?.accountSetupRequired) {
      toast.add({
        title: 'RSVP Successful!',
        description: 'Check your email to set up your account and view your RSVP.',
        color: 'green',
        timeout: 8000,
      })
    } else {
      toast.add({
        title: 'RSVP Successful',
        description: 'You have successfully RSVP\'d to this event',
        color: 'green',
      })
    }

    await refresh()
  } catch (e: any) {
    // Handle account exists error
    if (e.data?.data?.code === 'ACCOUNT_EXISTS_WITH_PASSWORD') {
      toast.add({
        title: 'Account Exists',
        description: 'An account with this email already exists. Please log in.',
        color: 'yellow',
        timeout: 8000,
      })
      showRsvpModal.value = false
      navigateTo(`/login?redirect=/events/${event.value?.slug}`)
      return
    }

    toast.add({
      title: 'RSVP Failed',
      description: e.data?.message || 'Failed to RSVP',
      color: 'red',
    })
  } finally {
    rsvpLoading.value = false
  }
}

async function cancelRsvp() {
  if (!event.value) return

  rsvpLoading.value = true
  try {
    await $fetch(`/api/v1/events/${event.value.id}/rsvp`, {
      method: 'DELETE' as const,
    })

    toast.add({
      title: 'RSVP Cancelled',
      description: 'Your RSVP has been cancelled',
      color: 'green',
    })

    await refresh()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to cancel RSVP',
      color: 'red',
    })
  } finally {
    rsvpLoading.value = false
  }
}

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

// Price tier countdown
const currentTime = ref(new Date())
let countdownInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  // Update current time every minute for countdown display
  countdownInterval = setInterval(() => {
    currentTime.value = new Date()
  }, 60000) // Update every minute
})

onBeforeUnmount(() => {
  if (countdownInterval) {
    clearInterval(countdownInterval)
  }
})

function formatCountdown(targetDate: string): string {
  const target = new Date(targetDate)
  const now = currentTime.value
  const diff = target.getTime() - now.getTime()

  if (diff <= 0) return 'soon'

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

// Status badge color
function getStatusColor(status: string) {
  switch (status) {
    case 'confirmed': return 'green'
    case 'pending': return 'yellow'
    case 'waitlisted': return 'orange'
    case 'declined': return 'red'
    case 'cancelled': return 'gray'
    default: return 'gray'
  }
}

// Contribution claiming state
const showClaimModal = ref(false)
const claimingItem = ref<any>(null)
const claimForm = ref({
  quantity: 1,
  notes: '',
})
const isClaimLoading = ref(false)

// Check if user can claim contributions (must be confirmed attendee)
const canClaimContributions = computed(() => {
  return user.value && userAttendee.value?.status === 'confirmed' && !isOrganizer.value
})

// Fetch contributions for this event
const { data: contributionsResponse, refresh: refreshContributions } = await useFetch<{ data?: any[] }>(
  () => event.value?.id ? `/api/v1/events/${event.value.id}/contributions` as const : null!,
  {
    watch: [event],
    immediate: false,
  }
)
const contributions = computed(() => contributionsResponse.value?.data ?? event.value?.contributionItems ?? [])

// Refresh contributions when event loads
watch(event, (e) => {
  if (e?.contributionsEnabled) {
    refreshContributions()
  }
}, { immediate: true })

function openClaimModal(item: any) {
  claimingItem.value = item
  claimForm.value = {
    quantity: 1,
    notes: '',
  }
  showClaimModal.value = true
}

async function claimContribution() {
  if (!event.value || !claimingItem.value) return

  isClaimLoading.value = true
  try {
    await $fetch(`/api/v1/events/${event.value.id}/contributions/${claimingItem.value.id}/claim`, {
      method: 'POST',
      body: claimForm.value,
    })
    toast.add({
      title: 'Claimed!',
      description: `You signed up to bring ${claimingItem.value.name}`,
      color: 'green',
    })
    showClaimModal.value = false
    await refreshContributions()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to claim item',
      color: 'red',
    })
  } finally {
    isClaimLoading.value = false
  }
}

async function unclaimContribution(item: any) {
  if (!event.value) return

  isClaimLoading.value = true
  try {
    await $fetch(`/api/v1/events/${event.value.id}/contributions/${item.id}/claim`, {
      method: 'DELETE' as const,
    })
    toast.add({
      title: 'Removed',
      description: 'Your contribution claim has been removed',
      color: 'green',
    })
    await refreshContributions()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || 'Failed to remove claim',
      color: 'red',
    })
  } finally {
    isClaimLoading.value = false
  }
}

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

// Apply event theme when event data loads
watch(event, (newEvent) => {
  if (newEvent?.theme) {
    // Store original theme preference on first application
    if (originalTheme.value === null) {
      originalTheme.value = colorMode.preference
    }
    // Apply event's theme
    colorMode.preference = newEvent.theme
  }
}, { immediate: true })

// Restore original theme when leaving the page
onBeforeUnmount(() => {
  if (originalTheme.value !== null) {
    colorMode.preference = originalTheme.value
  }
})
</script>

<template>
  <div>
    <!-- Full-width YouTube Video (scrolls with page, behind navbar and content) -->
    <!-- Capped at 1920px width so video height stays reasonable on 4K screens -->
    <div v-if="event && event.mediaType === 'video' && youtubeEmbedUrl" class="relative w-full -mt-16 z-10 bg-gray-100 dark:bg-black">
      <div class="max-w-[1920px] mx-auto relative" style="padding-bottom: clamp(400px, 56.25%, 1080px);">
        <iframe
          :src="youtubeEmbedUrl"
          :title="event.title"
          class="absolute top-0 left-0 w-full h-full"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        ></iframe>
        <!-- Color tint overlay (also prevents hover interactions) -->
        <div
          class="absolute inset-0 pointer-events-none mix-blend-multiply dark:mix-blend-screen"
          :style="{ backgroundColor: `rgb(var(--color-primary-500) / 0.15)` }"
        />
      </div>
    </div>

    <!-- Full-width Cover Image (same layout as video) -->
    <div v-else-if="event && event.mediaType !== 'video' && event.coverImage" class="relative w-full -mt-16 z-10 bg-gray-100 dark:bg-gray-900">
      <div class="max-w-[1920px] mx-auto relative" style="padding-bottom: clamp(400px, 56.25%, 1080px);">
        <img
          :src="event.coverImage"
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

    <!-- #1 - Full-width background (overlays lower part of media) -->
    <div class="relative z-20 bg-gray-50 dark:bg-gray-950 py-12" :class="{ '-mt-24': event && ((event.mediaType === 'video' && youtubeEmbedUrl) || (event.mediaType !== 'video' && event.coverImage)) }">
      <!-- #2 - Narrower content box (overlays more of the media) -->
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 sm:p-8" :class="{ '-mt-28 lg:-mt-40': event && ((event.mediaType === 'video' && youtubeEmbedUrl) || (event.mediaType !== 'video' && event.coverImage)) }">
        <!-- Loading -->
        <div v-if="pending" class="space-y-4">
        <USkeleton class="h-64 w-full rounded-xl" />
        <USkeleton class="h-8 w-2/3" />
        <USkeleton class="h-4 w-1/3" />
        <USkeleton class="h-32 w-full" />
      </div>

      <!-- Error / Not Found -->
      <div v-else-if="!event || apiError" class="text-center py-20">
        <UIcon name="i-heroicons-calendar-days" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Event Not Found</h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          {{ apiError || "This event doesn't exist or you don't have access to it." }}
        </p>
        <UButton to="/events" color="primary">Browse Events</UButton>
      </div>

      <!-- Event Content -->
      <div v-else>
        <!-- Event Header -->
        <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
          <div>
            <div v-if="event.visibility === 'private' || event.status === 'cancelled'" class="flex items-center gap-2 mb-2">
              <UBadge v-if="event.visibility === 'private'" color="gray" variant="soft">
                <UIcon name="i-heroicons-lock-closed" class="w-3 h-3 mr-1" />
                Private
              </UBadge>
              <UBadge v-if="event.status === 'cancelled'" color="red" variant="soft">
                Cancelled
              </UBadge>
            </div>
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
              {{ event.title }}
            </h1>
            <p class="text-gray-600 dark:text-gray-400 mt-2">
              Organized by {{ event.organizationName || event.organizer?.name }}
            </p>
          </div>

          <!-- Action Buttons -->
          <div class="flex flex-col gap-2">
            <!-- Organizer Actions -->
            <template v-if="isOrganizer">
              <UButton
                :to="`/dashboard/events/${event.id}`"
                color="primary"
                icon="i-heroicons-cog-6-tooth"
              >
                Manage Event
              </UButton>
              <UButton
                :to="`/dashboard/events/${event.id}/attendees`"
                color="gray"
                variant="outline"
                icon="i-heroicons-users"
              >
                View Attendees ({{ event.attendeeCount }})
              </UButton>
            </template>

            <!-- Attendee Actions -->
            <template v-else>
              <!-- Loading auth state -->
              <template v-if="authLoading">
                <USkeleton class="h-10 w-full" />
              </template>

              <!-- Registration Mode: RSVP -->
              <template v-else-if="event.registrationMode === 'rsvp'">
                <!-- Already RSVP'd -->
                <template v-if="userAttendee">
                  <UBadge :color="getStatusColor(userAttendee.status)" size="lg" class="justify-center">
                    {{ userAttendee.status === 'confirmed' ? 'You\'re going!' :
                       userAttendee.status === 'pending' ? 'Awaiting Approval' :
                       userAttendee.status === 'waitlisted' ? 'On Waitlist' :
                       userAttendee.status }}
                  </UBadge>
                  <UButton
                    v-if="userAttendee.status !== 'cancelled'"
                    color="red"
                    variant="outline"
                    @click="openCancelRsvpModal"
                  >
                    Cancel RSVP
                  </UButton>
                </template>

                <!-- Not RSVP'd -->
                <UButton
                  v-else-if="user"
                  color="primary"
                  size="lg"
                  :loading="rsvpLoading"
                  @click="handleRsvp(false)"
                >
                  <UIcon name="i-heroicons-hand-raised" class="w-5 h-5 mr-2" />
                  RSVP to this Event
                </UButton>
                <UButton
                  v-else
                  color="primary"
                  size="lg"
                  @click="openRsvpModal"
                >
                  <UIcon name="i-heroicons-hand-raised" class="w-5 h-5 mr-2" />
                  RSVP to this Event
                </UButton>
              </template>

              <!-- Registration Mode: Tickets -->
              <template v-else-if="event.registrationMode === 'tickets'">
                <template v-if="isEventSoldOut">
                  <UButton
                    color="gray"
                    size="lg"
                    disabled
                  >
                    <UIcon name="i-heroicons-x-circle" class="w-5 h-5 mr-2" />
                    Sold Out
                  </UButton>
                </template>
                <template v-else-if="event.ticketTypes?.length">
                  <UButton
                    color="primary"
                    size="lg"
                    @click="openTicketModal"
                  >
                    <UIcon name="i-heroicons-ticket" class="w-5 h-5 mr-2" />
                    Get Tickets
                  </UButton>
                  <p v-if="remainingCapacity !== null && remainingCapacity <= 10" class="text-sm text-orange-600 text-center mt-2">
                    Only {{ remainingCapacity }} spots left!
                  </p>
                </template>
                <p v-else class="text-sm text-gray-500 text-center">
                  No tickets available
                </p>
              </template>

              <!-- Registration Mode: Open -->
              <template v-else-if="event.registrationMode === 'open'">
                <UBadge color="green" size="lg" class="justify-center">
                  <UIcon name="i-heroicons-check-circle" class="w-4 h-4 mr-1" />
                  Open Event - Just Show Up!
                </UBadge>
                <p class="text-sm text-gray-500 text-center">
                  No registration required
                </p>
              </template>

              <!-- Fallback for events without registrationMode (legacy) -->
              <template v-else>
                <UButton
                  v-if="user"
                  color="primary"
                  size="lg"
                  :loading="rsvpLoading"
                  @click="handleRsvp(false)"
                >
                  <UIcon name="i-heroicons-hand-raised" class="w-5 h-5 mr-2" />
                  RSVP to this Event
                </UButton>
                <UButton
                  v-else
                  color="primary"
                  size="lg"
                  @click="openRsvpModal"
                >
                  <UIcon name="i-heroicons-hand-raised" class="w-5 h-5 mr-2" />
                  RSVP to this Event
                </UButton>
              </template>
            </template>
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
            <UCard v-if="event.contributionsEnabled && contributions?.length">
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="font-semibold text-gray-900 dark:text-white">Contribution List</h2>
                  <p v-if="canClaimContributions" class="text-sm text-gray-500">
                    Sign up to bring something!
                  </p>
                </div>
              </template>
              <div class="space-y-3">
                <div
                  v-for="item in contributions"
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
                          {{ item.quantityClaimed }}/{{ item.quantityNeeded }} claimed
                        </span>
                      </div>
                      <!-- User's claim indicator -->
                      <p v-if="item.userClaim" class="text-sm text-primary mt-1">
                        You're bringing {{ item.userClaim.quantity }}x
                        <span v-if="item.userClaim.notes" class="text-gray-500">- "{{ item.userClaim.notes }}"</span>
                      </p>
                    </div>
                    <div class="flex-shrink-0">
                      <!-- Claim/Unclaim buttons -->
                      <template v-if="canClaimContributions">
                        <UButton
                          v-if="item.userClaim"
                          color="red"
                          variant="outline"
                          size="sm"
                          :loading="isClaimLoading"
                          @click="unclaimContribution(item)"
                        >
                          Remove
                        </UButton>
                        <UButton
                          v-else-if="!item.isFullyClaimed"
                          color="primary"
                          size="sm"
                          :loading="isClaimLoading"
                          @click="openClaimModal(item)"
                        >
                          I'll bring this
                        </UButton>
                      </template>
                    </div>
                  </div>
                  <!-- Progress bar -->
                  <UProgress
                    :value="(item.quantityClaimed / item.quantityNeeded) * 100"
                    :color="item.isFullyClaimed ? 'green' : 'primary'"
                    size="xs"
                    class="mt-2"
                  />
                  <!-- Claims list (show who's bringing what) -->
                  <div v-if="item.claims?.length > 0" class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <p class="text-xs text-gray-500 mb-1">Who's bringing this:</p>
                    <div class="flex flex-wrap gap-2">
                      <div
                        v-for="claim in item.claims"
                        :key="claim.id"
                        class="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400"
                      >
                        <UAvatar :src="claim.user?.avatarUrl" :alt="claim.user?.name" size="2xs" />
                        <span>{{ claim.user?.name }}</span>
                        <span v-if="claim.quantity > 1">({{ claim.quantity }}x)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <!-- Info for non-attendees -->
              <template v-if="!canClaimContributions && !isOrganizer" #footer>
                <p class="text-sm text-gray-500 text-center">
                  <template v-if="!user">
                    <NuxtLink :to="`/login?redirect=/events/${event.slug}`" class="text-primary hover:underline">Log in</NuxtLink>
                    and RSVP to sign up for contributions
                  </template>
                  <template v-else-if="!userAttendee">
                    RSVP to this event to sign up for contributions
                  </template>
                  <template v-else-if="userAttendee.status !== 'confirmed'">
                    Your RSVP must be confirmed to sign up for contributions
                  </template>
                </p>
              </template>
            </UCard>

            <!-- Announcements Section -->
            <UCard v-if="event.announcements?.length">
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
              <div class="space-y-4">
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
            </UCard>

            <!-- FAQs Section -->
            <UCard v-if="event.faqs?.length">
              <template #header>
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                    <UIcon name="i-heroicons-question-mark-circle" class="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 class="font-semibold text-gray-900 dark:text-white">Frequently Asked Questions</h2>
                    <p class="text-sm text-gray-500">{{ event.faqs.length }} question{{ event.faqs.length !== 1 ? 's' : '' }}</p>
                  </div>
                </div>
              </template>
              <div class="space-y-3">
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
                <div>
                  <p class="font-medium text-gray-900 dark:text-white">Attendees</p>
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    {{ event.attendeeCount }}
                    <span v-if="event.maxAttendees"> / {{ event.maxAttendees }}</span>
                    <span v-else> attending</span>
                  </p>
                  <div v-if="event.maxAttendees" class="mt-2">
                    <UProgress
                      :value="(event.attendeeCount / event.maxAttendees) * 100"
                      :color="event.attendeeCount >= event.maxAttendees ? 'red' : 'primary'"
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
              <div class="space-y-4">
                <div
                  v-for="ticket in event.ticketTypes"
                  :key="ticket.id"
                  class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  :class="{ 'opacity-60': !isTicketOnSale(ticket) }"
                >
                  <div class="flex items-start justify-between mb-1">
                    <div>
                      <p class="font-medium text-gray-900 dark:text-white">{{ ticket.name }}</p>
                      <div class="flex flex-wrap items-center gap-2 mt-1">
                        <UBadge v-if="ticket.activeTierName && isTicketOnSale(ticket)" color="primary" variant="soft" size="xs">
                          {{ ticket.activeTierName }}
                        </UBadge>
                        <UBadge
                          v-if="getTicketSalesStatus(ticket).status !== 'on_sale'"
                          :color="getTicketSalesStatus(ticket).status === 'not_started' ? 'blue' : 'gray'"
                          variant="soft"
                          size="xs"
                        >
                          {{ getTicketSalesStatus(ticket).message }}
                        </UBadge>
                        <UBadge
                          v-if="ticket.showNextTierPrice !== false && getTicketSalesStatus(ticket).upcomingTier"
                          color="blue"
                          variant="soft"
                          size="xs"
                        >
                          {{ getTicketSalesStatus(ticket).upcomingTier }}
                        </UBadge>
                      </div>
                    </div>
                    <p class="font-semibold text-primary text-lg">
                      <!-- Show upcoming tier price if not on sale yet, otherwise show active price -->
                      {{ Number(getDisplayPrice(ticket)) === 0 ? 'Free' : formatCurrency(Number(getDisplayPrice(ticket))) }}
                    </p>
                  </div>
                  <!-- Show availability: tier quantity takes priority over ticket quantity -->
                  <p v-if="isTicketOnSale(ticket) && ticket.showAvailability !== false" class="text-sm text-gray-500 mb-1">
                    <template v-if="ticket.tierQuantityRemaining !== null">
                      {{ ticket.tierQuantityRemaining }} left at this price
                    </template>
                    <template v-else-if="ticket.quantity">
                      {{ ticket.quantity - ticket.quantitySold }} left
                    </template>
                    <template v-else>
                      Unlimited
                    </template>
                  </p>
                  <!-- Urgency message for low tier quantity -->
                  <p
                    v-if="isTicketOnSale(ticket) && ticket.tierQuantityRemaining !== null && ticket.tierQuantityRemaining <= 20 && ticket.tierQuantityRemaining > 0"
                    class="text-xs text-amber-600 dark:text-amber-400 mb-1 font-medium"
                  >
                    Only {{ ticket.tierQuantityRemaining }} tickets left at this price!
                  </p>
                  <p
                    v-else-if="isTicketOnSale(ticket) && ticket.nextTier && (ticket.nextTier.afterQuantity || ticket.nextTier.startsAt) && Number(ticket.nextTier.price) > Number(ticket.activePrice ?? ticket.price)"
                    class="text-xs text-amber-600 dark:text-amber-400 mb-1"
                  >
                    Limited tickets only. Price increases once sold out.
                  </p>
                  <!-- Show countdown or quantity trigger info for next tier -->
                  <div
                    v-if="ticket.showNextTierPrice !== false && isTicketOnSale(ticket) && ticket.nextTier && Number(ticket.nextTier.price) > Number(ticket.activePrice ?? ticket.price)"
                    class="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 mt-2"
                  >
                    <UIcon name="i-heroicons-clock" class="w-3.5 h-3.5" />
                    <span v-if="ticket.nextTier.afterQuantity">
                      Price increases to {{ formatCurrency(Number(ticket.nextTier.price)) }} after {{ ticket.nextTier.afterQuantity }} more tickets sold
                    </span>
                    <span v-else-if="ticket.nextTier.startsAt">
                      Price increases to {{ formatCurrency(Number(ticket.nextTier.price)) }} in {{ formatCountdown(ticket.nextTier.startsAt) }}
                    </span>
                  </div>
                </div>
              </div>
              <template #footer>
                <UButton
                  v-if="isEventSoldOut"
                  color="gray"
                  block
                  disabled
                >
                  Sold Out
                </UButton>
                <UButton
                  v-else-if="!hasTicketsOnSale"
                  color="gray"
                  block
                  disabled
                >
                  Sales Not Active
                </UButton>
                <UButton
                  v-else
                  color="primary"
                  block
                  @click="openTicketModal"
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
    </div>

    <!-- Ticket Purchase Modal -->
    <UModal v-model="showTicketModal" :ui="{ width: 'max-w-xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Select Tickets
            </h3>
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-x-mark"
              @click="showTicketModal = false"
            />
          </div>
        </template>

        <div v-if="event?.ticketTypes" class="space-y-4">
          <div
            v-for="tt in event.ticketTypes"
            :key="tt.id"
            class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
            :class="{ 'opacity-60': !isTicketOnSale(tt) }"
          >
            <div class="flex items-start justify-between mb-2">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h4 class="font-medium text-gray-900 dark:text-white">{{ tt.name }}</h4>
                  <UBadge v-if="tt.activeTierName && isTicketOnSale(tt)" color="primary" variant="soft" size="xs">
                    {{ tt.activeTierName }}
                  </UBadge>
                  <UBadge
                    v-if="getTicketSalesStatus(tt).status !== 'on_sale'"
                    :color="getTicketSalesStatus(tt).status === 'not_started' ? 'blue' : 'gray'"
                    variant="soft"
                    size="xs"
                  >
                    {{ getTicketSalesStatus(tt).message }}
                  </UBadge>
                  <UBadge
                    v-if="tt.showNextTierPrice !== false && getTicketSalesStatus(tt).upcomingTier"
                    color="blue"
                    variant="soft"
                    size="xs"
                  >
                    {{ getTicketSalesStatus(tt).upcomingTier }}
                  </UBadge>
                </div>
                <p v-if="tt.description" class="text-sm text-gray-500 mt-1">{{ tt.description }}</p>
              </div>
              <p class="font-semibold text-primary text-lg">
                {{ Number(getDisplayPrice(tt)) === 0 ? 'Free' : formatCurrency(Number(getDisplayPrice(tt))) }}
              </p>
            </div>

            <!-- Show countdown or quantity trigger if price increases soon -->
            <div
              v-if="tt.showNextTierPrice !== false && isTicketOnSale(tt) && tt.nextTier && Number(tt.nextTier.price) > Number(tt.activePrice ?? tt.price)"
              class="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 mb-2"
            >
              <UIcon name="i-heroicons-clock" class="w-3.5 h-3.5" />
              <span v-if="tt.nextTier.afterQuantity">
                Price increases to {{ formatCurrency(Number(tt.nextTier.price)) }} after {{ tt.nextTier.afterQuantity }} more tickets sold
              </span>
              <span v-else-if="tt.nextTier.startsAt">
                Price increases to {{ formatCurrency(Number(tt.nextTier.price)) }} in {{ formatCountdown(tt.nextTier.startsAt) }}
              </span>
            </div>

            <div class="flex items-center justify-between">
              <div>
                <!-- Show availability: tier quantity takes priority over ticket quantity -->
                <p class="text-sm text-gray-500">
                  <template v-if="isTicketOnSale(tt) && tt.showAvailability !== false">
                    <template v-if="tt.tierQuantityRemaining !== null">
                      {{ tt.tierQuantityRemaining }} available at this price
                    </template>
                    <template v-else-if="tt.quantity">
                      {{ tt.quantity - tt.quantitySold }} available
                    </template>
                    <template v-else>
                      Unlimited
                    </template>
                  </template>
                </p>
                <!-- Urgency message for low tier quantity -->
                <p
                  v-if="isTicketOnSale(tt) && tt.tierQuantityRemaining !== null && tt.tierQuantityRemaining <= 20 && tt.tierQuantityRemaining > 0"
                  class="text-xs text-amber-600 dark:text-amber-400 font-medium"
                >
                  Only {{ tt.tierQuantityRemaining }} tickets left at this price!
                </p>
                <p
                  v-else-if="isTicketOnSale(tt) && tt.nextTier && (tt.nextTier.afterQuantity || tt.nextTier.startsAt) && Number(tt.nextTier.price) > Number(tt.activePrice ?? tt.price)"
                  class="text-xs text-amber-600 dark:text-amber-400"
                >
                  Limited tickets only. Price increases once sold out.
                </p>
              </div>

              <div v-if="isTicketOnSale(tt)" class="flex items-center gap-3">
                <UButton
                  color="gray"
                  variant="outline"
                  icon="i-heroicons-minus"
                  size="sm"
                  :disabled="(ticketCart[tt.id] || 0) <= 0"
                  @click="updateTicketQuantity(tt.id, -1)"
                />
                <span class="w-8 text-center font-medium">{{ ticketCart[tt.id] || 0 }}</span>
                <UButton
                  color="gray"
                  variant="outline"
                  icon="i-heroicons-plus"
                  size="sm"
                  :disabled="(ticketCart[tt.id] || 0) >= tt.maxPerOrder || (tt.tierQuantityRemaining !== null && (ticketCart[tt.id] || 0) >= tt.tierQuantityRemaining) || (tt.quantity && (ticketCart[tt.id] || 0) >= (tt.quantity - tt.quantitySold))"
                  @click="updateTicketQuantity(tt.id, 1)"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Event Requirements Section -->
        <div v-if="event?.requirements?.length" class="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
          <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">
            Terms & Requirements
          </h4>
          <div class="space-y-4">
            <div v-for="req in event.requirements" :key="req.id">
              <div class="flex items-start gap-3">
                <UCheckbox
                  v-model="requirementResponses[req.id]"
                  :ui="{ wrapper: 'mt-0.5' }"
                />
                <p class="text-sm text-gray-700 dark:text-gray-300">{{ req.text }}</p>
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="space-y-4">
            <!-- Checkout Error Alert -->
            <UAlert
              v-if="checkoutError"
              color="red"
              variant="soft"
              icon="i-heroicons-exclamation-circle"
              :title="checkoutError"
              :close-button="{ icon: 'i-heroicons-x-mark', color: 'red', variant: 'link' }"
              @close="checkoutError = null"
            />

            <!-- Guest Form (shown when not logged in and showGuestForm is true) -->
            <div v-if="!user && showGuestForm" class="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Enter your details to continue as a guest. We'll send you an email to set up your account.
              </p>
              <UFormGroup label="Full Name" name="guestName">
                <UInput
                  v-model="guestForm.name"
                  placeholder="Enter your full name"
                  icon="i-heroicons-user"
                />
              </UFormGroup>
              <UFormGroup label="Email Address" name="guestEmail">
                <UInput
                  v-model="guestForm.email"
                  type="email"
                  placeholder="Enter your email address"
                  icon="i-heroicons-envelope"
                />
              </UFormGroup>
              <p class="text-xs text-gray-500">
                Already have an account?
                <NuxtLink :to="`/login?redirect=/events/${event?.slug}`" class="text-primary hover:underline">
                  Log in
                </NuxtLink>
              </p>
            </div>

            <!-- Requirements hint -->
            <p
              v-if="event?.requirements?.length && !requirementsSatisfied"
              class="text-sm text-yellow-600 dark:text-yellow-500 flex items-center gap-2"
            >
              <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4" />
              Please check all the boxes above to continue
            </p>

            <!-- Fee Breakdown (only for paid tickets) -->
            <div v-if="cartTotal > 0" class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-gray-600 dark:text-gray-400">Subtotal</span>
                <span class="text-gray-900 dark:text-white">{{ formatCurrency(feeBreakdown.subtotal) }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-600 dark:text-gray-400">Transaction Fee</span>
                <span class="text-gray-900 dark:text-white">{{ formatCurrency(feeBreakdown.processingFee) }}</span>
              </div>
              <div v-if="feeBreakdown.adminFee > 0" class="flex justify-between text-sm">
                <span class="text-gray-600 dark:text-gray-400">Booking Fee</span>
                <span class="text-gray-900 dark:text-white">{{ formatCurrency(feeBreakdown.adminFee) }}</span>
              </div>
              <div class="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between font-semibold">
                <span class="text-gray-900 dark:text-white">Total</span>
                <span class="text-gray-900 dark:text-white">{{ formatCurrency(feeBreakdown.total) }}</span>
              </div>
            </div>

            <!-- Payment Method Selection (only for paid tickets) -->
            <div v-if="cartTotal > 0 && requirementsSatisfied && isPayPalConfigured" class="space-y-3">
              <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Payment Method</p>
              <div class="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  class="flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all"
                  :class="selectedPaymentProvider === 'paymongo'
                    ? 'border-primary bg-primary/5 dark:bg-primary/10'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'"
                  @click="selectedPaymentProvider = 'paymongo'"
                >
                  <UIcon name="i-heroicons-credit-card" class="w-5 h-5" />
                  <span class="text-sm font-medium">GCash / Card</span>
                </button>
                <button
                  type="button"
                  class="flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all"
                  :class="selectedPaymentProvider === 'paypal'
                    ? 'border-primary bg-primary/5 dark:bg-primary/10'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'"
                  @click="selectedPaymentProvider = 'paypal'"
                >
                  <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 0 0 .554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 0 1 .923-.788h.58c3.76 0 6.705-1.528 7.565-5.946.36-1.847.174-3.388-.777-4.471z"/>
                  </svg>
                  <span class="text-sm font-medium">PayPal</span>
                </button>
              </div>
              <p v-if="selectedPaymentProvider === 'paypal'" class="text-xs text-gray-500">
                You'll be redirected to PayPal to complete your payment
              </p>
            </div>

            <!-- Footer Actions -->
            <div class="flex items-center justify-between">
              <div v-if="cartItemCount > 0">
                <p class="text-sm text-gray-500">{{ cartItemCount }} ticket{{ cartItemCount === 1 ? '' : 's' }}</p>
                <p class="text-xl font-bold text-gray-900 dark:text-white">
                  {{ cartTotal === 0 ? 'Free' : formatCurrency(feeBreakdown.total) }}
                </p>
              </div>
              <div v-else>
                <p class="text-sm text-gray-500">Select tickets above</p>
              </div>
              <UButton
                color="primary"
                size="lg"
                :loading="isCheckingOut"
                :disabled="cartItemCount === 0 || !requirementsSatisfied"
                @click="checkout"
              >
                <template v-if="cartItemCount === 0">
                  Select Tickets
                </template>
                <template v-else-if="cartTotal === 0">
                  Get Free Tickets
                </template>
                <template v-else-if="selectedPaymentProvider === 'paypal'">
                  Pay with PayPal
                </template>
                <template v-else-if="user">
                  Proceed to Payment
                </template>
                <template v-else-if="!showGuestForm">
                  Continue as Guest
                </template>
                <template v-else>
                  Proceed to Payment
                </template>
              </UButton>
            </div>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Cancel RSVP Confirmation Modal -->
    <UModal v-model="showCancelRsvpModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-600" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Cancel RSVP
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <p class="text-gray-600 dark:text-gray-400">
            Are you sure you want to cancel your RSVP for this event?
          </p>
          <ul class="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <li>You will lose your spot at this event</li>
            <li>If the event is full, you may not be able to RSVP again</li>
          </ul>

          <div class="pt-2">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Type <span class="font-bold text-red-600">{{ CANCEL_CONFIRM_PHRASE }}</span> to confirm
            </label>
            <UInput
              v-model="cancelRsvpConfirmText"
              placeholder="Type CANCEL to confirm"
              :ui="{ base: 'font-mono' }"
            />
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="closeCancelRsvpModal"
            >
              Keep RSVP
            </UButton>
            <UButton
              color="red"
              :disabled="cancelRsvpConfirmText !== CANCEL_CONFIRM_PHRASE"
              :loading="rsvpLoading"
              @click="confirmCancelRsvp"
            >
              Cancel RSVP
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Guest RSVP Modal -->
    <UModal v-model="showRsvpModal">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              RSVP to {{ event?.title }}
            </h3>
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-x-mark"
              @click="showRsvpModal = false"
            />
          </div>
        </template>

        <div class="space-y-4">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Enter your details to RSVP. We'll send you an email to confirm your registration.
          </p>

          <UFormGroup label="Full Name" name="rsvpGuestName" required>
            <UInput
              v-model="rsvpGuestForm.name"
              placeholder="Enter your full name"
              icon="i-heroicons-user"
            />
          </UFormGroup>

          <UFormGroup label="Email Address" name="rsvpGuestEmail" required>
            <UInput
              v-model="rsvpGuestForm.email"
              type="email"
              placeholder="Enter your email address"
              icon="i-heroicons-envelope"
            />
          </UFormGroup>

          <p class="text-xs text-gray-500">
            Already have an account?
            <NuxtLink :to="`/login?redirect=/events/${event?.slug}`" class="text-primary hover:underline">
              Log in
            </NuxtLink>
          </p>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showRsvpModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="rsvpLoading"
              @click="handleRsvp(true)"
            >
              <UIcon name="i-heroicons-hand-raised" class="w-4 h-4 mr-2" />
              Confirm RSVP
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Claim Contribution Modal -->
    <UModal v-model="showClaimModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <UIcon name="i-heroicons-gift" class="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                Sign Up to Bring
              </h3>
              <p class="text-sm text-gray-500">{{ claimingItem?.name }}</p>
            </div>
          </div>
        </template>

        <div v-if="claimingItem" class="space-y-4">
          <p v-if="claimingItem.description" class="text-sm text-gray-600 dark:text-gray-400">
            {{ claimingItem.description }}
          </p>

          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p class="text-sm">
              <span class="font-medium">{{ claimingItem.remainingNeeded }}</span> more needed
              <span class="text-gray-500">
                ({{ claimingItem.quantityClaimed }}/{{ claimingItem.quantityNeeded }} claimed)
              </span>
            </p>
          </div>

          <UFormGroup label="How many will you bring?">
            <UInput
              v-model.number="claimForm.quantity"
              type="number"
              min="1"
              :max="claimingItem.remainingNeeded"
            />
            <template #hint>
              <span class="text-gray-500">Max: {{ claimingItem.remainingNeeded }}</span>
            </template>
          </UFormGroup>

          <UFormGroup label="Notes (optional)">
            <UTextarea
              v-model="claimForm.notes"
              placeholder="e.g., I'll bring homemade pasta salad"
              :rows="2"
            />
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showClaimModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="isClaimLoading"
              :disabled="!claimForm.quantity || claimForm.quantity < 1 || claimForm.quantity > (claimingItem?.remainingNeeded || 1)"
              @click="claimContribution"
            >
              <UIcon name="i-heroicons-check" class="w-4 h-4 mr-2" />
              Confirm
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

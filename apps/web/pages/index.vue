<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

// Color mode for lazy loading hero images
const colorMode = useColorMode()

// Parallax effect
const heroBeach = ref<HTMLImageElement>()
const heroRave = ref<HTMLImageElement>()

const handleParallax = () => {
  const scrolled = window.pageYOffset
  const parallaxSpeed = 0.5 // Slower scroll speed for background

  if (heroBeach.value) {
    heroBeach.value.style.transform = `translateY(${scrolled * parallaxSpeed}px)`
  }
  if (heroRave.value) {
    heroRave.value.style.transform = `translateY(${scrolled * parallaxSpeed}px)`
  }
}

onMounted(() => {
  window.addEventListener('scroll', handleParallax, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleParallax)
})

const features = [
  {
    icon: 'i-heroicons-bolt',
    title: 'One-Click Setup',
    description: 'Smart templates and defaults eliminate guesswork. Get started instantly without overwhelm.'
  },
  {
    icon: 'i-heroicons-bell-alert',
    title: 'Automated Reminders',
    description: 'Never chase guests again. Automatic follow-ups keep everyone informed and engaged.'
  },
  {
    icon: 'i-heroicons-chart-bar',
    title: 'Real-time Insights',
    description: 'Stay in control with live tracking. Know exactly who is coming and when.'
  },
  {
    icon: 'i-heroicons-heart',
    title: '24/7 Peace of Mind',
    description: 'Expert support whenever you need it. Focus on hosting, we handle the rest.'
  }
]
</script>

<template>
  <!-- Homepage: Remove default top padding so hero goes under header -->
  <div class="-mt-16">
    <!-- Hero Section -->
    <section class="relative h-screen bg-gradient-to-br from-primary-50 via-secondary/10 to-white dark:from-gray-900 dark:via-gray-800 dark:to-gray-950 overflow-hidden flex items-center justify-center">
      <!-- Hero Background Images with Parallax -->
      <div class="absolute inset-0 overflow-hidden">
        <!-- Light Mode - Beach Festival -->
        <img
          ref="heroBeach"
          src="/hero-festival.webp"
          alt="Epic beach sunset music festival"
          class="w-full h-[120%] object-cover dark:hidden parallax-image"
          style="object-position: center 40%;"
          :loading="colorMode.value === 'dark' ? 'lazy' : 'eager'"
        />
        <!-- Dark Mode - Electric Rave -->
        <img
          ref="heroRave"
          src="/hero-rave.webp"
          alt="Electric rave party with neon lights"
          class="hidden dark:block w-full h-[120%] object-cover parallax-image"
          style="object-position: center 40%;"
          :loading="colorMode.value === 'dark' ? 'eager' : 'lazy'"
        />
      </div>
      
      <!-- Subtle dark overlay for better text readability -->
      <div class="absolute inset-0 bg-black/35 z-[1]"></div>
      
      <!-- Animated background elements -->
      <div class="absolute inset-0 opacity-30">
        <div class="floating-shape w-64 h-64 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-full absolute top-10 -right-32 animate-float"></div>
        <div class="floating-shape w-96 h-96 bg-gradient-to-r from-secondary/15 to-primary/15 rounded-full absolute bottom-10 -left-48 animate-float-delayed"></div>
        <div class="floating-shape w-32 h-32 bg-gradient-to-r from-emerald-400/20 to-primary/20 rounded-full absolute top-1/3 left-1/4 animate-pulse-slow"></div>
      </div>
      
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mobile-container-padding relative z-20 w-full">
        <div class="text-center max-w-3xl mx-auto hero-mobile-spacing">
          <h1 class="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6 animate-fade-in-up">
            <span class="text-metallic-3d">Create Events That</span> <span class="text-purple-3d">Bring People Together</span>
          </h1>
          <p class="text-base sm:text-lg md:text-xl mb-6 sm:mb-8 animate-fade-in-up animation-delay-200 hero-tagline">
            Create events, sell tickets, and manage everything — all in one place.
          </p>
          <div class="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center animate-fade-in-up animation-delay-400 mobile-button-spacing">
            <UButton to="/register" size="xl" color="primary" class="btn-3d hover-lift w-full sm:w-auto" :trailing="false" :icon="undefined">
              Create Your First Event
            </UButton>
            <UButton to="/events" size="xl" color="gray" variant="outline" class="btn-glass hover-lift ring-1 ring-white/50 w-full sm:w-auto">
              Explore Events
            </UButton>
          </div>
        </div>
      </div>
      
      <!-- Scroll indicator -->
      <div class="scroll-indicator">
        <UIcon name="i-heroicons-chevron-down" class="w-10 h-10 text-white" style="stroke-width: 2.5;" />
      </div>
    </section>

    <!-- Event Types Section -->
    <section class="py-12 sm:py-20 mobile-section-padding bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 relative overflow-hidden">
      <!-- Background decoration -->
      <div class="absolute inset-0 opacity-20">
        <div class="absolute top-20 right-20 w-32 h-32 bg-gradient-to-r from-primary/30 to-secondary/30 rounded-full blur-xl"></div>
        <div class="absolute bottom-20 left-20 w-48 h-48 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-full blur-2xl"></div>
      </div>

      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mobile-container-padding relative z-10">
        <div class="text-center mb-16">
          <div class="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 dark:bg-primary/20 rounded-full text-primary dark:text-primary-300 text-sm font-medium mb-6">
            <span class="text-lg">🎉</span>
            Made for every celebration
          </div>
          <h2 class="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6 mobile-text-3xl">
            Perfect for <span class="text-transparent bg-clip-text bg-gradient-to-r from-primary via-purple-500 to-pink-500">any occasion</span>
          </h2>
          <p class="text-lg sm:text-xl text-gray-600 dark:text-gray-300 max-w-4xl mx-auto leading-relaxed mobile-text-xl">
            From intimate family gatherings to grand celebrations, nvyt™ adapts to your unique event culture with features designed for meaningful connections.
          </p>
        </div>

        <!-- Statistics -->
        <div class="grid grid-cols-3 gap-8 mb-16 max-w-2xl mx-auto">
          <div class="text-center">
            <div class="text-2xl sm:text-3xl font-bold text-primary mb-1">Free</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">To Use</div>
          </div>
          <div class="text-center">
            <div class="text-2xl sm:text-3xl font-bold text-primary mb-1">24/7</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">Support</div>
          </div>
          <div class="text-center">
            <div class="text-2xl sm:text-3xl font-bold text-primary mb-1">100%</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">Secure</div>
          </div>
        </div>

        <div class="grid md:grid-cols-2 xl:grid-cols-2 gap-6 sm:gap-8 mb-12 sm:mb-16 mobile-grid-gap max-w-4xl mx-auto">
          <!-- Celebrations -->
          <div class="group relative overflow-hidden rounded-3xl aspect-[4/3] cursor-pointer transition-all duration-500 shadow-xl hover:shadow-2xl bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600">
            <!-- Background illustration -->
            <div class="absolute inset-0">
              <img 
                src="/picnic-friends-bg.webp" 
                alt="Friends having a picnic illustration" 
                class="w-full h-full object-cover opacity-40"
              />
            </div>
            
            <!-- Animated background pattern -->
            <div class="absolute inset-0 opacity-10">
              <div class="absolute top-4 right-4 w-8 h-8 bg-white rounded-full animate-ping animation-delay-1000"></div>
              <div class="absolute bottom-8 left-8 w-6 h-6 bg-white/60 rounded-full animate-pulse animation-delay-2000"></div>
              <div class="absolute top-1/3 left-1/4 w-4 h-4 bg-white/40 rounded-full animate-bounce animation-delay-3000"></div>
            </div>
            
            <!-- Gradient overlay with better opacity -->
            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20"></div>
            
            <!-- Enhanced hover content -->
            <div class="absolute inset-x-6 bottom-6 animate-fade-in-up animation-delay-400">
              <div class="mb-4 animate-fade-in-up animation-delay-600">
                <div class="flex items-center gap-2 text-white text-sm mb-2">
                  <span>👥</span>
                  <span>Private & Small Gatherings</span>
                </div>
              </div>
              
              <h3 class="text-xl sm:text-2xl font-bold text-white mb-4 mobile-text-2xl animate-fade-in-up animation-delay-200">Intimate Celebrations</h3>
              <p class="text-sm sm:text-base text-white/90 mb-4 animate-fade-in-up animation-delay-400">Private gatherings and small occasions with personal touch</p>
              
              <div class="flex flex-wrap gap-2 mb-4 animate-fade-in-up animation-delay-600">
                <span class="text-xs px-3 py-1.5 bg-white/25 backdrop-blur-sm rounded-full text-white border border-white/20">Invite-Only</span>
                <span class="text-xs px-3 py-1.5 bg-white/25 backdrop-blur-sm rounded-full text-white border border-white/20">Picnics</span>
                <span class="text-xs px-3 py-1.5 bg-white/25 backdrop-blur-sm rounded-full text-white border border-white/20">Movie Nights</span>
                <span class="text-xs px-3 py-1.5 bg-white/25 backdrop-blur-sm rounded-full text-white border border-white/20">Potlucks</span>
              </div>
              
              <!-- Features shown on scroll -->
              <div class="animate-fade-in-up animation-delay-800">
                <div class="text-white/80 text-sm space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="w-1 h-1 bg-white rounded-full"></span>
                    <span>RSVP management with approval system</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-1 h-1 bg-white rounded-full"></span>
                    <span>Potluck coordination with item pledges</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Professional -->
          <div class="group relative overflow-hidden rounded-3xl aspect-[4/3] cursor-pointer transition-all duration-500 shadow-xl hover:shadow-2xl bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-700">
            <!-- Background illustration -->
            <div class="absolute inset-0">
              <img 
                src="/rsvp-events-bg.webp" 
                alt="RSVP events illustration" 
                class="w-full h-full object-cover opacity-40"
              />
            </div>
            
            <!-- Animated background pattern -->
            <div class="absolute inset-0 opacity-10">
              <div class="absolute top-8 right-8 w-6 h-6 bg-white rounded-sm animate-pulse animation-delay-500"></div>
              <div class="absolute bottom-12 left-12 w-8 h-8 bg-white/60 rounded-sm animate-bounce animation-delay-1500"></div>
              <div class="absolute top-1/2 right-1/4 w-4 h-4 bg-white/40 rounded-sm animate-ping animation-delay-2500"></div>
            </div>
            
            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20"></div>
            
            <div class="absolute inset-x-6 bottom-6 animate-fade-in-up animation-delay-600">
              <div class="mb-4 animate-fade-in-up animation-delay-800">
                <div class="flex items-center gap-2 text-white text-sm mb-2">
                  <span>✅</span>
                  <span>Exclusive RSVP Events</span>
                </div>
              </div>
              
              <h3 class="text-xl sm:text-2xl font-bold text-white mb-4 mobile-text-2xl animate-fade-in-up animation-delay-400">RSVP Events</h3>
              <p class="text-sm sm:text-base text-white/90 mb-4 animate-fade-in-up animation-delay-600">Exclusive events with guest approval and waitlist control</p>
              
              <div class="flex flex-wrap gap-2 mb-4 animate-fade-in-up animation-delay-800">
                <span class="text-xs px-3 py-1.5 bg-white/25 backdrop-blur-sm rounded-full text-white border border-white/20">Dinners</span>
                <span class="text-xs px-3 py-1.5 bg-white/25 backdrop-blur-sm rounded-full text-white border border-white/20">VIP Only</span>
                <span class="text-xs px-3 py-1.5 bg-white/25 backdrop-blur-sm rounded-full text-white border border-white/20">Launches</span>
                <span class="text-xs px-3 py-1.5 bg-white/25 backdrop-blur-sm rounded-full text-white border border-white/20">Private</span>
              </div>
              
              <div class="animate-fade-in-up animation-delay-1000">
                <div class="text-white/80 text-sm space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="w-1 h-1 bg-white rounded-full"></span>
                    <span>RSVP with waitlist for exclusive events</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-1 h-1 bg-white rounded-full"></span>
                    <span>Approval system for attendee control</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Entertainment -->
          <div class="group relative overflow-hidden rounded-3xl aspect-[4/3] cursor-pointer transition-all duration-500 shadow-xl hover:shadow-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600">
            <!-- Background illustration -->
            <div class="absolute inset-0">
              <img 
                src="/public-events-bg.webp" 
                alt="Public events illustration" 
                class="w-full h-full object-cover opacity-40"
              />
            </div>
            
            <!-- Animated background pattern -->
            <div class="absolute inset-0 opacity-10">
              <div class="absolute top-6 right-6 w-10 h-10 bg-white rounded-full animate-spin animation-delay-0" style="animation-duration: 8s;"></div>
              <div class="absolute bottom-10 left-10 w-6 h-6 bg-white/60 rounded-full animate-pulse animation-delay-1000"></div>
              <div class="absolute top-2/3 right-1/3 w-4 h-4 bg-white/40 rounded-full animate-bounce animation-delay-2000"></div>
            </div>
            
            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20"></div>
            
            <div class="absolute inset-x-6 bottom-6 animate-fade-in-up animation-delay-800">
              <div class="mb-4 animate-fade-in-up animation-delay-1000">
                <div class="flex items-center gap-2 text-white text-sm mb-2">
                  <span>🎫</span>
                  <span>Paid Event Management</span>
                </div>
              </div>
              
              <h3 class="text-xl sm:text-2xl font-bold text-white mb-4 mobile-text-2xl animate-fade-in-up animation-delay-600">Ticket Events</h3>
              <p class="text-sm sm:text-base text-white/90 mb-4 animate-fade-in-up animation-delay-800">Monetize your events with secure ticketing and gating systems</p>
              
              <div class="flex flex-wrap gap-2 mb-4 animate-fade-in-up animation-delay-1000">
                <span class="text-xs px-3 py-1.5 bg-white/25 backdrop-blur-sm rounded-full text-white border border-white/20">Paid Entry</span>
                <span class="text-xs px-3 py-1.5 bg-white/25 backdrop-blur-sm rounded-full text-white border border-white/20">Workshops</span>
                <span class="text-xs px-3 py-1.5 bg-white/25 backdrop-blur-sm rounded-full text-white border border-white/20">Conferences</span>
              </div>
              
              <div class="animate-fade-in-up animation-delay-1200">
                <div class="text-white/80 text-sm space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="w-1 h-1 bg-white rounded-full"></span>
                    <span>Secure ticket sales with payment processing</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-1 h-1 bg-white rounded-full"></span>
                    <span>Access control and entry management</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Public and Free -->
          <div class="group relative overflow-hidden rounded-3xl aspect-[4/3] cursor-pointer transition-all duration-500 shadow-xl hover:shadow-2xl bg-gradient-to-br from-green-400 via-lime-500 to-emerald-600">
            <!-- Background illustration -->
            <div class="absolute inset-0">
              <img 
                src="/public-free-events-bg.webp" 
                alt="Public and free events illustration" 
                class="w-full h-full object-cover opacity-40"
              />
            </div>
            
            <!-- Animated background pattern -->
            <div class="absolute inset-0 opacity-10">
              <div class="absolute top-4 right-4 w-8 h-8 bg-white rounded-full animate-pulse animation-delay-500"></div>
              <div class="absolute bottom-8 left-8 w-6 h-6 bg-white/60 rounded-full animate-bounce animation-delay-1000"></div>
              <div class="absolute top-1/2 left-1/4 w-5 h-5 bg-white/40 rounded-full animate-ping animation-delay-1500"></div>
            </div>
            
            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20"></div>
            
            <div class="absolute inset-x-6 bottom-6 animate-fade-in-up animation-delay-1000">
              <div class="mb-4 animate-fade-in-up animation-delay-1200">
                <div class="flex items-center gap-2 text-white text-sm mb-2">
                  <span>🎭</span>
                  <span>Open Community Events</span>
                </div>
              </div>
              
              <h3 class="text-xl sm:text-2xl font-bold text-white mb-4 mobile-text-2xl animate-fade-in-up animation-delay-800">Public and Free</h3>
              <p class="text-sm sm:text-base text-white/90 mb-4 animate-fade-in-up animation-delay-1000">Open community gatherings and free public celebrations</p>
              
              <div class="flex flex-wrap gap-2 mb-4 animate-fade-in-up animation-delay-1200">
                <span class="text-xs px-3 py-1.5 bg-white/25 backdrop-blur-sm rounded-full text-white border border-white/20">Free Concerts</span>
                <span class="text-xs px-3 py-1.5 bg-white/25 backdrop-blur-sm rounded-full text-white border border-white/20">Festivals</span>
                <span class="text-xs px-3 py-1.5 bg-white/25 backdrop-blur-sm rounded-full text-white border border-white/20">Community</span>
              </div>
              
              <div class="animate-fade-in-up animation-delay-1400">
                <div class="text-white/80 text-sm space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="w-1 h-1 bg-white rounded-full"></span>
                    <span>No barriers - everyone welcome</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-1 h-1 bg-white rounded-full"></span>
                    <span>Community building and outreach</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Enhanced CTA Section -->
        <div class="text-center">
          <div class="bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-xl border border-white/20 dark:border-gray-700/30 max-w-2xl mx-auto mobile-card-spacing">
            <div class="flex items-center justify-center gap-2 mb-4">
              <span class="text-2xl">🚀</span>
              <p class="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Ready to create your perfect event?
              </p>
            </div>
            <p class="text-gray-600 dark:text-gray-400 mb-6">
              Your first event is just minutes away
            </p>
            <div class="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center mobile-button-spacing">
              <UButton to="/register" size="lg" color="primary" class="hover-lift btn-3d w-full sm:w-auto">
                Create Your First Event
              </UButton>
              <UButton to="/events" size="lg" variant="outline" color="gray" class="hover-lift border-2 w-full sm:w-auto">
                Browse Events
              </UButton>
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-4">
              Free to start • No credit card required • Accept payments today
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section class="py-20 bg-white dark:bg-gray-900">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-16">
          <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Host with confidence - Stress-free event management from start to finish
          </h2>
          <p class="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Whether it's a small dinner party or a large conference, nvyt™ has you covered.
          </p>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div
            v-for="(feature, index) in features"
            :key="feature.title"
            class="group p-6 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-primary dark:hover:border-primary transition-all duration-300 hover:shadow-xl hover:-translate-y-2 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm feature-card"
            :class="`animate-fade-in-up animation-delay-${(index + 1) * 200}`"
          >
            <div class="w-12 h-12 bg-gradient-to-br from-primary-100 to-secondary/20 dark:from-primary-900/30 dark:to-secondary/10 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <UIcon :name="feature.icon" class="w-6 h-6 text-primary group-hover:text-secondary transition-colors duration-300" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-primary dark:group-hover:text-primary transition-colors duration-300">
              {{ feature.title }}
            </h3>
            <p class="text-gray-600 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors duration-300">
              {{ feature.description }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Startup Vision Section -->
    <section class="py-16 bg-gray-50 dark:bg-gray-800">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-12">
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Built for modern event management
          </h2>
          <p class="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            We're launching soon with features designed for event organizers and their unique celebration needs.
          </p>
        </div>
        
        <div class="grid md:grid-cols-3 gap-8 mb-12">
          <div class="text-center">
            <div class="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
              <span class="text-3xl">🇵🇭</span>
            </div>
            <h3 class="font-semibold text-gray-900 dark:text-white mb-2">Local Payment Focus</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">PayMongo integration, GCash/Maya support, and regional payment methods</p>
          </div>
          <div class="text-center">
            <div class="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
              <span class="text-3xl">🚀</span>
            </div>
            <h3 class="font-semibold text-gray-900 dark:text-white mb-2">Modern Platform</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">Built with the latest technology for speed, reliability, and ease of use</p>
          </div>
          <div class="text-center">
            <div class="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
              <span class="text-3xl">💝</span>
            </div>
            <h3 class="font-semibold text-gray-900 dark:text-white mb-2">Community Focused</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">Features like contribution lists perfect for community celebrations and shared experiences</p>
          </div>
        </div>
        
        <!-- Early Access CTA -->
        <div class="max-w-2xl mx-auto text-center">
          <div class="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm">
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Ready to create your perfect event?
            </h3>
            <p class="text-gray-600 dark:text-gray-400 mb-6">
              Your first event is just minutes away
            </p>
            <div class="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
              <UButton to="/register" size="lg" color="primary" class="w-full sm:w-auto">
                Create Your First Event
              </UButton>
              <UButton to="/events" size="lg" variant="outline" color="gray" class="w-full sm:w-auto">
                Browse Events
              </UButton>
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-4">
              Free to start • No credit card required • Accept payments today
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Payment Trust Section -->
    <section class="py-16 bg-white dark:bg-gray-900">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Secure payments you can trust
          </h2>
          <p class="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto mb-8">
            Powered by PayMongo, supporting all major Philippine payment methods with bank-level security.
          </p>
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-5 gap-6 items-center justify-center max-w-5xl mx-auto">
          <!-- QRPh -->
          <div class="flex flex-col items-center">
            <div class="w-16 h-16 bg-white border border-gray-200 rounded-lg flex items-center justify-center mb-3 shadow-md p-2">
              <img src="/qrph.svg" alt="QRPh" class="w-full h-full object-contain">
            </div>
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">QRPh</span>
          </div>
          
          <!-- GCash -->
          <div class="flex flex-col items-center">
            <div class="w-16 h-16 rounded-lg mb-3 shadow-md overflow-hidden">
              <img src="/gcash.svg" alt="GCash" class="w-full h-full object-cover">
            </div>
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">GCash</span>
          </div>
          
          <!-- Maya -->
          <div class="flex flex-col items-center">
            <div class="w-16 h-16 rounded-lg mb-3 shadow-md overflow-hidden">
              <img src="/maya.svg" alt="Maya" class="w-full h-full object-cover">
            </div>
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Maya</span>
          </div>
          
          <!-- GrabPay -->
          <div class="flex flex-col items-center">
            <div class="w-16 h-16 bg-white border border-gray-200 rounded-lg flex items-center justify-center mb-3 shadow-md p-2">
              <img src="/grabpay.svg" alt="GrabPay" class="w-full h-full object-contain">
            </div>
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">GrabPay</span>
          </div>
          
          <!-- ShopeePay -->
          <div class="flex flex-col items-center">
            <div class="w-16 h-16 rounded-lg mb-3 shadow-md overflow-hidden">
              <img src="/shopee.svg" alt="ShopeePay" class="w-full h-full object-cover">
            </div>
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">ShopeePay</span>
          </div>
          
          <!-- PayPal -->
          <div class="flex flex-col items-center">
            <div class="w-16 h-16 bg-white border border-gray-200 rounded-lg flex items-center justify-center mb-3 shadow-md p-2">
              <img src="/paypal.svg" alt="PayPal" class="w-full h-full object-contain">
            </div>
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">PayPal</span>
          </div>
          
          <!-- Visa -->
          <div class="flex flex-col items-center">
            <div class="w-16 h-16 bg-white border border-gray-200 rounded-lg flex items-center justify-center mb-3 shadow-md p-2">
              <img src="/visa.svg" alt="Visa" class="w-full h-full object-contain">
            </div>
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Visa</span>
          </div>
          
          <!-- Mastercard -->
          <div class="flex flex-col items-center">
            <div class="w-16 h-16 bg-white border border-gray-200 rounded-lg flex items-center justify-center mb-3 shadow-md p-2">
              <img src="/mastercard.svg" alt="Mastercard" class="w-full h-full object-contain">
            </div>
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Mastercard</span>
          </div>
          
          <!-- American Express -->
          <div class="flex flex-col items-center">
            <div class="w-16 h-16 rounded-lg mb-3 shadow-md overflow-hidden">
              <img src="/american-express.svg" alt="American Express" class="w-full h-full object-cover">
            </div>
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">American Express</span>
          </div>
          
          <!-- Discover -->
          <div class="flex flex-col items-center">
            <div class="w-16 h-16 bg-white border border-gray-200 rounded-lg flex items-center justify-center mb-3 shadow-md p-2">
              <img src="/discover-network.svg" alt="Discover" class="w-full h-full object-contain">
            </div>
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Discover</span>
          </div>
        </div>
        
        <div class="text-center mt-8">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            🔒 SSL encrypted • 🛡️ PCI compliant • 🌍 Globally accessible
          </p>
        </div>
      </div>
    </section>

    <!-- FAQ Section -->
    <section class="py-16 bg-gray-50 dark:bg-gray-800">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Frequently asked questions
          </h2>
        </div>
        
        <div class="space-y-6">
          <div class="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-sm">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Is nvyt™ free to use?
            </h3>
            <p class="text-gray-600 dark:text-gray-400">
              Yes! Creating events and managing attendees is completely free. We only charge a small processing fee when you sell paid tickets.
            </p>
          </div>
          <div class="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-sm">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              How do I get paid from ticket sales?
            </h3>
            <p class="text-gray-600 dark:text-gray-400">
              Payments are processed securely through PayMongo and transferred directly to your bank account or e-wallet within 2-3 business days.
            </p>
          </div>
          <div class="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-sm">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Can I create private events?
            </h3>
            <p class="text-gray-600 dark:text-gray-400">
              Absolutely! You can create both public and private events. Private events are only accessible to people you invite or those with the direct link.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Enhanced CTA Section -->
    <section class="py-20 bg-gradient-to-r from-primary to-purple-600 relative overflow-hidden">
      <!-- Background elements -->
      <div class="absolute inset-0 opacity-10">
        <div class="absolute top-10 right-10 w-32 h-32 bg-white rounded-full animate-pulse"></div>
        <div class="absolute bottom-10 left-10 w-48 h-48 bg-white/50 rounded-full animate-pulse-slow"></div>
      </div>
      
      <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        <h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">
          Ready to create your perfect event?
        </h2>
        <p class="text-white/90 mb-8 text-lg">
          Your first event is just minutes away
        </p>
        
        <div class="flex flex-col sm:flex-row gap-4 justify-center mb-8">
          <UButton to="/register" size="xl" color="white" class="hover-lift">
            Create Your First Event
          </UButton>
          <UButton to="/events" size="xl" variant="outline" color="white" class="border-white/50 text-white hover:bg-white/10">
            Browse Events
          </UButton>
        </div>
        
        <p class="text-white/80 text-sm">
          Free to start • No credit card required • Accept payments today
        </p>
      </div>
    </section>
  </div>
</template>

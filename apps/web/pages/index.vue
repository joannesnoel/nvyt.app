<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const features = [
  {
    icon: 'i-heroicons-calendar-days',
    title: 'Create Events',
    description: 'Set up public or private events in minutes. Perfect for any occasion.',
  },
  {
    icon: 'i-heroicons-ticket',
    title: 'Sell Tickets',
    description: 'Collect payments securely via PayMongo. GCash, Maya, and cards supported.',
  },
  {
    icon: 'i-heroicons-clipboard-document-list',
    title: 'Contribution Lists',
    description: 'Let attendees sign up to bring items. Great for potlucks and gatherings.',
  },
  {
    icon: 'i-heroicons-qr-code',
    title: 'Easy Check-in',
    description: 'Scan QR codes at the door. Fast, reliable, and works offline.',
  },
]
</script>

<template>
  <div>
    <!-- Hero Section -->
    <section class="py-20 lg:py-32 bg-gradient-to-br from-primary-50 to-white dark:from-gray-900 dark:to-gray-950">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center max-w-3xl mx-auto">
          <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6">
            Make plans. <span class="text-primary">Bring people.</span>
          </h1>
          <p class="text-lg sm:text-xl text-gray-600 dark:text-gray-300 mb-8">
            Create events, sell tickets, and manage everything — all in one place.
          </p>
          <div class="flex flex-col sm:flex-row gap-4 justify-center">
            <UButton to="/register" size="xl" color="primary">
              Create Your First Event
            </UButton>
            <UButton to="/events" size="xl" color="gray" variant="outline">
              Explore Events
            </UButton>
          </div>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section class="py-20 bg-white dark:bg-gray-900">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-16">
          <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Everything you need to host amazing events
          </h2>
          <p class="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Whether it's a small dinner party or a large conference, nvyt has you covered.
          </p>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div
            v-for="feature in features"
            :key="feature.title"
            class="p-6 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-primary dark:hover:border-primary transition-colors"
          >
            <div class="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center mb-4">
              <UIcon :name="feature.icon" class="w-6 h-6 text-primary" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {{ feature.title }}
            </h3>
            <p class="text-gray-600 dark:text-gray-400">
              {{ feature.description }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="py-20 bg-primary">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 class="text-3xl font-bold text-white mb-4">
          Ready to create your event?
        </h2>
        <p class="text-white/90 mb-8">
          Join thousands of organizers who trust nvyt for their events.
        </p>
        <UButton to="/register" size="xl" color="white">
          Get Started for Free
        </UButton>
      </div>
    </section>
  </div>
</template>

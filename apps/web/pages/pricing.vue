<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

useSeoMeta({
  title: 'Pricing - NVYT',
  description: 'Simple, transparent pricing for event organizers. As low as 2% platform fee plus payment processing fees.',
})
</script>

<template>
  <div class="py-12 lg:py-20">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="text-center mb-12">
        <h1 class="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Simple, Transparent Pricing
        </h1>
        <p class="text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
          No hidden fees. Only pay when you sell tickets.
        </p>
      </div>

      <!-- Pricing Card -->
      <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 mb-12">
        <div class="text-center mb-8">
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">as low as</p>
          <p class="text-6xl font-bold text-primary mb-3">2%</p>
          <p class="text-gray-600 dark:text-gray-300">
            platform fee per paid ticket
          </p>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
            + payment processing fees (varies by payment method)
          </p>
        </div>

        <div class="border-t border-gray-200 dark:border-gray-800 pt-8">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            What's Included
          </h3>
          <div class="grid sm:grid-cols-2 gap-4">
            <div class="flex items-start gap-3">
              <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span class="text-gray-600 dark:text-gray-300">Unlimited events</span>
            </div>
            <div class="flex items-start gap-3">
              <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span class="text-gray-600 dark:text-gray-300">Unlimited ticket types</span>
            </div>
            <div class="flex items-start gap-3">
              <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span class="text-gray-600 dark:text-gray-300">QR code check-in</span>
            </div>
            <div class="flex items-start gap-3">
              <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span class="text-gray-600 dark:text-gray-300">Attendee management</span>
            </div>
            <div class="flex items-start gap-3">
              <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span class="text-gray-600 dark:text-gray-300">Custom registration forms</span>
            </div>
            <div class="flex items-start gap-3">
              <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span class="text-gray-600 dark:text-gray-300">Event announcements</span>
            </div>
            <div class="flex items-start gap-3">
              <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span class="text-gray-600 dark:text-gray-300">Team collaboration</span>
            </div>
            <div class="flex items-start gap-3">
              <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span class="text-gray-600 dark:text-gray-300">PDF ticket generation</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Free Events -->
      <div class="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-8 mb-12">
        <div class="text-center">
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Free Events? Completely Free.
          </h2>
          <p class="text-gray-600 dark:text-gray-300">
            Hosting a free event with RSVP or open registration? There are no fees at all.
            You only pay when you sell paid tickets.
          </p>
        </div>
      </div>

      <!-- Payment Fees -->
      <div class="mb-12">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-6 text-center">
          Payment Fees
        </h2>
        <p class="text-gray-500 dark:text-gray-400 text-center mb-6">
          Payment fees are charged by our payment provider and vary by payment method.
        </p>
        <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Payment Method
                </th>
                <th class="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">
                  Payment Fee
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              <tr>
                <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                  E-Wallets (GCash, Maya, GrabPay, etc.)
                </td>
                <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 text-right">
                  3.5%
                </td>
              </tr>
              <tr>
                <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                  Credit / Debit Cards
                </td>
                <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 text-right">
                  3.5%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-4 text-center">
          Fees are automatically calculated and displayed to attendees at checkout.
        </p>
      </div>

      <!-- CTA -->
      <div class="text-center">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Ready to get started?
        </h2>
        <div class="flex flex-col sm:flex-row gap-3 justify-center">
          <UButton to="/register" size="lg" color="primary">
            Create Your First Event
          </UButton>
          <UButton to="/events" size="lg" color="gray" variant="outline">
            Explore Events
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

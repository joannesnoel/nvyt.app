<script setup lang="ts">
const colorMode = useColorMode()
const { user, isAuthenticated, isLoading, logout } = useAuth()

const toggleColorMode = () => {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

// User dropdown menu items
const userMenuItems = computed(() => {
  const items: any[][] = [
    [{
      label: user.value?.email || '',
      slot: 'account',
      disabled: true,
    }],
    [{
      label: 'Dashboard',
      icon: 'i-heroicons-squares-2x2',
      to: '/dashboard',
    }, {
      label: 'My Events',
      icon: 'i-heroicons-calendar-days',
      to: '/dashboard',
    }, {
      label: 'Settings',
      icon: 'i-heroicons-cog-6-tooth',
      to: '/settings',
    }],
  ]

  // Add admin section if user is admin
  if (user.value?.isAdmin) {
    items.push([{
      label: 'Admin',
      icon: 'i-heroicons-shield-check',
      to: '/admin/verifications',
    }, {
      label: 'Payouts',
      icon: 'i-heroicons-banknotes',
      to: '/admin/payouts',
    }])
  }

  // Sign out is always last
  items.push([{
    label: 'Sign out',
    icon: 'i-heroicons-arrow-right-on-rectangle',
    click: logout,
  }])

  return items
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
    <!-- Header -->
    <header class="sticky top-0 z-50 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div class="max-w-7xl 2xl:max-w-9xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <!-- Logo -->
          <NuxtLink to="/" class="flex items-center gap-2">
            <img src="/logo.png" alt="nvyt" width="36" height="36" class="h-9 w-9" />
            <span class="text-2xl font-bold text-green-500 dark:text-green-400 ml-1 pb-2">nvyt</span>
          </NuxtLink>

          <!-- Actions -->
          <div class="flex items-center gap-3">
            <!-- Dark mode toggle -->
            <UButton
              :icon="colorMode.value === 'dark' ? 'i-heroicons-sun' : 'i-heroicons-moon'"
              color="gray"
              variant="ghost"
              @click="toggleColorMode"
            />

            <!-- Loading state -->
            <template v-if="isLoading">
              <USkeleton class="h-8 w-20" />
            </template>

            <!-- Authenticated -->
            <template v-else-if="isAuthenticated && user">
              <UDropdown
                :items="userMenuItems"
                :ui="{ width: 'w-56' }"
                :popper="{ placement: 'bottom-end' }"
              >
                <UButton color="gray" variant="ghost" class="gap-2">
                  <UAvatar
                    :src="user.avatarUrl || undefined"
                    :alt="user.name"
                    size="xs"
                  />
                  <span class="hidden sm:inline">{{ user.name }}</span>
                  <UIcon name="i-heroicons-chevron-down" class="w-4 h-4" />
                </UButton>

                <template #account>
                  <div class="text-left">
                    <p class="font-medium text-gray-900 dark:text-white truncate">
                      {{ user.name }}
                    </p>
                    <p class="text-sm text-gray-500 truncate">
                      {{ user.email }}
                    </p>
                  </div>
                </template>
              </UDropdown>
            </template>

            <!-- Not authenticated -->
            <template v-else>
              <UButton to="/login" color="gray" variant="ghost">
                Sign In
              </UButton>
            </template>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div class="max-w-7xl 2xl:max-w-9xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <!-- Company Info -->
          <div>
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">nvyt</h3>
            <p class="text-gray-500 dark:text-gray-400 text-sm">
              Create events, sell tickets, and manage everything — all in one place.
            </p>
          </div>

          <!-- Contact Info -->
          <div>
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">Contact Us</h3>
            <ul class="space-y-2 text-sm text-gray-500 dark:text-gray-400">
              <li class="flex items-start gap-2">
                <UIcon name="i-heroicons-map-pin" class="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Soliman Street, Poblacion, Argao, Cebu, Philippines</span>
              </li>
              <li class="flex items-center gap-2">
                <UIcon name="i-heroicons-phone" class="w-4 h-4 flex-shrink-0" />
                <a href="tel:+639524773274" class="hover:text-primary">+63 (952) 477-3274</a>
              </li>
              <li class="flex items-center gap-2">
                <UIcon name="i-heroicons-envelope" class="w-4 h-4 flex-shrink-0" />
                <a href="mailto:hello@nvyt.app" class="hover:text-primary">hello@nvyt.app</a>
              </li>
            </ul>
          </div>

          <!-- Links -->
          <div>
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">Links</h3>
            <ul class="space-y-2 text-sm">
              <li>
                <NuxtLink to="/pricing" class="text-gray-500 dark:text-gray-400 hover:text-primary">
                  Pricing
                </NuxtLink>
              </li>
              <li>
                <NuxtLink to="/privacy" class="text-gray-500 dark:text-gray-400 hover:text-primary">
                  Privacy Policy
                </NuxtLink>
              </li>
              <li>
                <NuxtLink to="/terms" class="text-gray-500 dark:text-gray-400 hover:text-primary">
                  Terms of Service
                </NuxtLink>
              </li>
              <li>
                <NuxtLink to="/refunds" class="text-gray-500 dark:text-gray-400 hover:text-primary">
                  Refund Policy
                </NuxtLink>
              </li>
            </ul>
          </div>
        </div>

        <!-- Bottom Bar -->
        <div class="border-t border-gray-200 dark:border-gray-800 pt-6">
          <p class="text-gray-500 dark:text-gray-400 text-sm text-center">
            &copy; {{ new Date().getFullYear() }} nvyt. All rights reserved.
          </p>
        </div>
      </div>
    </footer>

    <!-- Registration Reminder Banner (fixed above email banner) -->
    <RegistrationReminderBanner />

    <!-- Email Verification Banner (fixed at bottom) -->
    <EmailVerificationBanner />

    <!-- Bottom padding when banners are shown -->
    <div v-if="isAuthenticated && user && !user.emailVerified" class="h-28 sm:h-24" />

    <!-- Toast Notifications -->
    <UNotifications />
  </div>
</template>

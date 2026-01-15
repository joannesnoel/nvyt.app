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
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <!-- Logo -->
          <NuxtLink to="/" class="flex items-center gap-2">
            <span class="text-2xl font-bold text-primary">nvyt</span>
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
              <UButton to="/register" color="primary">
                Get Started
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
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="flex flex-col md:flex-row justify-between items-center gap-4">
          <p class="text-gray-500 dark:text-gray-400 text-sm">
            &copy; {{ new Date().getFullYear() }} nvyt. All rights reserved.
          </p>
          <div class="flex items-center gap-4">
            <NuxtLink to="/privacy" class="text-gray-500 dark:text-gray-400 hover:text-primary text-sm">
              Privacy
            </NuxtLink>
            <NuxtLink to="/terms" class="text-gray-500 dark:text-gray-400 hover:text-primary text-sm">
              Terms
            </NuxtLink>
            <NuxtLink to="/refunds" class="text-gray-500 dark:text-gray-400 hover:text-primary text-sm">
              Refunds
            </NuxtLink>
          </div>
        </div>
      </div>
    </footer>

    <!-- Email Verification Banner (fixed at bottom) -->
    <EmailVerificationBanner />

    <!-- Bottom padding when banner is shown -->
    <div v-if="isAuthenticated && user && !user.emailVerified" class="h-14 sm:h-12" />
  </div>
</template>

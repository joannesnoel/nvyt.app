<script setup lang="ts">
const { user, logout } = useAuth()
const route = useRoute()

// Mobile sidebar state
const sidebarOpen = ref(false)

// Close sidebar on route change
watch(() => route.path, () => {
  sidebarOpen.value = false
})

// User dropdown items
const userMenuItems = computed(() => [
  [{
    label: user.value?.email || '',
    slot: 'account',
    disabled: true,
  }],
  [{
    label: 'Settings',
    icon: 'i-heroicons-cog-6-tooth',
    to: '/settings',
  }],
  [{
    label: 'Sign out',
    icon: 'i-heroicons-arrow-right-on-rectangle',
    click: logout,
  }],
])
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950">
    <ImpersonationBanner />

    <!-- Mobile Sidebar -->
    <USlideover v-model="sidebarOpen" side="left" :ui="{ width: 'max-w-xs' }">
      <DashboardSidebar @close="sidebarOpen = false" />
    </USlideover>

    <!-- Desktop Sidebar -->
    <aside class="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col" :class="{ 'top-9': user?.isImpersonating }">
      <div class="flex flex-col flex-1 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
        <DashboardSidebar />
      </div>
    </aside>

    <!-- Main Content Area -->
    <div class="lg:pl-64" :class="{ 'pt-9': user?.isImpersonating }">
      <!-- Top Header -->
      <header class="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800" :class="{ 'top-9': user?.isImpersonating }">
        <div class="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
          <!-- Mobile menu button -->
          <div class="flex items-center gap-4">
            <UButton
              icon="i-heroicons-bars-3"
              color="gray"
              variant="ghost"
              class="lg:hidden"
              @click="sidebarOpen = true"
            />

            <!-- Mobile logo -->
            <NuxtLink to="/" class="lg:hidden flex items-center gap-2">
              <img src="/logo.png" alt="nvyt" width="28" height="28" class="h-7 w-7" />
              <span class="text-lg font-bold text-logo-metallic">nvyt</span>
            </NuxtLink>
          </div>

          <!-- Right side actions -->
          <div class="flex items-center gap-4">
            <!-- User dropdown -->
            <UDropdown
              :items="userMenuItems"
              :ui="{ width: 'w-56' }"
              :popper="{ placement: 'bottom-end' }"
            >
              <UButton color="gray" variant="ghost" class="gap-2">
                <UAvatar
                  :src="user?.avatarUrl || undefined"
                  :alt="user?.name"
                  size="xs"
                />
                <span class="hidden sm:inline text-sm font-medium">{{ user?.name }}</span>
                <UIcon name="i-heroicons-chevron-down" class="w-4 h-4" />
              </UButton>

              <template #account>
                <div class="text-left">
                  <p class="font-medium text-gray-900 dark:text-white truncate">
                    {{ user?.name }}
                  </p>
                  <p class="text-sm text-gray-500 truncate">
                    {{ user?.email }}
                  </p>
                </div>
              </template>
            </UDropdown>
          </div>
        </div>
      </header>

      <!-- Page Content -->
      <main class="py-6 px-4 sm:px-6 lg:px-8">
        <slot />
      </main>
    </div>

    <!-- Fixed Bottom Banners Container -->
    <div class="fixed bottom-0 inset-x-0 z-40 flex flex-col-reverse lg:pl-64">
      <EmailVerificationBanner />
      <RegistrationReminderBanner />
    </div>

    <!-- Toast Notifications -->
    <UNotifications />
  </div>
</template>

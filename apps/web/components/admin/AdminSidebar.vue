<script setup lang="ts">
const route = useRoute()
const colorMode = useColorMode()

const props = defineProps<{
  collapsed?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const navItems = [
  { label: 'Dashboard', icon: 'i-heroicons-home', to: '/admin' },
  { label: 'Users', icon: 'i-heroicons-users', to: '/admin/users' },
  { label: 'Verifications', icon: 'i-heroicons-shield-check', to: '/admin/verifications' },
  { label: 'Payouts', icon: 'i-heroicons-banknotes', to: '/admin/payouts' },
  { label: 'Reconcile', icon: 'i-heroicons-arrow-path', to: '/admin/reconcile-payments' },
]

function isActive(to: string) {
  if (to === '/admin') {
    return route.path === '/admin'
  }
  return route.path.startsWith(to)
}

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <div class="flex flex-col h-full admin-sidebar-bg">
    <!-- Logo -->
    <div class="flex items-center gap-3 px-4 h-16 border-b border-gray-200 dark:border-gray-800">
      <NuxtLink to="/admin" class="flex items-center gap-2" @click="emit('close')">
        <img src="/logo.png" alt="nvyt" width="32" height="32" class="h-8 w-8" />
        <span class="text-xl font-bold text-logo-metallic">nvyt</span>
      </NuxtLink>
      <UBadge color="indigo" variant="soft" size="xs" class="ml-auto">
        Admin
      </UBadge>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      <NuxtLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
        :class="isActive(item.to)
          ? 'admin-nav-active bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-l-3 border-indigo-500'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'"
        @click="emit('close')"
      >
        <UIcon :name="item.icon" class="w-5 h-5 flex-shrink-0" />
        <span>{{ item.label }}</span>
      </NuxtLink>
    </nav>

    <!-- Footer -->
    <div class="px-3 py-4 border-t border-gray-200 dark:border-gray-800">
      <div class="flex items-center justify-between px-3">
        <NuxtLink
          to="/dashboard"
          class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
          <span>Back to App</span>
        </NuxtLink>
        <UButton
          :icon="colorMode.value === 'dark' ? 'i-heroicons-sun' : 'i-heroicons-moon'"
          color="gray"
          variant="ghost"
          size="sm"
          @click="toggleColorMode"
        />
      </div>
    </div>
  </div>
</template>

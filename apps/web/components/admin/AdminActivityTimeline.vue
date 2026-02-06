<script setup lang="ts">
export interface ActivityItem {
  id: string
  type: 'user' | 'verification' | 'payout' | 'event' | 'order'
  title: string
  description?: string
  timestamp: string | Date
  icon?: string
  color?: 'gray' | 'indigo' | 'green' | 'yellow' | 'red' | 'blue'
  link?: string
}

defineProps<{
  items: ActivityItem[]
  loading?: boolean
}>()

const typeConfig = {
  user: {
    icon: 'i-heroicons-user-plus',
    color: 'indigo',
  },
  verification: {
    icon: 'i-heroicons-shield-check',
    color: 'blue',
  },
  payout: {
    icon: 'i-heroicons-banknotes',
    color: 'green',
  },
  event: {
    icon: 'i-heroicons-calendar',
    color: 'yellow',
  },
  order: {
    icon: 'i-heroicons-ticket',
    color: 'indigo',
  },
}

const colorClasses = {
  gray: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  indigo: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400',
  green: 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400',
  yellow: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-600 dark:text-yellow-400',
  red: 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400',
  blue: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400',
}

function formatRelativeTime(timestamp: string | Date) {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getItemIcon(item: ActivityItem) {
  return item.icon || typeConfig[item.type]?.icon || 'i-heroicons-bell'
}

function getItemColor(item: ActivityItem) {
  return item.color || typeConfig[item.type]?.color || 'gray'
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
          Recent Activity
        </h3>
        <slot name="header-action" />
      </div>
    </template>

    <!-- Loading state -->
    <div v-if="loading" class="space-y-4">
      <div v-for="i in 5" :key="i" class="flex gap-3">
        <USkeleton class="h-8 w-8 rounded-full flex-shrink-0" />
        <div class="flex-1 space-y-2">
          <USkeleton class="h-4 w-3/4" />
          <USkeleton class="h-3 w-1/2" />
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="items.length === 0" class="text-center py-8">
      <UIcon name="i-heroicons-clock" class="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
      <p class="text-sm text-gray-500 dark:text-gray-400">No recent activity</p>
    </div>

    <!-- Activity list -->
    <div v-else class="flow-root">
      <ul class="-mb-4">
        <li v-for="(item, index) in items" :key="item.id">
          <div class="relative pb-4">
            <!-- Connector line -->
            <span
              v-if="index !== items.length - 1"
              class="absolute left-4 top-8 -ml-px h-full w-0.5 bg-gray-200 dark:bg-gray-700"
              aria-hidden="true"
            />

            <div class="relative flex gap-3">
              <!-- Icon -->
              <div
                class="flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-white dark:ring-gray-900"
                :class="colorClasses[getItemColor(item)]"
              >
                <UIcon :name="getItemIcon(item)" class="w-4 h-4" />
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0 pt-0.5">
                <component
                  :is="item.link ? 'NuxtLink' : 'div'"
                  :to="item.link"
                  class="block group"
                >
                  <p class="text-sm font-medium text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {{ item.title }}
                  </p>
                  <p v-if="item.description" class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {{ item.description }}
                  </p>
                </component>
                <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {{ formatRelativeTime(item.timestamp) }}
                </p>
              </div>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </UCard>
</template>

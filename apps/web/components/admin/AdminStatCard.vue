<script setup lang="ts">
defineProps<{
  title: string
  value: string | number
  subtitle?: string
  icon?: string
  color?: 'gray' | 'indigo' | 'green' | 'yellow' | 'red' | 'blue'
  trend?: {
    value: number
    label?: string
  }
}>()

const colorClasses = {
  gray: {
    icon: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    title: 'text-gray-600 dark:text-gray-400',
    trend: 'text-gray-600 dark:text-gray-400',
  },
  indigo: {
    icon: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400',
    title: 'text-indigo-600 dark:text-indigo-400',
    trend: 'text-indigo-600 dark:text-indigo-400',
  },
  green: {
    icon: 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400',
    title: 'text-green-600 dark:text-green-400',
    trend: 'text-green-600 dark:text-green-400',
  },
  yellow: {
    icon: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-600 dark:text-yellow-400',
    title: 'text-yellow-600 dark:text-yellow-400',
    trend: 'text-yellow-600 dark:text-yellow-400',
  },
  red: {
    icon: 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400',
    title: 'text-red-600 dark:text-red-400',
    trend: 'text-red-600 dark:text-red-400',
  },
  blue: {
    icon: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400',
    title: 'text-blue-600 dark:text-blue-400',
    trend: 'text-blue-600 dark:text-blue-400',
  },
}
</script>

<template>
  <UCard :ui="{ body: { padding: 'p-4 sm:p-5' } }">
    <div class="flex items-start gap-4">
      <!-- Icon -->
      <div
        v-if="icon"
        class="flex-shrink-0 p-3 rounded-lg"
        :class="colorClasses[color || 'gray'].icon"
      >
        <UIcon :name="icon" class="w-6 h-6" />
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <p class="text-xs font-medium uppercase tracking-wider" :class="colorClasses[color || 'gray'].title">
          {{ title }}
        </p>
        <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
          {{ value }}
        </p>
        <p v-if="subtitle" class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          {{ subtitle }}
        </p>
        <p
          v-if="trend"
          class="mt-1 text-xs font-medium flex items-center gap-1"
          :class="trend.value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
        >
          <UIcon
            :name="trend.value >= 0 ? 'i-heroicons-arrow-trending-up' : 'i-heroicons-arrow-trending-down'"
            class="w-4 h-4"
          />
          <span>{{ trend.value >= 0 ? '+' : '' }}{{ trend.value }}%</span>
          <span v-if="trend.label" class="text-gray-500 dark:text-gray-400">{{ trend.label }}</span>
        </p>
      </div>
    </div>
  </UCard>
</template>

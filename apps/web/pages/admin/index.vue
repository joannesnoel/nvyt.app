<script setup lang="ts">
// Lazy load ApexCharts only on client-side
const ApexChart = defineAsyncComponent(() => import('vue3-apexcharts'))

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
})

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const { data, pending } = await useFetch('/api/v1/admin/dashboard')

const stats = computed(() => data.value?.data?.stats)
const activity = computed(() => data.value?.data?.activity || [])

// Revenue chart
const chartPeriod = ref(7)
const periodOptions = [7, 14, 30, 90] as const

const { data: analyticsResponse } = await useFetch('/api/v1/admin/analytics', {
  query: { days: chartPeriod },
  watch: [chartPeriod],
})
const analytics = computed(() => analyticsResponse.value?.data)

const dateCategories = computed(() => {
  const useShortFormat = chartPeriod.value >= 30
  return (analytics.value?.dateLabels || []).map((d: string) => {
    const date = new Date(d + 'T00:00:00')
    if (useShortFormat) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
  })
})

const revenueChartSeries = computed(() => [{
  name: 'Revenue',
  data: analytics.value?.revenue?.daily?.map((r: { amount: number }) => r.amount) || [],
}])

const hasRevenueChartData = computed(() =>
  revenueChartSeries.value[0].data.some((val: number) => val > 0),
)

const revenueChartOptions = computed(() => ({
  chart: {
    type: 'bar',
    height: 260,
    toolbar: { show: false },
    zoom: { enabled: false },
    background: 'transparent',
  },
  colors: ['#10b981'],
  plotOptions: {
    bar: {
      borderRadius: 3,
      columnWidth: '70%',
    },
  },
  dataLabels: { enabled: false },
  xaxis: {
    categories: dateCategories.value,
    labels: {
      show: true,
      style: { colors: isDark.value ? '#9ca3af' : '#6b7280', fontSize: '10px' },
    },
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  yaxis: {
    labels: {
      style: { colors: isDark.value ? '#9ca3af' : '#6b7280', fontSize: '10px' },
      formatter: (val: number) => formatCurrency(val),
    },
  },
  grid: {
    borderColor: isDark.value ? '#374151' : '#e5e7eb',
    strokeDashArray: 3,
    xaxis: { lines: { show: false } },
  },
  tooltip: {
    theme: isDark.value ? 'dark' : 'light',
    y: {
      formatter: (val: number) => formatCurrency(val),
    },
  },
}))

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
</script>

<template>
  <div>
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        Dashboard
      </h1>
      <p class="text-gray-600 dark:text-gray-400 mt-1">
        Overview of your platform activity
      </p>
    </div>

    <!-- Loading state -->
    <template v-if="pending">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <USkeleton v-for="i in 4" :key="i" class="h-28" />
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <USkeleton class="h-80 lg:col-span-2" />
        <USkeleton class="h-80" />
      </div>
    </template>

    <template v-else>
      <!-- Stats Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <AdminStatCard
          title="Total Users"
          :value="stats?.users?.total || 0"
          icon="i-heroicons-users"
          color="indigo"
          :trend="stats?.users?.trend ? { value: stats.users.trend, label: 'vs last week' } : undefined"
        />
        <AdminStatCard
          title="Pending Verifications"
          :value="stats?.verifications?.pending || 0"
          icon="i-heroicons-shield-check"
          color="yellow"
        />
        <AdminStatCard
          title="Pending Payouts"
          :value="stats?.payouts?.pendingCount || 0"
          :subtitle="formatCurrency(stats?.payouts?.pendingAmount || 0)"
          icon="i-heroicons-banknotes"
          color="blue"
        />
        <AdminStatCard
          title="Total Revenue"
          :value="formatCurrency(stats?.orders?.revenue || 0)"
          :subtitle="`${stats?.orders?.paid || 0} paid orders`"
          icon="i-heroicons-currency-dollar"
          color="green"
        />
      </div>

      <!-- Revenue Chart -->
      <UCard class="mb-8">
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
                Daily Revenue
              </h3>
              <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {{ formatCurrency(analytics?.revenue?.periodTotal ?? 0) }}
              </p>
            </div>
            <div class="flex gap-1">
              <UButton
                v-for="opt in periodOptions"
                :key="opt"
                :color="chartPeriod === opt ? 'primary' : 'gray'"
                :variant="chartPeriod === opt ? 'solid' : 'ghost'"
                size="xs"
                @click="chartPeriod = opt"
              >
                {{ opt }}d
              </UButton>
            </div>
          </div>
        </template>

        <div v-if="hasRevenueChartData">
          <ClientOnly>
            <ApexChart
              type="bar"
              height="260"
              :options="revenueChartOptions"
              :series="revenueChartSeries"
            />
          </ClientOnly>
        </div>
        <div v-else class="flex items-center justify-center h-40">
          <p class="text-sm text-gray-500">No revenue in this period</p>
        </div>
      </UCard>

      <!-- Main Content Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Quick Actions -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Quick Actions Cards -->
          <UCard>
            <template #header>
              <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
                Quick Actions
              </h3>
            </template>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- Pending Verifications -->
              <NuxtLink
                v-if="(stats?.verifications?.pending || 0) > 0"
                to="/admin/verifications?status=pending"
                class="group flex items-center gap-4 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
              >
                <div class="p-3 bg-yellow-100 dark:bg-yellow-900/50 rounded-lg">
                  <UIcon name="i-heroicons-shield-check" class="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p class="font-medium text-gray-900 dark:text-white group-hover:text-yellow-700 dark:group-hover:text-yellow-300">
                    {{ stats?.verifications?.pending }} Pending Verification{{ (stats?.verifications?.pending || 0) !== 1 ? 's' : '' }}
                  </p>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    Review and approve event verifications
                  </p>
                </div>
                <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-gray-400 ml-auto" />
              </NuxtLink>

              <!-- Pending Payouts -->
              <NuxtLink
                v-if="(stats?.payouts?.pendingCount || 0) > 0"
                to="/admin/payouts?status=pending"
                class="group flex items-center gap-4 p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
              >
                <div class="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                  <UIcon name="i-heroicons-banknotes" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p class="font-medium text-gray-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-300">
                    {{ stats?.payouts?.pendingCount }} Pending Payout{{ (stats?.payouts?.pendingCount || 0) !== 1 ? 's' : '' }}
                  </p>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ formatCurrency(stats?.payouts?.pendingAmount || 0) }} to process
                  </p>
                </div>
                <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-gray-400 ml-auto" />
              </NuxtLink>

              <!-- All caught up message -->
              <div
                v-if="(stats?.verifications?.pending || 0) === 0 && (stats?.payouts?.pendingCount || 0) === 0"
                class="sm:col-span-2 flex items-center gap-4 p-4 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20"
              >
                <div class="p-3 bg-green-100 dark:bg-green-900/50 rounded-lg">
                  <UIcon name="i-heroicons-check-circle" class="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p class="font-medium text-gray-900 dark:text-white">
                    All caught up!
                  </p>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    No pending items require your attention
                  </p>
                </div>
              </div>
            </div>
          </UCard>

          <!-- Stats Breakdown -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- Verification Stats -->
            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
                    Verifications
                  </h3>
                  <NuxtLink to="/admin/verifications" class="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                    View all
                  </NuxtLink>
                </div>
              </template>
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-sm text-gray-600 dark:text-gray-400">Pending</span>
                  <UBadge color="yellow" variant="soft">{{ stats?.verifications?.pending || 0 }}</UBadge>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-sm text-gray-600 dark:text-gray-400">Under Review</span>
                  <UBadge color="blue" variant="soft">{{ stats?.verifications?.underReview || 0 }}</UBadge>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-sm text-gray-600 dark:text-gray-400">Approved</span>
                  <UBadge color="green" variant="soft">{{ stats?.verifications?.approved || 0 }}</UBadge>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-sm text-gray-600 dark:text-gray-400">Rejected</span>
                  <UBadge color="red" variant="soft">{{ stats?.verifications?.rejected || 0 }}</UBadge>
                </div>
              </div>
            </UCard>

            <!-- User Stats -->
            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
                    Users
                  </h3>
                  <NuxtLink to="/admin/users" class="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                    View all
                  </NuxtLink>
                </div>
              </template>
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-sm text-gray-600 dark:text-gray-400">Total</span>
                  <UBadge color="gray" variant="soft">{{ stats?.users?.total || 0 }}</UBadge>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-sm text-gray-600 dark:text-gray-400">Verified</span>
                  <UBadge color="green" variant="soft">{{ stats?.users?.verified || 0 }}</UBadge>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-sm text-gray-600 dark:text-gray-400">Unverified</span>
                  <UBadge color="yellow" variant="soft">{{ stats?.users?.unverified || 0 }}</UBadge>
                </div>
              </div>
            </UCard>
          </div>
        </div>

        <!-- Activity Timeline -->
        <AdminActivityTimeline :items="activity" :loading="pending" />
      </div>
    </template>
  </div>
</template>

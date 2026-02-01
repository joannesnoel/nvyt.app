<script setup lang="ts">
const { user, fetchUser } = useAuth()

const stopping = ref(false)

async function stopImpersonating() {
  stopping.value = true
  try {
    await $fetch('/api/v1/admin/stop-impersonate', { method: 'POST' })
    await fetchUser()
    await navigateTo('/admin/users')
  } catch {
    stopping.value = false
  }
}
</script>

<template>
  <div
    v-if="user?.isImpersonating"
    class="fixed top-0 left-0 right-0 z-[100] bg-yellow-500 text-yellow-950 text-center py-1.5 px-4 text-sm font-medium flex items-center justify-center gap-3"
  >
    <span>Viewing as <strong>{{ user.name }}</strong> ({{ user.email }})</span>
    <UButton
      size="xs"
      color="white"
      variant="solid"
      :loading="stopping"
      @click="stopImpersonating"
    >
      Stop Impersonating
    </UButton>
  </div>
</template>

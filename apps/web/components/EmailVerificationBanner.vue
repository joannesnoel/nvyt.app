<script setup lang="ts">
const { user } = useAuth()
const toast = useToast()

const sending = ref(false)
const dismissed = ref(false)

// Show banner only for logged in users with unverified email
const showBanner = computed(() => {
  return user.value && !user.value.emailVerified && !dismissed.value
})

async function resendVerification() {
  sending.value = true
  try {
    await $fetch('/api/v1/auth/resend-verification', {
      method: 'POST',
    })
    toast.add({
      title: 'Verification Email Sent',
      description: 'Please check your inbox and click the verification link.',
      color: 'green',
      icon: 'i-heroicons-envelope',
    })
  } catch (e: any) {
    toast.add({
      title: 'Failed to send email',
      description: e.data?.message || 'Please try again later.',
      color: 'red',
    })
  } finally {
    sending.value = false
  }
}

function dismiss() {
  dismissed.value = true
}
</script>

<template>
  <div
    v-if="showBanner"
    class="fixed bottom-0 inset-x-0 z-50 bg-yellow-500 text-yellow-950 px-4 py-3 shadow-lg"
  >
    <div class="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 flex-shrink-0" />
        <p class="text-sm font-medium">
          Please verify your email address to access all features.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          color="white"
          size="sm"
          :loading="sending"
          @click="resendVerification"
        >
          Resend Verification Email
        </UButton>
        <UButton
          color="white"
          variant="ghost"
          size="sm"
          icon="i-heroicons-x-mark"
          @click="dismiss"
        />
      </div>
    </div>
  </div>
</template>

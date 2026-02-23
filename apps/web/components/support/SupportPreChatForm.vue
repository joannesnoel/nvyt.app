<script setup lang="ts">
const { user } = useAuth()

const emit = defineEmits<{
  submit: [data: { name: string; email: string; message: string }]
}>()

const form = reactive({
  name: user.value?.name || '',
  email: user.value?.email || '',
  message: '',
})

const errors = reactive({
  name: '',
  email: '',
  message: '',
})

const isSubmitting = ref(false)

// Pre-fill when user loads
watch(() => user.value, (u) => {
  if (u) {
    if (!form.name) form.name = u.name
    if (!form.email) form.email = u.email
  }
}, { immediate: true })

function validate(): boolean {
  errors.name = ''
  errors.email = ''
  errors.message = ''

  if (!form.name.trim()) errors.name = 'Name is required'
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = 'Invalid email'
  }
  if (!form.message.trim()) errors.message = 'Message is required'

  return !errors.name && !errors.email && !errors.message
}

async function onSubmit() {
  if (!validate()) return
  isSubmitting.value = true
  try {
    emit('submit', {
      name: form.name.trim(),
      email: form.email.trim(),
      message: form.message.trim(),
    })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="p-4 space-y-4">
    <div class="text-center mb-2">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
        How can we help?
      </h3>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
        Send us a message and we'll get back to you.
      </p>
    </div>

    <form @submit.prevent="onSubmit" class="space-y-3">
      <div>
        <UInput
          v-model="form.name"
          placeholder="Your name"
          :disabled="!!user"
          size="sm"
        />
        <p v-if="errors.name" class="text-red-500 text-xs mt-1">{{ errors.name }}</p>
      </div>

      <div>
        <UInput
          v-model="form.email"
          type="email"
          placeholder="Email (optional, for reply notifications)"
          :disabled="!!user"
          size="sm"
        />
        <p v-if="errors.email" class="text-red-500 text-xs mt-1">{{ errors.email }}</p>
      </div>

      <div>
        <UTextarea
          v-model="form.message"
          placeholder="Describe your issue..."
          :rows="3"
          size="sm"
          autoresize
        />
        <p v-if="errors.message" class="text-red-500 text-xs mt-1">{{ errors.message }}</p>
      </div>

      <UButton
        type="submit"
        block
        :loading="isSubmitting"
        color="primary"
      >
        Start Conversation
      </UButton>
    </form>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
})

const route = useRoute()
const eventId = computed(() => route.params.id as string)
const toast = useToast()

// Fetch event details
const { data: eventResponse, pending: eventPending } = await useFetch(
  () => `/api/v1/events/by-id/${eventId.value}`,
  { watch: [eventId] }
)
const event = computed(() => eventResponse.value?.data)

// Fetch invitations
const { data: invitationsResponse, refresh: refreshInvitations } = await useFetch(
  () => `/api/v1/events/${eventId.value}/invitations`,
  { watch: [eventId] }
)
const invitations = computed(() => invitationsResponse.value?.data ?? [])

// Single invite form
const singleForm = reactive({
  name: '',
  email: '',
  message: '',
})
const isSending = ref(false)

async function sendSingleInvite() {
  if (!singleForm.email) return
  isSending.value = true
  try {
    const { data, error } = await useFetch(`/api/v1/events/${eventId.value}/invite`, {
      method: 'POST',
      body: {
        invitees: [{ name: singleForm.name || undefined, email: singleForm.email }],
        message: singleForm.message || undefined,
      },
    })
    if (error.value) {
      toast.add({ title: 'Error', description: error.value.data?.message || 'Failed to send invitation', color: 'red' })
    } else {
      const result = data.value?.data as any
      if (result?.alreadyInvited > 0 && result?.sent === 0) {
        toast.add({ title: 'Already invited', description: 'This email has already been invited', color: 'yellow' })
      } else {
        toast.add({ title: 'Invitation sent', description: `Invitation sent to ${singleForm.email}`, color: 'green' })
        singleForm.name = ''
        singleForm.email = ''
        singleForm.message = ''
      }
      refreshInvitations()
    }
  } finally {
    isSending.value = false
  }
}

// CSV import
const showCsvFlow = ref(false)
const csvStep = ref<'upload' | 'map' | 'preview'>('upload')
const csvHeaders = ref<string[]>([])
const csvRows = ref<string[][]>([])
const nameColumn = ref<number | null>(null)
const emailColumn = ref<number | null>(null)
const isBulkSending = ref(false)

const mappedInvitees = computed(() => {
  if (emailColumn.value === null) return []
  return csvRows.value.map(row => ({
    name: nameColumn.value !== null ? row[nameColumn.value]?.trim() || '' : '',
    email: row[emailColumn.value!]?.trim() || '',
  })).filter(i => i.email && i.email.includes('@'))
})

function onFileUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const text = reader.result as string
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) {
      toast.add({ title: 'Invalid CSV', description: 'CSV must have a header row and at least one data row', color: 'red' })
      return
    }
    csvHeaders.value = parseCsvLine(lines[0])
    csvRows.value = lines.slice(1).map(parseCsvLine)
    // Auto-detect columns
    nameColumn.value = csvHeaders.value.findIndex(h => /name/i.test(h))
    emailColumn.value = csvHeaders.value.findIndex(h => /email|e-mail/i.test(h))
    if (nameColumn.value === -1) nameColumn.value = null
    if (emailColumn.value === -1) emailColumn.value = null
    csvStep.value = 'map'
  }
  reader.readAsText(file)
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

function proceedToPreview() {
  if (emailColumn.value === null) {
    toast.add({ title: 'Select email column', description: 'You must map the email column', color: 'red' })
    return
  }
  csvStep.value = 'preview'
}

const bulkProgress = ref('')

async function sendBulkInvites() {
  const invitees = mappedInvitees.value
  if (invitees.length === 0) return
  isBulkSending.value = true
  bulkProgress.value = ''

  const CHUNK_SIZE = 100
  let totalSent = 0
  let totalAlreadyInvited = 0
  let totalFailed = 0

  try {
    for (let i = 0; i < invitees.length; i += CHUNK_SIZE) {
      const chunk = invitees.slice(i, i + CHUNK_SIZE)
      bulkProgress.value = `Sending ${i + 1}-${Math.min(i + chunk.length, invitees.length)} of ${invitees.length}...`

      const { data, error } = await useFetch(`/api/v1/events/${eventId.value}/invite`, {
        method: 'POST',
        body: {
          invitees: chunk.map(inv => ({ name: inv.name || undefined, email: inv.email })),
          message: singleForm.message || undefined,
        },
      })

      if (error.value) {
        toast.add({ title: 'Error', description: error.value.data?.message || `Failed on batch ${Math.floor(i / CHUNK_SIZE) + 1}`, color: 'red' })
        break
      }

      const result = data.value?.data as any
      totalSent += result?.sent ?? 0
      totalAlreadyInvited += result?.alreadyInvited ?? 0
      totalFailed += result?.failed ?? 0
    }

    const parts = []
    if (totalSent > 0) parts.push(`${totalSent} sent`)
    if (totalAlreadyInvited > 0) parts.push(`${totalAlreadyInvited} already invited`)
    if (totalFailed > 0) parts.push(`${totalFailed} failed`)
    toast.add({ title: 'Bulk invite complete', description: parts.join(', '), color: totalSent > 0 ? 'green' : 'yellow' })
    resetCsv()
    refreshInvitations()
  } finally {
    isBulkSending.value = false
    bulkProgress.value = ''
  }
}

function resetCsv() {
  showCsvFlow.value = false
  csvStep.value = 'upload'
  csvHeaders.value = []
  csvRows.value = []
  nameColumn.value = null
  emailColumn.value = null
}

function statusColor(status: string) {
  switch (status) {
    case 'pending': return 'yellow'
    case 'accepted': return 'green'
    case 'declined': return 'red'
    case 'expired': return 'gray'
    default: return 'gray'
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="px-4 sm:px-6 lg:px-8 py-8">
    <h1 class="text-2xl font-bold mb-1">Send Invitations</h1>
    <p class="text-gray-500 mb-8">{{ event?.title }}</p>

    <!-- Single Invite Form -->
    <UCard class="mb-8">
      <template #header>
        <h2 class="text-lg font-semibold">Send Invitation</h2>
      </template>

      <form @submit.prevent="sendSingleInvite" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormGroup label="Name" hint="Optional">
            <UInput v-model="singleForm.name" placeholder="Invitee name" />
          </UFormGroup>
          <UFormGroup label="Email" required>
            <UInput v-model="singleForm.email" type="email" placeholder="email@example.com" required />
          </UFormGroup>
        </div>
        <UFormGroup label="Message" hint="Optional">
          <UTextarea v-model="singleForm.message" placeholder="Add a personal message..." :rows="2" />
        </UFormGroup>
        <div class="flex items-center gap-3">
          <UButton type="submit" color="primary" :loading="isSending" :disabled="!singleForm.email">
            Send Invitation
          </UButton>
          <UButton variant="outline" @click="showCsvFlow = true">
            <UIcon name="i-heroicons-arrow-up-tray" class="w-4 h-4 mr-1" />
            Import CSV
          </UButton>
        </div>
      </form>
    </UCard>

    <!-- CSV Import Flow -->
    <UCard v-if="showCsvFlow" class="mb-8">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">CSV Import</h2>
          <UButton variant="ghost" size="xs" @click="resetCsv">
            <UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
          </UButton>
        </div>
      </template>

      <!-- Step 1: Upload -->
      <div v-if="csvStep === 'upload'" class="space-y-4">
        <p class="text-sm text-gray-500">Upload a CSV file with name and email columns.</p>
        <input type="file" accept=".csv" @change="onFileUpload" class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-600 hover:file:bg-primary-100" />
      </div>

      <!-- Step 2: Column Mapping -->
      <div v-if="csvStep === 'map'" class="space-y-4">
        <p class="text-sm text-gray-500">Map your CSV columns to the required fields.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormGroup label="Name column" hint="Optional">
            <USelect
              v-model="nameColumn"
              :options="[{ label: '-- None --', value: null }, ...csvHeaders.map((h, i) => ({ label: h, value: i }))]"
              value-attribute="value"
              option-attribute="label"
            />
          </UFormGroup>
          <UFormGroup label="Email column" required>
            <USelect
              v-model="emailColumn"
              :options="[{ label: '-- Select --', value: null }, ...csvHeaders.map((h, i) => ({ label: h, value: i }))]"
              value-attribute="value"
              option-attribute="label"
            />
          </UFormGroup>
        </div>
        <UButton color="primary" @click="proceedToPreview" :disabled="emailColumn === null">
          Preview
        </UButton>
      </div>

      <!-- Step 3: Preview -->
      <div v-if="csvStep === 'preview'" class="space-y-4">
        <p class="text-sm text-gray-500">{{ mappedInvitees.length }} valid invitees found. Preview:</p>
        <div class="border rounded-lg overflow-hidden">
          <table class="min-w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-2 text-left font-medium text-gray-500">Name</th>
                <th class="px-4 py-2 text-left font-medium text-gray-500">Email</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr v-for="(inv, i) in mappedInvitees.slice(0, 5)" :key="i">
                <td class="px-4 py-2">{{ inv.name || '-' }}</td>
                <td class="px-4 py-2">{{ inv.email }}</td>
              </tr>
              <tr v-if="mappedInvitees.length > 5">
                <td colspan="2" class="px-4 py-2 text-gray-400 text-center">
                  ...and {{ mappedInvitees.length - 5 }} more
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="bulkProgress" class="text-sm text-primary-600 font-medium">{{ bulkProgress }}</p>
        <div class="flex gap-3">
          <UButton color="primary" :loading="isBulkSending" @click="sendBulkInvites">
            Send All ({{ mappedInvitees.length }})
          </UButton>
          <UButton variant="outline" @click="csvStep = 'map'">
            Back
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Sent Invitations -->
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">Sent Invitations</h2>
      </template>

      <div v-if="invitations.length === 0" class="text-center py-8 text-gray-400">
        No invitations sent yet.
      </div>

      <div v-else class="border rounded-lg overflow-hidden">
        <table class="min-w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left font-medium text-gray-500">Name</th>
              <th class="px-4 py-2 text-left font-medium text-gray-500">Email</th>
              <th class="px-4 py-2 text-left font-medium text-gray-500">Status</th>
              <th class="px-4 py-2 text-left font-medium text-gray-500">Sent</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="inv in invitations" :key="inv.id">
              <td class="px-4 py-2">{{ inv.name || '-' }}</td>
              <td class="px-4 py-2">{{ inv.email }}</td>
              <td class="px-4 py-2">
                <UBadge :color="statusColor(inv.status)" variant="soft" size="xs">
                  {{ inv.status }}
                </UBadge>
              </td>
              <td class="px-4 py-2 text-gray-500">{{ formatDate(inv.invitedAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>
  </div>
</template>

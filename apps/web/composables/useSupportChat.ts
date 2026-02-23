import { nanoid } from 'nanoid'

interface SupportConversation {
  id: string
  visitorToken: string
  visitorName: string
  visitorEmail: string | null
  eventId: string | null
  status: string
  subject: string | null
  unreadByVisitor: number
  createdAt: string
}

interface SupportMessage {
  id: string
  conversationId: string
  senderType: string
  senderId: string | null
  senderName: string
  content: string | null
  attachments: any[] | null
  readByVisitor: boolean
  createdAt: string
}

const STORAGE_KEY = 'supportVisitorToken'

export function useSupportChat() {
  const isOpen = useState('support-chat-open', () => false)
  const conversation = useState<SupportConversation | null>('support-chat-conversation', () => null)
  const messages = useState<SupportMessage[]>('support-chat-messages', () => [])
  const isLoading = useState('support-chat-loading', () => false)
  const unreadCount = useState('support-chat-unread', () => 0)
  const visitorToken = useState<string | null>('support-chat-token', () => null)
  const eventContext = useState<string | null>('support-chat-event-context', () => null)

  const route = useRoute()
  const { user } = useAuth()
  const { subscribe, unsubscribe, events } = usePusher()

  let heartbeatInterval: ReturnType<typeof setInterval> | null = null
  let channelName: string | null = null

  // Get or create visitor token
  function getVisitorToken(): string {
    if (import.meta.server) return ''

    let token = localStorage.getItem(STORAGE_KEY)
    if (!token) {
      token = nanoid(32)
      localStorage.setItem(STORAGE_KEY, token)
    }
    visitorToken.value = token
    return token
  }

  // Event context: set by event pages so conversations get tagged
  function setEventContext(eventId: string) {
    eventContext.value = eventId
  }

  function clearEventContext() {
    eventContext.value = null
  }

  // Initialize: check for existing conversation
  async function initChat() {
    if (import.meta.server) return

    const token = getVisitorToken()
    if (!token) return

    try {
      const response = await $fetch(`/api/v1/support/conversations/by-token/${token}`)
      const data = (response as any)?.data
      if (data) {
        conversation.value = data.conversation
        messages.value = data.messages || []
        unreadCount.value = data.conversation.unreadByVisitor || 0
        subscribeToConversation(data.conversation.id)
      }
    } catch {
      // No existing conversation - that's fine
    }
  }

  // Start a new conversation
  async function startConversation(name: string, email: string, message: string, eventId?: string) {
    const token = getVisitorToken()
    isLoading.value = true

    try {
      const response = await $fetch('/api/v1/support/conversations', {
        method: 'POST',
        body: {
          visitorName: name,
          visitorEmail: email || undefined,
          visitorToken: token,
          eventId: eventId || eventContext.value || undefined,
          message,
        },
      })

      const data = (response as any)?.data
      if (data) {
        conversation.value = data.conversation
        messages.value = data.messages || []
        unreadCount.value = 0
        subscribeToConversation(data.conversation.id)
        startHeartbeat()
      }
    } catch (error: any) {
      throw new Error(error?.data?.message || 'Failed to start conversation')
    } finally {
      isLoading.value = false
    }
  }

  // Send a message
  async function sendMessage(content: string, attachments?: any[]) {
    if (!conversation.value) return

    const token = getVisitorToken()
    isLoading.value = true

    try {
      const response = await $fetch(`/api/v1/support/conversations/${conversation.value.id}/messages`, {
        method: 'POST',
        body: {
          visitorToken: token,
          content: content || undefined,
          attachments: attachments || undefined,
        },
      })

      const msg = (response as any)?.data
      if (msg) {
        messages.value.push(msg)
      }
    } catch (error: any) {
      throw new Error(error?.data?.message || 'Failed to send message')
    } finally {
      isLoading.value = false
    }
  }

  // Upload attachment
  async function uploadAttachment(file: File): Promise<any> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await $fetch('/api/v1/support/upload', {
      method: 'POST',
      body: formData,
    })

    return (response as any)?.data
  }

  // Mark messages as read
  async function markAsRead() {
    if (!conversation.value) return

    const token = getVisitorToken()
    unreadCount.value = 0

    try {
      await $fetch(`/api/v1/support/conversations/${conversation.value.id}/read`, {
        method: 'POST',
        body: { visitorToken: token },
      })
    } catch {
      // Silent fail
    }
  }

  // Subscribe to real-time updates
  function subscribeToConversation(conversationId: string) {
    const name = `support-conversation-${conversationId}`
    if (channelName === name) return

    if (channelName) {
      unsubscribe(channelName)
    }

    channelName = name
    const channel = subscribe(name)

    if (channel) {
      channel.bind(events.SUPPORT_NEW_MESSAGE, (data: any) => {
        const msg = data.message
        // Only add if not from us (visitor)
        if (msg.senderType !== 'visitor') {
          messages.value.push(msg)
          if (isOpen.value) {
            markAsRead()
          } else {
            unreadCount.value++
          }
        }
      })

      channel.bind(events.SUPPORT_CONVERSATION_UPDATED, (data: any) => {
        if (conversation.value && data.updates) {
          Object.assign(conversation.value, data.updates)
        }
      })
    }
  }

  // Online heartbeat
  function startHeartbeat() {
    if (heartbeatInterval) return
    if (!conversation.value) return

    const token = getVisitorToken()
    const sendHeartbeat = () => {
      if (!conversation.value) return
      $fetch(`/api/v1/support/conversations/${conversation.value.id}/online`, {
        method: 'POST',
        body: { visitorToken: token, online: true },
      }).catch(() => {})
    }

    sendHeartbeat()
    heartbeatInterval = setInterval(sendHeartbeat, 30000)
  }

  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval)
      heartbeatInterval = null
    }
    // Send offline
    if (conversation.value) {
      const token = getVisitorToken()
      navigator.sendBeacon?.(`/api/v1/support/conversations/${conversation.value.id}/online`, JSON.stringify({ visitorToken: token, online: false }))
    }
  }

  // Toggle open/close
  function toggle() {
    isOpen.value = !isOpen.value
    if (isOpen.value) {
      if (conversation.value) {
        markAsRead()
        startHeartbeat()
      }
    } else {
      stopHeartbeat()
    }
  }

  function open() {
    isOpen.value = true
    if (conversation.value) {
      markAsRead()
      startHeartbeat()
    }
  }

  function close() {
    isOpen.value = false
    stopHeartbeat()
  }

  // Reset state to start a new conversation (after closed/resolved)
  function startNewConversation() {
    if (import.meta.server) return

    // Unsubscribe from old conversation channel
    if (channelName) {
      unsubscribe(channelName)
      channelName = null
    }
    stopHeartbeat()

    // Generate a fresh token
    const newToken = nanoid(32)
    localStorage.setItem(STORAGE_KEY, newToken)
    visitorToken.value = newToken

    // Clear conversation state
    conversation.value = null
    messages.value = []
    unreadCount.value = 0
  }

  // Load conversation by token (for email resume)
  async function loadByToken(token: string) {
    if (import.meta.server) return

    localStorage.setItem(STORAGE_KEY, token)
    visitorToken.value = token

    try {
      const response = await $fetch(`/api/v1/support/conversations/by-token/${token}`)
      const data = (response as any)?.data
      if (data) {
        conversation.value = data.conversation
        messages.value = data.messages || []
        unreadCount.value = data.conversation.unreadByVisitor || 0
        subscribeToConversation(data.conversation.id)
        startHeartbeat()
      }
    } catch {
      // Conversation not found
    }
  }

  // Cleanup on page unload
  if (import.meta.client) {
    window.addEventListener('beforeunload', stopHeartbeat)
  }

  return {
    isOpen,
    conversation,
    messages,
    isLoading,
    unreadCount,
    visitorToken,
    eventContext,
    setEventContext,
    clearEventContext,
    initChat,
    startConversation,
    startNewConversation,
    sendMessage,
    uploadAttachment,
    markAsRead,
    toggle,
    open,
    close,
    loadByToken,
    getVisitorToken,
  }
}

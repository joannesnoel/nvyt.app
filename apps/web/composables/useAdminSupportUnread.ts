export function useAdminSupportUnread() {
  const unreadCount = useState<number>('admin-support-unread', () => 0)
  const { user } = useAuth()

  // Initial fetch — works on both SSR and client, deduplicates by key
  const { refresh: refetch } = useAsyncData(
    'admin-support-unread',
    async () => {
      if (!user.value?.isAdmin) return null
      const res = await $fetch<any>('/api/v1/admin/support/stats')
      unreadCount.value = res?.data?.totalUnread ?? 0
      return res
    },
    { watch: [() => user.value?.isAdmin] }
  )

  // Pusher subscription for real-time updates (client only)
  if (import.meta.client) {
    const { subscribe, channels, events } = usePusher()
    let subscribed = false

    function setupPusher() {
      if (subscribed || !user.value?.isAdmin) return

      const channel = subscribe(channels.supportAdmin())
      if (channel) {
        subscribed = true

        channel.bind(events.SUPPORT_NEW_MESSAGE, (data: any) => {
          if (data.message?.senderType === 'visitor') {
            unreadCount.value++
          }
        })

        channel.bind(events.SUPPORT_NEW_CONVERSATION, () => {
          unreadCount.value++
        })

        channel.bind(events.SUPPORT_CONVERSATION_UPDATED, () => {
          refetch()
        })
      }
    }

    onMounted(() => setupPusher())
    watch(() => user.value?.isAdmin, (isAdmin) => {
      if (isAdmin) setupPusher()
    })
  }

  function refresh() {
    refetch()
  }

  return {
    unreadCount,
    refresh,
  }
}

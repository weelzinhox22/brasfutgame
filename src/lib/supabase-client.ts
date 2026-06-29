'use client'

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

let _client: ReturnType<typeof createClient> | null = null

export function getSupabaseClient() {
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 20,
        },
      },
    })
  }
  return _client
}

/**
 * Subscribe to a Supabase Realtime broadcast channel.
 * Returns a cleanup function to unsubscribe.
 */
export function subscribeToChannel(
  channelName: string,
  eventHandlers: Record<string, (payload: any) => void>,
  onStatusChange?: (status: string) => void
): () => void {
  const supabase = getSupabaseClient()
  const channel = supabase.channel(channelName, {
    config: {
      broadcast: { self: true },
    },
  })

  // Register event handlers
  for (const [event, handler] of Object.entries(eventHandlers)) {
    channel.on('broadcast', { event }, ({ payload }) => handler(payload))
  }

  if (onStatusChange) {
    channel.subscribe((status) => onStatusChange(status))
  } else {
    channel.subscribe()
  }

  return () => {
    supabase.removeChannel(channel)
  }
}

/**
 * Broadcast an event on a channel.
 */
export function broadcastEvent(
  channelName: string,
  event: string,
  payload: any
) {
  const supabase = getSupabaseClient()
  supabase.channel(channelName).send({
    type: 'broadcast',
    event,
    payload,
  })
}

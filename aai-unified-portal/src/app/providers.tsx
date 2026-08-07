'use client'

import React, { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10000,        // 10 seconds - data is fresh for 10s
            gcTime: 5 * 60 * 1000,   // 5 minutes - keep unused data in cache
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            retry: 2,
            retryDelay: 1000,
          },
          mutations: {
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

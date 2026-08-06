'use client'
import { useState, useEffect, useMemo } from 'react'
import { UserButton, useUser } from '@clerk/nextjs'
import { Bell, Search, X, CheckCheck } from 'lucide-react'
import { useRealtime } from '@/hooks/useRealtime'
import type { Role } from '@/types'

interface HeaderProps {
  role?: Role
}

interface Notification {
  id: number
  title: string
  time: string
  read: boolean
  type: 'CRITICAL' | 'WARNING' | 'SUCCESS' | 'INFO'
}

export default function Header({ role }: HeaderProps) {
  const { user } = useUser()
  const [showNotifications, setShowNotifications] = useState(false)
  const [localNotifs, setLocalNotifs] = useState<Notification[]>([])
  const { incidents, connected } = useRealtime()

  const notifications = useMemo(() => {
    if (localNotifs.length > 0) return localNotifs
    return incidents.slice(0, 5).map((inc, i) => ({
      id: i + 1,
      title: inc.description || `${inc.severity || 'INFO'}: ${inc.incident_type || 'Incident'} on ${inc.device_id || inc.washroom_id || 'Unknown'}`,
      time: inc.timestamp ? new Date(inc.timestamp).toLocaleTimeString() : 'Just now',
      read: false,
      type: (inc.severity === 'CRITICAL' ? 'CRITICAL' : inc.severity === 'HIGH' ? 'WARNING' : inc.severity === 'MEDIUM' ? 'WARNING' : 'INFO') as Notification['type'],
    }))
  }, [incidents, localNotifs])

  const unreadCount = notifications.filter(n => !n.read).length

  function markAllRead() {
    setLocalNotifs(prev => prev.length > 0 ? prev.map(n => ({ ...n, read: true })) : [])
  }

  return (
    <header className="h-16 aai-header-glass flex items-center justify-between px-6 gap-4 shrink-0 sticky top-0 z-10">
      {/* Search Bar */}
      <div className="flex-1">
        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-700 placeholder:text-slate-450 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50/50 transition-all"
          />
        </div>
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-3">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-slate-400 hover:text-slate-750 hover:bg-slate-100 rounded-xl transition-colors border-none bg-transparent cursor-pointer"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
            )}
          </button>

          {showNotifications && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowNotifications(false)}
              />

              {/* Notification panel */}
              <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900 text-sm">
                      Notifications
                    </h3>
                    {unreadCount > 0 && (
                      <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-blue-600 text-xs font-medium hover:text-blue-700 flex items-center gap-1 border-none bg-transparent cursor-pointer"
                      >
                        <CheckCheck size={12} />
                        Mark all read
                      </button>
                    )}
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition-colors border-none bg-transparent cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                  {notifications.map(notif => (
                    <div
                      key={notif.id}
                      className={`px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer ${!notif.read ? 'bg-blue-50/30' : ''}`}
                      onClick={() => {
                        setLocalNotifs(prev =>
                          prev.map(n => n.id === notif.id ? { ...n, read: true } : n)
                        )
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                          notif.type === 'CRITICAL' ? 'bg-red-500' :
                          notif.type === 'WARNING'  ? 'bg-amber-500' :
                          notif.type === 'SUCCESS'  ? 'bg-green-500' :
                          'bg-blue-500'
                        }`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm truncate ${!notif.read ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
                            {notif.title}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5 font-mono">
                            {notif.time}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* User Info */}
        <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
          
          {/* Real user name + ID display */}
          <div className="hidden sm:block text-right">
            <p className="text-slate-900 text-sm font-semibold leading-none">
              {user?.fullName ?? user?.username ?? 'User'}
            </p>
            <p className="text-slate-500 text-xs mt-0.5">
              {user?.username ?? user?.primaryEmailAddress?.emailAddress}
            </p>
          </div>

          {/* Clerk UserButton — profile management, account settings, sign out */}
          <UserButton
            appearance={{
              elements: {
                avatarBox: 'w-9 h-9 rounded-xl ring-2 ring-slate-200 hover:ring-blue-300 transition-all',
                userButtonPopoverCard: 'bg-white border border-slate-200 shadow-xl rounded-2xl',
                userButtonPopoverHeader: 'border-b border-slate-100',
                userButtonPopoverFooter: 'border-t border-slate-100',
                userButtonPopoverActionButton: 'hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-xl',
                userButtonPopoverActionButtonText: 'text-slate-700',
                userButtonPopoverActionButtonIcon: 'text-slate-500',
                userPreviewMainIdentifier: 'text-slate-900 font-semibold',
                userPreviewSecondaryIdentifier: 'text-slate-500',
                userButtonPopoverUserPreview: 'border-b border-slate-100 pb-3',
              },
              variables: {
                colorPrimary:          '#2563EB',
                colorBackground:       '#ffffff',
                colorText:             '#0f172a',
                colorTextSecondary:    '#64748b',
                colorInputBackground:  '#ffffff',
                colorInputText:        '#0f172a',
                borderRadius:          '0.75rem',
              } as any
            }}
            userProfileProps={{
              appearance: {
                elements: {
                  rootBox:       'bg-white',
                  card:          'bg-white border border-slate-200 shadow-xl rounded-2xl',
                  navbar:        'bg-slate-50 border-r border-slate-200',
                  navbarButton:  'text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl',
                  navbarButtonActive: 'bg-slate-200 text-slate-900',
                  pageScrollBox: 'bg-white',
                  headerTitle:   'text-slate-900 font-bold',
                  headerSubtitle:'text-slate-500',
                  formFieldLabel:'text-slate-750 text-sm',
                  formFieldInput:'bg-white border-slate-300 text-slate-900 rounded-xl focus:border-blue-500',
                  formButtonPrimary: 'bg-blue-650 hover:bg-blue-700 text-white font-semibold rounded-xl',
                  badge:         'bg-blue-50 text-blue-700 border border-blue-200',
                  profileSectionTitle: 'text-slate-900 font-semibold',
                  profileSectionContent: 'text-slate-600',
                  accordionTriggerButton: 'text-slate-600 hover:text-slate-900',
                  menuItem: 'hover:bg-slate-50 text-slate-700 hover:text-slate-900',
                },
                variables: {
                  colorPrimary:         '#2563EB',
                  colorBackground:      '#ffffff',
                  colorText:            '#0f172a',
                  colorTextSecondary:   '#64748b',
                  colorInputBackground: '#ffffff',
                  colorInputText:       '#0f172a',
                  borderRadius:         '0.75rem',
                } as any
              }
            }}
          />
        </div>
      </div>
    </header>
  )
}

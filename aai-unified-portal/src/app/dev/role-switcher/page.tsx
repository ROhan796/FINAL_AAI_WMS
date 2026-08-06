'use client'

import React, { useState, useEffect } from 'react'
import { notFound, useRouter } from 'next/navigation'
import { Shield, User, Clipboard, Check, HelpCircle, ArrowRight } from 'lucide-react'
import { useUser } from '@clerk/nextjs'

const CREDENTIALS = [
  {
    role: 'ADMIN',
    username: 'AP-001',
    label: 'System Administrator',
    color: 'bg-red-50 text-red-700 border-red-200',
    iconColor: 'text-red-600',
    description: 'Full access to dashboards, terminal settings, analytics reports, user configurations, and audit logs.',
    targetUrl: '/admin/dashboard'
  },
  {
    role: 'TERMINAL',
    username: 'TP-001',
    label: 'Terminal Operator',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    iconColor: 'text-blue-600',
    description: 'Manages live washroom conditions, logs manual incidents, generates reports, and checks device network telemetry.',
    targetUrl: '/terminal'
  },
  {
    role: 'AUDITOR',
    username: 'ALP-001',
    label: 'System Auditor',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    iconColor: 'text-amber-600',
    description: 'Read-only access to comprehensive system logs, background actions, and security audit logs.',
    targetUrl: '/audit'
  }
]

export default function RoleSwitcherPage() {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Redirect/block if not in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      notFound()
    }
  }, [])

  if (process.env.NODE_ENV === 'production') {
    return null
  }

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans text-sm text-slate-700">
      {/* Decorative Blobs */}
      <div className="absolute top-10 left-10 w-72 h-72 bg-blue-400/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-purple-400/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-4xl w-full space-y-8 relative">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs font-bold text-blue-700 mb-2">
            <Shield size={14} />
            <span>Developer Sandbox Environment</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            AAI Role Switcher & Sandbox credentials
          </h1>
          <p className="text-slate-500 max-w-xl mx-auto">
            Test authorization matrices, route guards, and dashboards using preset demo profiles.
          </p>
        </div>

        {/* Current Session Panel */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 border border-slate-200">
              <User size={20} />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Active Clerk Session</p>
              <h2 className="text-slate-900 font-bold mt-0.5">
                {isLoaded ? (user ? (user.username || user.fullName || user.primaryEmailAddress?.emailAddress) : 'Guest / Logged Out') : 'Loading session...'}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Role:</span>
            {user?.publicMetadata?.role ? (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                {user.publicMetadata.role as string}
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200 uppercase">
                NONE
              </span>
            )}
          </div>
        </div>

        {/* Role Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {CREDENTIALS.map((cred) => (
            <div 
              key={cred.role}
              className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border uppercase tracking-wider ${cred.color}`}>
                    {cred.role}
                  </span>
                  <Shield className={`${cred.iconColor} opacity-20 group-hover:opacity-40 transition-opacity`} size={24} />
                </div>
                
                <div>
                  <h3 className="text-slate-900 font-bold text-base">{cred.label}</h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    {cred.description}
                  </p>
                </div>

                {/* Sandbox Credentials */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold uppercase">Username:</span>
                    <div className="flex items-center gap-1.5 font-mono font-bold text-slate-800">
                      <span>{cred.username}</span>
                      <button 
                        onClick={() => handleCopy(cred.username, cred.role + '_user')}
                        className="p-1 hover:bg-slate-200 rounded text-slate-450 transition-colors border-none bg-transparent cursor-pointer"
                        title="Copy Username"
                      >
                        {copiedId === cred.role + '_user' ? <Check size={13} className="text-green-600" /> : <Clipboard size={13} />}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold uppercase">Password:</span>
                    <div className="flex items-center gap-1.5 font-mono font-bold text-slate-800">
                      <span>{process.env.NEXT_PUBLIC_DEMO_PASSWORD || 'Not configured'}</span>
                      <button 
                        onClick={() => handleCopy(process.env.NEXT_PUBLIC_DEMO_PASSWORD || '', cred.role + '_pass')}
                        className="p-1 hover:bg-slate-200 rounded text-slate-450 transition-colors border-none bg-transparent cursor-pointer"
                        title="Copy Password"
                      >
                        {copiedId === cred.role + '_pass' ? <Check size={13} className="text-green-600" /> : <Clipboard size={13} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <button
                  onClick={() => router.push(cred.targetUrl)}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer text-xs border-none shadow-sm"
                >
                  <span>Go to Dashboard</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Sandbox Guide */}
        <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-6 flex gap-4">
          <HelpCircle size={28} className="text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-slate-900 font-bold">Browser Isolation & Multi-Session Testing</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              To test interaction between multiple roles concurrently (e.g., creating an incident as TP-001 and viewing/updating it as AP-001), open an Incognito Window or use separate browser profiles. This prevents Clerk session cookies from overwriting one another.
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}

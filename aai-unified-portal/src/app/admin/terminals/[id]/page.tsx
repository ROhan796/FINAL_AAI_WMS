'use client'

import React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTerminals, useTerminalLevels } from '@/hooks/useTerminals'
import PageHeader from '@/components/ui/PageHeader'
import DataCard from '@/components/ui/DataCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { ArrowLeft, ShieldAlert, Cpu, AlertTriangle, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function TerminalDetailPage() {
  const { id } = useParams()
  const terminalId = typeof id === 'string' ? id : ''

  const { data: terminalsList, isLoading: terminalsLoading } = useTerminals()
  const { data: levelsList, isLoading: levelsLoading, error: levelsError } = useTerminalLevels(terminalId)

  const terminal = terminalsList?.find(x => x.id === terminalId)

  if (terminalsLoading || levelsLoading) {
    return <LoadingSpinner text="Connecting to terminal node telemetry..." />
  }

  if (!terminal) {
    return (
      <div className="p-6 font-sans">
        <Link href="/admin/terminals" className="text-blue-600 hover:underline flex items-center gap-1 text-sm mb-4 font-bold">
          <ArrowLeft size={16} /> Back to Terminals
        </Link>
        <EmptyState title="Terminal Not Found" description="The requested terminal registry does not exist." icon={ShieldAlert} />
      </div>
    )
  }

  const getWhiColorClass = (whi: number) => {
    if (whi >= 75) return 'text-green-600'
    if (whi >= 60) return 'text-amber-600'
    return 'text-red-650 font-bold'
  }

  const getWhiBadgeColor = (whi: number) => {
    if (whi >= 75) return 'bg-green-50 text-green-700 border-green-200'
    if (whi >= 60) return 'bg-amber-50 text-amber-700 border-amber-250'
    return 'bg-red-50 text-red-700 border-red-200'
  }

  return (
    <div className="space-y-6 font-sans text-sm text-slate-700">
      <div className="flex justify-between items-center">
        <Link href="/admin/terminals" className="text-blue-600 hover:underline flex items-center gap-1.5 text-xs font-bold">
          <ArrowLeft size={16} /> Back to Terminals Overview
        </Link>
      </div>

      <PageHeader
        title={terminal.name}
        subtitle={`${terminal.code} Terminal • Type: ${terminal.type.toUpperCase()}`}
      />

      {/* Levels Summary Grid */}
      <DataCard title="Terminal Levels Registry" subtitle="Detailed overview of active levels and facility status.">
        {levelsError || !levelsList || levelsList.length === 0 ? (
          <EmptyState title="No Levels Registered" description="This terminal has no levels configured." icon={ShieldAlert} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {levelsList.map((lvl) => {
              const total = lvl.total_units ?? 0
              const online = lvl.online_units ?? 0
              const offline = total - online
              const avgWhi = lvl.avg_whi ?? 100

              return (
                <div
                  key={lvl.id}
                  className="bg-slate-50 border border-slate-200 p-5 rounded-2xl flex flex-col gap-4 shadow-sm hover:shadow-md transition-all hover:border-slate-350"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-base font-bold text-slate-900 leading-snug">{lvl.label.split(' — ')[0]}</h4>
                      <p className="text-[11px] text-slate-500 font-semibold mt-0.5 uppercase tracking-wider">{lvl.label.split(' — ')[1] || 'Utility Zone'}</p>
                    </div>
                    <span className={cn(
                      "px-2.5 py-0.5 rounded font-extrabold font-mono text-xs border",
                      getWhiBadgeColor(avgWhi)
                    )}>
                      {avgWhi}% WHI
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs mt-1 border-y border-slate-200/60 py-3">
                    <div>
                      <p className="text-slate-500 font-medium text-[10px] uppercase">Total Units</p>
                      <p className="text-sm font-extrabold text-slate-900 mt-0.5 font-mono">{total}</p>
                    </div>
                    <div className="border-x border-slate-200/60">
                      <p className="text-slate-500 font-medium text-[10px] uppercase">Online</p>
                      <p className="text-sm font-extrabold text-green-600 mt-0.5 font-mono">{online}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-medium text-[10px] uppercase">Offline</p>
                      <p className="text-sm font-extrabold text-red-655 mt-0.5 font-mono">{offline}</p>
                    </div>
                  </div>

                  <div className="flex justify-end items-center pt-2">
                    <Link
                      href={`/admin/terminals/${terminalId}/washrooms?level=${lvl.level_number}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-650 hover:underline"
                    >
                      Inspect Washrooms <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DataCard>
    </div>
  )
}

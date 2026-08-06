'use client'

import React, { useState, useEffect } from 'react'
import { getAppUsers, AppUser, Role } from '@/db'
import PageHeader from '@/components/ui/PageHeader'
import DataCard from '@/components/ui/DataCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import RoleBadge from '@/components/auth/RoleBadge'
import { statusColor } from '@/lib/utils'
import { Users, Search, Plus, Settings, X, Check, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

function EditUserModal({
  user,
  onClose,
  onSuccess,
}: {
  user: AppUser
  onClose: () => void
  onSuccess: () => void
}) {
  const [form, setForm] = useState({
    zone: '',
    shift_start: '',
    shift_end: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const payload: Record<string, string> = {}
      if (form.zone) payload.zone = form.zone
      if (form.shift_start) payload.shift_start = form.shift_start
      if (form.shift_end) payload.shift_end = form.shift_end

      if (Object.keys(payload).length === 0) {
        setError('No changes to update')
        setSubmitting(false)
        return
      }

      const res = await fetch(`/api/wms/admin/users/${user.email}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update user')
      }

      setSuccess(true)
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 1000)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Edit User Attributes</h2>
            <p className="text-sm text-slate-500 mt-0.5">Update zone and shift for {user.name}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-600 flex items-center gap-2">
              <Check size={16} /> User attributes updated successfully
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Zone Assignment</label>
            <select
              value={form.zone}
              onChange={e => setForm(p => ({ ...p, zone: e.target.value }))}
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
            >
              <option value="">No change</option>
              <option value="T1">Terminal 1</option>
              <option value="T2">Terminal 2</option>
              <option value="T3">Terminal 3</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Shift Start</label>
              <input
                type="time"
                value={form.shift_start}
                onChange={e => setForm(p => ({ ...p, shift_start: e.target.value }))}
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Shift End</label>
              <input
                type="time"
                value={form.shift_end}
                onChange={e => setForm(p => ({ ...p, shift_end: e.target.value }))}
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 font-medium py-2.5 rounded-xl transition-colors text-sm">
              Cancel
            </button>
            <button type="submit" disabled={submitting || success} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm flex items-center justify-center gap-2">
              {submitting ? <><RefreshCw size={14} className="animate-spin" /> Updating...</> : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function UsersPage() {
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<AppUser[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterRole, setFilterRole] = useState<'ALL' | Role>('ALL')
  const [editingUser, setEditingUser] = useState<AppUser | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const data = await getAppUsers()
      setUsers(data)
    } catch (err) {
      console.error('Error fetching system users:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesRole = filterRole === 'ALL' || user.role === filterRole
    return matchesSearch && matchesRole
  })

  if (loading) {
    return <LoadingSpinner text="Connecting to operator registries..." />
  }

  // stats
  const totalCount = users.length
  const activeCount = users.filter(x => x.status === 'ACTIVE').length
  const adminCount = users.filter(x => x.role === 'ADMIN').length
  const terminalCount = users.filter(x => x.role === 'TERMINAL').length

  return (
    <div className="space-y-6 font-sans text-sm">
      <PageHeader
        title="User Management"
        subtitle="Administer operator privileges, add new technicians, and review access states."
        actions={
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all w-60"
              />
            </div>
            <button
              onClick={() => alert('New user registration opened')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-xl flex items-center gap-1.5 transition-all text-xs active:scale-[0.98] cursor-pointer shadow-sm"
            >
              <Plus size={14} />
              <span>Add Operator</span>
            </button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-col gap-1.5 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Total Users</p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl text-slate-900 font-bold font-mono">{String(totalCount).padStart(2, '0')}</h3>
            <span className="text-emerald-600 text-xs font-bold font-mono">+12%</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-col gap-1.5 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Active Operators</p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl text-emerald-600 font-bold font-mono">{String(activeCount).padStart(2, '0')}</h3>
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse mb-2 mr-1" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-col gap-1.5 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Administrators</p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl text-slate-900 font-bold font-mono">{String(adminCount).padStart(2, '0')}</h3>
            <span className="text-xs text-slate-500 font-medium">Root Access</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-col gap-1.5 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Terminal staff</p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl text-slate-900 font-bold font-mono">{String(terminalCount).padStart(2, '0')}</h3>
            <span className="text-xs text-slate-500 font-medium">On-site Crew</span>
          </div>
        </div>
      </div>

      {/* Table grid */}
      <DataCard
        title="System Directory"
        subtitle="Operational credentials registries."
        actions={
          <div className="flex gap-2 bg-slate-50 border border-slate-200 p-1 rounded-xl">
            {(['ALL', 'ADMIN', 'TERMINAL', 'AUDITOR'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setFilterRole(r)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider transition-all uppercase cursor-pointer ${
                  filterRole === r
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        }
      >
        {filteredUsers.length === 0 ? (
          <EmptyState title="No Users Found" description="Try adjusting your filter settings." icon={Users} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs">
                <tr>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">User Details</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Role Authority</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Last Sync</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-55 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-bold text-slate-900 leading-tight">{user.name}</p>
                        <p className="text-xs text-slate-500 mt-1 font-mono">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <RoleBadge role={user.role} size="sm" variant="soft" />
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wide", statusColor(user.status))}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 font-mono">
                      {user.lastLogin}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setEditingUser(user)}
                        className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                      >
                        <Settings size={12} />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataCard>

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSuccess={loadData}
        />
      )}
    </div>
  )
}

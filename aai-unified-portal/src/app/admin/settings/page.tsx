'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Header from '@/components/admin/Header';
import { useUser } from '@clerk/nextjs';

interface SettingsData {
  id?: number
  ammoniaThreshold: number
  whiAlertThreshold: number
  pingIntervalSeconds: number
  emailAlerts: boolean
  smsAlerts: boolean
  autoEscalation: boolean
  trafficLimitPerHour: number
  updatedBy?: string
  updatedAt?: string
}

export default function SettingsPage() {
  const { user } = useUser()
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const fullName = user?.fullName || user?.firstName || 'Administrator'
  const email = user?.emailAddresses?.[0]?.emailAddress || ''
  const dept = 'Operations Control Center'

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings')
        if (res.ok) {
          const data = await res.json()
          setSettings(data)
        }
      } catch (err) {
        console.error('Failed to load settings:', err)
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settings) return
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        showToast('System configuration saved successfully.')
      } else {
        showToast('Failed to save configuration.', 'error')
      }
    } catch {
      showToast('Network error — check connectivity.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = useCallback(<K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
  }, [settings])

  if (loading) {
    return (
      <>
        <Header title="Settings" placeholder="Search settings..." />
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <div className="text-sm text-slate-500">Loading system configuration...</div>
        </div>
      </>
    )
  }

  const s = settings || {
    ammoniaThreshold: 50,
    whiAlertThreshold: 60,
    pingIntervalSeconds: 30,
    emailAlerts: true,
    smsAlerts: false,
    autoEscalation: true,
    trafficLimitPerHour: 200,
  }

  return (
    <>
      <Header title="Settings" placeholder="Search settings..." />

      {toast && (
        <div className={`fixed bottom-8 right-8 z-50 flex items-center gap-2 px-4 py-2 rounded-xl shadow-lg border text-xs font-bold transition-all ${
          toast.type === 'success'
            ? 'bg-white text-emerald-700 border-emerald-200'
            : 'bg-white text-red-700 border-red-200'
        }`}>
          <span className="material-symbols-outlined text-sm">
            {toast.type === 'success' ? 'check_circle' : 'error'}
          </span>
          <span>{toast.message}</span>
        </div>
      )}

      <div className="p-6 max-w-[1200px] mx-auto w-full flex-grow font-sans text-sm">
        <div className="grid grid-cols-12 gap-6">
          {/* Profile Section */}
          <section className="col-span-12 lg:col-span-4 flex flex-col gap-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4 mb-6">
                <div className="relative flex-shrink-0">
                  <img
                    alt="Profile"
                    className="w-20 h-20 rounded-full border-4 border-slate-100 shadow-md object-cover"
                    src={user?.imageUrl || "https://lh3.googleusercontent.com/aida-public/AB6AXuDY9u9jyh7jrv-1Ys95tJ91IsVNZkig5M6AYSRSUjDxoheHMz_FTjRWYkFkrYwEQQPufzdlJmWQC7uyHgmx3iSoO2eEf3n3al9q34_mPX1v9iIaUc3PoVzbFGwCvCp5NxvLkoen8NubjLTanhvqmIDd4cKePj_Gb_6gZhx2JXpmfH-2Ps6LvZnPLJwzIDqfqX6GmGJd4Ze12q8EZnL6EBLsmx8JXT5YClk4-9jpD-aIhi45ALJkWfXKjvWeoaayxR7-zxGJvbJxt8_z"}
                  />
                </div>
                <div>
                  <h2 className="text-lg text-slate-900 font-bold leading-tight">{fullName}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">System Administrator</p>
                  <span className="inline-block mt-2 px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-semibold">
                    Verified Personnel
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label>
                  <input
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900"
                    type="text"
                    value={fullName}
                    readOnly
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900"
                    type="email"
                    value={email}
                    readOnly
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Department</label>
                  <input
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900"
                    type="text"
                    value={dept}
                    readOnly
                  />
                </div>
              </div>
            </div>
          </section>

          {/* System Config & Notifications */}
          <section className="col-span-12 lg:col-span-8 flex flex-col gap-6">
            {/* System Thresholds */}
            <form onSubmit={handleSaveProfile} className="flex flex-col gap-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-600">tune</span>
                    <h3 className="text-lg font-bold text-slate-900">System Configurations</h3>
                  </div>
                  {s.updatedAt && (
                    <span className="text-xs text-slate-500 italic">
                      Last updated: {new Date(s.updatedAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Alert Thresholds
                    </h4>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-medium text-slate-700">
                          <span>Ammonia Threshold (PPM)</span>
                          <span className="text-blue-600 font-bold">{s.ammoniaThreshold} PPM</span>
                        </div>
                        <input
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                          type="range"
                          min="10"
                          max="100"
                          value={s.ammoniaThreshold}
                          onChange={(e) => updateSetting('ammoniaThreshold', Number(e.target.value))}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-medium text-slate-700">
                          <span>WHI Alert Threshold</span>
                          <span className="text-emerald-600 font-bold">{s.whiAlertThreshold}%</span>
                        </div>
                        <input
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                          type="range"
                          min="20"
                          max="90"
                          value={s.whiAlertThreshold}
                          onChange={(e) => updateSetting('whiAlertThreshold', Number(e.target.value))}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-medium text-slate-700">
                          <span>Traffic Limit Per Hour</span>
                          <span className="text-violet-600 font-bold">{s.trafficLimitPerHour}</span>
                        </div>
                        <input
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-violet-600"
                          type="range"
                          min="50"
                          max="500"
                          value={s.trafficLimitPerHour}
                          onChange={(e) => updateSetting('trafficLimitPerHour', Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Notification Settings
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between py-1 text-xs font-bold">
                        <span className="text-slate-700">Email Alerts</span>
                        <button
                          type="button"
                          onClick={() => updateSetting('emailAlerts', !s.emailAlerts)}
                          className={`w-12 h-6 rounded-full relative transition-colors duration-200 cursor-pointer border-none ${
                            s.emailAlerts ? 'bg-blue-600' : 'bg-slate-200'
                          }`}
                        >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
                            s.emailAlerts ? 'left-[26px]' : 'left-1'
                          }`} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between py-1 text-xs font-bold">
                        <span className="text-slate-700">SMS Alerts</span>
                        <button
                          type="button"
                          onClick={() => updateSetting('smsAlerts', !s.smsAlerts)}
                          className={`w-12 h-6 rounded-full relative transition-colors duration-200 cursor-pointer border-none ${
                            s.smsAlerts ? 'bg-blue-600' : 'bg-slate-200'
                          }`}
                        >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
                            s.smsAlerts ? 'left-[26px]' : 'left-1'
                          }`} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between py-1 text-xs font-bold">
                        <span className="text-slate-700">Auto-Escalation</span>
                        <button
                          type="button"
                          onClick={() => updateSetting('autoEscalation', !s.autoEscalation)}
                          className={`w-12 h-6 rounded-full relative transition-colors duration-200 cursor-pointer border-none ${
                            s.autoEscalation ? 'bg-blue-600' : 'bg-slate-200'
                          }`}
                        >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
                            s.autoEscalation ? 'left-[26px]' : 'left-1'
                          }`} />
                        </button>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-medium text-slate-700">
                          <span>Device Polling Interval</span>
                          <span className="text-blue-600 font-bold">{s.pingIntervalSeconds}s</span>
                        </div>
                        <input
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                          type="range"
                          min="5"
                          max="120"
                          value={s.pingIntervalSeconds}
                          onChange={(e) => updateSetting('pingIntervalSeconds', Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full max-w-md mx-auto bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl transition-all active:scale-[0.98] font-bold text-sm cursor-pointer shadow-sm disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </form>
          </section>

          {/* Audit Log Preview */}
          <section className="col-span-12">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-900">Quick Links</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link href="/admin/audit-logs" className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 transition-colors">
                  <span className="material-symbols-outlined text-blue-600 bg-blue-50 p-2 rounded-full text-[20px] flex-shrink-0 border border-blue-100">
                    database
                  </span>
                  <div>
                    <p className="text-xs font-bold text-slate-900">View Audit Logs</p>
                    <p className="text-[11px] text-slate-600">System events, telemetry, and incident trails</p>
                  </div>
                </Link>
                <Link href="/admin/incidents" className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 transition-colors">
                  <span className="material-symbols-outlined text-amber-600 bg-amber-50 p-2 rounded-full text-[20px] flex-shrink-0 border border-amber-100">
                    warning
                  </span>
                  <div>
                    <p className="text-xs font-bold text-slate-900">Manage Incidents</p>
                    <p className="text-[11px] text-slate-600">View and resolve active incidents</p>
                  </div>
                </Link>
                <Link href="/admin/devices" className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 transition-colors">
                  <span className="material-symbols-outlined text-emerald-600 bg-emerald-50 p-2 rounded-full text-[20px] flex-shrink-0 border border-emerald-100">
                    sensors
                  </span>
                  <div>
                    <p className="text-xs font-bold text-slate-900">Device Status</p>
                    <p className="text-[11px] text-slate-600">Monitor IoT sensor health</p>
                  </div>
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>

      <footer className="mt-auto px-6 py-6 border-t border-slate-200 flex justify-between items-center bg-white shrink-0">
        <span className="text-xs text-slate-500 font-medium">
          AAI Smart Washroom Management System
        </span>
        <div className="flex gap-4">
          <a className="text-xs text-blue-600 hover:underline font-medium" href="#">
            Privacy Policy
          </a>
          <a className="text-xs text-blue-600 hover:underline font-medium" href="#">
            System Status
          </a>
        </div>
      </footer>
    </>
  );
}

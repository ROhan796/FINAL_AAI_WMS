'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface SettingsData {
  id?: number
  ammoniaThreshold: number
  whiAlertThreshold: number
  pingIntervalSeconds: number
  emailAlerts: boolean
  smsAlerts: boolean
  autoEscalation: boolean
  trafficLimitPerHour: number
  updatedAt?: string
}

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings')
        if (res.ok) {
          const data = await res.json()
          setSettings(data)
          setHasUnsavedChanges(false)
        }
      } catch (err) {
        console.error('Failed to load settings:', err)
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  const showToastMessage = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const updateSetting = useCallback(<K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
    setHasUnsavedChanges(true)
  }, [settings])

  const handleSaveConfiguration = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        showToastMessage('Configuration saved successfully.');
      } else {
        showToastMessage('Failed to save configuration.', 'error');
      }
    } catch {
      showToastMessage('Network error — check connectivity.', 'error');
    } finally {
      setSaving(false)
    }
  };

  const handleDiscardChanges = async () => {
    try {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const data = await res.json()
        setSettings(data)
        showToastMessage('Changes discarded, settings reloaded.');
      }
    } catch {
      showToastMessage('Failed to reload settings.', 'error');
    }
  };

  if (loading || !settings) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-in font-sans text-sm">
        <div className="text-sm text-slate-500 text-center py-20">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-in font-sans text-sm">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-8 right-8 z-50 flex items-center gap-2 px-4 py-2 rounded-xl shadow-lg border text-xs font-bold transition-all transform translate-y-0 scale-100 ${
            toast.type === 'success'
              ? 'bg-white text-emerald-700 border-emerald-200'
              : 'bg-white text-red-700 border-red-200'
          }`}
        >
          <span className="material-symbols-outlined text-sm">
            {toast.type === 'success' ? 'check_circle' : 'error'}
          </span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Main Header Area */}
      <header className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-xl text-slate-900 mb-1 font-bold">Global Settings</h1>
          <p className="text-xs text-slate-500">
            Configure system-wide operational thresholds and terminal parameters.
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button
            onClick={handleDiscardChanges}
            className="flex-1 md:flex-none bg-white border border-slate-300 hover:border-slate-400 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer text-center"
          >
            DISCARD CHANGES
          </button>
          <button
            onClick={handleSaveConfiguration}
            disabled={saving}
            className="flex-1 md:flex-none bg-blue-600 text-white px-6 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 active:scale-95 transition-all shadow-sm cursor-pointer text-center border-none disabled:opacity-50"
          >
            {saving ? 'SAVING...' : 'SAVE CONFIGURATION'}
          </button>
        </div>
      </header>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-12 gap-6">
        {/* Section: System Thresholds (WHI Alerts) */}
        <div className="col-span-12 lg:col-span-8 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
              <span className="material-symbols-outlined text-blue-600">warning</span>
              <h3 className="text-sm font-bold text-slate-900">System Thresholds (WHI Alerts)</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500 block mb-1">
                    CRITICAL THRESHOLD (%)
                  </span>
                  <input
                    className="w-full accent-red-500 cursor-pointer"
                    max="100"
                    min="0"
                    type="range"
                    value={settings.whiAlertThreshold}
                    onChange={(e) => updateSetting('whiAlertThreshold', Number(e.target.value))}
                  />
                  <div className="flex justify-between text-[10px] mt-1 text-red-650 font-bold">
                    <span>ALERT TRIGGERED AT {settings.whiAlertThreshold}%</span>
                    <span>HIGH</span>
                  </div>
                </label>

                <label className="block pt-4">
                  <span className="text-xs font-semibold text-slate-500 block mb-1">
                    AMMONIA ALERT THRESHOLD (PPM)
                  </span>
                  <input
                    className="w-full accent-amber-500 cursor-pointer"
                    max="100"
                    min="0"
                    type="range"
                    value={settings.ammoniaThreshold}
                    onChange={(e) => updateSetting('ammoniaThreshold', Number(e.target.value))}
                  />
                  <div className="flex justify-between text-[10px] mt-1 text-amber-600 font-bold">
                    <span>WARNING AT {settings.ammoniaThreshold} PPM</span>
                    <span>MEDIUM</span>
                  </div>
                </label>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 h-fit">
                <h4 className="text-xs font-bold mb-4 text-blue-600">ALERT ESCALATION LOGIC</h4>
                <div className="space-y-4 text-xs font-semibold text-slate-700">
                  <div className="flex items-center justify-between">
                    <span>Notify Operations Manager</span>
                    <input
                      checked={settings.emailAlerts}
                      onChange={(e) => updateSetting('emailAlerts', e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4"
                      type="checkbox"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Auto-Dispatch Cleaning Crew</span>
                    <input
                      checked={settings.autoEscalation}
                      onChange={(e) => updateSetting('autoEscalation', e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4"
                      type="checkbox"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>SMS Emergency Alerts</span>
                    <input
                      checked={settings.smsAlerts}
                      onChange={(e) => updateSetting('smsAlerts', e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4"
                      type="checkbox"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section: Device Polling */}
        <div className="col-span-12 lg:col-span-4 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
              <span className="material-symbols-outlined text-blue-600">sensors</span>
              <h3 className="text-sm font-bold text-slate-900">Device Polling</h3>
            </div>
            <div className="space-y-6">
              <div>
                <span className="text-xs font-semibold text-slate-500 block mb-1">
                  DEVICE PING INTERVAL
                </span>
                <div className="flex justify-between text-[10px] mt-1 text-blue-600 font-bold mb-2">
                  <span>Current: {settings.pingIntervalSeconds}s</span>
                  <span>{settings.pingIntervalSeconds <= 15 ? 'Real-time' : settings.pingIntervalSeconds <= 30 ? 'Optimized' : 'Low Power'}</span>
                </div>
                <input
                  className="w-full accent-blue-500 cursor-pointer"
                  type="range"
                  min="5"
                  max="120"
                  value={settings.pingIntervalSeconds}
                  onChange={(e) => updateSetting('pingIntervalSeconds', Number(e.target.value))}
                />
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-[10px] text-blue-750 flex items-start gap-1 font-bold">
                  <span className="material-symbols-outlined text-[16px] mt-0.5 text-blue-600">info</span>
                  <span>Optimized polling reduces network congestion by 34% across terminals.</span>
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-[10px] text-slate-600 flex items-start gap-1 font-bold">
                  <span className="material-symbols-outlined text-[16px] mt-0.5 text-slate-500">schedule</span>
                  <span>Traffic limit: {settings.trafficLimitPerHour} washes/hour per device</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Full Width Activity Card */}
        <div className="col-span-12 bg-slate-50 border border-slate-200 p-6 rounded-2xl relative overflow-hidden group shadow-sm">
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-blue-600 scale-125">verified_user</span>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Security & Compliance Baseline
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  All settings persisted to PostgreSQL. Auto-escalation is {settings.autoEscalation ? 'enabled' : 'disabled'}.
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push('/terminal/audit-log')}
              className="w-full md:w-auto bg-blue-50 hover:bg-blue-100 text-blue-700 px-6 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 hover:shadow-lg transition-all cursor-pointer border-none shadow-sm"
            >
              VIEW AUDIT LOGS
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Activity, Cpu, ShieldCheck, CheckCircle2, ArrowRight, ShieldAlert,
  Server, Database, Network, KeyRound, LayoutDashboard, Map, Bath,
  AlertTriangle, FileBarChart, Shield, Thermometer, Droplets, Battery,
  Wifi, HelpCircle, Layers, Check, ChevronLeft, ChevronRight, BarChart3,
  Clock, ClipboardList, Zap, ArrowDown, User, Sparkles, Fan, Siren
} from 'lucide-react'

const CAROUSEL_SLIDES = [
  {
    id: 'admin',
    title: 'Admin Command Center',
    subtitle: 'High-level airport SLA statistics, regional network aggregates, and user account management.',
    stats: { main: '94.2%', label: 'Global WHI', status: 'COMPLIANT' },
    details: [
      { label: 'Monitored Stalls', value: '3,840 Nodes' },
      { label: 'Response Target', value: '< 15 mins' },
      { label: 'Incident Closure', value: '98.8% Ratio' }
    ]
  },
  {
    id: 'terminal',
    title: 'Terminal Operator View',
    subtitle: 'Live floor maps, active janitorial checklists, and manual incident logging console.',
    stats: { main: 'T1 Arrivals', label: 'Terminal Node', status: 'ACTIVE' },
    details: [
      { label: 'Crew Dispatch', value: '45 Online' },
      { label: 'Ventilation', value: 'Optimal Flow' },
      { label: 'System Pings', value: '100% Online' }
    ]
  },
  {
    id: 'audit',
    title: 'Auditor Event Ledger',
    subtitle: 'Immutable logs, system compliance levels, database triggers, and security events.',
    stats: { main: 'SHA-256', label: 'Hash Integrity', status: 'VERIFIED' },
    details: [
      { label: 'Ledger Audit', value: '12,500+ Daily' },
      { label: 'Session Integrity', value: 'Enforced' },
      { label: 'Traceability', value: 'Full Path' }
    ]
  }
]

export default function PublicLandingPage() {
  const [activeSlide, setActiveSlide] = useState(0)
  const [selectedTerminal, setSelectedTerminal] = useState<'T1' | 'T2' | 'T3'>('T1')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  
  // Interactive Simulator States
  const [ammoniaLevel, setAmmoniaLevel] = useState(12)
  const [fanState, setFanState] = useState<'AUTO' | 'ON' | 'OFF'>('AUTO')
  const [simulatedAlert, setSimulatedAlert] = useState(false)

  // Simulation loop for ammonia fluctuations
  useEffect(() => {
    const interval = setInterval(() => {
      setAmmoniaLevel((prev) => {
        const delta = Math.random() > 0.55 ? 1 : -1
        const next = Math.max(5, Math.min(48, prev + delta))
        if (next > 40) {
          setSimulatedAlert(true)
        } else {
          setSimulatedAlert(false)
        }
        return next
      })
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans relative overflow-x-hidden selection:bg-blue-600 selection:text-white">
      
      {/* Dynamic Grid Backgrounds & Radial Glows */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.03] -z-10"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #0f172a 1px, transparent 0)`,
          backgroundSize: '24px 24px'
        }}
      />
      <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[700px] bg-gradient-to-br from-blue-400/10 to-indigo-400/5 rounded-full blur-[160px] pointer-events-none -z-10" />
      <div className="absolute bottom-[20%] left-[-10%] w-[50%] h-[600px] bg-gradient-to-tr from-purple-400/5 to-blue-400/10 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* Header with Glassmorphism */}
      <header className="h-16 border-b border-slate-200/80 flex items-center justify-between px-8 bg-white/70 backdrop-blur-lg sticky top-0 z-50 shadow-sm transition-all duration-300">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20">
            AAI
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-sm tracking-tight text-slate-900 uppercase">Airports Authority of India</span>
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider -mt-0.5">Civil Aviation Telemetry Node</span>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <nav className="hidden md:flex items-center gap-6 text-xs font-bold text-slate-650 uppercase tracking-wider">
            <a href="#features" className="hover:text-blue-600 transition-colors">Features</a>
            <a href="#simulator" className="hover:text-blue-600 transition-colors">Telemetry Simulator</a>
            <a href="#workflow" className="hover:text-blue-600 transition-colors">Data Workflow</a>
            <a href="#showcase" className="hover:text-blue-600 transition-colors">Showcase</a>
          </nav>

          <Link
            href="/sign-in"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-xl text-xs transition-all active:scale-[0.98] shadow-md shadow-blue-500/10 flex items-center gap-1.5 border-none"
          >
            <span>Operator Portal</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-12 pb-24 px-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        
        {/* Left Side: Headline & Description */}
        <div className="lg:col-span-6 space-y-6 text-left">
          <div className="inline-flex items-center gap-2 bg-blue-50/80 border border-blue-200/80 px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase text-blue-700 shadow-sm animate-fade-in">
            <CheckCircle2 size={12} className="text-blue-600 animate-pulse" />
            <span>Airports Authority of India — Live Telemetry System</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.12]">
            Transforming Airport Facility Operations <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
              with Intelligent IoT Monitoring
            </span>
          </h1>

          <p className="text-sm sm:text-base text-slate-500 leading-relaxed max-w-xl">
            A state-of-the-art Command Center consolidating ammonia detection filters, cleaning schedule schedules, and multi-terminal RBAC controls into a unified dashboard.
          </p>

          <div className="pt-4 flex flex-wrap gap-4">
            <Link
              href="/sign-in"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-8 rounded-xl text-sm transition-all shadow-md hover:shadow-lg active:scale-[0.98] flex items-center gap-2 border-none"
            >
              <span>Operator Sign In</span>
              <ArrowRight size={16} />
            </Link>
            <a
              href="#simulator"
              className="bg-white border border-slate-350 hover:border-slate-400 text-slate-700 font-bold py-3.5 px-8 rounded-xl text-sm transition-all shadow-sm hover:bg-slate-50 active:scale-[0.98]"
            >
              Interactive Simulator
            </a>
          </div>
        </div>

        {/* Right Side: Command Center Illustration & Glassmorphic Stat overlay */}
        <div className="lg:col-span-6 relative flex items-center justify-center">
          <div className="relative w-full max-w-lg aspect-video rounded-2xl border border-slate-200 shadow-2xl overflow-hidden group">
            <img 
              src="/aai_command_center.png" 
              alt="AAI Command Center Visual"
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            {/* Dark gradient mask */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-transparent pointer-events-none" />
          </div>

          {/* Floating Glassmorphic SLA Card */}
          <div className="absolute bottom-[-20px] left-[-20px] bg-white/70 backdrop-blur-md border border-white/20 p-5 rounded-2xl shadow-xl flex items-center gap-4 max-w-xs transition-transform hover:translate-y-[-4px]">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Network SLA Status</p>
              <h4 className="text-lg font-black text-slate-900 font-mono">99.98%</h4>
              <span className="text-[9px] font-bold text-emerald-650 uppercase tracking-widest mt-0.5 block">Audit Passing</span>
            </div>
          </div>

        </div>

      </section>

      {/* Feature Highlights Masonry Layout (Phase 10) */}
      <section id="features" className="bg-white border-y border-slate-250/80 py-24 px-6">
        <div className="max-w-7xl mx-auto space-y-12">
          
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Platform Core Capabilities</h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto">Explore how real-time diagnostics are structured across terminals.</p>
          </div>

          {/* Perfect Masonry Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-auto">
            
            {/* Card 1: Real-Time Telemetry (Standard height) */}
            <div className="bg-slate-50/50 border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300 hover:translate-y-[-4px]">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                <Activity size={20} />
              </div>
              <h3 className="font-extrabold text-slate-900 mt-4 text-base">Real-Time Telemetry</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Continual tracking of bathroom occupancy, room temperature, door closures, and battery levels of all active hardware units.
              </p>
            </div>

            {/* Card 2: AI-Powered WHI (Larger height / row-span-2) */}
            <div className="md:row-span-2 bg-gradient-to-b from-blue-50/30 to-indigo-50/20 border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300 hover:translate-y-[-4px] flex flex-col justify-between">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                  <Cpu size={20} />
                </div>
                <h3 className="font-extrabold text-slate-900 text-base">AI Powered WHI Engine</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  The Washroom Health Index dynamically updates based on occupancy loads, janitorial cycle logs, and environmental telemetry.
                </p>
                <div className="bg-white border border-slate-200/60 rounded-xl p-3.5 space-y-2 text-xs font-semibold">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">WHI Formula Breakdown</p>
                  <div className="flex justify-between text-slate-650">
                    <span>Cleanliness Weight</span>
                    <span>35%</span>
                  </div>
                  <div className="flex justify-between text-slate-650">
                    <span>Occupancy Load</span>
                    <span>20%</span>
                  </div>
                  <div className="flex justify-between text-slate-650">
                    <span>Supplies Level</span>
                    <span>25%</span>
                  </div>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-200/60 flex items-center gap-1.5 text-xs text-blue-600 font-bold">
                <Sparkles size={14} />
                <span>Automatic scaling enabled</span>
              </div>
            </div>

            {/* Card 3: Predictive Alerts (Standard height) */}
            <div className="bg-slate-50/50 border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300 hover:translate-y-[-4px]">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-650 flex items-center justify-center border border-red-100">
                <AlertTriangle size={20} />
              </div>
              <h3 className="font-extrabold text-slate-900 mt-4 text-base">Predictive Dispatch Alerts</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Automatic generation of technician tickets when environmental variables cross preconfigured limits, preventing passenger complaints.
              </p>
            </div>

            {/* Card 4: Device Health (Standard height) */}
            <div className="bg-slate-50/50 border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300 hover:translate-y-[-4px]">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                <Battery size={20} />
              </div>
              <h3 className="font-extrabold text-slate-900 mt-4 text-base">Device Network Health</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Ping-interval validation checks for battery thresholds, telemetry packet structures, and hardware offline cycles.
              </p>
            </div>

            {/* Card 5: Role-Based Auditing (Standard height) */}
            <div className="bg-slate-50/50 border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300 hover:translate-y-[-4px]">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <ShieldCheck size={20} />
              </div>
              <h3 className="font-extrabold text-slate-900 mt-4 text-base">Role-Based Access</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Strict compartmentalization between Administrators, Operators, and Auditors to prevent unauthorized setting changes.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Interactive Telemetry Simulator Section (Phase 10) */}
      <section id="simulator" className="py-24 px-6 max-w-7xl mx-auto w-full space-y-12">
        <div className="text-center space-y-2">
          <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200">
            INTERACTIVE ENVIRONMENT
          </span>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Active Telemetry Simulation</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">Toggle settings below to test the automatic alert escalation logic in real time.</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-md grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative overflow-hidden">
          {/* Neon blob */}
          <div className="absolute top-[-50%] right-[-50%] w-[100%] h-[100%] bg-blue-50/20 rounded-full blur-3xl pointer-events-none" />

          {/* Left Control Board */}
          <div className="lg:col-span-5 space-y-6">
            <h3 className="text-lg font-bold text-slate-950">Sensor Control Board</h3>
            
            <div className="space-y-4">
              {/* Slider Ammonia */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold text-slate-650">
                  <span>Simulate Ammonia Level:</span>
                  <span className={`${ammoniaLevel > 40 ? 'text-red-600 font-extrabold' : 'text-slate-900'}`}>{ammoniaLevel} ppm</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="75"
                  value={ammoniaLevel}
                  onChange={(e) => {
                    const next = Number(e.target.value)
                    setAmmoniaLevel(next)
                    setSimulatedAlert(next > 40)
                  }}
                  className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                />
              </div>

              {/* Fan Toggle */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-650 block">Exhaust Fan Overrides:</label>
                <div className="flex gap-2 mt-1">
                  {(['AUTO', 'ON', 'OFF'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setFanState(mode)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${fanState === mode ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Live Operational Status Screen */}
          <div className="lg:col-span-7 bg-slate-900 rounded-2xl p-6 text-slate-350 shadow-inner relative overflow-hidden flex flex-col justify-between min-h-[220px]">
            {/* Status indicators */}
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest font-mono">Telemetry Node Status</p>
                <h4 className="text-white font-bold mt-1 text-base">Terminal 1 Arrivals Zone</h4>
              </div>
              
              <div className={`px-3 py-1 rounded-full text-[10px] font-bold border flex items-center gap-1.5 ${simulatedAlert ? 'bg-red-950/80 text-red-400 border-red-900/50 animate-pulse' : 'bg-emerald-950/80 text-emerald-400 border-emerald-900/50'}`}>
                <Siren size={12} />
                <span>{simulatedAlert ? 'ESCALATION ALERT' : 'SYSTEM HEALTHY'}</span>
              </div>
            </div>

            {/* Animated details */}
            <div className="grid grid-cols-2 gap-6 my-6 text-xs border-y border-slate-800 py-4">
              <div>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Ventilation State</span>
                <p className="text-white font-bold mt-1 flex items-center gap-1.5">
                  <Fan size={14} className={`${(fanState === 'ON' || (fanState === 'AUTO' && ammoniaLevel > 40)) ? 'animate-spin text-blue-400' : 'text-slate-500'}`} />
                  <span>{(fanState === 'ON' || (fanState === 'AUTO' && ammoniaLevel > 40)) ? 'ACTIVE — HIGH FLOW' : 'OFF — STANDBY'}</span>
                </p>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">WHI Score</span>
                <p className={`font-mono font-black mt-1 text-lg ${ammoniaLevel > 40 ? 'text-red-505' : 'text-emerald-405'}`}>
                  {Math.max(35, 95 - Math.max(0, ammoniaLevel - 20) * 1.5)}%
                </p>
              </div>
            </div>

            <div className="flex justify-between text-[10px] text-slate-500 font-bold">
              <span>Sensor: T1-ARR-AM-001</span>
              <span className="flex items-center gap-1"><Wifi size={12} className="text-emerald-500" /> RSSI: -54 dBm</span>
            </div>
          </div>
        </div>
      </section>

      {/* Showcase Section with Carousel (Phase 10) */}
      <section id="showcase" className="bg-white border-y border-slate-200 py-24 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto space-y-12">
          
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Console Modules Showcase</h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto">Click through the sections below to preview the active dashboard metrics.</p>
          </div>

          {/* Selector Tabs */}
          <div className="flex flex-wrap justify-center gap-2 max-w-3xl mx-auto">
            {CAROUSEL_SLIDES.map((slide, idx) => (
              <button
                key={slide.id}
                onClick={() => setActiveSlide(idx)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer uppercase ${activeSlide === idx ? 'bg-blue-600 text-white border-blue-600 shadow-sm font-semibold' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-350'}`}
              >
                {slide.title}
              </button>
            ))}
          </div>

          {/* Slider Display Box */}
          <div className="max-w-4xl mx-auto bg-slate-50 border border-slate-200 rounded-3xl p-8 shadow-inner relative flex flex-col justify-between min-h-[300px] transition-all duration-300">
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-[10px] font-mono font-bold uppercase tracking-widest border border-blue-200">
                  Slide {activeSlide + 1} of {CAROUSEL_SLIDES.length}
                </span>
                <span className="text-xs text-slate-400 font-mono font-bold">NODE://MODULE_{CAROUSEL_SLIDES[activeSlide].id.toUpperCase()}</span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-900">{CAROUSEL_SLIDES[activeSlide].title}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-2xl">{CAROUSEL_SLIDES[activeSlide].subtitle}</p>
              </div>
            </div>

            {/* Slider Mock Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-8 border-t border-slate-200 mt-8">
              <div className="bg-white border border-slate-200/60 p-4 rounded-2xl shadow-sm">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{CAROUSEL_SLIDES[activeSlide].stats.label}</p>
                <p className="text-2xl font-black text-slate-900 mt-1 font-mono">{CAROUSEL_SLIDES[activeSlide].stats.main}</p>
                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md mt-2 inline-block uppercase tracking-wider">{CAROUSEL_SLIDES[activeSlide].stats.status}</span>
              </div>

              {CAROUSEL_SLIDES[activeSlide].details.map((det, index) => (
                <div key={index} className="bg-white border border-slate-200/60 p-4 rounded-2xl shadow-sm flex flex-col justify-center">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{det.label}</p>
                  <p className="text-lg font-bold text-slate-800 mt-1 font-mono">{det.value}</p>
                </div>
              ))}
            </div>

            {/* Navigation Arrows */}
            <div className="absolute top-[45%] left-2 right-2 flex justify-between pointer-events-none">
              <button
                onClick={() => setActiveSlide((prev) => (prev - 1 + CAROUSEL_SLIDES.length) % CAROUSEL_SLIDES.length)}
                className="w-10 h-10 rounded-full bg-white border border-slate-250 flex items-center justify-center text-slate-650 hover:text-slate-900 hover:bg-slate-50 shadow-sm pointer-events-auto transition-all cursor-pointer"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => setActiveSlide((prev) => (prev + 1) % CAROUSEL_SLIDES.length)}
                className="w-10 h-10 rounded-full bg-white border border-slate-250 flex items-center justify-center text-slate-650 hover:text-slate-900 hover:bg-slate-50 shadow-sm pointer-events-auto transition-all cursor-pointer"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* Access Level Credentials Cards */}
      <section className="py-24 px-6 max-w-7xl mx-auto w-full space-y-12">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Sandbox Credentials vault</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">Use these preset credentials to log in and audit various authority portals.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Admin */}
          <div className="bg-white border border-slate-200 p-6 rounded-2xl hover:border-slate-350 transition-all flex flex-col justify-between shadow-sm">
            <div>
              <span className="px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200">
                ADMIN LEVEL
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-3">System Administrator</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Full authority access to global settings, charts, personnel lists, and event logs.
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-slate-100 flex flex-col gap-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase">Demo User ID:</span>
                <div className="flex items-center gap-1 font-mono font-bold text-slate-800">
                  <span>AP-001</span>
                  <button 
                    onClick={() => handleCopy('AP-001', 'admin_demo')}
                    className="p-1 hover:bg-slate-100 rounded text-slate-400 transition-colors border-none bg-transparent cursor-pointer"
                  >
                    {copiedId === 'admin_demo' ? <Check size={11} className="text-green-600" /> : <ClipboardList size={11} />}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase">Password:</span>
                <span className="font-mono text-slate-650 font-bold">{process.env.NEXT_PUBLIC_DEMO_PASSWORD || 'Not configured'}</span>
              </div>
            </div>
          </div>

          {/* Operator */}
          <div className="bg-white border border-slate-200 p-6 rounded-2xl hover:border-slate-350 transition-all flex flex-col justify-between shadow-sm">
            <div>
              <span className="px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                OPERATOR LEVEL
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-3">Terminal Operator</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Active monitoring of washrooms, heatmap traffic status, and manual incident escalation.
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-slate-100 flex flex-col gap-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase">Demo User ID:</span>
                <div className="flex items-center gap-1 font-mono font-bold text-slate-800">
                  <span>TP-001</span>
                  <button 
                    onClick={() => handleCopy('TP-001', 'operator_demo')}
                    className="p-1 hover:bg-slate-100 rounded text-slate-400 transition-colors border-none bg-transparent cursor-pointer"
                  >
                    {copiedId === 'operator_demo' ? <Check size={11} className="text-green-600" /> : <ClipboardList size={11} />}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase">Password:</span>
                <span className="font-mono text-slate-650 font-bold">{process.env.NEXT_PUBLIC_DEMO_PASSWORD || 'Not configured'}</span>
              </div>
            </div>
          </div>

          {/* Auditor */}
          <div className="bg-white border border-slate-200 p-6 rounded-2xl hover:border-slate-350 transition-all flex flex-col justify-between shadow-sm">
            <div>
              <span className="px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                AUDITOR LEVEL
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-3">System Compliance Auditor</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Read-only logs audit audit trails, network telemetry, and Civil Aviation compliance logs.
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-slate-100 flex flex-col gap-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase">Demo User ID:</span>
                <div className="flex items-center gap-1 font-mono font-bold text-slate-800">
                  <span>ALP-001</span>
                  <button 
                    onClick={() => handleCopy('ALP-001', 'auditor_demo')}
                    className="p-1 hover:bg-slate-100 rounded text-slate-400 transition-colors border-none bg-transparent cursor-pointer"
                  >
                    {copiedId === 'auditor_demo' ? <Check size={11} className="text-green-600" /> : <ClipboardList size={11} />}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase">Password:</span>
                <span className="font-mono text-slate-650 font-bold">{process.env.NEXT_PUBLIC_DEMO_PASSWORD || 'Not configured'}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tech stack log */}
      <section className="bg-white border-t border-slate-250 py-16 px-6">
        <div className="max-w-7xl mx-auto space-y-8">
          <p className="text-center text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">
            PLATFORM TECHNOLOGY STACK
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12 opacity-80">
            <span className="text-slate-900 font-black text-sm tracking-tighter">Next.js 16</span>
            <span className="text-slate-900 font-bold text-sm tracking-tight">TypeScript</span>
            <span className="text-slate-900 font-bold text-sm tracking-tight">Tailwind CSS</span>
            <span className="text-slate-900 font-bold text-sm tracking-tight">Clerk Auth</span>
            <span className="text-slate-900 font-black text-sm tracking-wider">PostgreSQL</span>
            <span className="text-slate-900 font-bold text-sm tracking-tight">Drizzle ORM</span>
            <span className="text-slate-900 font-bold text-sm tracking-tight">Neon Serverless</span>
            <span className="text-slate-900 font-bold text-sm tracking-tight">Recharts</span>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-slate-900 text-white py-24 px-6 text-center space-y-6 relative overflow-hidden">
        <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-gradient-radial from-blue-500/10 to-transparent pointer-events-none" />
        
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight relative z-10">
          Ready to Modernize Airport Facility Operations?
        </h2>
        <p className="text-xs text-slate-450 max-w-md mx-auto leading-relaxed relative z-10">
          Access the secure terminal management dashboard using your Civil Aviation credentials.
        </p>

        <div className="pt-4 flex justify-center gap-4 relative z-10">
          <Link
            href="/sign-in"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-8 rounded-xl text-xs transition-all active:scale-[0.98] shadow-md border-none"
          >
            Access Operator Panel
          </Link>
          <a
            href="#features"
            className="bg-slate-800 hover:bg-slate-700 text-slate-350 font-bold py-3.5 px-8 rounded-xl text-xs transition-all active:scale-[0.98]"
          >
            Explore Platform Features
          </a>
        </div>
      </section>

      {/* Official Government Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-12 px-8 text-slate-450">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-xs font-medium">
          
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center font-bold text-white text-[10px]">A</span>
              <span className="font-bold text-white uppercase tracking-wider">Airports Authority of India</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Integrated aviation facilities telemetry command node. Developed under Ministry of Civil Aviation specifications.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-white uppercase tracking-wider text-[10px]">Reference Links</h4>
            <div className="grid grid-cols-2 gap-1.5 text-slate-500 text-[10px]">
              <a href="#features" className="hover:underline">Platform Features</a>
              <a href="#simulator" className="hover:underline">Live Telemetry Simulator</a>
              <a href="#workflow" className="hover:underline">Escalation Flow</a>
              <a href="#showcase" className="hover:underline">Showcase Modules</a>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-white uppercase tracking-wider text-[10px]">System Info</h4>
            <p className="text-[10px] text-slate-500 font-mono">NODE_VERSION: v20.11.0</p>
            <p className="text-[10px] text-slate-500 font-mono">COMPLIANCE: MoCA-SLA-2025</p>
            <p className="text-[10px] text-slate-500 font-mono">© {new Date().getFullYear()} Airports Authority of India.</p>
          </div>

        </div>
      </footer>
    </div>
  )
}

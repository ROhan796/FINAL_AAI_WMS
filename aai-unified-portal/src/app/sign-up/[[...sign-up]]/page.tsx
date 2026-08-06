'use client'
import { SignUp } from '@clerk/nextjs'
import { Wifi, CheckCircle } from 'lucide-react'

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen bg-slate-50 relative overflow-hidden font-sans">
      {/* Background Decorative Grids and Radial Blobs */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.4]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #cbd5e1 1px, transparent 0)`,
          backgroundSize: '24px 24px'
        }}
      />
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-100/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-purple-100/20 rounded-full blur-3xl pointer-events-none" />

      {/* Left Panel: Branding & Features (Hidden on mobile) */}
      <div className="hidden md:flex w-1/2 bg-white border-r border-slate-200 shadow-sm p-16 flex-col justify-between z-10">
        <div>
          <div className="flex items-center gap-3 mb-6">
            <span className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center font-extrabold text-white text-xl shadow-lg shadow-blue-500/30">
              AAI
            </span>
            <div>
              <h1 className="text-slate-900 text-2xl font-bold tracking-tight">Smart Washroom System</h1>
              <p className="text-slate-500 text-xs font-semibold">Airports Authority of India</p>
            </div>
          </div>
          <div className="mt-16 space-y-6">
            <div className="flex items-start gap-3">
              <CheckCircle className="text-emerald-600 shrink-0 mt-0.5" size={18} />
              <p className="text-slate-700 text-sm font-medium">Real-time occupancy monitoring across all terminals</p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="text-emerald-600 shrink-0 mt-0.5" size={18} />
              <p className="text-slate-700 text-sm font-medium">Predictive maintenance and sensor health alerts</p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="text-emerald-600 shrink-0 mt-0.5" size={18} />
              <p className="text-slate-700 text-sm font-medium">Live Washroom Hygiene Index (WHI) tracking</p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="text-emerald-600 shrink-0 mt-0.5" size={18} />
              <p className="text-slate-700 text-sm font-medium">Centralized audit trail and compliance logging</p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="text-emerald-600 shrink-0 mt-0.5" size={18} />
              <p className="text-slate-700 text-sm font-medium">Role-based access: Admin, Operator, Auditor</p>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-8 flex items-center justify-between text-slate-500">
          <div>
            <p className="text-slate-900 font-bold text-lg">24</p>
            <p className="text-xs font-medium">Airports</p>
          </div>
          <div>
            <p className="text-slate-900 font-bold text-lg">1,847</p>
            <p className="text-xs font-medium">Washrooms</p>
          </div>
          <div>
            <p className="text-slate-900 font-bold text-lg">12,403</p>
            <p className="text-xs font-medium">Sensors</p>
          </div>
        </div>
      </div>

      {/* Right Panel: Sign Up Form */}
      <div className="w-full md:w-1/2 flex flex-col items-center justify-center p-8 z-10 overflow-y-auto">
        <div className="w-full max-w-md flex flex-col items-center">
          <div className="inline-flex items-center gap-2 bg-blue-55 bg-blue-50 border border-blue-200 rounded-full px-4 py-1.5 mb-4">
            <Wifi size={14} className="text-blue-600 animate-pulse" />
            <span className="text-blue-700 text-xs font-semibold tracking-wider uppercase">
              Secure Registration
            </span>
          </div>

          <div className="mb-6 text-center">
            <p className="text-slate-500 text-sm font-medium">
              Contact your system administrator to get your User ID
            </p>
          </div>

          <SignUp
            routing="path"
            path="/sign-up"
            forceRedirectUrl="/api/auth/redirect"
            appearance={{
              variables: {
                colorPrimary: '#2563EB',
                colorBackground: '#FFFFFF',
                colorNeutral: '#64748b',
                colorDanger: '#dc2626',
                colorSuccess: '#16a34a',
                borderRadius: '0.625rem',
                fontFamily: 'inherit',
                fontSize: '0.875rem',
              },
              elements: {
                rootBox: 'w-full',
                card: '!bg-white !border !border-slate-200 !shadow-md !rounded-2xl',
                headerTitle: '!text-slate-900 !font-bold !text-xl',
                headerSubtitle: '!text-slate-500 !text-sm',
                socialButtonsBlockButton: '!bg-white !border !border-slate-200 !text-slate-800 hover:!bg-slate-50',
                socialButtonsBlockButtonText: '!text-slate-700 !font-medium',
                dividerLine: '!bg-slate-200',
                dividerText: '!text-slate-500 !text-xs',
                formFieldLabel: '!text-slate-700 !text-sm !font-medium',
                formFieldInput: [
                  '!bg-white !border !border-slate-300',
                  '!text-slate-900 !rounded-lg',
                  'focus:!border-blue-500 focus:!ring-2 focus:!ring-blue-100',
                  '!placeholder-slate-400',
                ].join(' '),
                formButtonPrimary: [
                  '!bg-blue-600 hover:!bg-blue-700',
                  '!text-white !font-semibold',
                  '!rounded-lg !transition-colors',
                ].join(' '),
                footerActionLink: '!text-blue-600 hover:!text-blue-700',
                footerAction: '!text-slate-505',
                identityPreviewText: '!text-slate-800',
                identityPreviewEditButton: '!text-blue-600',
                alert: '!bg-red-50 !border !border-red-200 !text-red-600',
                alertText: '!text-red-600 !text-sm',
                formResendCodeLink: '!text-blue-600',
                otpCodeFieldInput: '!bg-white !border-slate-300 !text-slate-900',
              }
            }}
          />

          <div className="mt-8 flex flex-col items-center gap-1 text-[10px] text-slate-500 font-bold uppercase tracking-wider text-center">
            <span>Airports Authority of India</span>
            <span className="text-slate-400">Ministry of Civil Aviation, Government of India</span>
          </div>
        </div>
      </div>
    </div>
  )
}

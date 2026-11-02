import { Brain, Shield, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BackendNotice } from '../BackendNotice'

const features = [
  { icon: Sparkles, title: 'AI Powered', desc: 'Deep learning screening assistance' },
  { icon: Brain, title: 'High Accuracy', desc: 'EfficientNet-based classification' },
  { icon: Shield, title: 'Secure & Private', desc: 'Your data stays protected' },
]

export function AuthLayout({ children, footerLink }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-violet-50 to-slate-100 lg:grid lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between bg-sidebar px-10 py-12 text-white lg:flex">
        <div>
          <Link to="/login" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient text-lg font-bold">
              DV
            </div>
            <span className="text-xl font-bold tracking-tight">DermaVision AI</span>
          </Link>
          <p className="mt-8 max-w-sm text-2xl font-bold leading-snug">
            Better Detection. Healthier Tomorrow.
          </p>
          <p className="mt-3 max-w-sm text-sm text-slate-300">
            AI-assisted skin lesion screening and monitoring for informed conversations with your
            care team.
          </p>
        </div>
        <ul className="space-y-5">
          {features.map(({ icon: Icon, title, desc }) => (
            <li key={title} className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-200">
                <Icon className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-slate-400">{desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex min-h-screen flex-col justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient text-sm font-bold text-white">
            DV
          </div>
          <div>
            <p className="font-bold text-slate-900">DermaVision AI</p>
            <p className="text-xs text-slate-500">Better Detection. Healthier Tomorrow.</p>
          </div>
        </div>
        <div className="mx-auto w-full max-w-md">
          <BackendNotice />
          {children}
        </div>
        {footerLink && <div className="mx-auto mt-6 w-full max-w-md text-center">{footerLink}</div>}
      </main>
    </div>
  )
}

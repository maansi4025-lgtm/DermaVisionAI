import { AlertTriangle } from 'lucide-react'

export function MedicalDisclaimer({ className = '' }) {
  return (
    <div
      className={`flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 ${className}`}
      role="note"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
      <p>
        This prediction is for screening and educational support only. Please consult a qualified
        dermatologist for professional advice.
      </p>
    </div>
  )
}

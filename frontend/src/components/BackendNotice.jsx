import { AlertTriangle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BASE_URL, checkBackend } from '../services/api'

/** Amber notice shown above the login forms when the backend cannot be reached (or blocks this page via CORS). */
export function BackendNotice() {
  const [status, setStatus] = useState('checking')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    checkBackend().then((r) => {
      if (!cancelled) setStatus(r.ok ? 'ok' : 'down')
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (status !== 'down') return null
  return (
    <div role="alert" className="mb-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">Cannot reach the server at {BASE_URL}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
          <li>Start the backend (double-click start-backend.bat) and wait for &quot;startup complete&quot;.</li>
          <li>Open this app at http://localhost:5173 (address bar: {window.location.origin}).</li>
          <li>If the browser console says &quot;blocked by CORS&quot;, restart the backend after editing backend/.env.</li>
        </ul>
        <button
          type="button"
          onClick={() => {
            setStatus('checking')
            setAttempt((n) => n + 1)
          }}
          className="mt-2 rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
        >
          Try again
        </button>
      </div>
    </div>
  )
}

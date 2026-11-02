import { Calendar, ChevronRight, History, Sparkles, Upload, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { RiskBadge } from '../components/ui/RiskBadge'
import { Spinner } from '../components/ui/Spinner'
import { dashboardApi } from '../services/api'
import { confidencePercent, formatDate, formatDateTime } from '../utils/validation'
import { badgeLabel } from '../utils/result'
export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await dashboardApi.getStats()
        if (!cancelled) setStats(data)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <Spinner label="Loading dashboard…" />

  const recent = stats?.recent_scans ?? []

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Couldn&apos;t load your dashboard data, so the numbers below may be missing. Please refresh the page.
        </div>
      )}

      <Card className="overflow-hidden bg-gradient-to-r from-indigo-600 to-violet-600 p-0 text-white">
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="max-w-xl">
            <p className="text-sm font-medium text-indigo-100">Your skin health journey</p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
              Stay proactive with AI-assisted screening
            </h2>
            <p className="mt-2 text-sm text-indigo-100/90">
              Upload a clear lesion photo anytime to track changes and share insights with your
              dermatologist.
            </p>
          </div>
          <div
            className="mx-auto flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-white/15 sm:mx-0"
            aria-hidden
          >
            <Sparkles className="h-14 w-14 text-indigo-100" />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-sm text-slate-500">Total Scans</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{stats?.total_scans ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Last Scan</p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {formatDate(stats?.last_scan_date)}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Next Follow-up</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-bold text-slate-900">
            <Calendar className="h-5 w-5 text-indigo-500" aria-hidden />
            {formatDate(stats?.next_follow_up)}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">AI Analysis</p>
          <span className="mt-2 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            Available
          </span>
        </Card>
      </div>

      <div>
        <h3 className="mb-3 text-lg font-semibold text-slate-900">Quick Actions</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { to: '/upload', icon: Upload, label: 'Upload Skin Lesion Image' },
            { to: '/history', icon: History, label: 'View History' },
            { to: '/reports', icon: FileText, label: 'View Reports' },
          ].map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-sm font-semibold text-slate-800">{label}</span>
            </Link>
          ))}
        </div>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-slate-900">Recent Scans</h3>
          <Link
            to="/history"
            className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
          >
            View All <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {recent.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">
            No scans yet.{' '}
            <Link to="/upload" className="font-semibold text-indigo-600">
              Upload your first image
            </Link>{' '}
            to get started.
          </p>
        )}
        <ul className="divide-y divide-slate-100">
          {recent.map((scan) => (
            <li key={scan.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
              <img
                src={scan.image_url}
                alt=""
                className="h-16 w-16 rounded-lg object-cover ring-1 ring-slate-200"
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">Scan #{scan.scan_number}</p>
                <p className="text-sm text-slate-500">{formatDateTime(scan.created_at)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <RiskBadge label={badgeLabel(scan)} riskLevel={scan.risk_level} />
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {confidencePercent(scan.confidence)}
                </span>
                <Link
                  to={`/results/${scan.id}`}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  View
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
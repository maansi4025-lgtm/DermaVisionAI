import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui/EmptyState'
import { Card } from '../components/ui/Card'
import { RiskBadge } from '../components/ui/RiskBadge'
import { Spinner } from '../components/ui/Spinner'
import { useToast } from '../context/ToastContext'
import { scanApi } from '../services/api'
import { confidencePercent, formatDateTime } from '../utils/validation'
import { badgeLabel } from '../utils/result'
export default function Reports() {
  const { showToast } = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortDesc, setSortDesc] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await scanApi.getHistory({ page: 1, page_size: 50 })
        if (!cancelled) setItems(res.items ?? [])
      } catch {
        showToast('Failed to load reports.', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showToast])

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const diff = new Date(b.created_at) - new Date(a.created_at)
      return sortDesc ? diff : -diff
    })
  }, [items, sortDesc])

  if (loading) return <Spinner label="Loading reports…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Reports</h2>
          <p className="text-sm text-slate-500">Download printable screening summaries</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <span>Sort by date</span>
          <select
            value={sortDesc ? 'newest' : 'oldest'}
            onChange={(e) => setSortDesc(e.target.value === 'newest')}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
      </div>

      {!sorted.length ? (
        <EmptyState
          title="No reports available"
          description="Complete a scan analysis to generate downloadable reports."
          action={
            <Link
              to="/upload"
              className="inline-flex rounded-lg bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white"
            >
              Upload Scan
            </Link>
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Prediction</th>
                <th className="px-4 py-3 font-semibold">Confidence</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((scan) => (
                <tr key={scan.id}>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(scan.created_at)}</td>
                  <td className="px-4 py-3">
                    <RiskBadge label={badgeLabel(scan)} riskLevel={scan.risk_level} />
                  </td>
                  <td className="px-4 py-3 font-medium">{confidencePercent(scan.confidence)}</td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/reports/${scan.id}`}
                      className="font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      View PDF
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

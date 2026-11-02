import { Search, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { RiskBadge } from '../components/ui/RiskBadge'
import { Spinner } from '../components/ui/Spinner'
import { useToast } from '../context/ToastContext'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { apiErrorMessage, scanApi } from '../services/api'
import { confidencePercent, formatDateTime } from '../utils/validation'
import { badgeLabel } from '../utils/result'

export default function History() {
  const { showToast } = useToast()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await scanApi.getHistory({ page, page_size: 5, search: query })
        if (!cancelled) setData(res)
      } catch {
        showToast('Failed to load scan history.', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [page, query, reloadKey, showToast])

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await scanApi.remove(toDelete.id)
      showToast('Scan deleted.', 'success')
      setToDelete(null)
      if (data?.items?.length === 1 && page > 1) setPage(page - 1)
      else setReloadKey((k) => k + 1)
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not delete the scan.'), 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    setPage(1)
    setQuery(search)
  }

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              type="search"
              placeholder="Search by date or prediction"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              aria-label="Search scans"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </Card>

      {loading ? (
        <Spinner label="Loading history…" />
      ) : !data?.items?.length ? (
        <EmptyState
          title="No scans yet"
          description="Upload your first skin lesion image to start building your screening history."
          action={
            <Link
              to="/upload"
              className="inline-flex items-center justify-center rounded-lg bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-md"
            >
              Upload Scan
            </Link>
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0 sm:p-0">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Image</th>
                <th className="px-4 py-3 font-semibold">Date &amp; Time</th>
                <th className="px-4 py-3 font-semibold">Prediction</th>
                <th className="px-4 py-3 font-semibold">Confidence</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((scan) => (
                <tr key={scan.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium">{scan.scan_number}</td>
                  <td className="px-4 py-3">
                    <img
                      src={scan.image_url}
                      alt=""
                      className="h-12 w-12 rounded-lg object-cover ring-1 ring-slate-200"
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(scan.created_at)}</td>
                  <td className="px-4 py-3">
                    <RiskBadge label={badgeLabel(scan)} riskLevel={scan.risk_level} />
                  </td>
                  <td className="px-4 py-3 font-medium">{confidencePercent(scan.confidence)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-4">
                      <Link
                        to={`/results/${scan.id}`}
                        className="font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => setToDelete(scan)}
                        className="inline-flex items-center gap-1 font-semibold text-red-600 hover:text-red-700"
                        aria-label={`Delete scan ${scan.scan_number}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row">
            <p className="text-sm text-slate-500">
              Page {data.page} of {data.total_pages} · {data.total} scans
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={page >= data.total_pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Delete scan #${toDelete?.scan_number ?? ''}?`}
        confirmLabel="Delete scan"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      >
        <p>
          This permanently removes the photo, the result and its report. It cannot be undone. A copy of a
          report you already saved or printed is not affected.
        </p>
      </ConfirmDialog>
    </div>
  )
}
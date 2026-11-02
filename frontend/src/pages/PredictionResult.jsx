import { AlertTriangle, Expand, FileText, Lightbulb, MessageCircle, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { MedicalDisclaimer } from '../components/MedicalDisclaimer'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { RiskBadge } from '../components/ui/RiskBadge'
import { Spinner } from '../components/ui/Spinner'
import { useToast } from '../context/ToastContext'
import { apiErrorMessage, scanApi } from '../services/api'
import { isLowConfidence, plainSummary } from '../utils/result'
import { confidencePercent } from '../utils/validation'

const NEXT_STEPS = {
  low: {
    title: 'Lower concern. Keep an eye on it.',
    text: 'Re-scan in a few weeks. If it changes in size, shape or colour, or starts to itch or bleed, see a doctor.',
    style: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  },
  medium: {
    title: 'Worth getting checked.',
    text: 'Book a dermatologist visit in the coming weeks and bring this report.',
    style: 'border-amber-200 bg-amber-50 text-amber-900',
  },
  high: {
    title: 'Please see a dermatologist soon.',
    text: 'This result suggests a higher-concern lesion. Do not wait for it to change. This is not a diagnosis; only a doctor can confirm.',
    style: 'border-red-200 bg-red-50 text-red-900',
  },
  uncertain: {
    title: 'Not sure. Please see a doctor.',
    text: 'The AI could not give a confident answer for this photo. Have a doctor look at the spot, especially if it is new, changing, bleeding or itching.',
    style: 'border-amber-200 bg-amber-50 text-amber-900',
  },
}

export default function PredictionResult() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [scan, setScan] = useState(location.state?.result ?? null)
  const [loading, setLoading] = useState(!location.state?.result)
  const [showGradcamFull, setShowGradcamFull] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (location.state?.result) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await scanApi.getById(id)
        if (!cancelled) setScan(data)
      } catch {
        if (!cancelled) navigate('/history')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, location.state?.result, navigate])

  useEffect(() => {
    if (!showGradcamFull) return
    const onKey = (e) => e.key === 'Escape' && setShowGradcamFull(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showGradcamFull])

  if (loading || !scan) return <Spinner label="Loading results…" />

  const uncertain = isLowConfidence(scan)
  // A high-risk result always gets the "see a dermatologist soon" step, even when the model is unsure.
  const nextStep =
    scan.risk_level === 'high'
      ? NEXT_STEPS.high
      : uncertain
        ? NEXT_STEPS.uncertain
        : (NEXT_STEPS[scan.risk_level] ?? NEXT_STEPS.medium)
  const summary = plainSummary(scan)
  const showDetails = !uncertain || detailsOpen
  const top = scan.top_classes ?? []

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await scanApi.remove(scan.id)
      showToast('Scan deleted.', 'success')
      navigate('/history', { replace: true })
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not delete the scan.'), 'error')
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Prediction Result</h2>
          <p className="text-sm text-slate-500">Scan #{scan.scan_number}</p>
        </div>
        <Button variant="secondary" onClick={() => navigate(`/reports/${scan.id}`)}>
          <FileText className="h-4 w-4" aria-hidden />
          View / Download Report
        </Button>
      </div>

      {scan.is_demo && (
        <div role="alert" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-100 px-4 py-3 text-sm font-medium text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          Demo mode: no trained model is loaded, so this result is NOT a real prediction.
        </div>
      )}

      <div className={`rounded-xl border px-4 py-3 text-sm ${nextStep.style}`} role="note">
        <p className="font-semibold">{nextStep.title}</p>
        <p className="mt-0.5">{nextStep.text}</p>
        <p className="mt-1 text-xs opacity-80">
          Screening and educational support only. Consult a qualified dermatologist for advice.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold text-slate-900">Uploaded Image</h3>
          <img
            src={scan.image_url}
            alt="Uploaded skin lesion"
            className="w-full rounded-xl object-cover ring-1 ring-slate-200"
          />
        </Card>

        <Card className="space-y-5">
          <div>
            <p className="text-sm text-slate-500">What the AI found</p>
            <h3 className="mt-1 text-2xl font-bold text-slate-900">{summary.headline}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{summary.meaning}</p>
          </div>

          {uncertain && !detailsOpen && (
            <Button variant="ghost" className="px-0 text-indigo-600 hover:bg-transparent hover:underline" onClick={() => setDetailsOpen(true)}>
              Show the AI&apos;s best guesses anyway
            </Button>
          )}

          {showDetails && (
            <>
              {uncertain && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  The AI was not sure, so treat these as rough guesses, not an answer.
                </p>
              )}

              <div>
                <p className="text-sm text-slate-500">Closest match</p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <span className="text-base font-semibold text-slate-900">{scan.prediction}</span>
                  <RiskBadge label={scan.prediction} riskLevel={scan.risk_level} />
                </div>
              </div>

              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-slate-600">Confidence</span>
                  <span className="font-semibold text-slate-900">{confidencePercent(scan.confidence)}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-brand-gradient"
                    style={{ width: `${Math.round(scan.confidence * 100)}%` }}
                  />
                </div>
              </div>

              <div>
                <h4 className="mb-3 font-semibold text-slate-900">Top 3 Probabilities</h4>
                <ol className="space-y-2">
                  {top.slice(0, 3).map((item, idx) => (
                    <li
                      key={item.label}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-slate-800">
                        {idx + 1}. {item.label}
                      </span>
                      <span className="text-slate-600">{confidencePercent(item.probability)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-900">Grad-CAM Visualization</h3>
          <Button variant="ghost" className="py-1.5" onClick={() => setShowGradcamFull(true)}>
            <Expand className="h-4 w-4" aria-hidden />
            View Full Image
          </Button>
        </div>
        <p className="mb-3 text-sm text-slate-600">
          Warmer colours (red/yellow) mark the areas the AI paid most attention to; cooler colours (blue)
          mattered less. It shows where the model looked, not where disease is.
        </p>
        <div className="relative overflow-hidden rounded-xl ring-1 ring-slate-200">
          <img
            src={scan.gradcam_image_url || scan.image_url}
            alt="Grad-CAM heatmap overlay"
            className="max-h-80 w-full object-cover"
          />
        </div>
      </Card>

      <Card className="flex gap-3 border-indigo-100 bg-indigo-50/50">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
          <Lightbulb className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">AI Insight</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{scan.insight}</p>
        </div>
      </Card>

      <MedicalDisclaimer />

      {showGradcamFull && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close full image"
            onClick={() => setShowGradcamFull(false)}
          />
          <img
            src={scan.gradcam_image_url || scan.image_url}
            alt="Full Grad-CAM visualization"
            className="relative max-h-[90vh] max-w-full rounded-xl object-contain"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => navigate('/upload')}>Upload Another Scan</Button>
        <Button variant="secondary" onClick={() => navigate(`/assistant?scan=${scan.id}`)}>
          <MessageCircle className="h-4 w-4" aria-hidden />
          Ask the Assistant
        </Button>
        <Link
          to="/history"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back to History
        </Link>
        <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-4 w-4" aria-hidden />
          Delete this scan
        </Button>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title={`Delete scan #${scan.scan_number}?`}
        confirmLabel="Delete scan"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      >
        <p>
          This permanently removes the photo, the result and its report. It cannot be undone. A copy of a
          report you already saved or printed is not affected.
        </p>
      </ConfirmDialog>
    </div>
  )
}
import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MedicalDisclaimer } from '../components/MedicalDisclaimer'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { RiskBadge } from '../components/ui/RiskBadge'
import { Spinner } from '../components/ui/Spinner'
import { reportsApi } from '../services/api'
import { confidencePercent, formatDateTime } from '../utils/validation'
import { badgeLabel, isLowConfidence } from '../utils/result'
export default function ReportView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await reportsApi.getReport(id)
        if (!cancelled) setReport(data)
      } catch {
        if (!cancelled) navigate('/reports')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  const handlePrint = () => window.print()

  if (loading || !report) return <Spinner label="Generating report…" />

  const patient = report.patient ?? {}

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Screening Report</h2>
          <p className="text-sm text-slate-500">Scan ID: {report.id}</p>
        </div>
        <Button onClick={handlePrint}>
          <Download className="h-4 w-4" aria-hidden />
          Download PDF
        </Button>
      </div>

      <Card className="print:shadow-none">
        <header className="border-b border-slate-200 pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-gradient font-bold text-white">
                DV
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900">DermaVision AI</p>
                <p className="text-sm text-slate-500">AI-Assisted Skin Lesion Screening Report</p>
              </div>
            </div>
            <p className="text-sm text-slate-500">
              Generated: {formatDateTime(report.generated_at || new Date().toISOString())}
            </p>
          </div>
        </header>

        <section className="grid gap-4 border-b border-slate-200 py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-slate-500">Patient</p>
            <p className="font-semibold">{patient.full_name || '—'}</p>
            <p className="text-sm text-slate-600">{patient.email || '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Scan details</p>
            <p className="text-sm text-slate-700">Date: {formatDateTime(report.created_at)}</p>
            <p className="text-sm text-slate-700">Scan #: {report.scan_number}</p>
          </div>
        </section>

        <section className="grid gap-6 py-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 font-semibold">Uploaded Image</h3>
            <img
              src={report.image_url}
              alt="Lesion scan"
              className="rounded-xl ring-1 ring-slate-200"
            />
          </div>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">AI Prediction</h3>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-lg font-bold">{badgeLabel(report)}</span>
                <RiskBadge label={badgeLabel(report)} riskLevel={report.risk_level} />
              </div>
              <div className="mt-3 h-2 rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-brand-gradient"
                  style={{ width: `${Math.round(report.confidence * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-sm text-slate-600">
                                Confidence: {confidencePercent(report.confidence)}
              </p>
              {isLowConfidence(report) && (
                <p className="mt-1 text-sm font-medium text-amber-800">
                  Low confidence: the AI was not sure. The probabilities below are best guesses, not a finding.
                </p>
              )}
            </div>
            <div>
              <h3 className="mb-2 font-semibold">Top Probabilities</h3>
              <ul className="space-y-1 text-sm">
                {(report.top_classes ?? []).slice(0, 3).map((c) => (
                  <li key={c.label} className="flex justify-between rounded bg-slate-50 px-2 py-1">
                    <span>{c.label}</span>
                    <span>{confidencePercent(c.probability)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 py-6">
          <h3 className="mb-2 font-semibold">Grad-CAM Visualization</h3>
          <img
            src={report.gradcam_image_url || report.image_url}
            alt="Grad-CAM"
            className="max-h-64 w-full rounded-xl object-cover ring-1 ring-slate-200"
          />
        </section>

        <section className="space-y-4 border-t border-slate-200 pt-6">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">Note</p>
            <p className="mt-1">
              This document summarizes AI model output for educational screening support. It does
              not constitute a medical diagnosis.
            </p>
          </div>
          <MedicalDisclaimer />
        </section>
      </Card>
    </div>
  )
}

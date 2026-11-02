import clsx from 'clsx'

const styles = {
  low: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20',
  medium: 'bg-amber-100 text-amber-900 ring-amber-600/20',
  high: 'bg-red-100 text-red-800 ring-red-600/20',
}

export function RiskBadge({ label, riskLevel = 'low', className }) {
  const text = label || 'Unknown'
  const level =
    riskLevel ||
    (text.toLowerCase().includes('benign') || text.toLowerCase().includes('seborrheic')
      ? 'low'
      : text.toLowerCase().includes('melanoma') ||
          text.toLowerCase().includes('carcinoma')
        ? 'high'
        : 'medium')

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
        styles[level] || styles.medium,
        className,
      )}
    >
      {text}
    </span>
  )
}

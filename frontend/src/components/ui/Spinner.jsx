import clsx from 'clsx'

export function Spinner({ className, label = 'Loading' }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center gap-3 py-8', className)}>
      <div
        className="h-10 w-10 animate-spin rounded-full border-[3px] border-indigo-200 border-t-indigo-600"
        role="status"
        aria-label={label}
      />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  )
}

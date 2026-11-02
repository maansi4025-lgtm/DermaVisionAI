import { useEffect, useRef } from 'react'
import { Button } from './Button'

/** Accessible confirm dialog: Escape cancels, Tab stays inside, focus starts on the Cancel button. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}) {
  const panelRef = useRef(null)
  const cancelRef = useRef(null)
  // Latest props live in refs so the effect below runs only when the dialog opens or closes.
  // Otherwise every keystroke in a field inside the dialog would move focus back to Cancel.
  const onCancelRef = useRef(onCancel)
  const loadingRef = useRef(loading)
  useEffect(() => {
    onCancelRef.current = onCancel
    loadingRef.current = loading
  })

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    cancelRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape' && !loadingRef.current) {
        onCancelRef.current()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const items = [...panelRef.current.querySelectorAll('button, input, [href], select, textarea')].filter(
        (el) => !el.disabled,
      )
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 id="confirm-title" className="text-lg font-bold text-slate-900">
          {title}
        </h2>
        <div className="mt-2 space-y-3 text-sm text-slate-600">{children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={loading}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
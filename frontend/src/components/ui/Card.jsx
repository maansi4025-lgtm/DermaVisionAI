import clsx from 'clsx'

export function Card({ className, children, as: Tag = 'div', ...props }) {
  return (
    <Tag
      className={clsx(
        'rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6',
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  )
}

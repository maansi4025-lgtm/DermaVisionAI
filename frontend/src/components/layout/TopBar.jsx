import { ChevronDown, Menu } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export function TopBar({ onMenuClick, title }) {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const name = user?.full_name || 'User'
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  useEffect(() => {
    function onDocClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-slate-200/80 bg-[#F8FAFC]/90 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <p className="text-xs text-slate-500 sm:text-sm">Hello, {name.split(' ')[0]}!</p>
          {title && <h1 className="text-lg font-bold text-slate-900 sm:text-xl">{title}</h1>}
        </div>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2 shadow-sm"
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white">
            {initials}
          </span>
          <ChevronDown className="hidden h-4 w-4 text-slate-500 sm:block" aria-hidden />
        </button>
        {open && (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          >
            <Link
              to="/profile"
              role="menuitem"
              className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              Profile
            </Link>
            <button
              type="button"
              role="menuitem"
              className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              onClick={() => logout()}
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

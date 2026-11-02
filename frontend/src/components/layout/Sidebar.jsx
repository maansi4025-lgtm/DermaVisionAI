import clsx from 'clsx'
import {
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Upload,
  User,
  X,
} from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/upload', label: 'Upload Scan', icon: Upload },
  { to: '/assistant', label: 'AI Assistant', icon: MessageCircle },
  { to: '/history', label: 'History', icon: History },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/profile', label: 'Profile', icon: User },
]

export function Sidebar({ mobileOpen, onCloseMobile }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const content = (
    <>
      <div className="flex items-center justify-between gap-3 px-5 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient text-sm font-bold">
            DV
          </div>
          <span className="font-bold tracking-tight">DermaVision AI</span>
        </div>
        <button
          type="button"
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 lg:hidden"
          onClick={onCloseMobile}
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-1 px-3" aria-label="Main">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onCloseMobile}
            end={to !== '/upload'}
            className={({ isActive }) => {
              const active =
                isActive ||
                (to === '/upload' && location.pathname.startsWith('/results'))
              return clsx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                active
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white',
              )
            }}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-800 p-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          <LogOut className="h-5 w-5" aria-hidden />
          Logout
        </button>
      </div>
    </>
  )

  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-white lg:flex">{content}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60"
            aria-label="Close menu overlay"
            onClick={onCloseMobile}
          />
          <aside className="relative flex h-full w-[min(280px,85vw)] flex-col bg-sidebar text-white shadow-xl">
            {content}
          </aside>
        </div>
      )}
    </>
  )
}

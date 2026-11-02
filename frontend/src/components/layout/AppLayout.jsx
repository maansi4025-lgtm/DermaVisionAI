import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppLayout({ title }) {
  const [mobileNav, setMobileNav] = useState(false)

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      <Sidebar mobileOpen={mobileNav} onCloseMobile={() => setMobileNav(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} onMenuClick={() => setMobileNav(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

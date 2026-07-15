import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Dashboard', exact: true },
  { to: '/skills', label: 'Skills' },
  { to: '/projects', label: 'Projects' },
]

export default function Layout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 md:flex md:h-screen">
      <aside className="border-b border-slate-200 bg-white md:flex md:w-60 md:flex-col md:border-b-0 md:border-r">
        <div className="px-4 py-4 md:border-b md:border-slate-200 md:px-5">
          <span className="text-base font-semibold tracking-tight text-slate-950">skills-ui</span>
          <p className="mt-1 hidden text-xs text-slate-500 md:block">Local skill assets</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:space-y-1 md:overflow-visible md:py-4">
          {navItems.map(({ to, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-950 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { ProjectSwitcher } from './ProjectSwitcher';

const links = [
  { to: '/events', label: '事件库' },
  { to: '/actions', label: '动作' },
  { to: '/task', label: '任务' },
  { to: '/templates', label: '模板/ROI' },
  { to: '/settings', label: '设置' },
];

export function Layout() {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-surface-border bg-surface px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold tracking-tight">Freer</span>
          {health.data?.ok && (
            <span className="rounded-full bg-emerald-950 px-2 py-0.5 text-xs text-emerald-300">
              API {health.data.data.api_version}
            </span>
          )}
          <ProjectSwitcher />
        </div>
        <nav className="flex gap-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

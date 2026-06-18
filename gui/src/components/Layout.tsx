import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useActiveProject } from '../hooks/useActiveProject';
import { queryKeys } from '../lib/queryKeys';
import { ProjectSwitcher } from './projects/ProjectSwitcher';

const links = [
  { to: '/events', label: '事件库' },
  { to: '/actions', label: '动作' },
  { to: '/task', label: '任务' },
  { to: '/templates', label: '模板/ROI' },
  { to: '/settings', label: '设置' },
];

export function Layout() {
  const { data: projects = [] } = useQuery({ queryKey: queryKeys.projects(), queryFn: api.listProjects });
  const { activeId, payload, isReady } = useActiveProject(projects);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-surface-border bg-surface px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-lg font-semibold tracking-tight">Freer</span>
          {isReady && (
            <span className="rounded-full bg-emerald-950 px-2 py-0.5 text-xs text-emerald-300">
              API {payload?.api_version}
            </span>
          )}
          <span className="h-4 w-px bg-surface-border" aria-hidden />
          <ProjectSwitcher />
        </div>
        <nav className="flex shrink-0 gap-0.5">
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
      <main className="min-h-0 flex-1 overflow-hidden">
        <Outlet key={activeId} />
      </main>
    </div>
  );
}

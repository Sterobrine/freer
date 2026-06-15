import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { api } from './api/client';
import './App.css';

function SidecarError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="gate gate-error">
      <AlertCircle size={40} />
      <h1>引擎未连接</h1>
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        <RefreshCw size={16} />
        重试连接
      </button>
      <p className="hint">
        开发模式可先运行：<code>python -m freer_api</code>，再执行 <code>pnpm dev</code>
      </p>
    </div>
  );
}

function Shell() {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const events = useQuery({ queryKey: ['events'], queryFn: api.events, enabled: health.isSuccess });
  const config = useQuery({ queryKey: ['config'], queryFn: api.config, enabled: health.isSuccess });

  if (health.isLoading) {
    return (
      <div className="gate">
        <Loader2 className="spin" size={32} />
        <p>正在连接 Freer 引擎…</p>
      </div>
    );
  }

  if (health.isError || !health.data?.ok) {
    const msg = !health.data?.ok
      ? health.data?.error?.message ?? '健康检查失败'
      : '无法连接 sidecar';
    return <SidecarError message={msg} onRetry={() => health.refetch()} />;
  }

  const version = health.data.data.api_version;
  const eventCount = events.data?.ok ? events.data.data.length : 0;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Freer</h1>
          <span className="badge">API {version}</span>
        </div>
        <nav className="nav">
          <button type="button" className="active">概览</button>
          <button type="button" disabled>事件库</button>
          <button type="button" disabled>动作</button>
          <button type="button" disabled>任务</button>
          <button type="button" disabled>模板/ROI</button>
          <button type="button" disabled>设置</button>
        </nav>
      </header>
      <main className="content">
        <section className="card">
          <h2>Phase 3 脚手架已就绪</h2>
          <ul>
            <li>引擎 API v1.1 已上线（pause/resume、validate、tree、preview、import/export）</li>
            <li>事件数：{eventCount}</li>
            <li>数据目录：{String(config.data?.ok ? config.data.data.data_dir : '—')}</li>
          </ul>
          <p className="muted">下一步：事件属性表单 → 树形编排编辑器 → 任务控制台</p>
        </section>
      </main>
    </div>
  );
}

export default function App() {
  return <Shell />;
}

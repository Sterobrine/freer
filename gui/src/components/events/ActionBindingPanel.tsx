import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { FreerAction } from '../../api/types';
import type { FreerEvent } from '../../api/types';
import { getActionContractWarnings, requiredPositionCount, eventPositionSlots } from '../../lib/actionContract';
import { normalizeFreerAction, PLATFORM_LABELS, summarizeSteps } from '../../lib/actionSteps';

const PLATFORM_BADGE: Record<string, string> = {
  windows: 'bg-blue-500/20 text-blue-200 border-blue-500/40',
  adb: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
  mac: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
};

type Props = {
  event: FreerEvent;
  action: FreerAction | undefined;
};

export function ActionBindingPanel({ event, action }: Props) {
  const normalized = action ? normalizeFreerAction(action) : undefined;
  const warnings = useMemo(
    () => (normalized ? getActionContractWarnings(event, normalized) : []),
    [event, normalized],
  );

  if (!normalized) return null;

  const needCount = requiredPositionCount(normalized.steps);
  const haveCount = eventPositionSlots(event);

  return (
    <div className="space-y-2 rounded-lg border border-surface-border bg-[#1a1f2e]/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded border px-2 py-0.5 text-xs font-medium ${PLATFORM_BADGE[normalized.platform] ?? ''}`}
        >
          {PLATFORM_LABELS[normalized.platform]}
        </span>
        <span className="text-xs text-[#9aa3b2]">{summarizeSteps(normalized.steps, normalized.platform)}</span>
      </div>

      <div className="text-xs text-[#6b7280]">
        {needCount == null ? (
          <span>此动作无需识别坐标（如纯等待/按键）</span>
        ) : (
          <span>
            需要位置数：
            <span className={haveCount != null && haveCount >= needCount ? 'text-[#9aa3b2]' : 'text-amber-300'}>
              {' '}{needCount}
            </span>
            {haveCount != null && (
              <span> · 事件提供：{haveCount}（索引 0–{haveCount - 1}）</span>
            )}
            {haveCount == null && <span> · 事件尚未提供坐标来源</span>}
          </span>
        )}
        {normalized.run_time > 1 && (
          <span className="mt-1 block text-amber-300/90">
            动作整套重复 {normalized.run_time} 次；双击等建议用步骤编排，勿依赖 run_time。
          </span>
        )}
      </div>

      {warnings.length > 0 && (
        <ul className="space-y-1">
          {warnings.map((w) => (
            <li
              key={w.code}
              className="flex items-start gap-1.5 text-xs text-amber-200/90"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{w.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

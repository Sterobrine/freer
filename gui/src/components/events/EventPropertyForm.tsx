import type { FreerEvent } from '../../api/types';
import {
  LAST_RESORT_LABELS,
  MATCH_TYPE_LABELS,
  SYMBOL_FIELD_LABELS,
} from '../../lib/fieldLabels';
import { formatRoi, parseRoi } from '../../lib/schemas';

type Props = {
  event: FreerEvent;
  actions: string[];
  onChange: (event: FreerEvent) => void;
};

export function EventPropertyForm({ event, actions, onChange }: Props) {
  const set = <K extends keyof FreerEvent>(key: K, value: FreerEvent[K]) =>
    onChange({ ...event, [key]: value });

  const isMacro = event.event_type === 0;

  return (
    <div className="space-y-4 text-sm">
      <div>
        <label className="label">名称</label>
        <input className="input" value={event.name} onChange={(e) => set('name', e.target.value)} />
      </div>
      <div>
        <label className="label">类型</label>
        <select
          className="input"
          value={event.event_type}
          onChange={(e) => set('event_type', Number(e.target.value) as 0 | 1)}
        >
          <option value={0}>宏事件</option>
          <option value={1}>微事件</option>
        </select>
      </div>
      <div>
        <label className="label">窗口名 (父|子)</label>
        <input
          className="input"
          value={event.window_name ?? ''}
          onChange={(e) => set('window_name', e.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!event.is_exception}
          onChange={(e) => set('is_exception', e.target.checked)}
        />
        异常事件
      </label>

      {isMacro ? (
        <div>
          <label className="label">最大空转次数</label>
          <input
            className="input"
            type="number"
            value={event.max_rotate_time ?? 50}
            onChange={(e) => set('max_rotate_time', Number(e.target.value))}
          />
        </div>
      ) : (
        <>
          <div>
            <label className="label">绑定动作</label>
            <select
              className="input"
              value={event.action ?? ''}
              onChange={(e) => set('action', e.target.value)}
            >
              <option value="">—</option>
              {actions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">最大连续执行</label>
            <input
              className="input"
              type="number"
              value={event.max_suc_run_time ?? 5}
              onChange={(e) => set('max_suc_run_time', Number(e.target.value))}
            />
          </div>
          <SymbolFields
            label="起始标志"
            kind="start"
            event={event}
            onChange={onChange}
          />
          <SymbolFields
            label="结束标志"
            kind="finish"
            event={event}
            onChange={onChange}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">事件间隔下限</label>
              <input
                className="input"
                type="number"
                step="0.1"
                value={event.gap?.[0] ?? 0.4}
                onChange={(e) => set('gap', [Number(e.target.value), event.gap?.[1] ?? 0.6])}
              />
            </div>
            <div>
              <label className="label">事件间隔上限</label>
              <input
                className="input"
                type="number"
                step="0.1"
                value={event.gap?.[1] ?? 0.6}
                onChange={(e) => set('gap', [event.gap?.[0] ?? 0.4, Number(e.target.value)])}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SymbolFields({
  label,
  kind,
  event,
  onChange,
}: {
  label: string;
  kind: 'start' | 'finish';
  event: FreerEvent;
  onChange: (e: FreerEvent) => void;
}) {
  const symKey = kind === 'start' ? 'symbol_start' : 'symbol_finish';
  const typeKey = kind === 'start' ? 'match_type_start' : 'match_type_finish';
  const roiKey = kind === 'start' ? 'roi_start' : 'roi_finish';
  const fbKey = kind === 'start' ? 'match_fallback_start' : 'match_fallback_finish';
  const lrKey = kind === 'start' ? 'last_resort_start' : 'last_resort_finish';

  const symbol = event[symKey];
  const symbolStr = typeof symbol === 'string' ? symbol : symbol ? JSON.stringify(symbol) : '';

  return (
    <fieldset className="space-y-2 rounded-lg border border-surface-border p-3">
      <legend className="px-1 text-xs font-medium text-[#9aa3b2]">{label}</legend>
      <div>
        <label className="label">{SYMBOL_FIELD_LABELS.target}</label>
        <input
          className="input"
          value={symbolStr}
          onChange={(e) => onChange({ ...event, [symKey]: e.target.value || null })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">{SYMBOL_FIELD_LABELS.match_type}</label>
          <select
            className="input"
            value={event[typeKey] ?? 'template'}
            onChange={(e) => onChange({ ...event, [typeKey]: e.target.value })}
          >
            {Object.entries(MATCH_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{SYMBOL_FIELD_LABELS.accuracy}</label>
          <input
            className="input"
            type="number"
            step="0.01"
            value={event.accuracy ?? 0.85}
            onChange={(e) => onChange({ ...event, accuracy: Number(e.target.value) })}
          />
        </div>
      </div>
      <div>
        <label className="label">{SYMBOL_FIELD_LABELS.roi}</label>
        <input
          className="input"
          placeholder={SYMBOL_FIELD_LABELS.roiPlaceholder}
          value={formatRoi(event[roiKey])}
          onChange={(e) => onChange({ ...event, [roiKey]: parseRoi(e.target.value) })}
        />
      </div>
      <div>
        <label className="label">{SYMBOL_FIELD_LABELS.fallback}</label>
        <input
          className="input"
          placeholder={SYMBOL_FIELD_LABELS.fallbackPlaceholder}
          value={event[fbKey] ?? ''}
          onChange={(e) => onChange({ ...event, [fbKey]: e.target.value })}
        />
      </div>
      <div>
        <label className="label">{SYMBOL_FIELD_LABELS.last_resort}</label>
        <select
          className="input"
          value={event[lrKey] ?? 'none'}
          onChange={(e) => onChange({ ...event, [lrKey]: e.target.value })}
        >
          {Object.entries(LAST_RESORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}

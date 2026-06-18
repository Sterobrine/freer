import { ChevronDown, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { FreerEvent } from '../../api/types';
import {
  LAST_RESORT_LABELS,
  MATCH_TYPE_LABELS,
  SYMBOL_FIELD_LABELS,
} from '../../lib/fieldLabels';
import {
  buildFallbackSteps,
  fallbackStepLabel,
  parseFallbackSteps,
  summarizePipelineFlow,
  summarizeTarget,
  type FallbackStep,
} from '../../lib/fallbackSteps';
import { getSymbolTarget, setSymbolTarget } from '../../lib/formValues';
import { MATCH_TYPES } from '../../lib/schemas';
import { RoiInput, SymbolTargetInput } from '../form/EventFormFields';
import { CaptureWorkbench } from '../capture/CaptureWorkbench';

type Kind = 'start' | 'finish';

type Props = {
  label: string;
  kind: Kind;
  event: FreerEvent;
  templates: string[];
  onChange: (event: FreerEvent) => void;
};

const LAST_RESORT_HINTS: Record<string, string> = {
  none: '识别链全部失败后，交给调度层空转或异常队列',
  default_position: '使用事件「默认坐标」执行（须配置 default_position）',
  last_known: '复用同一 symbol 最近一次成功坐标（带 TTL）',
  expand_roi: '将 ROI 各边扩展后再用主 Matcher 试一次',
  pause: '立即暂停任务并告警',
};

export function RecognitionPipelinePanel({ label, kind, event, templates, onChange }: Props) {
  const symKey = kind === 'start' ? 'symbol_start' : 'symbol_finish';
  const typeKey = kind === 'start' ? 'match_type_start' : 'match_type_finish';
  const roiKey = kind === 'start' ? 'roi_start' : 'roi_finish';
  const fbKey = kind === 'start' ? 'match_fallback_start' : 'match_fallback_finish';
  const lrKey = kind === 'start' ? 'last_resort_start' : 'last_resort_finish';
  const accKey = kind === 'start' ? 'accuracy_start' : 'accuracy_finish';
  const indexKey = kind === 'start' ? 'index_start' : 'index_finish';
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [previewMsg, setPreviewMsg] = useState('');

  const preview = useMutation({
    mutationFn: () =>
      api.preview({
        symbol: event[symKey],
        accuracy: event[accKey] ?? event.accuracy ?? 0.85,
        kind,
        match_type_start: event.match_type_start,
        match_type_finish: event.match_type_finish,
        roi_start: event.roi_start,
        roi_finish: event.roi_finish,
        match_fallback_start: event.match_fallback_start,
        match_fallback_finish: event.match_fallback_finish,
        last_resort_start: event.last_resort_start,
        last_resort_finish: event.last_resort_finish,
        index_start: event.index_start,
        index_finish: event.index_finish,
        use_capture: true,
      }),
    onSuccess: (res) => {
      const n = res.positions?.length ?? 0;
      setPreviewMsg(n > 0 ? `命中 ${n} 处` : '未命中');
    },
    onError: (e: Error) => setPreviewMsg(e.message),
  });

  const matchType = event[typeKey] ?? 'template';
  const symbolTarget = getSymbolTarget(event[symKey]);
  const fallbackSteps = parseFallbackSteps(event[fbKey]);
  const lastResort = event[lrKey] ?? 'none';

  const flowSummary = summarizePipelineFlow(matchType, symbolTarget, fallbackSteps, lastResort);

  const patch = (patchEvent: Partial<FreerEvent>) => onChange({ ...event, ...patchEvent });

  const setFallbackSteps = (steps: FallbackStep[]) => {
    patch({ [fbKey]: buildFallbackSteps(steps) || undefined } as Partial<FreerEvent>);
  };

  const addFallbackStep = (type: string) => {
    if (!type) return;
    setFallbackSteps([...fallbackSteps, { matchType: type }]);
  };

  const updateFallbackStep = (index: number, step: FallbackStep) => {
    const next = [...fallbackSteps];
    next[index] = step;
    setFallbackSteps(next);
  };

  const removeFallbackStep = (index: number) => {
    setFallbackSteps(fallbackSteps.filter((_, i) => i !== index));
  };

  const availableFallbackTypes = MATCH_TYPES.filter(
    (type) => type !== matchType && !fallbackSteps.some((s) => s.matchType === type && !s.target?.trim()),
  );

  return (
    <fieldset className="space-y-3 rounded-lg border border-surface-border p-3">
      <legend className="px-1 text-xs font-medium text-[#9aa3b2]">{label}</legend>

      <p className="rounded-md border border-surface-border/80 bg-[#12151c] px-2.5 py-2 font-mono text-xs text-[#9aa3b2]">
        {flowSummary}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn text-xs" onClick={() => preview.mutate()} disabled={preview.isPending}>
          预览识别
        </button>
        <button type="button" className="btn text-xs" onClick={() => setWorkbenchOpen(true)}>
          从画面选取…
        </button>
        {previewMsg && <span className="self-center text-xs text-[#9aa3b2]">{previewMsg}</span>}
      </div>
      {workbenchOpen && (
        <CaptureWorkbench
          kind={kind}
          event={event}
          onClose={() => setWorkbenchOpen(false)}
          onApply={(patchEvent) => {
            onChange({ ...event, ...patchEvent });
            setWorkbenchOpen(false);
          }}
        />
      )}

      <div className="relative space-y-0 pl-1">
        <PipelineStep
          badge="主识别"
          badgeClass="bg-accent/20 text-accent border-accent/30"
          connectorBelow
        >
          <div className="space-y-2">
            <div>
              <label className="label">{SYMBOL_FIELD_LABELS.match_type}</label>
              <select
                className="input"
                value={matchType}
                onChange={(e) => patch({ [typeKey]: e.target.value } as Partial<FreerEvent>)}
              >
                {Object.entries(MATCH_TYPE_LABELS).map(([value, optionLabel]) => (
                  <option key={value} value={value}>{optionLabel}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{SYMBOL_FIELD_LABELS.target}</label>
              <SymbolTargetInput
                matchType={matchType}
                value={symbolTarget}
                templates={templates}
                onChange={(target) => patch({ [symKey]: setSymbolTarget(event[symKey], target) })}
              />
            </div>
            <div>
              <label className="label">{SYMBOL_FIELD_LABELS.accuracy}（{kind === 'start' ? '起始' : '结束'}）</label>
              <input
                className="input"
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={event[accKey] ?? event.accuracy ?? 0.85}
                onChange={(e) => patch({ [accKey]: Number(e.target.value) } as Partial<FreerEvent>)}
              />
            </div>
            <div>
              <label className="label">位置索引 index_{kind}</label>
              <input
                className="input"
                type="number"
                min={0}
                value={event[indexKey] ?? 0}
                onChange={(e) => patch({ [indexKey]: Number(e.target.value) } as Partial<FreerEvent>)}
              />
            </div>
            <div>
              <label className="label">{SYMBOL_FIELD_LABELS.roi}</label>
              <RoiInput
                value={event[roiKey]}
                onChange={(roi) => patch({ [roiKey]: roi } as Partial<FreerEvent>)}
              />
            </div>
          </div>
        </PipelineStep>

        {fallbackSteps.map((step, index) => (
          <PipelineStep
            key={`${step.matchType}-${index}`}
            badge={fallbackStepLabel(step, index)}
            badgeClass="bg-amber-500/15 text-amber-200 border-amber-500/35"
            connectorBelow
            onRemove={() => removeFallbackStep(index)}
          >
            <div className="space-y-2">
              <div>
                <label className="label">识别方式</label>
                <select
                  className="input"
                  value={step.matchType}
                  onChange={(e) => updateFallbackStep(index, { ...step, matchType: e.target.value })}
                >
                  {MATCH_TYPES.map((type) => (
                    <option key={type} value={type}>{MATCH_TYPE_LABELS[type] ?? type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">识别目标</label>
                <p className="mb-1 text-xs text-[#6b7280]">
                  留空则沿用主识别目标
                  {symbolTarget.trim() ? `（${summarizeTarget(matchType, symbolTarget)}）` : ''}
                </p>
                <SymbolTargetInput
                  matchType={step.matchType}
                  value={step.target ?? ''}
                  templates={templates}
                  onChange={(target) => updateFallbackStep(index, {
                    ...step,
                    target: target.trim() ? target : undefined,
                  })}
                />
              </div>
              <p className="text-xs text-[#6b7280]">
                阈值与 ROI 沿用主识别；本步阈值自动降低约 0.05。
              </p>
            </div>
          </PipelineStep>
        ))}

        <div className="flex items-start gap-2 py-2 pl-8">
          <select
            className="input min-w-0 flex-1 text-xs"
            defaultValue=""
            onChange={(e) => {
              addFallbackStep(e.target.value);
              e.currentTarget.value = '';
            }}
          >
            <option value="">＋ 添加备用识别步骤…</option>
            {availableFallbackTypes.map((type) => (
              <option key={type} value={type}>{MATCH_TYPE_LABELS[type] ?? type}</option>
            ))}
          </select>
        </div>

        <PipelineStep
          badge="L2 兜底"
          badgeClass="bg-violet-500/15 text-violet-200 border-violet-500/35"
          connectorBelow={false}
        >
          <div className="space-y-1">
            <label className="label">{SYMBOL_FIELD_LABELS.last_resort}</label>
            <select
              className="input"
              value={lastResort}
              onChange={(e) => patch({ [lrKey]: e.target.value } as Partial<FreerEvent>)}
            >
              {Object.entries(LAST_RESORT_LABELS).map(([value, optionLabel]) => (
                <option key={value} value={value}>{optionLabel}</option>
              ))}
            </select>
            <p className="text-xs text-[#6b7280]">{LAST_RESORT_HINTS[lastResort] ?? ''}</p>
          </div>
        </PipelineStep>
      </div>
    </fieldset>
  );
}

function PipelineStep({
  badge,
  badgeClass,
  connectorBelow,
  children,
  onRemove,
}: {
  badge: string;
  badgeClass: string;
  connectorBelow: boolean;
  children: ReactNode;
  onRemove?: () => void;
}) {
  return (
    <div className="relative pb-3">
      {connectorBelow && (
        <div
          className="absolute left-[15px] top-8 bottom-0 w-px bg-surface-border"
          aria-hidden
        />
      )}
      <div className="flex gap-2">
        <div className="flex w-8 shrink-0 flex-col items-center pt-1">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full border text-[10px] font-bold ${badgeClass}`}
            title={badge}
          >
            {badge.startsWith('主') ? '主' : badge.startsWith('L2') ? 'L2' : '备'}
          </span>
          {connectorBelow && (
            <ChevronDown className="mt-1 h-3.5 w-3.5 text-[#6b7280]" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface-raised/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className={`rounded border px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
              {badge}
            </span>
            {onRemove && (
              <button
                type="button"
                className="btn shrink-0 px-2 py-1 text-xs text-[#9aa3b2] hover:text-red-300"
                onClick={onRemove}
                aria-label="移除备用步骤"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

// PipelineStep end

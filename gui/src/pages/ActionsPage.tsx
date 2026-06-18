import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api/client';
import { useActiveProjectId } from '../hooks/useActiveProject';
import type { FreerAction } from '../api/types';
import {
  CLICK_BUTTON_LABELS,
  PLATFORM_LABELS,
  PLATFORM_OPS,
  PLATFORM_PRESETS,
  STEP_LABELS,
  emptyStep,
  isGestureOp,
  isPointerOp,
  summarizeSteps,
  stepUsesOffset,
  type ActionPlatform,
  type ActionStep,
  type ActionStepOp,
} from '../lib/actionSteps';
import { actionSchema } from '../lib/schemas';
import { findActionReferrers } from '../lib/eventDraft';
import { queryKeys } from '../lib/queryKeys';

const emptyAction = (platform: ActionPlatform = 'windows'): FreerAction => ({
  name: '',
  platform,
  run_time: 1,
  gap: [0.02, 0.03],
  steps: [emptyStep(platform)],
});

function StepFields({
  step,
  platform,
  onChange,
}: {
  step: ActionStep;
  platform: ActionPlatform;
  onChange: (step: ActionStep) => void;
}) {
  if (isPointerOp(step.op)) {
    const showButton = step.op === 'click' || step.op === 'pointer_down' || step.op === 'pointer_up';
    return (
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label text-xs">位置索引</label>
          <input
            className="input"
            type="number"
            min={0}
            value={step.pos ?? 0}
            onChange={(e) => onChange({ ...step, pos: Number(e.target.value) })}
          />
        </div>
        {showButton && platform !== 'adb' && (
          <div>
            <label className="label text-xs">鼠标按键</label>
            <select
              className="input"
              value={step.button ?? 'left'}
              onChange={(e) =>
                onChange({ ...step, button: e.target.value as 'left' | 'right' | 'middle' })
              }
            >
              {Object.entries(CLICK_BUTTON_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  }

  if (isGestureOp(step.op)) {
    const useOffset = stepUsesOffset(step);
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label text-xs">起点索引</label>
            <input
              className="input"
              type="number"
              min={0}
              value={step.from_pos ?? 0}
              onChange={(e) => onChange({ ...step, from_pos: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label text-xs">时长 (s)</label>
            <input
              className="input"
              type="number"
              step={0.1}
              value={step.duration ?? 1}
              onChange={(e) => onChange({ ...step, duration: Number(e.target.value) })}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-[#9aa3b2]">
          <input
            type="checkbox"
            checked={useOffset}
            onChange={(e) => {
              if (e.target.checked) {
                onChange({ ...step, offset: step.offset ?? [0, -200], to_pos: undefined });
              } else {
                const { offset: _o, ...rest } = step;
                onChange({ ...rest, to_pos: rest.to_pos ?? 1 });
              }
            }}
          />
          使用相对偏移（单识别区域时滑动/长按）
        </label>
        {useOffset ? (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label text-xs">偏移 X</label>
              <input
                className="input"
                type="number"
                value={step.offset?.[0] ?? 0}
                onChange={(e) =>
                  onChange({ ...step, offset: [Number(e.target.value), step.offset?.[1] ?? 0] })
                }
              />
            </div>
            <div>
              <label className="label text-xs">偏移 Y</label>
              <input
                className="input"
                type="number"
                value={step.offset?.[1] ?? 0}
                onChange={(e) =>
                  onChange({ ...step, offset: [step.offset?.[0] ?? 0, Number(e.target.value)] })
                }
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="label text-xs">终点索引（与起点相同 = 长按）</label>
            <input
              className="input"
              type="number"
              min={0}
              value={step.to_pos ?? 1}
              onChange={(e) => onChange({ ...step, to_pos: Number(e.target.value) })}
            />
          </div>
        )}
      </div>
    );
  }

  if (step.op === 'wait') {
    return (
      <div>
        <label className="label text-xs">等待秒数</label>
        <input
          className="input"
          type="number"
          step={0.01}
          value={step.seconds ?? 1}
          onChange={(e) => onChange({ ...step, seconds: Number(e.target.value) })}
        />
        <p className="mt-1 text-xs text-[#6b7280]">适合短延迟（如双击间隔 &lt;1s）。等界面变化请用事件结束标志。</p>
      </div>
    );
  }

  return (
    <div>
      <label className="label text-xs">{step.op === 'key' ? '按键码' : '文本内容'}</label>
      <input
        className="input"
        placeholder={step.op === 'key' ? 'KEYCODE_BACK 或 4' : ''}
        value={step.value ?? ''}
        onChange={(e) => onChange({ ...step, value: e.target.value })}
      />
    </div>
  );
}

export function ActionsPage() {
  const qc = useQueryClient();
  const projectId = useActiveProjectId();
  const { data: actions = [], isLoading } = useQuery({
    queryKey: queryKeys.actions(projectId),
    queryFn: api.listActions,
  });
  const { data: events = [] } = useQuery({ queryKey: queryKeys.events(projectId), queryFn: api.listEvents });
  const [editing, setEditing] = useState<FreerAction | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: async (action: FreerAction) => {
      const parsed = actionSchema.safeParse(action);
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => i.message).join('；'));
      }
      if (isNew) return api.createAction(parsed.data as FreerAction);
      return api.updateAction(action.name, parsed.data as FreerAction);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.actions(projectId) });
      setEditing(null);
      setIsNew(false);
      setError('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const requestDeleteAction = (name: string) => {
    const referrers = findActionReferrers(events, name);
    if (referrers.length > 0) {
      const ok = window.confirm(
        `动作「${name}」被以下微事件使用：${referrers.join('、')}。仍要删除吗？`,
      );
      if (!ok) return;
    } else if (!window.confirm(`确定删除动作「${name}」？`)) {
      return;
    }
    remove.mutate(name);
  };

  const remove = useMutation({
    mutationFn: (name: string) => api.deleteAction(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.actions(projectId) }),
    onError: (e: Error) => setError(e.message),
  });

  const updateStep = (index: number, step: ActionStep) => {
    if (!editing) return;
    const steps = [...editing.steps];
    steps[index] = step;
    setEditing({ ...editing, steps });
  };

  const moveStep = (index: number, dir: -1 | 1) => {
    if (!editing) return;
    const next = index + dir;
    if (next < 0 || next >= editing.steps.length) return;
    const steps = [...editing.steps];
    [steps[index], steps[next]] = [steps[next], steps[index]];
    setEditing({ ...editing, steps });
  };

  const changePlatform = (platform: ActionPlatform) => {
    if (!editing) return;
    setEditing({
      ...editing,
      platform,
      steps: [emptyStep(platform)],
    });
  };

  if (isLoading) return <div className="p-6 text-sm text-[#9aa3b2]">加载动作…</div>;

  const platformOps = editing ? PLATFORM_OPS[editing.platform] : PLATFORM_OPS.windows;

  return (
    <div className="flex h-full">
      <div className="w-80 shrink-0 overflow-y-auto border-r border-surface-border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">动作</h2>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditing(emptyAction());
              setIsNew(true);
            }}
          >
            <Plus className="h-4 w-4" />
            新建
          </button>
        </div>
        <ul className="space-y-1">
          {actions.map((a) => (
            <li
              key={a.name}
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-sm ${
                editing?.name === a.name ? 'bg-surface-raised' : 'hover:bg-surface-raised/60'
              }`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  const platform = a.platform ?? 'windows';
                  setEditing({
                    ...a,
                    platform,
                    steps: a.steps?.length ? a.steps : [emptyStep(platform)],
                  });
                  setIsNew(false);
                }}
              >
                <span className="block truncate">{a.name}</span>
                <span className="text-xs text-[#6b7280]">
                  {summarizeSteps(a.steps ?? [], a.platform ?? 'windows')}
                </span>
              </button>
              <button type="button" className="ml-1 text-[#9aa3b2] hover:text-red-300" onClick={() => requestDeleteAction(a.name)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {!editing ? (
          <p className="text-sm text-[#9aa3b2]">
            选择或新建动作。先选平台，再编排该平台支持的原子步骤。
          </p>
        ) : (
          <div className="mx-auto max-w-xl space-y-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <Pencil className="h-4 w-4" />
              {isNew ? '新建动作' : editing.name}
            </h3>
            {error && <p className="text-sm text-red-300">{error}</p>}
            <div>
              <label className="label">名称</label>
              <input
                className="input"
                disabled={!isNew}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">平台</label>
              <select
                className="input"
                value={editing.platform}
                onChange={(e) => changePlatform(e.target.value as ActionPlatform)}
              >
                {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[#6b7280]">
                {editing.platform === 'windows' && '通过 Win32 窗口消息操作模拟器窗口，支持按下/抬起/移动分离。text 步骤当前仍经 ADB 输入。'}
                {editing.platform === 'adb' && '通过 adb shell input 操作设备，仅支持 tap / swipe 成品手势。'}
                {editing.platform === 'mac' && 'macOS 执行器尚未实现；步骤格式与 Windows 相同，保存后暂无法执行。'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">整套重复次数</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={editing.run_time}
                  onChange={(e) => setEditing({ ...editing, run_time: Number(e.target.value) })}
                />
                <p className="mt-1 text-xs text-[#6b7280]">
                  单次微事件触发内，整套步骤重复的次数。双击请用「点击 → wait → 点击」编排，勿设 run_time=2。
                </p>
              </div>
              <div>
                <label className="label">步骤间隔（默认）</label>
                <div className="flex gap-1">
                  <input
                    className="input"
                    type="number"
                    step={0.01}
                    value={editing.gap?.[0] ?? 0}
                    onChange={(e) =>
                      setEditing({ ...editing, gap: [Number(e.target.value), editing.gap?.[1] ?? 0] })
                    }
                  />
                  <input
                    className="input"
                    type="number"
                    step={0.01}
                    value={editing.gap?.[1] ?? 0}
                    onChange={(e) =>
                      setEditing({ ...editing, gap: [editing.gap?.[0] ?? 0, Number(e.target.value)] })
                    }
                  />
                </div>
                <p className="mt-1 text-xs text-[#6b7280]">
                  每步执行后的默认随机间隔（秒）；单步可设 gap 覆盖。长等待用 wait 步骤或事件结束标志。
                </p>
              </div>
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label className="label mb-0">步骤编排</label>
                <select
                  className="input w-auto text-xs"
                  defaultValue=""
                  onChange={(e) => {
                    const preset = PLATFORM_PRESETS[editing.platform].find((p) => p.label === e.target.value);
                    if (preset) setEditing({ ...editing, steps: preset.steps.map((s) => ({ ...s })) });
                    e.target.value = '';
                  }}
                >
                  <option value="" disabled>从模板填充…</option>
                  {PLATFORM_PRESETS[editing.platform].map((p) => (
                    <option key={p.label} value={p.label}>{p.label}</option>
                  ))}
                </select>
              </div>
              <ol className="space-y-3">
                {editing.steps.map((step, index) => (
                  <li key={index} className="rounded-lg border border-surface-border p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-xs font-medium text-[#6b7280]">#{index + 1}</span>
                      <select
                        className="input flex-1"
                        value={step.op}
                        onChange={(e) =>
                          updateStep(index, emptyStep(editing.platform, e.target.value as ActionStepOp))
                        }
                      >
                        {platformOps.map((op) => (
                          <option key={op} value={op}>{STEP_LABELS[op]}</option>
                        ))}
                      </select>
                      <button type="button" className="btn px-2" disabled={index === 0} onClick={() => moveStep(index, -1)}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="btn px-2"
                        disabled={index === editing.steps.length - 1}
                        onClick={() => moveStep(index, 1)}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="btn px-2 text-red-300"
                        disabled={editing.steps.length <= 1}
                        onClick={() =>
                          setEditing({
                            ...editing,
                            steps: editing.steps.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <StepFields
                      step={step}
                      platform={editing.platform}
                      onChange={(s) => updateStep(index, s)}
                    />
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className="btn mt-2"
                onClick={() =>
                  setEditing({
                    ...editing,
                    steps: [...editing.steps, emptyStep(editing.platform)],
                  })
                }
              >
                <Plus className="h-4 w-4" />
                添加步骤
              </button>
            </div>

            <div className="flex gap-2">
              <button type="button" className="btn btn-primary" onClick={() => save.mutate(editing)} disabled={save.isPending}>
                保存
              </button>
              <button type="button" className="btn" onClick={() => { setEditing(null); setIsNew(false); }}>
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

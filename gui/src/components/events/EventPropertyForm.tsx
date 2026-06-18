import { useQuery } from '@tanstack/react-query';

import { api } from '../../api/client';

import type { FreerEvent } from '../../api/types';

import { useActiveProjectId } from '../../hooks/useActiveProject';
import { queryKeys } from '../../lib/queryKeys';

import { DefaultPositionInput, WindowNameInput } from '../form/EventFormFields';

import { ActionBindingPanel } from './ActionBindingPanel';

import { RecognitionPipelinePanel } from './RecognitionPipelinePanel';

import { normalizeFreerAction } from '../../lib/actionSteps';



type Props = {

  event: FreerEvent;

  actions: string[];

  onChange: (event: FreerEvent) => void;

};



export function EventPropertyForm({ event, actions, onChange }: Props) {

  const projectId = useActiveProjectId();
  const { data: templates = [] } = useQuery({
    queryKey: queryKeys.templates(projectId),
    queryFn: api.listTemplates,
  });

  const { data: allActions = [] } = useQuery({
    queryKey: queryKeys.actions(projectId),
    queryFn: api.listActions,
  });

  const boundAction = allActions.find((a) => a.name === event.action);

  const boundActionNorm = boundAction ? normalizeFreerAction(boundAction) : undefined;

  const set = <K extends keyof FreerEvent>(key: K, value: FreerEvent[K]) =>

    onChange({ ...event, [key]: value });



  const isMacro = event.event_type === 0;

  const needsDefaultPosition =

    !isMacro

    && (event.last_resort_start === 'default_position' || event.last_resort_finish === 'default_position');



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

        <label className="label">窗口名</label>

        <WindowNameInput value={event.window_name} onChange={(value) => set('window_name', value)} />

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

            {event.action && <ActionBindingPanel event={event} action={boundActionNorm} />}

            {event.action && !boundAction && (

              <p className="mt-1 text-xs text-red-300">未找到动作「{event.action}」</p>

            )}

          </div>

          <div>

            <label className="label">最大连续执行</label>

            <input

              className="input"

              type="number"

              value={event.max_suc_run_time ?? 5}

              onChange={(e) => set('max_suc_run_time', Number(e.target.value))}

            />

            <p className="mt-1 text-xs text-[#6b7280]">

              同一微事件在调度循环中连续触发的上限；超出后进入冷却并尝试异常/其他子事件。与动作的 run_time（单次触发内重复整套步骤）不同。

            </p>

          </div>

          <RecognitionPipelinePanel

            label="起始标志 · 识别流水线"

            kind="start"

            event={event}

            templates={templates}

            onChange={onChange}

          />

          <RecognitionPipelinePanel

            label="结束标志 · 识别流水线"

            kind="finish"

            event={event}

            templates={templates}

            onChange={onChange}

          />

          {needsDefaultPosition && (

            <div>

              <label className="label">默认坐标</label>

              <DefaultPositionInput

                value={event.default_position}

                onChange={(value) => set('default_position', value)}

              />

            </div>

          )}

          <div className="grid grid-cols-2 gap-2">

            <div>

              <label className="label">事件间隔下限 (秒)</label>

              <input

                className="input"

                type="number"

                step="0.1"

                value={event.gap?.[0] ?? 0.4}

                onChange={(e) => set('gap', [Number(e.target.value), event.gap?.[1] ?? 0.6])}

              />

            </div>

            <div>

              <label className="label">事件间隔上限 (秒)</label>

              <input

                className="input"

                type="number"

                step="0.1"

                value={event.gap?.[1] ?? 0.6}

                onChange={(e) => set('gap', [event.gap?.[0] ?? 0.4, Number(e.target.value)])}

              />

            </div>

          </div>

          <p className="text-xs text-[#6b7280]">

            事件间隔：整套动作执行完毕后的随机等待（秒）。步骤间间隔在动作页配置；短延迟（如双击间隔）用 wait 步骤；等界面变化请用结束标志或单独微事件。

          </p>

        </>

      )}

    </div>

  );

}



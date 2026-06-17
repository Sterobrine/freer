import type { ChildEntry, TreeNode } from '../api/types';

/** 子事件在父宏中的编排参数（API 字段 → 界面文案） */
export const CHILD_COMPOSE_FIELDS = [
  {
    key: 'should_run_time' as const,
    label: '最少执行次数',
    short: '最少',
    hint: '父宏判定完成前，该子事件至少要执行的次数',
  },
  {
    key: 'max_run_time' as const,
    label: '最多执行次数',
    short: '最多',
    hint: '达到后该子事件及之前子事件会从队列移除',
  },
  {
    key: 'priority' as const,
    label: '优先级',
    short: '优先',
    hint: '多个子事件起始标志相同时，数值越大越先匹配',
  },
];

export function childComposeLabel(key: (typeof CHILD_COMPOSE_FIELDS)[number]['key']): string {
  return CHILD_COMPOSE_FIELDS.find((f) => f.key === key)?.label ?? key;
}

export function formatChildComposeSummary(
  entry: Pick<ChildEntry, 'should_run_time' | 'max_run_time' | 'priority'>,
): string {
  const should = CHILD_COMPOSE_FIELDS[0];
  const max = CHILD_COMPOSE_FIELDS[1];
  const pri = CHILD_COMPOSE_FIELDS[2];
  const parts = [`${should.short} ${entry.should_run_time}`, `${max.short} ${entry.max_run_time}`];
  if (entry.priority) parts.push(`${pri.short} ${entry.priority}`);
  return parts.join(' · ');
}

export function formatTreeNodeComposeMeta(node: TreeNode): string | null {
  if (node.should_run_time === undefined) return null;
  return formatChildComposeSummary({
    should_run_time: node.should_run_time,
    max_run_time: node.max_run_time ?? 1,
    priority: node.priority,
  });
}

/** 微事件识别相关字段 */
export const SYMBOL_FIELD_LABELS = {
  match_type: '识别方式',
  accuracy: '匹配阈值',
  roi: '识别区域',
  fallback: '备用识别链',
  last_resort: '兜底策略',
  target: '识别目标',
};

export const MATCH_TYPE_LABELS: Record<string, string> = {
  template: '模板匹配',
  feature: '特征点',
  ocr: '文字识别',
  ui: 'UI 树',
  color: '颜色',
};

export const LAST_RESORT_LABELS: Record<string, string> = {
  none: '无',
  default_position: '默认坐标',
  last_known: '上次位置',
  expand_roi: '扩大识别区域',
  pause: '暂停任务',
};

export function matchTypeLabel(value: string): string {
  return MATCH_TYPE_LABELS[value] ?? value;
}

export function lastResortLabel(value: string): string {
  return LAST_RESORT_LABELS[value] ?? value;
}

/** @deprecated 使用 actionSteps.ts 中的 ACTION_STEP_LABELS */
export const ACTION_TYPE_LABELS: Record<number, string> = {
  1: '左键单击',
  2: '右键单击',
  3: '拖拽',
  4: '等待',
  5: '输入文字',
  6: '左键双击',
  7: '中键单击',
  8: '滚轮滚动',
  9: '按键',
  10: '长按',
};

export function actionTypeLabel(value: number): string {
  return ACTION_TYPE_LABELS[value] ?? String(value);
}

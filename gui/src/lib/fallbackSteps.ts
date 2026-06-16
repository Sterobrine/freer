import { MATCH_TYPE_LABELS, lastResortLabel, matchTypeLabel } from './fieldLabels';
import { MATCH_TYPES } from './schemas';

export type FallbackStep = {
  matchType: string;
  /** Empty = reuse primary recognition target */
  target?: string;
};

const MATCH_TYPE_SET = new Set<string>(MATCH_TYPES);

/** Split flat match_fallback_* into structured steps (mirrors recognition.fallback_parse). */
export function parseFallbackSteps(value?: string): FallbackStep[] {
  const parts = value?.split('|').map((p) => p.trim()).filter(Boolean) ?? [];
  if (!parts.length) return [];

  const steps: FallbackStep[] = [];
  let i = 0;
  while (i < parts.length) {
    const part = parts[i]!;
    if (MATCH_TYPE_SET.has(part)) {
      const next = parts[i + 1];
      if (next !== undefined && !MATCH_TYPE_SET.has(next)) {
        steps.push({ matchType: part, target: next });
        i += 2;
      } else {
        steps.push({ matchType: part });
        i += 1;
      }
    } else {
      steps.push({ matchType: 'template', target: part });
      i += 1;
    }
  }
  return steps;
}

export function serializeFallbackStep(step: FallbackStep): string {
  const target = step.target?.trim();
  if (target) return `${step.matchType}|${target}`;
  return step.matchType;
}

export function buildFallbackSteps(steps: FallbackStep[]): string {
  return steps.map(serializeFallbackStep).filter(Boolean).join('|');
}

export function summarizeTarget(matchType: string, target: string, maxLen = 28): string {
  const trimmed = target.trim();
  if (!trimmed) return '（沿用主目标）';
  if (matchType === 'template' || matchType === 'feature') {
    const base = trimmed.split(/[/\\]/).pop() ?? trimmed;
    return base.length > maxLen ? `${base.slice(0, maxLen)}…` : base;
  }
  if (trimmed.length > maxLen) return `${trimmed.slice(0, maxLen)}…`;
  return trimmed;
}

export function summarizePipelineFlow(
  primaryType: string,
  _primaryTarget: string,
  fallbackSteps: FallbackStep[],
  lastResort: string,
): string {
  const parts = [matchTypeLabel(primaryType)];
  for (const step of fallbackSteps) {
    const label = matchTypeLabel(step.matchType);
    const target = step.target?.trim();
    parts.push(target ? `${label}(${summarizeTarget(step.matchType, target, 12)})` : label);
  }
  const lr = lastResort && lastResort !== 'none' ? lastResortLabel(lastResort) : null;
  if (lr) parts.push(`兜底:${lr}`);
  return parts.join(' → ');
}

export function fallbackStepLabel(step: FallbackStep, index: number): string {
  return `备用 ${index + 1} · ${MATCH_TYPE_LABELS[step.matchType] ?? step.matchType}`;
}

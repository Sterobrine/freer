import type { FreerEvent } from '../api/types';

export function parseRoiValues(roi?: number[]): [number | '', number | '', number | '', number | ''] {
  if (!roi || roi.length !== 4) return ['', '', '', ''];
  return [roi[0], roi[1], roi[2], roi[3]];
}

export function buildRoi(
  x1: number | '',
  y1: number | '',
  x2: number | '',
  y2: number | '',
): number[] | undefined {
  const values = [x1, y1, x2, y2];
  if (values.every((v) => v === '')) return undefined;
  if (values.some((v) => v === '' || Number.isNaN(Number(v)))) return undefined;
  return values.map(Number);
}

export function parseWindowName(value?: string): { parent: string; child: string } {
  if (!value) return { parent: '', child: '' };
  const [parent = '', child = ''] = value.split('|');
  return { parent, child };
}

export function buildWindowName(parent: string, child: string): string {
  if (!parent && !child) return '';
  return `${parent}|${child}`;
}

export function parseFallbackChain(value?: string): string[] {
  if (!value?.trim()) return [];
  return value.split('|').map((part) => part.trim()).filter(Boolean);
}

export function buildFallbackChain(types: string[]): string {
  return types.join('|');
}

export function getSymbolTarget(symbol: FreerEvent['symbol_start']): string {
  if (!symbol) return '';
  if (typeof symbol === 'string') return symbol;
  return String(symbol.target ?? '');
}

export function setSymbolTarget(
  symbol: FreerEvent['symbol_start'],
  target: string,
): FreerEvent['symbol_start'] {
  if (!target) return null;
  if (typeof symbol === 'object' && symbol !== null) {
    return { ...symbol, target };
  }
  return target;
}

export function parseTemplatePaths(value: string): string[] {
  if (!value.trim()) return [''];
  return value.split('|').map((part) => part.trim()).filter((part, index, all) => part || index === 0 || all.length > 1);
}

export function buildTemplatePaths(paths: string[]): string {
  return paths.map((part) => part.trim()).filter(Boolean).join('|');
}

export function templateBasename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

export function isImagePath(path: string): boolean {
  return /\.(bmp|png|jpe?g)$/i.test(path.trim());
}

export type DefaultRect = { x1: number | ''; y1: number | ''; x2: number | ''; y2: number | '' };

export function parseDefaultPosition(position?: number[][] | null): DefaultRect {
  if (!position?.length) {
    return { x1: '', y1: '', x2: '', y2: '' };
  }
  if (
    position.length >= 2
    && Array.isArray(position[0])
    && Array.isArray(position[1])
    && position[0].length >= 2
    && position[1].length >= 2
  ) {
    return {
      x1: position[0][0],
      y1: position[0][1],
      x2: position[1][0],
      y2: position[1][1],
    };
  }
  const flat = position as unknown as number[];
  if (flat.length >= 4 && typeof flat[0] === 'number') {
    return {
      x1: flat[0],
      y1: flat[1],
      x2: flat[2],
      y2: flat[3],
    };
  }
  return { x1: '', y1: '', x2: '', y2: '' };
}

export function buildDefaultPosition(rect: DefaultRect): number[][] | null {
  const values = [rect.x1, rect.y1, rect.x2, rect.y2];
  if (values.every((v) => v === '')) return null;
  if (values.some((v) => v === '' || Number.isNaN(Number(v)))) return null;
  const [x1, y1, x2, y2] = values.map(Number);
  return [[x1, y1], [x2, y2]];
}

export type UiTargetPrefix = 'text' | 'resourceId' | 'desc';

export function parseUiTarget(value: string): { prefix: UiTargetPrefix; text: string } {
  if (value.startsWith('resourceId:')) {
    return { prefix: 'resourceId', text: value.slice('resourceId:'.length).trim() };
  }
  if (value.startsWith('desc:')) {
    return { prefix: 'desc', text: value.slice('desc:'.length).trim() };
  }
  if (value.startsWith('text:')) {
    return { prefix: 'text', text: value.slice('text:'.length).trim() };
  }
  return { prefix: 'text', text: value.trim() };
}

export function buildUiTarget(prefix: UiTargetPrefix, text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (prefix === 'text') return trimmed;
  return `${prefix}:${trimmed}`;
}

export function parseColorTarget(value: string): { hex: string; rgb: [number, number, number] } {
  const trimmed = value.trim();
  if (trimmed.startsWith('#') && trimmed.length === 7) {
    const r = Number.parseInt(trimmed.slice(1, 3), 16);
    const g = Number.parseInt(trimmed.slice(3, 5), 16);
    const b = Number.parseInt(trimmed.slice(5, 7), 16);
    if (![r, g, b].some(Number.isNaN)) {
      return { hex: trimmed, rgb: [r, g, b] };
    }
  }
  const parts = trimmed.split(',').map((part) => Number(part.trim()));
  if (parts.length >= 3 && !parts.slice(0, 3).some(Number.isNaN)) {
    const [r, g, b] = parts;
    const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
    return { hex, rgb: [r, g, b] };
  }
  return { hex: '#ffffff', rgb: [255, 255, 255] };
}

export function buildColorTarget(hex: string): string {
  return hex;
}

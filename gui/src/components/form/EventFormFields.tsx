import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { useRef } from 'react';
import { api } from '../../api/client';
import { MATCH_TYPE_LABELS } from '../../lib/fieldLabels';
import { buildFallbackSteps, parseFallbackSteps } from '../../lib/fallbackSteps';
import {
  buildColorTarget,
  buildDefaultPosition,
  buildTemplatePaths,
  buildUiTarget,
  buildWindowName,
  isImagePath,
  parseColorTarget,
  parseDefaultPosition,
  parseTemplatePaths,
  parseUiTarget,
  parseWindowName,
  templateBasename,
  type DefaultRect,
  type UiTargetPrefix,
} from '../../lib/formValues';
import { MATCH_TYPES } from '../../lib/schemas';

const ROI_LABELS = ['左上 X', '左上 Y', '右下 X', '右下 Y'] as const;

type RoiInputProps = {
  value?: number[];
  onChange: (roi: number[] | undefined) => void;
};

export function RoiInput({ value, onChange }: RoiInputProps) {
  const [x1, y1, x2, y2] = value ?? [];

  const update = (index: number, raw: string) => {
    const next = [x1 ?? '', y1 ?? '', x2 ?? '', y2 ?? ''] as Array<number | ''>;
    next[index] = raw === '' ? '' : Number(raw);
    const allEmpty = next.every((part) => part === '');
    if (allEmpty) {
      onChange(undefined);
      return;
    }
    if (next.some((part) => part === '' || Number.isNaN(Number(part)))) return;
    onChange(next.map(Number));
  };

  const values = [x1 ?? '', y1 ?? '', x2 ?? '', y2 ?? ''];

  return (
    <div className="grid grid-cols-2 gap-2">
      {ROI_LABELS.map((label, index) => (
        <div key={label}>
          <label className="label">{label}</label>
          <input
            className="input"
            type="number"
            value={values[index]}
            onChange={(e) => update(index, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

type WindowNameInputProps = {
  value?: string;
  onChange: (value: string) => void;
};

export function WindowNameInput({ value, onChange }: WindowNameInputProps) {
  const { parent, child } = parseWindowName(value);

  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="label">父窗口标题</label>
        <input
          className="input"
          value={parent}
          placeholder="例如：游戏主窗口"
          onChange={(e) => onChange(buildWindowName(e.target.value, child))}
        />
      </div>
      <div>
        <label className="label">子窗口标题</label>
        <input
          className="input"
          value={child}
          placeholder="无子窗口可留空"
          onChange={(e) => onChange(buildWindowName(parent, e.target.value))}
        />
      </div>
    </div>
  );
}

type FallbackChainInputProps = {
  value?: string;
  onChange: (value: string) => void;
};

export function FallbackChainInput({ value, onChange }: FallbackChainInputProps) {
  const chain = parseFallbackSteps(value);
  const available = MATCH_TYPES.filter(
    (type) => !chain.some((step) => step.matchType === type && !step.target?.trim()),
  );

  const addStep = (type: string) => {
    if (!type) return;
    onChange(buildFallbackSteps([...chain, { matchType: type }]));
  };

  const removeStep = (index: number) => {
    onChange(buildFallbackSteps(chain.filter((_, i) => i !== index)));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {chain.length === 0 ? (
          <span className="text-xs text-[#6b7280]">未配置备用识别链</span>
        ) : (
          chain.map((step, index) => (
            <span
              key={`${step.matchType}-${index}`}
              className="inline-flex items-center gap-1 rounded-md border border-surface-border bg-surface-raised px-2 py-1 text-xs"
            >
              {index > 0 && <span className="text-[#6b7280]">→</span>}
              {MATCH_TYPE_LABELS[step.matchType] ?? step.matchType}
              <button
                type="button"
                className="text-[#9aa3b2] hover:text-red-300"
                onClick={() => removeStep(index)}
                aria-label="移除"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <select
          className="input"
          defaultValue=""
          onChange={(e) => {
            addStep(e.target.value);
            e.currentTarget.value = '';
          }}
        >
          <option value="">添加识别方式…</option>
          {available.map((type) => (
            <option key={type} value={type}>{MATCH_TYPE_LABELS[type] ?? type}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

type DefaultPositionInputProps = {
  value?: number[][] | null;
  onChange: (value: number[][] | null) => void;
};

export function DefaultPositionInput({ value, onChange }: DefaultPositionInputProps) {
  const rect = parseDefaultPosition(value);

  const update = (key: keyof DefaultRect, raw: string) => {
    const next = { ...rect, [key]: raw === '' ? '' : Number(raw) };
    onChange(buildDefaultPosition(next));
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-[#6b7280]">定义默认可点击矩形区域（左上 → 右下）</p>
      <div className="grid grid-cols-2 gap-2">
        {ROI_LABELS.map((label) => {
          const key = label === '左上 X'
            ? 'x1'
            : label === '左上 Y'
              ? 'y1'
              : label === '右下 X'
                ? 'x2'
                : 'y2';
          return (
            <div key={label}>
              <label className="label">{label}</label>
              <input
                className="input"
                type="number"
                value={rect[key]}
                onChange={(e) => update(key, e.target.value)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

type TemplateTargetInputProps = {
  value: string;
  templates: string[];
  onChange: (value: string) => void;
};

export function TemplateTargetInput({ value, templates, onChange }: TemplateTargetInputProps) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const paths = parseTemplatePaths(value);
  const normalizedPaths = paths.length ? paths : [''];

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadTemplate(file),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      const next = [...normalizedPaths.filter(Boolean), result.path];
      onChange(buildTemplatePaths(next.length ? next : [result.path]));
    },
  });

  const updatePath = (index: number, path: string) => {
    const next = [...normalizedPaths];
    next[index] = path;
    onChange(buildTemplatePaths(next));
  };

  const removePath = (index: number) => {
    const next = normalizedPaths.filter((_, i) => i !== index);
    onChange(buildTemplatePaths(next.length ? next : ['']));
  };

  const addPath = () => {
    onChange(buildTemplatePaths([...normalizedPaths, '']));
  };

  const previewUrl = (path: string) => {
    if (!isImagePath(path)) return null;
    return api.assetUrl(templateBasename(path));
  };

  return (
    <div className="space-y-2">
      {normalizedPaths.map((path, index) => (
        <div key={index} className="rounded-lg border border-surface-border p-2 space-y-2">
          <div className="flex gap-2">
            <select
              className="input min-w-0 flex-1 text-xs"
              value={templates.includes(path) ? path : ''}
              onChange={(e) => updatePath(index, e.target.value)}
            >
              <option value="">从模板库选择…</option>
              {templates.map((template) => (
                <option key={template} value={template}>
                  {templateBasename(template)}
                </option>
              ))}
            </select>
            {normalizedPaths.length > 1 && (
              <button
                type="button"
                className="btn shrink-0 px-2"
                onClick={() => removePath(index)}
                aria-label="移除模板"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <input
            className="input text-xs"
            value={path}
            placeholder="img/example.bmp"
            onChange={(e) => updatePath(index, e.target.value)}
          />
          {previewUrl(path) && (
            <img
              src={previewUrl(path)!}
              alt="模板预览"
              className="max-h-24 rounded border border-surface-border bg-[#0a0c10] object-contain"
            />
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn text-xs" onClick={addPath}>
          <Plus className="h-3.5 w-3.5" />
          添加模板
        </button>
        <button
          type="button"
          className="btn text-xs"
          onClick={() => fileRef.current?.click()}
          disabled={upload.isPending}
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {upload.isPending ? '上传中…' : '上传 .bmp'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".bmp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
            e.currentTarget.value = '';
          }}
        />
      </div>
      {upload.isError && (
        <p className="text-xs text-red-300">{(upload.error as Error).message}</p>
      )}
    </div>
  );
}

type SymbolTargetInputProps = {
  matchType: string;
  value: string;
  templates: string[];
  onChange: (value: string) => void;
};

export function SymbolTargetInput({ matchType, value, templates, onChange }: SymbolTargetInputProps) {
  if (matchType === 'template' || matchType === 'feature') {
    return <TemplateTargetInput value={value} templates={templates} onChange={onChange} />;
  }

  if (matchType === 'ocr') {
    return (
      <input
        className="input"
        value={value}
        placeholder="要识别的文字，例如：讨伐"
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (matchType === 'ui') {
    const { prefix, text } = parseUiTarget(value);
    return (
      <div className="space-y-2">
        <select
          className="input"
          value={prefix}
          onChange={(e) => onChange(buildUiTarget(e.target.value as UiTargetPrefix, text))}
        >
          <option value="text">控件文字</option>
          <option value="resourceId">resourceId</option>
          <option value="desc">contentDescription</option>
        </select>
        <input
          className="input"
          value={text}
          placeholder={prefix === 'resourceId' ? 'com.example:id/button' : '按钮文字或描述'}
          onChange={(e) => onChange(buildUiTarget(prefix, e.target.value))}
        />
      </div>
    );
  }

  if (matchType === 'color') {
    const { hex, rgb } = parseColorTarget(value);
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <input
            type="color"
            className="h-10 w-14 cursor-pointer rounded border border-surface-border bg-transparent"
            value={hex}
            onChange={(e) => onChange(buildColorTarget(e.target.value))}
          />
          <div className="text-xs text-[#9aa3b2]">
            RGB: {rgb.join(', ')}
          </div>
        </div>
        <p className="text-xs text-[#6b7280]">颜色识别需同时配置识别区域 (ROI)</p>
      </div>
    );
  }

  return (
    <input
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

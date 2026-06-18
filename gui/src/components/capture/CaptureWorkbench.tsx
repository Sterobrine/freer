import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import type { FreerEvent } from '../../api/types';
import { setSymbolTarget } from '../../lib/formValues';

type Kind = 'start' | 'finish';

type Props = {
  kind: Kind;
  event: FreerEvent;
  onClose: () => void;
  onApply: (patch: Partial<FreerEvent>) => void;
};

export function CaptureWorkbench({ kind, event, onClose, onApply }: Props) {
  const symKey = kind === 'start' ? 'symbol_start' : 'symbol_finish';
  const roiKey = kind === 'start' ? 'roi_start' : 'roi_finish';
  const [url, setUrl] = useState('');
  const [rect, setRect] = useState<[number, number, number, number]>([0, 0, 100, 100]);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const capture = useMutation({
    mutationFn: () => api.capture(),
    onSuccess: () => setUrl(api.screenshotUrl()),
  });

  const crop = useMutation({
    mutationFn: () => api.cropTemplate({ rect: [...rect], image: 'capture' }),
    onSuccess: (res) => {
      const existing = typeof event[symKey] === 'string' ? event[symKey] : '';
      const merged = existing && typeof existing === 'string' && existing.includes('|')
        ? `${existing}|${res.path}`
        : res.path;
      onApply({
        [symKey]: setSymbolTarget(event[symKey], merged),
        [roiKey]: rect,
      } as Partial<FreerEvent>);
    },
  });

  useEffect(() => {
    capture.mutate();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-surface-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-2">
          <h3 className="text-sm font-medium">采图编排台 — {kind === 'start' ? '起始' : '结束'}标志</h3>
          <button type="button" className="btn text-xs" onClick={onClose}>关闭</button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-3">
          <p className="text-xs text-[#6b7280]">
            识别基于 ADB 截屏像素坐标。拖拽图片可框选区域（简化模式：输入 ROI 后裁剪为模板）。
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn text-xs" onClick={() => capture.mutate()} disabled={capture.isPending}>
              刷新截屏
            </button>
          </div>
          {url && (
            <img
              src={url}
              alt="capture"
              className="max-h-96 w-full cursor-crosshair object-contain bg-black"
              onMouseDown={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                const x = Math.round((e.clientX - box.left) / box.width * e.currentTarget.naturalWidth);
                const y = Math.round((e.clientY - box.top) / box.height * e.currentTarget.naturalHeight);
                dragRef.current = { x, y };
                setRect([x, y, x, y]);
              }}
              onMouseMove={(e) => {
                if (!dragRef.current) return;
                const box = e.currentTarget.getBoundingClientRect();
                const x = Math.round((e.clientX - box.left) / box.width * e.currentTarget.naturalWidth);
                const y = Math.round((e.clientY - box.top) / box.height * e.currentTarget.naturalHeight);
                const x1 = Math.min(dragRef.current.x, x);
                const y1 = Math.min(dragRef.current.y, y);
                const x2 = Math.max(dragRef.current.x, x);
                const y2 = Math.max(dragRef.current.y, y);
                setRect([x1, y1, x2, y2]);
              }}
              onMouseUp={() => { dragRef.current = null; }}
              onMouseLeave={() => { dragRef.current = null; }}
            />
          )}
          <div className="grid grid-cols-4 gap-2 text-xs">
            {(['x1', 'y1', 'x2', 'y2'] as const).map((label, i) => (
              <div key={label}>
                <label className="label">{label}</label>
                <input
                  className="input"
                  type="number"
                  value={rect[i]}
                  onChange={(e) => {
                    const next = [...rect] as [number, number, number, number];
                    next[i] = Number(e.target.value);
                    setRect(next);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-surface-border px-4 py-3">
          <button
            type="button"
            className="btn btn-primary text-xs"
            disabled={crop.isPending || rect[0] >= rect[2] || rect[1] >= rect[3]}
            onClick={() => crop.mutate()}
          >
            裁剪并写回模板
          </button>
        </div>
      </div>
    </div>
  );
}

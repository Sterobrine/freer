import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Crop, Crosshair, MousePointer, Save, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { api } from '../../api/client';
import { CaptureCanvas } from './CaptureCanvas';

type Rect = { x1: number; y1: number; x2: number; y2: number };

type ToolMode = 'none' | 'roi' | 'template' | 'point';

type Props = {
  /** 目标字段写入回调 */
  onApply: (result: CaptureResult) => void;
  onClose: () => void;
  /** 当前编辑的 kind，用于确定写回 start/finish */
  kind: 'start' | 'finish';
  /** 已有值（可选） */
  existingSymbol?: string | null;
  existingRoi?: number[] | null;
  existingPosition?: number[][] | null;
};

export type CaptureResult = {
  /** cropped template path */
  symbolPath?: string;
  /** ROI rect */
  roi?: number[];
  /** default_position point */
  point?: [number, number];
};

export function CaptureWorkbench({ onApply, onClose, kind, existingSymbol, existingRoi, existingPosition }: Props) {
  const qc = useQueryClient();
  const [tool, setTool] = useState<ToolMode>('none');
  const [imageInfo, setImageInfo] = useState<{ url: string; width: number; height: number } | null>(null);
  const [capturedRects, setCapturedRects] = useState<Array<{ type: ToolMode; rect: Rect }>>([]);
  const [result, setResult] = useState<CaptureResult>({});
  const hasApplied = useRef(false);
  const cropCounter = useRef(0);

  // Capture screenshot
  const captureMut = useMutation({
    mutationFn: () => api.capture(),
    onSuccess: (data) => {
      setImageInfo({
        url: data.url || api.screenshotUrl(),
        width: data.width || 1280,
        height: data.height || 720,
      });
      qc.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  // Crop template
  const cropMut = useMutation({
    mutationFn: (rect: Rect) =>
      api.templateCrop({
        rect: [rect.x1, rect.y1, rect.x2, rect.y2],
        name: `template_${kind}_${++cropCounter.current}`,
      }),
    onSuccess: (data) => {
      setResult((prev) => ({ ...prev, symbolPath: data.path }));
    },
  });

  const handleRectCreated = useCallback(
    (rect: Rect) => {
      const r: { type: ToolMode; rect: Rect } = { type: tool, rect };
      setCapturedRects((prev) => [...prev, r]);

      if (tool === 'roi') {
        setResult((prev) => ({ ...prev, roi: [rect.x1, rect.y1, rect.x2, rect.y2] }));
      } else if (tool === 'template') {
        cropMut.mutate(rect);
      }
    },
    [tool, cropMut],
  );

  const handlePointSelected = useCallback((x: number, y: number) => {
    setResult((prev) => ({ ...prev, point: [x, y] }));
  }, []);

  const handleApply = useCallback(() => {
    hasApplied.current = true;
    onApply(result);
    onClose();
  }, [result, onApply, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
        <h2 className="text-sm font-semibold">采图编排台 — {kind === 'start' ? '起始' : '结束'}标志</h2>
        <div className="flex items-center gap-2">
          {imageInfo && (
            <div className="flex items-center gap-1 rounded-lg border border-surface-border bg-surface-raised px-3 py-1.5">
              <span className="text-xs text-[#6b7280]">
                {imageInfo.width}×{imageInfo.height}
              </span>
            </div>
          )}
          <button type="button" className="btn btn-primary text-xs" onClick={handleApply} disabled={!result.symbolPath && !result.roi && !result.point}>
            <Save className="h-3.5 w-3.5" /> 应用到事件
          </button>
          <button type="button" className="btn text-xs" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1">
        {/* Toolbar */}
        <div className="flex w-14 flex-col items-center gap-2 border-r border-surface-border py-3">
          <button
            type="button"
            className={`btn p-2 ${tool === 'none' ? 'bg-accent/20' : ''}`}
            onClick={() => setTool('none')}
            title="选择"
          >
            <MousePointer className="h-4 w-4" />
          </button>
          <div className="h-px w-6 bg-surface-border" />
          <button
            type="button"
            className={`btn p-2 ${tool === 'roi' ? 'bg-accent/20' : ''}`}
            onClick={() => setTool(tool === 'roi' ? 'none' : 'roi')}
            title="框选 ROI"
          >
            <Crop className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={`btn p-2 ${tool === 'template' ? 'bg-accent/20' : ''}`}
            onClick={() => setTool(tool === 'template' ? 'none' : 'template')}
            title="裁切模板"
          >
            <Camera className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={`btn p-2 ${tool === 'point' ? 'bg-accent/20' : ''}`}
            onClick={() => setTool(tool === 'point' ? 'none' : 'point')}
            title="选点"
          >
            <Crosshair className="h-4 w-4" />
          </button>
        </div>

        {/* Canvas area */}
        <div className="flex flex-1 flex-col">
          {!imageInfo ? (
            <div className="flex flex-1 items-center justify-center">
              <button type="button" className="btn btn-primary" onClick={() => captureMut.mutate()} disabled={captureMut.isPending}>
                <Camera className="h-4 w-4" />
                截取当前画面
              </button>
            </div>
          ) : (
            <CaptureCanvas
              imageUrl={imageInfo.url}
              imageWidth={imageInfo.width}
              imageHeight={imageInfo.height}
              mode={tool}
              onRectCreated={handleRectCreated}
              onPointSelected={handlePointSelected}
            />
          )}
        </div>

        {/* Result panel */}
        <div className="w-64 border-l border-surface-border p-4 text-xs space-y-3">
          <h3 className="font-medium text-sm">采集结果</h3>

          {!imageInfo && (
            <p className="text-[#6b7280]">点击「截取当前画面」开始</p>
          )}

          {result.symbolPath && (
            <div>
              <label className="label">模板路径</label>
              <code className="block break-all rounded bg-surface-raised px-2 py-1 text-[10px]">
                {result.symbolPath}
              </code>
            </div>
          )}

          {result.roi && (
            <div>
              <label className="label">ROI</label>
              <code className="block rounded bg-surface-raised px-2 py-1">
                [{result.roi.join(', ')}]
              </code>
            </div>
          )}

          {result.point && (
            <div>
              <label className="label">坐标</label>
              <code className="block rounded bg-surface-raised px-2 py-1">
                [{result.point.join(', ')}]
              </code>
            </div>
          )}

          {!result.symbolPath && !result.roi && !result.point && imageInfo && (
            <p className="text-[#6b7280]">
              使用左侧工具在画面上操作
              <br />
              ROI = 识别区域
              <br />
              模板 = 裁切为 .bmp
              <br />
              选点 = 默认点击坐标
            </p>
          )}

          {cropMut.isPending && <p className="text-amber-300">裁切中…</p>}

          {/* Existing values */}
          {(existingSymbol || existingRoi) && (
            <>
              <div className="h-px bg-surface-border" />
              <p className="text-[#6b7280]">当前值</p>
              {existingSymbol && (
                <code className="block break-all rounded bg-surface-raised px-2 py-1 text-[10px]">
                  symbol: {existingSymbol}
                </code>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useMutation, useQuery } from '@tanstack/react-query';
import { Camera, Scan } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { api } from '../api/client';
import { MATCH_TYPE_LABELS, SYMBOL_FIELD_LABELS } from '../lib/fieldLabels';
import { formatRoi, parseRoi } from '../lib/schemas';

type Rect = { x1: number; y1: number; x2: number; y2: number };

export function TemplateLabPage() {
  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: api.listTemplates });
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [symbol, setSymbol] = useState('');
  const [matchType, setMatchType] = useState('template');
  const [roiText, setRoiText] = useState('');
  const [preview, setPreview] = useState<Rect[]>([]);
  const [message, setMessage] = useState('');
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const capture = useMutation({
    mutationFn: api.capture,
    onSuccess: () => {
      setScreenshot(api.screenshotUrl());
      setMessage('截屏完成');
    },
    onError: (e: Error) => setMessage(e.message),
  });

  const runPreview = useMutation({
    mutationFn: () =>
      api.preview({
        symbol,
        kind: 'start',
        use_capture: true,
        match_type_start: matchType,
        roi_start: parseRoi(roiText),
        accuracy: 0.85,
      }),
    onSuccess: (res) => {
      setPreview(res.rects.map((r) => ({ x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 })));
      if (res.capture_error) setMessage(res.capture_error);
      else setMessage(`命中 ${res.rects.length} 个目标`);
    },
    onError: (e: Error) => setMessage(e.message),
  });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = imgRef.current.naturalWidth / rect.width;
    const scaleY = imgRef.current.naturalHeight / rect.height;
    dragRef.current = {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    };
  }, []);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = imgRef.current.naturalWidth / rect.width;
    const scaleY = imgRef.current.naturalHeight / rect.height;
    const x2 = Math.round((e.clientX - rect.left) * scaleX);
    const y2 = Math.round((e.clientY - rect.top) * scaleY);
    const { x: x1, y: y1 } = dragRef.current;
    dragRef.current = null;
    const roi = [
      Math.min(x1, x2),
      Math.min(y1, y2),
      Math.max(x1, x2),
      Math.max(y1, y2),
    ];
    setRoiText(formatRoi(roi));
  }, []);

  const imgW = imgRef.current?.naturalWidth ?? 1;
  const displayW = imgRef.current?.clientWidth ?? 1;

  return (
    <div className="flex h-[calc(100vh-57px)]">
      <aside className="w-72 shrink-0 space-y-4 overflow-y-auto border-r border-surface-border p-4">
        <h2 className="font-semibold">模板 / ROI</h2>
        {message && <p className="text-xs text-[#9aa3b2]">{message}</p>}

        <button type="button" className="btn w-full" onClick={() => capture.mutate()} disabled={capture.isPending}>
          <Camera className="h-4 w-4" />ADB 截屏
        </button>

        <div>
          <label className="label">模板路径</label>
          <select className="input text-xs" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            <option value="">— 手动输入 —</option>
            {templates.map((t) => (
              <option key={t} value={t}>{t.split('/').pop()}</option>
            ))}
          </select>
          <input className="input mt-1 text-xs" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
        </div>

        <div>
          <label className="label">{SYMBOL_FIELD_LABELS.match_type}</label>
          <select className="input" value={matchType} onChange={(e) => setMatchType(e.target.value)}>
            {Object.entries(MATCH_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">{SYMBOL_FIELD_LABELS.roi}（可拖拽选框）</label>
          <input className="input text-xs" value={roiText} onChange={(e) => setRoiText(e.target.value)} />
        </div>

        <button type="button" className="btn btn-primary w-full" onClick={() => runPreview.mutate()} disabled={!symbol}>
          <Scan className="h-4 w-4" />识别预览
        </button>

        <div>
          <label className="label">模板库</label>
          <ul className="max-h-40 overflow-y-auto text-xs text-[#9aa3b2]">
            {templates.map((t) => (
              <li key={t} className="truncate py-0.5">{t}</li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="relative flex-1 overflow-auto bg-[#0a0c10] p-4">
        {screenshot ? (
          <div className="relative inline-block">
            <img
              ref={imgRef}
              src={screenshot}
              alt="screenshot"
              className="max-w-full cursor-crosshair select-none"
              onMouseDown={onMouseDown}
              onMouseUp={onMouseUp}
              draggable={false}
            />
            {preview.map((r, i) => {
              const scale = displayW / imgW;
              return (
                <div
                  key={i}
                  className="pointer-events-none absolute border-2 border-emerald-400 bg-emerald-400/10"
                  style={{
                    left: r.x1 * scale,
                    top: r.y1 * scale,
                    width: (r.x2 - r.x1) * scale,
                    height: (r.y2 - r.y1) * scale,
                  }}
                />
              );
            })}
            {roiText && parseRoi(roiText) && imgRef.current && (() => {
              const roi = parseRoi(roiText)!;
              const scale = displayW / imgW;
              return (
                <div
                  className="pointer-events-none absolute border-2 border-dashed border-accent"
                  style={{
                    left: roi[0] * scale,
                    top: roi[1] * scale,
                    width: (roi[2] - roi[0]) * scale,
                    height: (roi[3] - roi[1]) * scale,
                  }}
                />
              );
            })()}
          </div>
        ) : (
          <p className="text-sm text-[#6b7280]">点击「ADB 截屏」获取画面，拖拽选择 ROI</p>
        )}
      </div>
    </div>
  );
}

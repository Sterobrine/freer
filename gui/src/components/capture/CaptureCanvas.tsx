import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';

type Rect = { x1: number; y1: number; x2: number; y2: number };

type Props = {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  mode: 'roi' | 'template' | 'point' | 'none';
  existingRects?: Rect[];
  onRectCreated?: (rect: Rect) => void;
  onPointSelected?: (x: number, y: number) => void;
};

export function CaptureCanvas({
  imageUrl,
  imageWidth,
  imageHeight,
  mode,
  existingRects = [],
  onRectCreated,
  onPointSelected,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<Rect | null>(null);
  const [points, setPoints] = useState<Array<{ x: number; y: number }>>([]);

  // Fit image to container
  useEffect(() => {
    if (!containerRef.current) return;
    const pad = 20;
    const cw = containerRef.current.clientWidth - pad * 2;
    const ch = containerRef.current.clientHeight - pad * 2;
    const s = Math.min(cw / imageWidth, ch / imageHeight, 1.5);
    setScale(Math.max(s, 0.2));
  }, [imageWidth, imageHeight]);

  const imageCoord = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const el = containerRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      // Center the image
      const displayW = imageWidth * scale;
      const displayH = imageHeight * scale;
      const offsetX = (rect.width - displayW) / 2;
      const offsetY = (rect.height - displayH) / 2;
      return {
        x: Math.round((clientX - rect.left - offsetX) / scale),
        y: Math.round((clientY - rect.top - offsetY) / scale),
      };
    },
    [imageWidth, imageHeight, scale],
  );

  const handleMouseDown = (e: MouseEvent) => {
    if (mode === 'none') return;
    const pos = imageCoord(e.clientX, e.clientY);
    if (mode === 'point') {
      setPoints((prev) => [...prev, pos]);
      onPointSelected?.(pos.x, pos.y);
      return;
    }
    setDrawing(true);
    setStartPos(pos);
    setCurrentRect({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!drawing || !startPos) return;
    const pos = imageCoord(e.clientX, e.clientY);
    setCurrentRect({
      x1: Math.min(startPos.x, pos.x),
      y1: Math.min(startPos.y, pos.y),
      x2: Math.max(startPos.x, pos.x),
      y2: Math.max(startPos.y, pos.y),
    });
  };

  const handleMouseUp = () => {
    if (!drawing || !currentRect) return;
    setDrawing(false);
    const w = currentRect.x2 - currentRect.x1;
    const h = currentRect.y2 - currentRect.y1;
    if (w > 5 && h > 5) {
      onRectCreated?.(currentRect);
    }
    setCurrentRect(null);
    setStartPos(null);
  };

  const displayW = imageWidth * scale;
  const displayH = imageHeight * scale;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden bg-[#0a0c10]"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: mode === 'point' ? 'crosshair' : mode !== 'none' ? 'crosshair' : 'default' }}
    >
      <div
        className="absolute"
        style={{
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%)`,
          width: displayW,
          height: displayH,
        }}
      >
        {/* Screenshot image */}
        <img
          src={imageUrl}
          alt="Screenshot"
          className="block"
          style={{ width: displayW, height: displayH, objectFit: 'contain' }}
          draggable={false}
        />

        {/* Existing rects (ROI / template areas) */}
        <svg className="pointer-events-none absolute inset-0" width={displayW} height={displayH}>
          {existingRects.map((r, i) => (
            <rect
              key={i}
              x={r.x1 * scale}
              y={r.y1 * scale}
              width={(r.x2 - r.x1) * scale}
              height={(r.y2 - r.y1) * scale}
              fill="none"
              stroke="#22c55e"
              strokeWidth={2 / scale}
              strokeDasharray={`${4 / scale} ${3 / scale}`}
            />
          ))}

          {/* Points */}
          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x * scale}
                cy={p.y * scale}
                r={6 / scale}
                fill="#ef4444"
                stroke="#fff"
                strokeWidth={1.5 / scale}
              />
              <line
                x1={(p.x - 10) * scale}
                y1={p.y * scale}
                x2={(p.x + 10) * scale}
                y2={p.y * scale}
                stroke="#ef4444"
                strokeWidth={1.5 / scale}
              />
              <line
                x1={p.x * scale}
                y1={(p.y - 10) * scale}
                x2={p.x * scale}
                y2={(p.y + 10) * scale}
                stroke="#ef4444"
                strokeWidth={1.5 / scale}
              />
            </g>
          ))}

          {/* Current drawing rect */}
          {currentRect && (
            <rect
              x={currentRect.x1 * scale}
              y={currentRect.y1 * scale}
              width={(currentRect.x2 - currentRect.x1) * scale}
              height={(currentRect.y2 - currentRect.y1) * scale}
              fill="rgba(59, 130, 246, 0.15)"
              stroke="#3b82f6"
              strokeWidth={2 / scale}
            />
          )}
        </svg>
      </div>
    </div>
  );
}

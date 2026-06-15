import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  onDelta: (dx: number) => void;
};

export function ColumnResizeHandle({ onDelta }: Props) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastX.current;
      lastX.current = e.clientX;
      onDelta(dx);
    };

    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [onDelta]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="调节列宽"
      className="group relative z-10 w-1.5 shrink-0 cursor-col-resize touch-none bg-transparent"
      onPointerDown={(e) => {
        e.preventDefault();
        dragging.current = true;
        lastX.current = e.clientX;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      }}
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-surface-border transition-colors group-hover:bg-accent/50 group-active:bg-accent" />
    </div>
  );
}

export function loadStoredWidth(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function saveStoredWidth(key: string, width: number) {
  try {
    localStorage.setItem(key, String(Math.round(width)));
  } catch {
    /* ignore quota errors */
  }
}

export function useResizableWidth(
  storageKey: string,
  defaultWidth: number,
  minWidth: number,
  maxWidth: number,
) {
  const [width, setWidth] = useState(() => {
    const loaded = loadStoredWidth(storageKey, defaultWidth);
    return Math.min(maxWidth, Math.max(minWidth, loaded));
  });

  const resizeBy = useCallback(
    (dx: number) => {
      setWidth((current) => {
        const next = Math.min(maxWidth, Math.max(minWidth, current + dx));
        saveStoredWidth(storageKey, next);
        return next;
      });
    },
    [maxWidth, minWidth, storageKey],
  );

  return [width, resizeBy] as const;
}

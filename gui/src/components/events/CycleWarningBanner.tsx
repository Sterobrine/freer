import { AlertTriangle } from 'lucide-react';

type Props = {
  cycle: string[];
  className?: string;
};

export function CycleWarningBanner({ cycle, className = '' }: Props) {
  if (cycle.length < 2) return null;

  return (
    <div
      className={`flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-xs text-red-200 ${className}`}
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
      <div>
        <p className="font-medium text-red-100">检测到编排环</p>
        <p className="mt-0.5 text-red-200/90">{cycle.join(' → ')}</p>
      </div>
    </div>
  );
}

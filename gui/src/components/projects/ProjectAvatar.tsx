function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h;
}

const PALETTES = [
  { bg: 'bg-accent/15', text: 'text-accent' },
  { bg: 'bg-emerald-950', text: 'text-emerald-400' },
  { bg: 'bg-amber-950', text: 'text-amber-400' },
  { bg: 'bg-violet-950', text: 'text-violet-400' },
  { bg: 'bg-rose-950', text: 'text-rose-400' },
  { bg: 'bg-cyan-950', text: 'text-cyan-400' },
] as const;

export function ProjectAvatar({
  id,
  name,
  size = 'md',
}: {
  id: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const initial = (name.trim() || id).charAt(0).toUpperCase();
  const palette = PALETTES[hashId(id) % PALETTES.length];
  const dim = size === 'sm' ? 'h-6 w-6 text-[10px]' : size === 'lg' ? 'h-8 w-8 text-sm' : 'h-7 w-7 text-xs';

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-semibold ${palette.bg} ${palette.text} ${dim}`}
      aria-hidden
    >
      {initial}
    </span>
  );
}

import { Image as ImageIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../lib/cn';

function initialsForTeam(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export default function TeamLogo({
  name,
  logoUrl,
  className,
  initialsClassName,
}: {
  name: string;
  logoUrl?: string | null;
  className?: string;
  initialsClassName?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [logoUrl]);

  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl text-slate-700 dark:text-slate-200',
        !logoUrl || imageFailed
          ? 'border border-slate-200 bg-slate-100 shadow-sm dark:border-slate-800 dark:bg-slate-900'
          : '',
        className,
      )}
      aria-hidden="true"
    >
      {logoUrl && !imageFailed ? (
        <img
          src={logoUrl}
          alt=""
          className="h-full w-full object-contain"
          onError={() => setImageFailed(true)}
        />
      ) : initialsForTeam(name) ? (
        <span className={cn('font-semibold tracking-tight', initialsClassName)}>{initialsForTeam(name)}</span>
      ) : (
        <ImageIcon className="h-5 w-5 opacity-50" />
      )}
    </div>
  );
}

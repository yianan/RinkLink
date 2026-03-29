import { useCallback, useState } from 'react';
import { Check, UploadCloud, X } from 'lucide-react';
import { api } from '../api/client';
import { PlayerUploadPreview } from '../types';
import { cn } from '../lib/cn';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

export default function RosterCsvUploader({
  teamId,
  seasonId,
  seasonName,
  onConfirmed,
}: {
  teamId: string;
  seasonId: string;
  seasonName: string;
  onConfirmed: () => void;
}) {
  const [preview, setPreview] = useState<PlayerUploadPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(true);

  const handleFile = useCallback(async (file: File) => {
    setError('');
    setLoading(true);
    try {
      const result = await api.uploadRoster(teamId, file);
      setPreview(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  const handleConfirm = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      await api.confirmRosterUpload(teamId, seasonId, preview.entries, replaceExisting);
      setPreview(null);
      onConfirmed();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-3">
      {!preview && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            'rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            dragOver
              ? 'border-[color:var(--app-accent-link)] bg-[color:color-mix(in_srgb,var(--app-surface-strong)_72%,white)] dark:bg-cyan-950/25'
              : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/20',
          )}
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Drag & drop a roster CSV here</div>
          <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">or choose a file to preview before importing</div>

          <div className="mt-5 flex items-center justify-center gap-2">
            <Button type="button" variant="primary" disabled={loading} onClick={() => document.getElementById('roster-csv-input')?.click()}>
              <UploadCloud className="h-4 w-4" />
              Choose File
            </Button>
            <input
              id="roster-csv-input"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>

          <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Expected columns: First Name, Last Name (optional: Number/Jersey, Position)
          </div>
        </div>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      {preview && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Preview <span className="text-slate-500 dark:text-slate-400">({preview.entries.length} player(s))</span>
              </div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Confirm to import this roster into the {seasonName} season.
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-[color:var(--app-accent-link)] focus:ring-[color:var(--app-focus-ring)] dark:border-slate-700 dark:bg-slate-950/20"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
              />
              Replace existing {seasonName} roster
            </label>
          </div>

          {preview.warnings.map((w, i) => (
            <Alert key={i} variant="warning">{w}</Alert>
          ))}

          <Card className="overflow-hidden">
            <div className="max-h-[420px] overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">First</th>
                    <th className="px-4 py-3">Last</th>
                    <th className="px-4 py-3">Pos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {preview.entries.map((p, i) => (
                    <tr key={i} className="bg-white dark:bg-slate-950/20">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{p.jersey_number ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{p.first_name}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{p.last_name}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{p.position || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="primary" onClick={handleConfirm} disabled={loading || preview.entries.length === 0}>
              <Check className="h-4 w-4" />
              Confirm Import
            </Button>
            <Button type="button" variant="outline" onClick={() => setPreview(null)} disabled={loading}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

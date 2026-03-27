import { useState, useCallback } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';
import { api } from '../api/client';
import { IceSlotUploadPreview } from '../types';
import { cn } from '../lib/cn';
import { formatTimeHHMM } from '../lib/time';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface Props {
  arenaRinkId: string;
  onConfirmed: () => void;
}

export default function IceSlotCsvUploader({ arenaRinkId, onConfirmed }: Props) {
  const [preview, setPreview] = useState<IceSlotUploadPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setError('');
    setLoading(true);
    try {
      const result = await api.uploadIceSlots(arenaRinkId, file);
      setPreview(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [arenaRinkId]);

  const handleConfirm = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      await api.confirmIceSlotUpload(arenaRinkId, preview.entries);
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
      {error && <Alert variant="error">{error}</Alert>}

      {!preview && (
        <div
          className={cn(
            'rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            dragOver
              ? 'border-[color:var(--app-accent-link)] bg-[color:color-mix(in_srgb,var(--app-surface-strong)_72%,white)] dark:bg-cyan-950/25'
              : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/20',
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading…
            </div>
          ) : (
            <>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
                <UploadCloud className="h-6 w-6" />
              </div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Drag & drop a CSV file here</div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">Expected columns: Date, Start Time, End Time, Notes</div>

              <div className="mt-5 flex items-center justify-center">
              <Button type="button" variant="outline" onClick={() => document.getElementById('ice-slot-csv-input')?.click()}>
                  Browse Files
                </Button>
                <input
                  id="ice-slot-csv-input"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {preview && (
        <div className="space-y-3">
          {preview.warnings.length > 0 && (
            <Alert variant="warning">
              <ul className="list-disc space-y-1 pl-5">
                {preview.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Alert>
          )}

          <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Preview <span className="text-slate-500 dark:text-slate-400">({preview.entries.length} ice slot(s))</span>
          </div>

          <Card className="overflow-hidden">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-3 sm:px-4">Date</th>
                  <th className="hidden px-3 py-3 sm:table-cell sm:px-4">Start</th>
                  <th className="hidden px-3 py-3 sm:table-cell sm:px-4">End</th>
                  <th className="hidden px-3 py-3 md:table-cell md:px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {preview.entries.map((e, i) => {
                  const startTime = formatTimeHHMM(e.start_time) ?? e.start_time;
                  const endTime = e.end_time ? formatTimeHHMM(e.end_time) ?? e.end_time : null;

                  return (
                    <tr key={i} className="bg-white dark:bg-slate-950/20">
                      <td className="px-3 py-3 font-medium text-slate-900 sm:px-4 dark:text-slate-100">
                        <div className="whitespace-nowrap">{e.date}</div>
                        <div className="mt-0.5 break-words whitespace-normal text-xs font-normal text-slate-500 sm:hidden dark:text-slate-400">
                          {startTime}
                          {endTime ? `–${endTime}` : ''}
                          {e.notes ? ` • ${e.notes}` : ''}
                        </div>
                        <div className="mt-0.5 hidden break-words whitespace-normal text-xs font-normal text-slate-500 sm:block md:hidden dark:text-slate-400">
                          {e.notes || '-'}
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 text-slate-700 whitespace-nowrap sm:table-cell sm:px-4 dark:text-slate-300">{startTime}</td>
                      <td className="hidden px-3 py-3 text-slate-700 whitespace-nowrap sm:table-cell sm:px-4 dark:text-slate-300">{endTime || '-'}</td>
                      <td className="hidden px-3 py-3 text-slate-700 break-words whitespace-normal md:table-cell md:px-4 dark:text-slate-300">
                        {e.notes || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="primary" onClick={handleConfirm} disabled={loading || preview.entries.length === 0}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Working…
                </>
              ) : (
                `Confirm & Add ${preview.entries.length} Slot(s)`
              )}
            </Button>
            <Button type="button" variant="outline" onClick={() => setPreview(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useCallback } from 'react';
import { Check, Download, UploadCloud, X } from 'lucide-react';
import { api } from '../api/client';
import { AvailabilityUploadPreview, AvailabilityUploadRow } from '../types';
import { cn } from '../lib/cn';
import { formatTimeHHMM } from '../lib/time';
import { Alert } from './ui/Alert';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface Props {
  teamId: string;
  onConfirmed: () => void;
}

const DATE_FORMAT_HELP = 'Dates: YYYY-MM-DD, MM/DD/YYYY, MM/DD/YY, MM-DD-YYYY, or MM-DD-YY.';
const TIME_FORMAT_HELP = 'Times: HH:MM, H:MM AM/PM, or HH:MM:SS.';
const AVAILABILITY_TEMPLATE = [
  'Date,Time,End Time,Home/Away,Notes',
  '2026-09-12,18:30,19:45,Home,Home ice at main rink',
  '09/19/2026,7:00 PM,8:15 PM,Away,Away game window',
].join('\n');

function downloadCsvTemplate(filename: string, content: string) {
  const blob = new Blob([`${content}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function CsvUploader({ teamId, onConfirmed }: Props) {
  const [preview, setPreview] = useState<AvailabilityUploadPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setError('');
    setLoading(true);
    try {
      const result = await api.uploadAvailability(teamId, file);
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
      await api.confirmAvailabilityUpload(teamId, preview.entries);
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
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Drag & drop a CSV file here</div>
          <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">or choose a file to preview before importing</div>

          <div className="mt-5 flex items-center justify-center gap-2">
            <Button type="button" variant="primary" disabled={loading} onClick={() => document.getElementById('availability-csv-input')?.click()}>
              <UploadCloud className="h-4 w-4" />
              Choose CSV
            </Button>
            <Button type="button" variant="outline" disabled={loading} onClick={() => downloadCsvTemplate('availability-template.csv', AVAILABILITY_TEMPLATE)}>
              <Download className="h-4 w-4" />
              Template
            </Button>
            <input
              id="availability-csv-input"
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
            Expected columns: Date, Time, End Time, Home/Away, Notes
          </div>
          <div className="mx-auto mt-2 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">
            {DATE_FORMAT_HELP} {TIME_FORMAT_HELP}
          </div>
        </div>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      {preview && (
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Preview <span className="text-slate-500 dark:text-slate-400">({preview.entries.length} entries)</span>
              </div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">Confirm to add these entries to team availability.</div>
            </div>
          </div>
          {preview.warnings.length > 0 ? (
            <Alert variant="warning" title="Fix CSV warnings before importing">
              <div>Rows with warnings were skipped. Correct the CSV and upload it again before confirming.</div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {preview.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          <Card className="overflow-hidden">
            <div className="max-h-[420px] overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Opponent</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {preview.entries.map((row: AvailabilityUploadRow, i: number) => (
                    <tr key={i} className="bg-white dark:bg-slate-950/20">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{row.date}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatTimeHHMM(row.start_time) || '-'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={row.availability_type === 'home' ? 'success' : 'info'}>{row.availability_type}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{row.notes || '-'}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{row.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="primary" onClick={handleConfirm} disabled={loading || preview.entries.length === 0 || preview.warnings.length > 0}>
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

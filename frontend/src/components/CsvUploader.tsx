import { useState, useCallback } from 'react';
import { UploadCloud } from 'lucide-react';
import { api } from '../api/client';
import { ScheduleUploadPreview, ScheduleUploadRow } from '../types';
import { cn } from '../lib/cn';
import { Alert } from './ui/Alert';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface Props {
  teamId: string;
  onConfirmed: () => void;
}

export default function CsvUploader({ teamId, onConfirmed }: Props) {
  const [preview, setPreview] = useState<ScheduleUploadPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setError('');
    setLoading(true);
    try {
      const result = await api.uploadSchedule(teamId, file);
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
      await api.confirmUpload(teamId, preview.entries);
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
            dragOver ? 'border-brand-500 bg-brand-50/60' : 'border-slate-200 bg-white',
          )}
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div className="text-sm font-medium text-slate-900">Drag & drop a CSV file here</div>
          <div className="mt-1 text-sm text-slate-600">or choose a file to preview before importing</div>

          <div className="mt-5 flex items-center justify-center gap-2">
            <Button type="button" variant="primary" disabled={loading} onClick={() => document.getElementById('schedule-csv-input')?.click()}>
              Choose File
            </Button>
            <input
              id="schedule-csv-input"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>

          <div className="mt-3 text-xs text-slate-500">
            Expected columns: Date, Time, Home/Away (optional: Opponent, Location, Notes)
          </div>
        </div>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      {preview && (
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold tracking-tight text-slate-900">
                Preview <span className="text-slate-500">({preview.entries.length} entries)</span>
              </div>
              <div className="mt-1 text-sm text-slate-600">Confirm to add these entries to your schedule.</div>
            </div>
          </div>
          {preview.warnings.map((w, i) => (
            <Alert key={i} variant="warning">{w}</Alert>
          ))}

          <Card className="overflow-hidden">
            <div className="max-h-[420px] overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Opponent</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {preview.entries.map((row: ScheduleUploadRow, i: number) => (
                    <tr key={i} className="bg-white">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.date}</td>
                      <td className="px-4 py-3 text-slate-700">{row.time || '-'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={row.entry_type === 'home' ? 'success' : 'info'}>{row.entry_type}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.opponent_name || '-'}</td>
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
            <Button type="button" variant="primary" onClick={handleConfirm} disabled={loading}>
              Confirm Upload
            </Button>
            <Button type="button" variant="outline" onClick={() => setPreview(null)} disabled={loading}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

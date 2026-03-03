import { useState, useCallback } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';
import { api } from '../api/client';
import { IceSlotUploadPreview } from '../types';
import { cn } from '../lib/cn';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface Props {
  rinkId: string;
  onConfirmed: () => void;
}

export default function IceSlotCsvUploader({ rinkId, onConfirmed }: Props) {
  const [preview, setPreview] = useState<IceSlotUploadPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setError('');
    setLoading(true);
    try {
      const result = await api.uploadIceSlots(rinkId, file);
      setPreview(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [rinkId]);

  const handleConfirm = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      await api.confirmIceSlotUpload(rinkId, preview.entries);
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
            dragOver ? 'border-brand-500 bg-brand-50/60' : 'border-slate-200 bg-white',
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading…
            </div>
          ) : (
            <>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                <UploadCloud className="h-6 w-6" />
              </div>
              <div className="text-sm font-medium text-slate-900">Drag & drop a CSV file here</div>
              <div className="mt-1 text-sm text-slate-600">Expected columns: Date, Start Time, End Time, Notes</div>

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

          <div className="text-sm font-semibold tracking-tight text-slate-900">
            Preview <span className="text-slate-500">({preview.entries.length} ice slot(s))</span>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Start</th>
                    <th className="px-4 py-3">End</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {preview.entries.map((e, i) => (
                    <tr key={i} className="bg-white">
                      <td className="px-4 py-3 font-medium text-slate-900">{e.date}</td>
                      <td className="px-4 py-3 text-slate-700">{e.start_time}</td>
                      <td className="px-4 py-3 text-slate-700">{e.end_time || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{e.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

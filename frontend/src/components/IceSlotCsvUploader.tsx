import { useState, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Alert, CircularProgress,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { api } from '../api/client';
import { IceSlotUploadPreview } from '../types';

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
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!preview && (
        <Paper
          sx={{
            p: 4, textAlign: 'center', border: '2px dashed',
            borderColor: dragOver ? 'primary.main' : 'grey.300',
            bgcolor: dragOver ? 'action.hover' : 'background.paper',
            cursor: 'pointer',
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {loading ? (
            <CircularProgress />
          ) : (
            <>
              <CloudUploadIcon sx={{ fontSize: 48, color: 'grey.400', mb: 1 }} />
              <Typography gutterBottom>Drag & drop a CSV file here</Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Expected columns: Date, Start Time, End Time, Notes
              </Typography>
              <Button variant="outlined" component="label" sx={{ mt: 1 }}>
                Browse Files
                <input type="file" accept=".csv" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </Button>
            </>
          )}
        </Paper>
      )}

      {preview && (
        <>
          {preview.warnings.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {preview.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </Alert>
          )}

          <Typography variant="subtitle1" gutterBottom>
            Preview: {preview.entries.length} ice slot(s)
          </Typography>

          <TableContainer component={Paper} sx={{ mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Start Time</TableCell>
                  <TableCell>End Time</TableCell>
                  <TableCell>Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {preview.entries.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell>{e.date}</TableCell>
                    <TableCell>{e.start_time}</TableCell>
                    <TableCell>{e.end_time || '-'}</TableCell>
                    <TableCell>{e.notes || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="contained" onClick={handleConfirm} disabled={loading || preview.entries.length === 0}>
              {loading ? <CircularProgress size={20} /> : `Confirm & Add ${preview.entries.length} Slot(s)`}
            </Button>
            <Button onClick={() => setPreview(null)}>Cancel</Button>
          </Box>
        </>
      )}
    </Box>
  );
}

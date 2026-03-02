import { useState, useCallback } from 'react';
import {
  Box, Button, Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Alert, Chip,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { api } from '../api/client';
import { ScheduleUploadPreview, ScheduleUploadRow } from '../types';

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
    <Box>
      {!preview && (
        <Paper
          variant="outlined"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          sx={{
            p: 4, textAlign: 'center', cursor: 'pointer',
            bgcolor: dragOver ? 'action.hover' : 'background.paper',
            border: '2px dashed', borderColor: dragOver ? 'primary.main' : 'divider',
          }}
        >
          <CloudUploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography variant="body1" gutterBottom>
            Drag & drop a CSV file here, or click to browse
          </Typography>
          <Button variant="contained" component="label" disabled={loading}>
            Choose File
            <input
              type="file"
              accept=".csv"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </Button>
          <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
            Expected columns: Date, Time, Home/Away (optional: Opponent, Location, Notes)
          </Typography>
        </Paper>
      )}

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      {preview && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Preview ({preview.entries.length} entries)
          </Typography>
          {preview.warnings.map((w, i) => (
            <Alert key={i} severity="warning" sx={{ mb: 1 }}>{w}</Alert>
          ))}
          <TableContainer component={Paper} sx={{ maxHeight: 400, mb: 2 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Time</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Opponent</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {preview.entries.map((row: ScheduleUploadRow, i: number) => (
                  <TableRow key={i}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>{row.time || '-'}</TableCell>
                    <TableCell>
                      <Chip label={row.entry_type} size="small"
                        color={row.entry_type === 'home' ? 'success' : 'info'} />
                    </TableCell>
                    <TableCell>{row.opponent_name || '-'}</TableCell>
                    <TableCell>
                      <Chip label={row.status} size="small" variant="outlined" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="contained" onClick={handleConfirm} disabled={loading}>
              Confirm Upload
            </Button>
            <Button variant="outlined" onClick={() => setPreview(null)} disabled={loading}>
              Cancel
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}

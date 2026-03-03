import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, Tabs, Tab, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, IconButton, Alert,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import { api } from '../api/client';
import { Rink, IceSlot } from '../types';
import IceSlotCsvUploader from '../components/IceSlotCsvUploader';

const statusColors: Record<string, 'success' | 'default' | 'info' | 'warning'> = {
  available: 'success',
  held: 'warning',
  booked: 'info',
};

export default function IceSlotsPage() {
  const { rinkId } = useParams<{ rinkId: string }>();
  const navigate = useNavigate();
  const [rink, setRink] = useState<Rink | null>(null);
  const [slots, setSlots] = useState<IceSlot[]>([]);
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: '', start_time: '', end_time: '', notes: '' });

  const load = () => {
    if (!rinkId) return;
    api.getIceSlots(rinkId).then(setSlots);
  };

  useEffect(() => {
    if (!rinkId) return;
    api.getRinks().then((rinks) => {
      const r = rinks.find((r) => r.id === rinkId);
      if (r) setRink(r);
    });
    load();
  }, [rinkId]);

  const handleAdd = async () => {
    if (!rinkId) return;
    await api.createIceSlot(rinkId, {
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time || null,
      notes: form.notes || null,
    } as any);
    setOpen(false);
    setForm({ date: '', start_time: '', end_time: '', notes: '' });
    load();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this ice slot?')) {
      await api.deleteIceSlot(id);
      load();
    }
  };

  if (!rinkId) return <Alert severity="error">No rink ID provided.</Alert>;

  // Group slots by month for calendar view
  const byMonth: Record<string, IceSlot[]> = {};
  slots.forEach((s) => {
    const month = s.date.substring(0, 7);
    (byMonth[month] ??= []).push(s);
  });

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={() => navigate('/rinks')}><ArrowBackIcon /></IconButton>
        <Typography variant="h5">
          {rink ? `${rink.name} - Ice Slots` : 'Ice Slots'}
        </Typography>
      </Box>

      {rink && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {rink.address}, {rink.city}, {rink.state} {rink.zip_code}
        </Typography>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`List View (${slots.length})`} />
        <Tab label="Calendar View" />
        <Tab label="Upload CSV" />
      </Tabs>

      {tab === 0 && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <Button variant="contained" onClick={() => setOpen(true)}>Add Slot</Button>
          </Box>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Start Time</TableCell>
                  <TableCell>End Time</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Notes</TableCell>
                  <TableCell width={80}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {slots.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.date}</TableCell>
                    <TableCell>{s.start_time}</TableCell>
                    <TableCell>{s.end_time || '-'}</TableCell>
                    <TableCell>
                      <Chip label={s.status} size="small" color={statusColors[s.status] || 'default'} />
                    </TableCell>
                    <TableCell>{s.notes || '-'}</TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => handleDelete(s.id)}
                        disabled={s.status === 'booked'}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {slots.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                      No ice slots yet. Add one or upload a CSV.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {tab === 1 && (
        <Box>
          {Object.entries(byMonth).sort().map(([month, monthSlots]) => (
            <Paper key={month} sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6" gutterBottom>{month}</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {monthSlots.map((s) => (
                  <Chip
                    key={s.id}
                    label={`${s.date.substring(5)} ${s.start_time}${s.end_time ? '-' + s.end_time : ''}`}
                    color={statusColors[s.status] || 'default'}
                    variant={s.status === 'available' ? 'filled' : 'outlined'}
                  />
                ))}
              </Box>
            </Paper>
          ))}
          {Object.keys(byMonth).length === 0 && (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">No ice slots to display.</Typography>
            </Paper>
          )}
        </Box>
      )}

      {tab === 2 && (
        <IceSlotCsvUploader rinkId={rinkId} onConfirmed={() => { setTab(0); load(); }} />
      )}

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Ice Slot</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="Date" type="date" value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              slotProps={{ inputLabel: { shrink: true } }} required fullWidth />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label="Start Time" type="time" value={form.start_time}
                onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }} required fullWidth />
              <TextField label="End Time" type="time" value={form.end_time}
                onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }} fullWidth />
            </Box>
            <TextField label="Notes" value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              fullWidth multiline rows={2} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!form.date || !form.start_time}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

import { useState, useEffect } from 'react';
import {
  Box, Typography, Tabs, Tab, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, IconButton, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Alert,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useTeam } from '../context/TeamContext';
import { api } from '../api/client';
import { ScheduleEntry } from '../types';
import CsvUploader from '../components/CsvUploader';

const statusColors: Record<string, 'success' | 'default' | 'info' | 'warning'> = {
  open: 'success',
  scheduled: 'info',
  confirmed: 'warning',
};

export default function SchedulePage() {
  const { activeTeam } = useTeam();
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [tab, setTab] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ date: '', time: '', entry_type: 'home' });

  const load = () => {
    if (!activeTeam) return;
    api.getSchedule(activeTeam.id).then(setEntries);
  };
  useEffect(() => { load(); }, [activeTeam]); // eslint-disable-line

  const handleAdd = async () => {
    if (!activeTeam) return;
    await api.createScheduleEntry(activeTeam.id, {
      date: addForm.date,
      time: addForm.time || null,
      entry_type: addForm.entry_type as 'home' | 'away',
    });
    setAddOpen(false);
    setAddForm({ date: '', time: '', entry_type: 'home' });
    load();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this schedule entry?')) {
      await api.deleteScheduleEntry(id);
      load();
    }
  };

  if (!activeTeam) {
    return <Alert severity="info">Select a team to view the schedule.</Alert>;
  }

  // Calendar view: group by month
  const byMonth: Record<string, ScheduleEntry[]> = {};
  entries.forEach((e) => {
    const month = e.date.substring(0, 7);
    (byMonth[month] ??= []).push(e);
  });

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
        <Typography variant="h5">{activeTeam.name} Schedule</Typography>
        <Button variant="contained" onClick={() => setAddOpen(true)}>Add Entry</Button>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="List View" />
        <Tab label="Calendar View" />
        <Tab label="Upload CSV" />
      </Tabs>

      {tab === 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Time</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Opponent</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell width={60}></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.date}</TableCell>
                  <TableCell>{e.time || '-'}</TableCell>
                  <TableCell>
                    <Chip label={e.entry_type} size="small"
                      color={e.entry_type === 'home' ? 'success' : 'info'} />
                  </TableCell>
                  <TableCell>
                    <Chip label={e.status} size="small" color={statusColors[e.status]} variant="outlined" />
                  </TableCell>
                  <TableCell>{e.opponent_name || '-'}</TableCell>
                  <TableCell>{e.location || '-'}</TableCell>
                  <TableCell>{e.notes || '-'}</TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => handleDelete(e.id)}><DeleteIcon /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    No schedule entries. Upload a CSV or add entries manually.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {tab === 1 && (
        <Box>
          {Object.entries(byMonth).sort().map(([month, monthEntries]) => (
            <Box key={month} sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                {new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {monthEntries.map((e) => (
                  <Paper key={e.id} sx={{
                    p: 1.5, width: 140,
                    bgcolor: e.status === 'open'
                      ? (e.entry_type === 'home' ? '#e8f5e9' : '#e3f2fd')
                      : '#f5f5f5',
                    border: '1px solid',
                    borderColor: e.status === 'open'
                      ? (e.entry_type === 'home' ? 'success.light' : 'info.light')
                      : 'divider',
                  }}>
                    <Typography variant="body2" fontWeight="bold">
                      {new Date(e.date + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </Typography>
                    <Typography variant="caption">{e.time || ''}</Typography>
                    <Box>
                      <Chip label={e.entry_type} size="small"
                        color={e.entry_type === 'home' ? 'success' : 'info'} sx={{ mt: 0.5 }} />
                    </Box>
                    {e.opponent_name && (
                      <Typography variant="caption" display="block">vs {e.opponent_name}</Typography>
                    )}
                    <Chip label={e.status} size="small" variant="outlined" sx={{ mt: 0.5 }} />
                  </Paper>
                ))}
              </Box>
            </Box>
          ))}
          {entries.length === 0 && (
            <Typography color="text.secondary">No schedule entries yet.</Typography>
          )}
        </Box>
      )}

      {tab === 2 && (
        <CsvUploader teamId={activeTeam.id} onConfirmed={() => { load(); setTab(0); }} />
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add Schedule Entry</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <TextField type="date" label="Date" value={addForm.date}
            onChange={(e) => setAddForm((f) => ({ ...f, date: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }} required />
          <TextField type="time" label="Time" value={addForm.time}
            onChange={(e) => setAddForm((f) => ({ ...f, time: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }} />
          <TextField select label="Type" value={addForm.entry_type}
            onChange={(e) => setAddForm((f) => ({ ...f, entry_type: e.target.value }))}>
            <MenuItem value="home">Home</MenuItem>
            <MenuItem value="away">Away</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!addForm.date}>Add</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

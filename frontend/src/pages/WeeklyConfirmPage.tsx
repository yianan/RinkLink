import { useState, useEffect } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Switch, Chip, Alert,
} from '@mui/material';
import { useTeam } from '../context/TeamContext';
import { api } from '../api/client';
import { ScheduleEntry } from '../types';

export default function WeeklyConfirmPage() {
  const { activeTeam } = useTeam();
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);

  useEffect(() => {
    if (!activeTeam) return;
    // Get scheduled/confirmed entries for the next 2 weeks
    const today = new Date();
    const twoWeeks = new Date(today);
    twoWeeks.setDate(twoWeeks.getDate() + 14);

    api.getSchedule(activeTeam.id, {
      date_from: today.toISOString().split('T')[0],
      date_to: twoWeeks.toISOString().split('T')[0],
    }).then((data) => {
      setEntries(data.filter((e) => e.status === 'scheduled' || e.status === 'confirmed'));
    });
  }, [activeTeam]);

  const handleToggle = async (id: string) => {
    const updated = await api.toggleWeeklyConfirm(id);
    setEntries((prev) => prev.map((e) => e.id === id ? updated : e));
  };

  if (!activeTeam) {
    return <Alert severity="info">Select a team to confirm games.</Alert>;
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Weekly Game Confirmation</Typography>
      <Typography color="text.secondary" gutterBottom>
        Confirm your upcoming games for the next two weeks.
      </Typography>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Time</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Opponent</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="center">Confirmed</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  {new Date(e.date + 'T00:00').toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric',
                  })}
                </TableCell>
                <TableCell>{e.time || '-'}</TableCell>
                <TableCell>
                  <Chip label={e.entry_type} size="small"
                    color={e.entry_type === 'home' ? 'success' : 'info'} />
                </TableCell>
                <TableCell>{e.opponent_name || 'TBD'}</TableCell>
                <TableCell>
                  <Chip label={e.status} size="small" variant="outlined" />
                </TableCell>
                <TableCell align="center">
                  <Switch checked={e.weekly_confirmed} onChange={() => handleToggle(e.id)} />
                </TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  No scheduled games in the next two weeks.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

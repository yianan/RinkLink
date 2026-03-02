import { useState, useEffect } from 'react';
import { Box, Typography, Paper, Grid, Button, List, ListItem, ListItemText, Chip } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import SearchIcon from '@mui/icons-material/Search';
import InboxIcon from '@mui/icons-material/Inbox';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useTeam } from '../context/TeamContext';
import { api } from '../api/client';
import { ScheduleEntry, GameProposal } from '../types';

function StatCard({ title, value, icon, color, onClick }: {
  title: string; value: number | string; icon: React.ReactNode; color: string; onClick?: () => void;
}) {
  return (
    <Paper sx={{ p: 2, cursor: onClick ? 'pointer' : 'default', '&:hover': onClick ? { bgcolor: 'action.hover' } : {} }}
      onClick={onClick}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Box sx={{ color }}>{icon}</Box>
        <Typography variant="body2" color="text.secondary">{title}</Typography>
      </Box>
      <Typography variant="h4">{value}</Typography>
    </Paper>
  );
}

export default function HomePage() {
  const { activeTeam } = useTeam();
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [proposals, setProposals] = useState<GameProposal[]>([]);

  useEffect(() => {
    if (!activeTeam) return;
    api.getSchedule(activeTeam.id).then(setSchedule);
    api.getProposals(activeTeam.id, { direction: 'incoming', status: 'proposed' }).then(setProposals);
  }, [activeTeam]);

  const openDates = schedule.filter((e) => e.status === 'open');
  const upcoming = schedule
    .filter((e) => e.status === 'scheduled' && e.date >= new Date().toISOString().split('T')[0])
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  if (!activeTeam) {
    return (
      <Box sx={{ textAlign: 'center', mt: 8 }}>
        <Typography variant="h5" gutterBottom>Welcome to RinkLink</Typography>
        <Typography color="text.secondary" gutterBottom>
          Select a team from the dropdown above, or seed demo data to get started.
        </Typography>
        <Button variant="contained" onClick={() => api.seed().then(() => window.location.reload())} sx={{ mt: 2 }}>
          Seed Demo Data
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>{activeTeam.name} Dashboard</Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard title="Open Dates" value={openDates.length}
            icon={<CalendarMonthIcon />} color="success.main" onClick={() => navigate('/schedule')} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard title="Pending Proposals" value={proposals.length}
            icon={<InboxIcon />} color="warning.main" onClick={() => navigate('/proposals')} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard title="Upcoming Games" value={upcoming.length}
            icon={<CheckCircleIcon />} color="info.main" onClick={() => navigate('/schedule')} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard title="Find Opponents" value="Search"
            icon={<SearchIcon />} color="primary.main" onClick={() => navigate('/search')} />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Upcoming Games</Typography>
            {upcoming.length === 0 ? (
              <Typography color="text.secondary">No upcoming scheduled games</Typography>
            ) : (
              <List dense>
                {upcoming.map((e) => (
                  <ListItem key={e.id}>
                    <ListItemText
                      primary={`${e.date} ${e.time || ''} - vs ${e.opponent_name || 'TBD'}`}
                      secondary={<Chip label={e.entry_type} size="small"
                        color={e.entry_type === 'home' ? 'success' : 'info'} />}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Pending Proposals</Typography>
            {proposals.length === 0 ? (
              <Typography color="text.secondary">No pending proposals</Typography>
            ) : (
              <List dense>
                {proposals.map((p) => (
                  <ListItem key={p.id} secondaryAction={
                    <Button size="small" onClick={() => navigate('/proposals')}>View</Button>
                  }>
                    <ListItemText
                      primary={`${p.proposed_date} - ${p.home_team_name} vs ${p.away_team_name}`}
                      secondary={p.message}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
        <Button variant="outlined" onClick={() => navigate('/schedule')}>View Schedule</Button>
        <Button variant="outlined" onClick={() => navigate('/search')}>Find Opponents</Button>
        <Button variant="outlined" onClick={() => navigate('/confirm')}>Weekly Confirm</Button>
      </Box>
    </Box>
  );
}

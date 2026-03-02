import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, TextField, Slider, Button, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, Tabs, Tab, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useTeam } from '../context/TeamContext';
import { api } from '../api/client';
import { OpponentResult, AutoMatchResult, ScheduleEntry } from '../types';

export default function SearchPage() {
  const { activeTeam } = useTeam();
  const [tab, setTab] = useState(0);
  const [openDates, setOpenDates] = useState<ScheduleEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [maxDistance, setMaxDistance] = useState(100);
  const [results, setResults] = useState<OpponentResult[]>([]);
  const [autoMatches, setAutoMatches] = useState<AutoMatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [proposalDialog, setProposalDialog] = useState<{
    open: boolean;
    opponent?: OpponentResult;
    autoMatch?: AutoMatchResult;
    myEntry?: ScheduleEntry;
  }>({ open: false });
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!activeTeam) return;
    api.getSchedule(activeTeam.id, { status: 'open' }).then(setOpenDates);
    api.getAutoMatches(activeTeam.id).then(setAutoMatches);
  }, [activeTeam]);

  const handleSearch = async () => {
    if (!activeTeam || !selectedDate) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {
        team_id: activeTeam.id,
        date: selectedDate,
      };
      if (maxDistance < 200) params.max_distance_miles = maxDistance.toString();
      const data = await api.searchOpponents(params);
      setResults(data);
    } finally {
      setLoading(false);
    }
  };

  const handlePropose = async () => {
    if (!activeTeam) return;
    const { opponent, autoMatch, myEntry } = proposalDialog;

    let homeTeamId: string, awayTeamId: string, homeEntryId: string, awayEntryId: string, date: string;

    if (autoMatch) {
      homeTeamId = autoMatch.home_team_id;
      awayTeamId = autoMatch.away_team_id;
      homeEntryId = autoMatch.home_entry_id;
      awayEntryId = autoMatch.away_entry_id;
      date = autoMatch.date;
    } else if (opponent && myEntry) {
      if (myEntry.entry_type === 'home') {
        homeTeamId = activeTeam.id;
        awayTeamId = opponent.team_id;
        homeEntryId = myEntry.id;
        awayEntryId = opponent.schedule_entry_id;
      } else {
        homeTeamId = opponent.team_id;
        awayTeamId = activeTeam.id;
        homeEntryId = opponent.schedule_entry_id;
        awayEntryId = myEntry.id;
      }
      date = opponent.entry_date;
    } else {
      return;
    }

    await api.createProposal({
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      home_schedule_entry_id: homeEntryId,
      away_schedule_entry_id: awayEntryId,
      proposed_date: date,
      proposed_by_team_id: activeTeam.id,
      message: message || null,
    });

    setProposalDialog({ open: false });
    setMessage('');
    // Refresh
    if (tab === 0 && selectedDate) handleSearch();
    if (tab === 1) api.getAutoMatches(activeTeam.id).then(setAutoMatches);
  };

  if (!activeTeam) {
    return <Alert severity="info">Select a team to search for opponents.</Alert>;
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Find Opponents</Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Search by Date" />
        <Tab label={`Auto-Matches (${autoMatches.length})`} />
      </Tabs>

      {tab === 0 && (
        <>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <TextField
                select
                label="Open Date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                sx={{ minWidth: 200 }}
                slotProps={{ select: { native: true } }}
              >
                <option value="">Select a date...</option>
                {openDates.map((e) => (
                  <option key={e.id} value={e.date}>
                    {e.date} ({e.entry_type}) {e.time || ''}
                  </option>
                ))}
              </TextField>
              <Box sx={{ minWidth: 200 }}>
                <Typography variant="caption">Max Distance: {maxDistance >= 200 ? 'Any' : `${maxDistance} mi`}</Typography>
                <Slider value={maxDistance} onChange={(_, v) => setMaxDistance(v as number)}
                  min={10} max={200} step={10} />
              </Box>
              <Button variant="contained" startIcon={<SearchIcon />} onClick={handleSearch}
                disabled={!selectedDate || loading}>
                Search
              </Button>
            </Box>
          </Paper>

          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Team</TableCell>
                  <TableCell>Association</TableCell>
                  <TableCell>Level</TableCell>
                  <TableCell>Ranking</TableCell>
                  <TableCell>Distance</TableCell>
                  <TableCell>Their Slot</TableCell>
                  <TableCell width={120}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.map((r) => {
                  const myEntry = openDates.find((e) => e.date === selectedDate);
                  return (
                    <TableRow key={r.schedule_entry_id}>
                      <TableCell>{r.team_name}</TableCell>
                      <TableCell>{r.association_name}</TableCell>
                      <TableCell>{r.age_group} {r.level}</TableCell>
                      <TableCell>{r.myhockey_ranking ?? '-'}</TableCell>
                      <TableCell>{r.distance_miles != null ? `${r.distance_miles} mi` : '-'}</TableCell>
                      <TableCell>
                        <Chip label={r.entry_type} size="small"
                          color={r.entry_type === 'home' ? 'success' : 'info'} />
                        {r.entry_time && ` ${r.entry_time}`}
                      </TableCell>
                      <TableCell>
                        <Button size="small" variant="outlined"
                          onClick={() => setProposalDialog({ open: true, opponent: r, myEntry })}>
                          Propose
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {results.length === 0 && selectedDate && !loading && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                      No matching opponents found for this date.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {tab === 1 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Home Team</TableCell>
                <TableCell>Away Team</TableCell>
                <TableCell>Distance</TableCell>
                <TableCell width={120}></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {autoMatches.map((m, i) => (
                <TableRow key={i}>
                  <TableCell>{m.date}</TableCell>
                  <TableCell>
                    {m.home_team_name}
                    <Typography variant="caption" display="block" color="text.secondary">
                      {m.home_association_name} {m.home_time && `@ ${m.home_time}`}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {m.away_team_name}
                    <Typography variant="caption" display="block" color="text.secondary">
                      {m.away_association_name} {m.away_time && `@ ${m.away_time}`}
                    </Typography>
                  </TableCell>
                  <TableCell>{m.distance_miles != null ? `${m.distance_miles} mi` : '-'}</TableCell>
                  <TableCell>
                    <Button size="small" variant="outlined"
                      onClick={() => setProposalDialog({ open: true, autoMatch: m })}>
                      Propose
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {autoMatches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                    No auto-matches found. Add more open dates to find matches.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={proposalDialog.open} onClose={() => setProposalDialog({ open: false })} maxWidth="sm" fullWidth>
        <DialogTitle>Propose Game</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            {proposalDialog.autoMatch
              ? `${proposalDialog.autoMatch.home_team_name} (H) vs ${proposalDialog.autoMatch.away_team_name} (A) on ${proposalDialog.autoMatch.date}`
              : proposalDialog.opponent
                ? `vs ${proposalDialog.opponent.team_name} on ${proposalDialog.opponent.entry_date}`
                : ''}
          </Typography>
          <TextField
            label="Message (optional)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            fullWidth
            multiline
            rows={2}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProposalDialog({ open: false })}>Cancel</Button>
          <Button variant="contained" onClick={handlePropose}>Send Proposal</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

import { useState, useEffect } from 'react';
import {
  Box, Typography, Tabs, Tab, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, Button, Alert,
} from '@mui/material';
import { useTeam } from '../context/TeamContext';
import { api } from '../api/client';
import { GameProposal } from '../types';

const statusColors: Record<string, 'warning' | 'success' | 'error' | 'default'> = {
  proposed: 'warning',
  accepted: 'success',
  declined: 'error',
  cancelled: 'default',
};

export default function ProposalsPage() {
  const { activeTeam } = useTeam();
  const [tab, setTab] = useState(0);
  const [proposals, setProposals] = useState<GameProposal[]>([]);

  const direction = ['incoming', 'outgoing', 'all'][tab];

  const load = () => {
    if (!activeTeam) return;
    api.getProposals(activeTeam.id, { direction }).then(setProposals);
  };
  useEffect(() => { load(); }, [activeTeam, tab]); // eslint-disable-line

  const handleAccept = async (id: string) => {
    await api.acceptProposal(id);
    load();
  };
  const handleDecline = async (id: string) => {
    await api.declineProposal(id);
    load();
  };
  const handleCancel = async (id: string) => {
    await api.cancelProposal(id);
    load();
  };

  if (!activeTeam) {
    return <Alert severity="info">Select a team to view proposals.</Alert>;
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Game Proposals</Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Incoming" />
        <Tab label="Outgoing" />
        <Tab label="All" />
      </Tabs>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Home</TableCell>
              <TableCell>Away</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Message</TableCell>
              <TableCell>Created</TableCell>
              <TableCell width={180}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {proposals.map((p) => {
              const isIncoming = p.proposed_by_team_id !== activeTeam.id;
              const canRespond = isIncoming && p.status === 'proposed';
              const canCancel = !isIncoming && p.status === 'proposed';

              return (
                <TableRow key={p.id}>
                  <TableCell>{p.proposed_date} {p.proposed_time || ''}</TableCell>
                  <TableCell>
                    {p.home_team_name}
                    <Typography variant="caption" display="block" color="text.secondary">
                      {p.home_team_association}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {p.away_team_name}
                    <Typography variant="caption" display="block" color="text.secondary">
                      {p.away_team_association}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={p.status} size="small" color={statusColors[p.status]} />
                  </TableCell>
                  <TableCell>{p.message || '-'}</TableCell>
                  <TableCell>{new Date(p.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {canRespond && (
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Button size="small" variant="contained" color="success"
                          onClick={() => handleAccept(p.id)}>Accept</Button>
                        <Button size="small" variant="outlined" color="error"
                          onClick={() => handleDecline(p.id)}>Decline</Button>
                      </Box>
                    )}
                    {canCancel && (
                      <Button size="small" variant="outlined"
                        onClick={() => handleCancel(p.id)}>Cancel</Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {proposals.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                  No {direction !== 'all' ? direction : ''} proposals.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

import { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, IconButton, MenuItem,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { api } from '../api/client';
import { Team, Association } from '../types';
import { useTeam } from '../context/TeamContext';
import AgeLevelSelect from '../components/AgeLevelSelect';

const emptyForm = {
  association_id: '', name: '', age_group: '', level: '',
  manager_name: '', manager_email: '', manager_phone: '',
  rink_city: '', rink_state: '', rink_zip: '',
  myhockey_ranking: '' as string,
};

export default function TeamListPage() {
  const { refreshTeams } = useTeam();
  const [teams, setTeams] = useState<Team[]>([]);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = () => {
    api.getTeams().then(setTeams);
    api.getAssociations().then(setAssociations);
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    const data = {
      ...form,
      myhockey_ranking: form.myhockey_ranking ? parseInt(form.myhockey_ranking) : null,
    };
    if (editId) {
      await api.updateTeam(editId, data);
    } else {
      await api.createTeam(data);
    }
    setOpen(false);
    setEditId(null);
    setForm(emptyForm);
    load();
    refreshTeams();
  };

  const handleEdit = (t: Team) => {
    setEditId(t.id);
    setForm({
      association_id: t.association_id, name: t.name, age_group: t.age_group, level: t.level,
      manager_name: t.manager_name, manager_email: t.manager_email, manager_phone: t.manager_phone,
      rink_city: t.rink_city, rink_state: t.rink_state, rink_zip: t.rink_zip,
      myhockey_ranking: t.myhockey_ranking?.toString() || '',
    });
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this team?')) {
      await api.deleteTeam(id);
      load();
      refreshTeams();
    }
  };

  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5">Teams</Typography>
        <Button variant="contained" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}>
          Add Team
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Association</TableCell>
              <TableCell>Age</TableCell>
              <TableCell>Level</TableCell>
              <TableCell>Ranking</TableCell>
              <TableCell>Manager</TableCell>
              <TableCell width={100}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {teams.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.name}</TableCell>
                <TableCell>{t.association_name}</TableCell>
                <TableCell>{t.age_group}</TableCell>
                <TableCell>{t.level}</TableCell>
                <TableCell>{t.myhockey_ranking ?? '-'}</TableCell>
                <TableCell>{t.manager_name}</TableCell>
                <TableCell>
                  <IconButton size="small" onClick={() => handleEdit(t)}><EditIcon /></IconButton>
                  <IconButton size="small" onClick={() => handleDelete(t.id)}><DeleteIcon /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Edit' : 'Add'} Team</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <TextField select label="Association" value={form.association_id}
            onChange={(e) => setField('association_id', e.target.value)} required disabled={!!editId}>
            {associations.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
          </TextField>
          <TextField label="Team Name" value={form.name} onChange={(e) => setField('name', e.target.value)} required />
          <AgeLevelSelect ageGroup={form.age_group} level={form.level}
            onAgeGroupChange={(v) => setField('age_group', v)}
            onLevelChange={(v) => setField('level', v)} />
          <TextField label="Manager Name" value={form.manager_name} onChange={(e) => setField('manager_name', e.target.value)} />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Email" value={form.manager_email} onChange={(e) => setField('manager_email', e.target.value)} fullWidth />
            <TextField label="Phone" value={form.manager_phone} onChange={(e) => setField('manager_phone', e.target.value)} fullWidth />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Rink City" value={form.rink_city} onChange={(e) => setField('rink_city', e.target.value)} fullWidth />
            <TextField label="State" value={form.rink_state} onChange={(e) => setField('rink_state', e.target.value)} sx={{ width: 80 }} />
            <TextField label="Zip" value={form.rink_zip} onChange={(e) => setField('rink_zip', e.target.value)} sx={{ width: 120 }} />
          </Box>
          <TextField label="MyHockey Ranking" type="number" value={form.myhockey_ranking}
            onChange={(e) => setField('myhockey_ranking', e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}
            disabled={!form.name || !form.association_id || !form.age_group || !form.level}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

import { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, IconButton,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { api } from '../api/client';
import { Association } from '../types';

const emptyForm = { name: '', home_rink_address: '', city: '', state: '', zip_code: '', league_affiliation: '' };

export default function AssociationListPage() {
  const [associations, setAssociations] = useState<Association[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = () => api.getAssociations().then(setAssociations);
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (editId) {
      await api.updateAssociation(editId, form);
    } else {
      await api.createAssociation(form);
    }
    setOpen(false);
    setEditId(null);
    setForm(emptyForm);
    load();
  };

  const handleEdit = (a: Association) => {
    setEditId(a.id);
    setForm({ name: a.name, home_rink_address: a.home_rink_address, city: a.city, state: a.state, zip_code: a.zip_code, league_affiliation: a.league_affiliation || '' });
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this association and all its teams?')) {
      await api.deleteAssociation(id);
      load();
    }
  };

  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5">Associations</Typography>
        <Button variant="contained" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}>
          Add Association
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>City</TableCell>
              <TableCell>State</TableCell>
              <TableCell>Zip</TableCell>
              <TableCell>League</TableCell>
              <TableCell width={100}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {associations.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{a.name}</TableCell>
                <TableCell>{a.city}</TableCell>
                <TableCell>{a.state}</TableCell>
                <TableCell>{a.zip_code}</TableCell>
                <TableCell>{a.league_affiliation || '-'}</TableCell>
                <TableCell>
                  <IconButton size="small" onClick={() => handleEdit(a)}><EditIcon /></IconButton>
                  <IconButton size="small" onClick={() => handleDelete(a.id)}><DeleteIcon /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Edit' : 'Add'} Association</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <TextField label="Name" value={form.name} onChange={(e) => setField('name', e.target.value)} required />
          <TextField label="Home Rink Address" value={form.home_rink_address} onChange={(e) => setField('home_rink_address', e.target.value)} />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="City" value={form.city} onChange={(e) => setField('city', e.target.value)} fullWidth />
            <TextField label="State" value={form.state} onChange={(e) => setField('state', e.target.value)} sx={{ width: 80 }} />
            <TextField label="Zip" value={form.zip_code} onChange={(e) => setField('zip_code', e.target.value)} sx={{ width: 120 }} />
          </Box>
          <TextField label="League Affiliation" value={form.league_affiliation} onChange={(e) => setField('league_affiliation', e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

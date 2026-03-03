import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  IconButton,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { api } from '../api/client';
import { Rink } from '../types';

const emptyForm = { name: '', address: '', city: '', state: '', zip_code: '', phone: '', contact_email: '' };

export default function RinkListPage() {
  const navigate = useNavigate();
  const [rinks, setRinks] = useState<Rink[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = () => api.getRinks().then(setRinks);
  useEffect(() => { load(); }, []);

  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (editId) {
      await api.updateRink(editId, form);
    } else {
      await api.createRink(form);
    }
    setOpen(false);
    load();
  };

  const handleEdit = (r: Rink) => {
    setEditId(r.id);
    setForm({
      name: r.name, address: r.address, city: r.city, state: r.state,
      zip_code: r.zip_code, phone: r.phone, contact_email: r.contact_email,
    });
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this rink and all its ice slots?')) {
      await api.deleteRink(id);
      load();
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5">Rinks</Typography>
        <Button variant="contained" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}>
          Add Rink
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Address</TableCell>
              <TableCell>City</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell>Email</TableCell>
              <TableCell width={140}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rinks.map((r) => (
              <TableRow key={r.id} hover sx={{ cursor: 'pointer' }}
                onClick={() => navigate(`/rinks/${r.id}/slots`)}>
                <TableCell>{r.name}</TableCell>
                <TableCell>{r.address}</TableCell>
                <TableCell>{r.city}, {r.state} {r.zip_code}</TableCell>
                <TableCell>{r.phone}</TableCell>
                <TableCell>{r.contact_email}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <IconButton size="small" onClick={() => handleEdit(r)}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => handleDelete(r.id)}><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {rinks.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                  No rinks yet. Add one or seed demo data.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Edit' : 'Add'} Rink</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="Name" value={form.name} onChange={(e) => setField('name', e.target.value)} required fullWidth />
            <TextField label="Address" value={form.address} onChange={(e) => setField('address', e.target.value)} fullWidth />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label="City" value={form.city} onChange={(e) => setField('city', e.target.value)} fullWidth />
              <TextField label="State" value={form.state} onChange={(e) => setField('state', e.target.value)} sx={{ width: 100 }} />
              <TextField label="Zip" value={form.zip_code} onChange={(e) => setField('zip_code', e.target.value)} sx={{ width: 120 }} />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label="Phone" value={form.phone} onChange={(e) => setField('phone', e.target.value)} fullWidth />
              <TextField label="Contact Email" value={form.contact_email} onChange={(e) => setField('contact_email', e.target.value)} fullWidth />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

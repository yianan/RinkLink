import { FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { useTeam } from '../context/TeamContext';

export default function TeamSwitcher() {
  const { teams, activeTeam, setActiveTeam } = useTeam();

  return (
    <FormControl size="small" sx={{ minWidth: 250 }}>
      <InputLabel>Active Team</InputLabel>
      <Select
        value={activeTeam?.id || ''}
        label="Active Team"
        onChange={(e) => {
          const team = teams.find((t) => t.id === e.target.value) || null;
          setActiveTeam(team);
        }}
        sx={{ bgcolor: 'white', borderRadius: 1 }}
      >
        {teams.map((t) => (
          <MenuItem key={t.id} value={t.id}>
            {t.name} ({t.association_name})
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

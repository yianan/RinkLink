import { Select, MenuItem, Typography, Box } from '@mui/material';
import { useTeam } from '../context/TeamContext';

export default function TeamSwitcher() {
  const { teams, activeTeam, setActiveTeam } = useTeam();

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap' }}>
        Active Team:
      </Typography>
      <Select
        size="small"
        displayEmpty
        value={activeTeam?.id || ''}
        onChange={(e) => {
          const team = teams.find((t) => t.id === e.target.value) || null;
          setActiveTeam(team);
        }}
        sx={{ minWidth: 250, bgcolor: 'white', borderRadius: 1 }}
        renderValue={(value) => {
          if (!value) return <em>Select a team...</em>;
          const team = teams.find((t) => t.id === value);
          return team ? `${team.name} (${team.association_name})` : '';
        }}
      >
        {teams.map((t) => (
          <MenuItem key={t.id} value={t.id}>
            {t.name} ({t.association_name})
          </MenuItem>
        ))}
      </Select>
    </Box>
  );
}

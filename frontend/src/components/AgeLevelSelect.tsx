import { TextField, MenuItem, Box } from '@mui/material';

const AGE_GROUPS = ['19U', '18U', '16U', '15U', '14U', '13U', '12U', '11U', '10U', '9U', '8U', '7U', '6U'];

const LEVELS_BY_AGE: Record<string, string[]> = {
  '19U': ['AAA', 'AA', 'A', 'B'],
  '18U': ['AAA', 'AA', 'A', 'B'],
  '16U': ['AAA', 'AA', 'A', 'B'],
  '15U': ['AAA', 'AA', 'A', 'B'],
  '14U': ['AAA', 'AA', 'A', 'B'],
  '13U': ['AAA', 'AA', 'A', 'B'],
  '12U': ['AAA', 'AA', 'A', 'B'],
  '11U': ['AA', 'A', 'B'],
  '10U': ['AA', 'A', 'B'],
  '9U': ['A', 'B'],
  '8U': ['A', 'B'],
  '7U': ['A', 'B'],
  '6U': ['A', 'B'],
};

interface Props {
  ageGroup: string;
  level: string;
  onAgeGroupChange: (v: string) => void;
  onLevelChange: (v: string) => void;
}

export default function AgeLevelSelect({ ageGroup, level, onAgeGroupChange, onLevelChange }: Props) {
  const levels = LEVELS_BY_AGE[ageGroup] || [];

  return (
    <Box sx={{ display: 'flex', gap: 2 }}>
      <TextField
        select
        label="Age Group"
        value={ageGroup}
        onChange={(e) => {
          onAgeGroupChange(e.target.value);
          onLevelChange('');
        }}
        fullWidth
        required
      >
        {AGE_GROUPS.map((ag) => (
          <MenuItem key={ag} value={ag}>{ag}</MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label="Level"
        value={level}
        onChange={(e) => onLevelChange(e.target.value)}
        fullWidth
        required
        disabled={!ageGroup}
      >
        {levels.map((l) => (
          <MenuItem key={l} value={l}>{l}</MenuItem>
        ))}
      </TextField>
    </Box>
  );
}

import { Input } from './ui/Input';
import { Select } from './ui/Select';

const STANDARD_AGE_GROUPS = ['19U', '16U', '14U', '12U', '10U', '8U', '6U'];

const LEVELS_10U_PLUS = ['AAA', 'AA', 'A', 'B', 'C', 'Rec'];
const LEVELS_6U_8U = ['Beginner', 'Beginner/Intermediate', 'Intermediate', 'Intermediate/Advanced', 'Advanced'];

const CUSTOM = '__custom__';

function parseAgeNumber(ageGroup: string) {
  const m = ageGroup.match(/(\\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

interface Props {
  ageGroup: string;
  level: string;
  onAgeGroupChange: (v: string) => void;
  onLevelChange: (v: string) => void;
}

export default function AgeLevelSelect({ ageGroup, level, onAgeGroupChange, onLevelChange }: Props) {
  const isCustomAge = !!ageGroup && !STANDARD_AGE_GROUPS.includes(ageGroup);
  const ageSelectValue = isCustomAge ? CUSTOM : ageGroup;

  const ageNumber = parseAgeNumber(ageGroup);
  const isMite = ageNumber != null ? ageNumber <= 8 : ageGroup === '6U' || ageGroup === '8U';
  const standardLevels = !ageGroup ? [] : isMite ? LEVELS_6U_8U : LEVELS_10U_PLUS;

  const isCustomLevel = !!level && !standardLevels.includes(level);
  const levelSelectValue = isCustomLevel ? CUSTOM : level;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Age Group</label>
        <Select
          value={ageSelectValue}
          required
          onChange={(e) => {
            const v = e.target.value;
            if (v === CUSTOM) {
              if (!isCustomAge) onAgeGroupChange('');
            } else {
              onAgeGroupChange(v);
            }
            onLevelChange('');
          }}
        >
          <option value="" disabled>
            Select age…
          </option>
          {STANDARD_AGE_GROUPS.map((ag) => (
            <option key={ag} value={ag}>
              {ag}
            </option>
          ))}
          <option value={CUSTOM}>Custom…</option>
        </Select>

        {ageSelectValue === CUSTOM && (
          <div className="mt-2">
            <Input
              value={ageGroup}
              onChange={(e) => onAgeGroupChange(e.target.value)}
              placeholder="Custom age group (e.g., 18U)"
            />
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Level</label>
        <Select
          value={levelSelectValue}
          required
          onChange={(e) => {
            const v = e.target.value;
            if (v === CUSTOM) {
              if (!isCustomLevel) onLevelChange('');
            } else {
              onLevelChange(v);
            }
          }}
          disabled={!ageGroup}
        >
          <option value="" disabled>
            Select level…
          </option>
          {standardLevels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
          <option value={CUSTOM}>Custom…</option>
        </Select>

        {levelSelectValue === CUSTOM && (
          <div className="mt-2">
            <Input
              value={level}
              onChange={(e) => onLevelChange(e.target.value)}
              placeholder="Custom level"
            />
          </div>
        )}
      </div>
    </div>
  );
}

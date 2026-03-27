import { Input } from './ui/Input';

type ScoreStepperProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

function digitsOnly(value: string) {
  return value.replace(/\D+/g, '');
}

export default function ScoreStepper({ label, value, onChange, disabled = false }: ScoreStepperProps) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">{label}</div>
      <Input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(event) => onChange(digitsOnly(event.target.value))}
        className="w-full text-center"
        inputMode="numeric"
        disabled={disabled}
      />
    </div>
  );
}

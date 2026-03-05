import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from './ui/Button';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'rinklink.theme';

function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme() || 'dark');

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const isDark = theme === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={() => {
        const next = isDark ? 'light' : 'dark';
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // ignore
        }
        setTheme(next);
      }}
      className="bg-slate-900/5 text-slate-700 ring-1 ring-slate-200/70 hover:bg-slate-900/10 hover:text-slate-900 dark:bg-white/10 dark:text-white dark:ring-white/15 dark:hover:bg-white/15 dark:hover:text-white"
      title={label}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

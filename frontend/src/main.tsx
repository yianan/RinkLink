import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/inter';
import './styles.css';
import App from './App.tsx'

const THEME_STORAGE_KEY = 'rinklink.theme';
const THEME_EXPLICIT_STORAGE_KEY = 'rinklink.theme.explicit';

function applyInitialTheme() {
  try {
    const explicitChoice = localStorage.getItem(THEME_EXPLICIT_STORAGE_KEY) === 'true';
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    document.documentElement.classList.toggle('dark', explicitChoice && storedTheme === 'dark');
  } catch {
    document.documentElement.classList.remove('dark');
  }
}

applyInitialTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import './theme-toggle.css';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? 'Ativar modo claro' : 'Ativar modo escuro';

  return (
    <button
      className="cyl-theme-toggle"
      type="button"
      aria-label={label}
      title={label}
      onClick={toggleTheme}
    >
      <Moon className="cyl-theme-icon cyl-theme-icon-moon" aria-hidden="true" />
      <Sun className="cyl-theme-icon cyl-theme-icon-sun" aria-hidden="true" />
    </button>
  );
}

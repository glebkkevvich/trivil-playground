import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeMode = 'dark' | 'light';

export interface Theme {
  mode: ThemeMode;
  colors: {
    background: string;
    backgroundSecondary: string;
    text: string;
    textSecondary: string;
    border: string;
    accent: string;
    accentHover: string;
    success: string;
    error: string;
    warning: string;
  };
}

const darkTheme: Theme = {
  mode: 'dark',
  colors: {
    background: '#1e1e1e',
    backgroundSecondary: '#2d2d30',
    text: '#cccccc',
    textSecondary: '#969696',
    border: '#3e3e42',
    accent: '#007acc',
    accentHover: '#1f9cf0',
    success: '#4caf50',
    error: '#f44336',
    warning: '#ff9800',
  },
};

const lightTheme: Theme = {
  mode: 'light',
  colors: {
    background: '#ffffff',
    backgroundSecondary: '#f8f8f8',
    text: '#333333',
    textSecondary: '#666666',
    border: '#e0e0e0',
    accent: '#007acc',
    accentHover: '#005a9e',
    success: '#4caf50',
    error: '#f44336',
    warning: '#ff9800',
  },
};

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeContextProviderProps {
  children: ReactNode;
}

export const ThemeContextProvider: React.FC<ThemeContextProviderProps> = ({ children }) => {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const savedTheme = localStorage.getItem('trivil-playground-theme');
    return (savedTheme as ThemeMode) || 'dark';
  });

  const theme = themeMode === 'dark' ? darkTheme : lightTheme;

  const toggleTheme = () => {
    const newTheme = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(newTheme);
    localStorage.setItem('trivil-playground-theme', newTheme);
  };

  useEffect(() => {
    document.body.style.backgroundColor = theme.colors.background;
    document.body.style.color = theme.colors.text;
  }, [theme]);

  const value: ThemeContextValue = {
    theme,
    toggleTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeContextProvider');
  }
  return context;
}; 
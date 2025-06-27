import React from 'react';
import { ThemeProvider } from 'styled-components';
import { PlaygroundLayout } from './components/PlaygroundLayout';
import { ThemeContextProvider, useTheme } from './contexts/ThemeContext';
import { GlobalStyle } from './styles/GlobalStyle';
import './App.css';
import './styles/syntax-highlighting.css';
import './styles/trivil-highlighting.css';


(function immediateErrorSuppression() {
  const suppressClipboardError = (args: any[]): boolean => {
    const content = args.map(arg => {
      if (arg === null || arg === undefined) return '';
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return arg.message + ' ' + (arg.stack || '');
      if (arg && typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ').toLowerCase();
    
    return content.includes('notallowederror') || 
           content.includes('clipboard') || 
           content.includes('the request is not allowed') ||
           content.includes('user denied permission') ||
           content.includes('permission denied') ||
           content.includes('write permission') ||
           content.includes('read permission') ||
           content.includes('user activation') ||
           content.includes('transient activation') ||
           content.includes('user gesture');
  };
  
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;
  
  console.error = (...args: any[]) => {
    if (suppressClipboardError(args)) return;
    originalError.apply(console, args);
  };
  
  console.warn = (...args: any[]) => {
    if (suppressClipboardError(args)) return;
    originalWarn.apply(console, args);
  };
  
  console.log = (...args: any[]) => {
    if (suppressClipboardError(args)) return;
    originalLog.apply(console, args);
  };
  
  window.onerror = (message, source, lineno, colno, error) => {
    if (suppressClipboardError([message, error])) {
      return true;
    }
    return false;
  };
  
  window.addEventListener('unhandledrejection', (event) => {
    if (suppressClipboardError([event.reason])) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }, true);
  
  window.addEventListener('error', (event) => {
    if (suppressClipboardError([event.message, event.error])) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }, true);
  
  const originalSetTimeout = window.setTimeout;
  (window as any).setTimeout = (callback: any, timeout?: number) => {
    if (typeof callback === 'function') {
      const wrappedCallback = () => {
        try {
          return callback();
        } catch (error) {
          if (suppressClipboardError([error])) {
            return;
          }
          throw error;
        }
      };
      return originalSetTimeout.call(window, wrappedCallback, timeout);
    }
    return originalSetTimeout.call(window, callback, timeout);
  };
})();

const ThemedApp: React.FC = () => {
  const { theme } = useTheme();
  
  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <PlaygroundLayout />
    </ThemeProvider>
  );
};

const App: React.FC = () => {
  return (
    <ThemeContextProvider>
      <ThemedApp />
    </ThemeContextProvider>
  );
};

export default App;

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/manrope'
import './styles.css'
import App from './App.tsx'
import { applyTheme, preferredTheme } from './lib/theme'

// Before the first paint, so the page never flashes in the wrong theme.
applyTheme(preferredTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Overlay } from './overlay/Overlay.tsx'
import { OverlayBriefing } from './overlay/OverlayBriefing.tsx'
import { OverlayTimer } from './overlay/OverlayTimer.tsx'
import { OverlayChat } from './overlay/OverlayChat.tsx'
import { OverlayPinned } from './overlay/OverlayPinned.tsx'

const path = window.location.pathname

if (path.startsWith('/overlay')) {
  document.documentElement.classList.add('overlay')
  document.body.classList.add('overlay')
}

const views: Record<string, React.ReactNode> = {
  '/overlay':          <Overlay />,
  '/overlay/briefing': <OverlayBriefing />,
  '/overlay/timer':    <OverlayTimer />,
  '/overlay/chat':     <OverlayChat />,
  '/overlay/pinned':   <OverlayPinned />,
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {views[path] ?? <App />}
  </StrictMode>,
)

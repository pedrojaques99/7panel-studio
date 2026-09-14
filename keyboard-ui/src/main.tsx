import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Overlay } from './overlay/Overlay.tsx'
import { OverlayBriefing } from './overlay/OverlayBriefing.tsx'
import { OverlayTimer } from './overlay/OverlayTimer.tsx'
import { OverlayChat } from './overlay/OverlayChat.tsx'
import { OverlayPinned } from './overlay/OverlayPinned.tsx'
import { OverlayQuestion } from './overlay/OverlayQuestion.tsx'
import { OverlayPoll } from './overlay/OverlayPoll.tsx'
import { Fabrica } from './fabrica/Fabrica.tsx'
import { Eq } from './eq/Eq.tsx'
import { Musica } from './musica/Musica.tsx'

const path = window.location.pathname

if (path.startsWith('/overlay')) {
  document.documentElement.classList.add('overlay')
  document.body.classList.add('overlay')
}

const isStreamer = path.startsWith('/streamer')

const views: Record<string, React.ReactNode> = {
  '/overlay':          <Overlay />,
  '/overlay/briefing': <OverlayBriefing />,
  '/overlay/timer':    <OverlayTimer />,
  '/overlay/chat':     <OverlayChat />,
  '/overlay/pinned':   <OverlayPinned />,
  '/overlay/question': <OverlayQuestion />,
  '/overlay/poll':     <OverlayPoll />,
  // esteira do eno esticado, sozinha: SEED -> TRIAGEM -> ESTICAR -> DOMAR
  '/fabrica':          <Fabrica />,
  '/fabrica/':         <Fabrica />,
  // a MESMA esteira com uma voz só: cama clara e flutuante, sem escolha de destino
  '/fabrica/etereo':   <Fabrica modo="etereo" />,
  '/fabrica/etereo/':  <Fabrica modo="etereo" />,
  // rota SOLTA: abre arquivo qualquer, inclusive um que nunca passou pela esteira
  '/eq':               <Eq />,
  '/eq/':              <Eq />,
  // onde a música mora: repertório, editor e histórico de versões por música
  '/musica':           <Musica />,
  '/musica/':          <Musica />,
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {views[path] ?? <App mode={isStreamer ? 'streamer' : 'studio'} />}
  </StrictMode>,
)

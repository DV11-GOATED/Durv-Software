import React from 'react'
import { createRoot } from 'react-dom/client'
import Dashboard from './Dashboard'
import OverlayApp from './OverlayApp'
import './index.css'

const isOverlay = window.location.hash === '#overlay'      // the in-game overlay window (see main.js)
if (isOverlay) document.body.classList.add('overlay-page')
createRoot(document.getElementById('root')).render(isOverlay ? <OverlayApp /> : <Dashboard />)

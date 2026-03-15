import React from 'react'
import ReactDOM from 'react-dom/client'
// import PinAnonBoard from './pin-anon.jsx'  // ← Comment out
import CarlisleSignupMockup from './CarlisleSignup.jsx'  // ← Add this
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CarlisleSignupMockup />  {/* ← Change this */}
  </React.StrictMode>,
)
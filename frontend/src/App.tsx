import React from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'

import WorkPage from './pages/WorkPage'
import SavedListPage from './pages/SavedListPage'
import SavedDetailPage from './pages/SavedDetailPage'
import PracticePage from './pages/PracticePage'

function TopNav() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    'navLink ' + (isActive ? 'active' : '')

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Vivaldi</div>
          <div className="small">Optimal violin learning tool</div>
        </div>

        <div className="nav">
          <NavLink to="/" className={linkClass} end>
            Transcribe & Finger
          </NavLink>
          <NavLink to="/saved" className={linkClass}>
            Saved
          </NavLink>
          <NavLink to="/practice" className={linkClass}>
            Practice
          </NavLink>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <div className="container">
      <TopNav />
      <Routes>
        <Route path="/" element={<WorkPage />} />
        <Route path="/saved" element={<SavedListPage />} />
        <Route path="/saved/:id" element={<SavedDetailPage />} />
        <Route path="/practice" element={<PracticePage />} />
        <Route
          path="*"
          element={
            <div className="card">
              <div style={{ fontWeight: 700 }}>Not found</div>
              <div className="small" style={{ marginTop: 6 }}>
                That route doesn’t exist.
              </div>
            </div>
          }
        />
      </Routes>
    </div>
  )
}

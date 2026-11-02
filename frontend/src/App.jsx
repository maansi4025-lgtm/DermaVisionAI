import { Navigate, Route, Routes } from 'react-router-dom'
import { CatchAllRedirect } from './components/CatchAllRedirect'
import { AppLayout } from './components/layout/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import Assistant from './pages/Assistant'
import Dashboard from './pages/Dashboard'
import ForgotPassword from './pages/ForgotPassword'
import History from './pages/History'
import Login from './pages/Login'
import PredictionResult from './pages/PredictionResult'
import Profile from './pages/Profile'
import ReportView from './pages/ReportView'
import Reports from './pages/Reports'
import ResetPassword from './pages/ResetPassword'
import SignUp from './pages/SignUp'
import UploadPage from './pages/Upload'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/results/:id" element={<PredictionResult />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/history" element={<History />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/reports/:id" element={<ReportView />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<CatchAllRedirect />} />
    </Routes>
  )
}

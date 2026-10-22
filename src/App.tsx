import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { Loading, WakingNotice } from './components/ui'
import { BalancesPage } from './pages/BalancesPage'
import { BudgetLinesPage } from './pages/BudgetLinesPage'
import { CompanyPage } from './pages/CompanyPage'
import { ComparisonPage } from './pages/ComparisonPage'
import { CardSettingsPage } from './pages/CardSettingsPage'
import { CardsPage } from './pages/CardsPage'
import { HolidaysPage } from './pages/HolidaysPage'
import { MerchantsPage } from './pages/MerchantsPage'
import { LoginPage } from './pages/LoginPage'
import { MonthPage } from './pages/MonthPage'
import { SettingsPage } from './pages/SettingsPage'
import { SpendingPage } from './pages/SpendingPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { PasswordPage } from './pages/PasswordPage'
import { UsersPage } from './pages/UsersPage'
import { WeeklyPlanPage } from './pages/WeeklyPlanPage'
import { YearPage } from './pages/YearPage'

function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="centered">
        <Loading />
      </div>
    )
  }
  // Remember where the user was going, to return there after login.
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

// HashRouter: GitHub Pages has no SPA fallback, so routes live after the `#`.
export default function App() {
  return (
    <AuthProvider>
      <WakingNotice />
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route path="/year" element={<YearPage />} />
              <Route path="/month" element={<MonthPage />} />
              <Route path="/cards" element={<CardsPage />} />
              <Route path="/spending" element={<SpendingPage />} />
              <Route path="/weekly" element={<WeeklyPlanPage />} />
              <Route path="/future" element={<BalancesPage />} />
              <Route path="/future/history" element={<ComparisonPage />} />
              <Route path="/company" element={<CompanyPage />} />
              <Route path="/settings" element={<SettingsPage />}>
                <Route index element={<Navigate to="/settings/lines" replace />} />
                <Route path="lines" element={<BudgetLinesPage />} />
                <Route path="cards" element={<CardSettingsPage />} />
                <Route path="merchants" element={<MerchantsPage />} />
                <Route path="holidays" element={<HolidaysPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
              </Route>
              <Route path="/password" element={<PasswordPage />} />
              <Route path="*" element={<Navigate to="/year" replace />} />
            </Route>
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}

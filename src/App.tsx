import HomePage from './pages/HomePage'
import { Navigate, Route, Routes } from 'react-router-dom'
import AccountPage from './pages/AccountPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import LoginPage from './pages/LoginPage'
import RegistrationPage from './pages/RegistrationPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import VerificationPendingPage from './pages/VerificationPendingPage'
import AuthLayout from './components/auth/AuthLayout'
import { GuestRoute, ProtectedRoute } from './auth/RouteGuards'
import CreateTeamPage from './pages/CreateTeamPage'
import TeamsPage from './pages/TeamsPage'
import TeamDashboardLayout from './components/team/TeamDashboardLayout'
import { TeamProvider } from './teams/TeamContext'
import TeamOverviewPage from './pages/TeamOverviewPage'
import TeamProfilePage from './pages/TeamProfilePage'
import TeamMembersPage from './pages/TeamMembersPage'
import TeamInvitationsPage from './pages/TeamInvitationsPage'
import TeamSettingsPage from './pages/TeamSettingsPage'
import TournamentArenaPage from './pages/TournamentArenaPage'
import TournamentDetailsPage from './pages/TournamentDetailsPage'
import TournamentRegistrationComingSoonPage from './pages/TournamentRegistrationComingSoonPage'
import TournamentAdminRoute from './components/tournaments/TournamentAdminRoute'
import TournamentAdminLayout from './components/tournaments/TournamentAdminLayout'
import AdminTournamentListPage from './pages/AdminTournamentListPage'
import AdminTournamentFormPage from './pages/AdminTournamentFormPage'
import TeamTournamentsPage from './pages/TeamTournamentsPage'
import AdminTournamentRegistrationsPage from './pages/AdminTournamentRegistrationsPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/tournaments" element={<TournamentArenaPage />} />
      <Route path="/tournaments/:slug/registration" element={<TournamentRegistrationComingSoonPage />} />
      <Route path="/tournaments/:slug" element={<TournamentDetailsPage />} />
      <Route element={<AuthLayout />}>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegistrationPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/verify-email" element={<VerificationPendingPage />} />
        </Route>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/account" element={<AccountPage />} />
        <Route element={<TeamProvider />}>
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/teams/create" element={<CreateTeamPage />} />
          <Route path="/dashboard/team" element={<TeamDashboardLayout />}>
            <Route index element={<TeamOverviewPage />} />
            <Route path="profile" element={<TeamProfilePage />} />
            <Route path="members" element={<TeamMembersPage />} />
            <Route path="tournaments" element={<TeamTournamentsPage />} />
            <Route path="invitations" element={<TeamInvitationsPage />} />
            <Route path="settings" element={<TeamSettingsPage />} />
          </Route>
        </Route>
        <Route element={<TournamentAdminRoute />}>
          <Route element={<TournamentAdminLayout />}>
            <Route path="/admin/tournaments" element={<AdminTournamentListPage />} />
            <Route path="/admin/tournaments/new" element={<AdminTournamentFormPage />} />
            <Route path="/admin/tournaments/:id/edit" element={<AdminTournamentFormPage />} />
            <Route path="/admin/tournaments/:id/registrations" element={<AdminTournamentRegistrationsPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
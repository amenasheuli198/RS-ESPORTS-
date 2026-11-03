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
import MatchesPage from './pages/MatchesPage'
import TeamMatchesPage from './pages/TeamMatchesPage'
import AdminTournamentMatchesPage from './pages/AdminTournamentMatchesPage'
import LeaderboardPage from './pages/LeaderboardPage'
import TournamentLeaderboardPage from './pages/TournamentLeaderboardPage'
import PublicMatchResultsPage from './pages/PublicMatchResultsPage'
import TeamResultsPage from './pages/TeamResultsPage'
import AdminTournamentScoringPage from './pages/AdminTournamentScoringPage'
import AdminMatchResultsPage from './pages/AdminMatchResultsPage'
import AnnouncementsPage from './pages/AnnouncementsPage'
import AnnouncementDetailsPage from './pages/AnnouncementDetailsPage'
import NotificationCenterPage from './pages/NotificationCenterPage'
import AdminDashboardPage from './pages/AdminDashboardPage'
import PlayerProfilePage from './pages/PlayerProfilePage'
import NewsPage from './pages/NewsPage'
import NewsArticlePage from './pages/NewsArticlePage'
import AdminContentPage from './pages/AdminContentPage'
import ContactPage from './pages/ContactPage'
import SupportDashboardPage from './pages/SupportDashboardPage'
import DisputesDashboardPage from './pages/DisputesDashboardPage'
import AdminSettingsPage from './pages/AdminSettingsPage'
import MaintenancePage from './pages/MaintenancePage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/tournaments" element={<TournamentArenaPage />} />
      <Route path="/matches" element={<MatchesPage />} />
      <Route path="/matches/:matchId/results" element={<PublicMatchResultsPage />} />
      <Route path="/leaderboard" element={<LeaderboardPage />} />
      <Route path="/players/:username" element={<PlayerProfilePage />} />
      <Route path="/news" element={<NewsPage />} />
      <Route path="/news/category/:slug" element={<NewsPage />} />
      <Route path="/news/:slug" element={<NewsArticlePage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/maintenance" element={<MaintenancePage />} />
      <Route path="/tournaments/:slug/leaderboard" element={<TournamentLeaderboardPage />} />
      <Route path="/announcements" element={<AnnouncementsPage />} />
      <Route path="/announcements/:id" element={<AnnouncementDetailsPage />} />
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
        <Route path="/dashboard/profile" element={<AccountPage />} />
        <Route path="/dashboard/support" element={<SupportDashboardPage />} />
        <Route path="/dashboard/disputes" element={<DisputesDashboardPage />} />
        <Route element={<TeamProvider />}>
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/teams/create" element={<CreateTeamPage />} />
          <Route path="/dashboard/team" element={<TeamDashboardLayout />}>
            <Route index element={<TeamOverviewPage />} />
            <Route path="profile" element={<TeamProfilePage />} />
            <Route path="members" element={<TeamMembersPage />} />
            <Route path="tournaments" element={<TeamTournamentsPage />} />
            <Route path="matches" element={<TeamMatchesPage />} />
            <Route path="results" element={<TeamResultsPage />} />
            <Route path="invitations" element={<TeamInvitationsPage />} />
            <Route path="settings" element={<TeamSettingsPage />} />
          </Route>
        </Route>
        <Route element={<TournamentAdminRoute />}>
          <Route element={<TournamentAdminLayout />}>
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="/admin/content" element={<AdminContentPage />} />
            <Route path="/admin/settings" element={<AdminSettingsPage />} />
            <Route path="/admin/tournaments" element={<AdminTournamentListPage />} />
            <Route path="/admin/tournaments/new" element={<AdminTournamentFormPage />} />
            <Route path="/admin/tournaments/:id/edit" element={<AdminTournamentFormPage />} />
            <Route path="/admin/tournaments/:id/registrations" element={<AdminTournamentRegistrationsPage />} />
            <Route path="/admin/tournaments/:tournamentId/matches" element={<AdminTournamentMatchesPage />} />
            <Route path="/admin/tournaments/:tournamentId/scoring" element={<AdminTournamentScoringPage />} />
            <Route path="/admin/tournaments/:tournamentId/matches/:matchId/results" element={<AdminMatchResultsPage />} />
          </Route>
        </Route>
        <Route path="/dashboard/notifications" element={<NotificationCenterPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import Layout from './components/Layout';
import AdminPage from './pages/admin/AdminPage';
import Home from './pages/Home';
import JoinTeam from './pages/JoinTeam';
import Login from './pages/Login';
import OrgDashboard from './pages/OrgDashboard';
import TeamPage from './pages/team/TeamPage';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/join"
          element={
            <RequireAuth need="any">
              <JoinTeam />
            </RequireAuth>
          }
        />
        <Route
          path="/org"
          element={
            <RequireAuth need="org">
              <OrgDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/teams/:teamId"
          element={
            <RequireAuth need="member">
              <TeamPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth need="admin">
              <AdminPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

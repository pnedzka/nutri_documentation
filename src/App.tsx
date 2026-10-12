import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Toasts } from './components/Toasts';
import { useAuth } from './lib/auth';
import { LoginPage } from './pages/LoginPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { DocumentPage } from './pages/DocumentPage';
import { AdminDocumentsPage } from './pages/AdminDocumentsPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AccountPage } from './pages/AccountPage';
import { SetupPage } from './pages/SetupPage';

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
      <span className="animate-spin h-5 w-5 mr-3 rounded-full border-2 border-gray-300 border-t-[#CC1F1F]" />
      Ładowanie…
    </div>
  );
}

function AdminOnly({ children }: { children: ReactNode }) {
  const profile = useAuth((s) => s.profile);
  return profile?.role === 'admin' ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  const { status, init } = useAuth();
  useEffect(() => init(), [init]);

  let content: ReactNode;
  if (status === 'loading') content = <Spinner />;
  else if (status === 'unconfigured') content = <SetupPage />;
  else if (status !== 'signedIn') content = <LoginPage />;
  else
    content = (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DocumentsPage />} />
          <Route path="/dokumenty/:id" element={<DocumentPage />} />
          <Route path="/konto" element={<AccountPage />} />
          <Route path="/admin/dokumenty" element={<AdminOnly><AdminDocumentsPage /></AdminOnly>} />
          <Route path="/admin/uzytkownicy" element={<AdminOnly><AdminUsersPage /></AdminOnly>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    );

  return (
    <>
      {content}
      <Toasts />
    </>
  );
}

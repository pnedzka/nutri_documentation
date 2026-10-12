import { NavLink, Outlet } from 'react-router-dom';
import { FileText, LogOut, Shield, User as UserIcon, Users } from 'lucide-react';
import { useAuth } from '../lib/auth';

function Tab({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
          isActive ? 'bg-[#CC1F1F] text-white' : 'text-gray-600 hover:bg-gray-100'
        }`
      }
    >
      {icon}
      {children}
    </NavLink>
  );
}

export function Layout() {
  const { profile, signOut } = useAuth();
  const isAdmin = profile?.role === 'admin';
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo.png" alt="Nutri Partners" width={150} height={29} className="shrink-0" />
            <span className="hidden md:block h-5 w-px bg-gray-200" aria-hidden="true" />
            <span className="hidden md:block text-sm font-medium text-gray-500 truncate">Neutralizacja dokumentów</span>
          </div>
          <div className="flex items-center gap-2">
            <NavLink
              to="/konto"
              className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
              title="Moje konto"
            >
              {isAdmin ? <Shield size={14} className="text-[#CC1F1F]" /> : <UserIcon size={14} />}
              <span className="max-w-[200px] truncate">{profile?.full_name || profile?.email}</span>
            </NavLink>
            <button
              onClick={() => void signOut()}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Wyloguj</span>
            </button>
          </div>
        </div>
        <nav className="max-w-[1400px] mx-auto px-4 sm:px-6 pb-3 flex gap-2 overflow-x-auto" aria-label="Nawigacja">
          <Tab to="/" icon={<FileText size={16} />}>Moje dokumenty</Tab>
          {isAdmin && <Tab to="/admin/dokumenty" icon={<Shield size={16} />}>Wszystkie dokumenty</Tab>}
          {isAdmin && <Tab to="/admin/uzytkownicy" icon={<Users size={16} />}>Użytkownicy</Tab>}
        </nav>
      </header>
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}

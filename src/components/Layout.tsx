import { NavLink, Outlet } from 'react-router-dom';
import { FileText, LogOut, Shield, User as UserIcon, Users } from 'lucide-react';
import { useAuth } from '../lib/auth';

/** On phones the tabs share the width equally and use the short label. */
function Tab({ to, icon, label, short }: { to: string; icon: React.ReactNode; label: string; short: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
          isActive ? 'bg-[#CC1F1F] text-white' : 'text-gray-600 hover:bg-gray-100'
        }`
      }
    >
      {icon}
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{label}</span>
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
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
              title="Moje konto"
              aria-label="Moje konto"
            >
              {isAdmin ? <Shield size={16} className="text-[#CC1F1F]" /> : <UserIcon size={16} />}
              <span className="hidden sm:inline max-w-[200px] truncate">{profile?.full_name || profile?.email}</span>
            </NavLink>
            <button
              onClick={() => void signOut()}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
              aria-label="Wyloguj"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Wyloguj</span>
            </button>
          </div>
        </div>
        <nav className="max-w-[1400px] mx-auto px-4 sm:px-6 pb-3 flex gap-1 sm:gap-2" aria-label="Nawigacja">
          <Tab to="/" icon={<FileText size={16} />} label="Moje dokumenty" short="Moje" />
          {isAdmin && <Tab to="/admin/dokumenty" icon={<Shield size={16} />} label="Wszystkie dokumenty" short="Wszystkie" />}
          {isAdmin && <Tab to="/admin/uzytkownicy" icon={<Users size={16} />} label="Użytkownicy" short="Użytkownicy" />}
        </nav>
      </header>
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}

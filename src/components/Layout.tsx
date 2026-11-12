import { NavLink, Outlet } from 'react-router-dom';
import { FileText, Shield, User as UserIcon } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useHeaderPhoto } from '../lib/headerPhoto';
import { HUB_URL, supabase } from '../lib/supabase';
import { AppHeader } from './AppHeader';
import { Footer } from './Footer';

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
  const photo = useHeaderPhoto(supabase, Boolean(profile));
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader
        appName="Document neutralizer"
        hubUrl={HUB_URL}
        user={profile && { name: profile.full_name, email: profile.email, role: isAdmin ? 'admin' : 'user', avatarUrl: photo }}
        onSignOut={() => void signOut()}
        nav={
          <nav className="flex gap-1 sm:gap-2" aria-label="Navigation">
            <Tab to="/" icon={<FileText size={16} />} label="My documents" short="Mine" />
            {isAdmin && <Tab to="/admin/dokumenty" icon={<Shield size={16} />} label="All documents" short="All" />}
            <Tab to="/konto" icon={<UserIcon size={16} />} label="My account" short="Account" />
          </nav>
        }
      />
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Outlet />
      </main>
      <Footer appName="Document neutralizer" hubUrl={HUB_URL} />
    </div>
  );
}

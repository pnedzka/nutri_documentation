import { HUB_URL } from '../lib/supabase';

// The same bottom bar as in the other Nutri Partners apps (whoisowner and the hub, src/components/Layout.tsx and
// Footer.tsx): who makes the app, the way back to the other apps and to My profile in the hub, and the version.

const footerLink =
  'inline-flex items-center min-h-11 sm:min-h-0 pointer-coarse:min-h-11 px-2 -mx-2 sm:mx-0 sm:px-0 rounded hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F]';

/** The build on screen: commit (to quote when reporting a problem) and, outside production, which environment. */
const COMMIT = (import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA as string | undefined)?.slice(0, 7) || 'local';
const ENVIRONMENT = (import.meta.env.VITE_VERCEL_ENV as string | undefined) || 'development';

/**
 * The bottom bar of every page. Quiet on purpose (small grey text), so it never competes with the content. Signed out
 * it shows no links, only who makes the app and the version.
 */
export function Footer({ links = true }: { links?: boolean }) {
  return (
    <footer className="mt-auto bg-white border-t border-gray-100 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 sm:py-3 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4 text-xs text-gray-500">
        <p className="text-center sm:text-left">
          © {new Date().getFullYear()} Nutri Partners <span className="text-gray-300">·</span> Document neutralizer
        </p>
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          {links && (
            <>
              <a href={HUB_URL} className={footerLink}>
                All apps
              </a>
              <a href={`${HUB_URL}/profile`} className={footerLink}>
                My profile
              </a>
            </>
          )}
          <span className="inline-flex items-center gap-1.5 text-gray-400" title={`Version ${COMMIT} (${ENVIRONMENT})`}>
            {ENVIRONMENT !== 'production' && (
              <span className="rounded-full bg-amber-50 border border-amber-200 px-1.5 py-px text-[11px] font-medium text-amber-800">
                {ENVIRONMENT === 'preview' ? 'Dev' : 'Local'}
              </span>
            )}
            Version {COMMIT}
          </span>
        </nav>
      </div>
    </footer>
  );
}

// Account e-mails (invitation, password reset). The app creates the one-time link itself with Supabase Auth
// (`generateLink`, which sends nothing) and sends the message through the Resend API, so no SMTP settings are needed
// in Supabase. The link leads straight to the app, which exchanges the token for a session (`verifyOtp`).

import { HttpError } from './http.js';
import { db } from './supabase.js';

export type AccountLinkKind = 'invite' | 'recovery';

const FROM = () => process.env.MAIL_FROM?.trim() || 'Nutri APEX <no-reply@nutripartners.co>';

/** Creates the one-time link. An invitation creates the account if it does not exist yet. */
export async function createAccountLink(kind: AccountLinkKind, email: string, appUrl: string, fullName?: string | null) {
  const { data, error } =
    kind === 'invite'
      ? await db().auth.admin.generateLink({ type: 'invite', email, options: { data: { full_name: fullName ?? null } } })
      : await db().auth.admin.generateLink({ type: 'recovery', email });
  if (error || !data.user || !data.properties?.hashed_token) return { error: error ?? new Error('Brak linku w odpowiedzi Supabase.') };
  const url = `${appUrl}/?${new URLSearchParams({ token_hash: data.properties.hashed_token, type: kind })}`;
  return { user: data.user, url };
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function message(kind: AccountLinkKind, email: string, url: string) {
  const invite = kind === 'invite';
  const subject = invite ? 'Zaproszenie do Nutri APEX' : 'Ustaw nowe hasło – Nutri APEX';
  const intro = invite
    ? 'założyliśmy dla Ciebie konto w Nutri APEX, aplikacji Nutri Partners do neutralizacji dokumentów dostawców.'
    : 'otrzymaliśmy prośbę o ustawienie nowego hasła do Twojego konta w Nutri APEX.';
  const button = invite ? 'Ustaw hasło i zaloguj się' : 'Ustaw nowe hasło';
  const after = invite
    ? 'Link jest jednorazowy i ważny przez ograniczony czas. Jeśli wygaśnie, na stronie logowania kliknij „Nie pamiętasz hasła?” i wpisz swój adres.'
    : 'Link jest jednorazowy i ważny przez ograniczony czas. Jeśli to nie Ty prosisz o zmianę hasła, zignoruj tę wiadomość – hasło się nie zmieni.';
  const text = `Dzień dobry,\n\n${intro}\nLogin: ${email}\n\n${button}: ${url}\n\n${after}\n\nNutri Partners`;
  const html = `<!DOCTYPE html>
<html lang="pl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f5" style="background-color:#f4f4f5;"><tr><td align="center" style="padding-top:32px;padding-bottom:32px;padding-left:16px;padding-right:16px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:560px;background-color:#ffffff;border-top:4px solid #a50029;">
<tr><td style="padding-top:28px;padding-bottom:8px;padding-left:32px;padding-right:32px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:26px;font-weight:bold;color:#1a1a1a;">Nutri APEX</td></tr>
<tr><td style="padding-top:8px;padding-bottom:0;padding-left:32px;padding-right:32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#1a1a1a;">
<p style="margin-top:0;margin-bottom:12px;">Dzień dobry,</p>
<p style="margin-top:0;margin-bottom:12px;">${escape(intro)}</p>
<p style="margin-top:0;margin-bottom:20px;">Login: <strong>${escape(email)}</strong></p>
</td></tr>
<tr><td style="padding-left:32px;padding-right:32px;padding-bottom:20px;"><table cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="#a50029" style="background-color:#a50029;padding-top:12px;padding-bottom:12px;padding-left:22px;padding-right:22px;"><a href="${escape(url)}" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;">${escape(button)}</a></td>
</tr></table></td></tr>
<tr><td style="padding-left:32px;padding-right:32px;padding-bottom:28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#6b7280;">
<p style="margin-top:0;margin-bottom:10px;">${escape(after)}</p>
<p style="margin-top:0;margin-bottom:0;">Jeśli przycisk nie działa, skopiuj ten adres do przeglądarki:<br><a href="${escape(url)}" style="color:#a50029;word-break:break-all;">${escape(url)}</a></p>
</td></tr>
<tr><td style="padding-top:14px;padding-bottom:14px;padding-left:32px;padding-right:32px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:17px;color:#6b7280;">Nutri Partners Sp. z o.o. · Prof. Ludwika Chmaja 6 str., 35-119 Rzeszów, Poland</td></tr>
</table></td></tr></table>
</body></html>`;
  return { subject, html, text };
}

/** Sends the account e-mail through Resend. Throws an HttpError with a Polish message. */
export async function sendAccountMail(kind: AccountLinkKind, email: string, url: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new HttpError(500, 'Wysyłka e-maili nie jest skonfigurowana (brak RESEND_API_KEY).');
  const { subject, html, text } = message(kind, email, url);
  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM(), to: [email], subject, html, text, tags: [{ name: 'type', value: kind }] }),
    });
  } catch (error) {
    console.error('[mail] network', error);
    throw new HttpError(502, 'Nie udało się połączyć z serwerem pocztowym. Spróbuj ponownie.');
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[mail] resend', res.status, detail);
    throw new HttpError(502, `Serwer pocztowy odrzucił wiadomość (${res.status}). Spróbuj ponownie później.`);
  }
}

// Account e-mails (invitation, password reset), sent through the Resend API. The sender is Nutri APEX, the company's
// AI assistant; the message says clearly that it concerns the "Neutralizacja dokumentów" system. Links come from
// accountLinks.ts.

import { LETTERHEAD } from '../../shared/letterhead.js';
import { LINK_VALIDITY_HOURS, type AccountLinkKind } from './accountLinks.js';
import { HttpError } from './http.js';

const FROM = () => process.env.MAIL_FROM?.trim() || 'Nutri APEX <no-reply@nutripartners.co>';
const SYSTEM = 'Neutralizacja dokumentów';
const ACCENT = LETTERHEAD.accent;

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const hours = (h: number) => (h === 1 ? '1 godzinę' : `${h} godziny`);

export interface AccountMail {
  kind: AccountLinkKind;
  email: string;
  url: string;
  appUrl: string;
  /** Who sent the invitation (administrator's name or e-mail). */
  invitedBy?: string | null;
}

export function accountMessage({ kind, email, url, appUrl, invitedBy }: AccountMail) {
  const invite = kind === 'invite';
  const validity = hours(LINK_VALIDITY_HOURS[kind]);
  const subject = invite ? `Zaproszenie do systemu ${SYSTEM} – Nutri Partners` : `${SYSTEM}: ustaw nowe hasło`;
  const paragraphs = invite
    ? [
        `Dzień dobry,`,
        `jestem Nutri APEX, asystent AI Nutri Partners. Zapraszam Cię do systemu ${SYSTEM}.`,
        `W systemie wgrywasz dokumenty od dostawców (specyfikacje, karty techniczne, świadectwa jakości), a w wyniku dostajesz ich zneutralizowaną wersję w języku angielskim na papierze firmowym Nutri Partners – bez danych dostawcy, z zachowaniem wszystkich danych technicznych.`,
      ]
    : [`Dzień dobry,`, `jestem Nutri APEX, asystent AI Nutri Partners. Otrzymałem prośbę o ustawienie nowego hasła do Twojego konta w systemie ${SYSTEM}.`];
  const button = invite ? 'Ustaw hasło i zaloguj się' : 'Ustaw nowe hasło';
  const after = invite
    ? `Link jest ważny ${validity} i działa jeden raz. Jeśli wygaśnie, na stronie logowania kliknij „Nie pamiętasz hasła?” i wpisz swój adres albo poproś administratora o nowe zaproszenie.`
    : `Link jest ważny ${validity} i działa jeden raz. Jeśli to nie Ty prosisz o zmianę hasła, zignoruj tę wiadomość – hasło się nie zmieni.`;
  const signature = `Tę wiadomość wysłał automatycznie Nutri APEX, asystent AI Nutri Partners, w imieniu systemu ${SYSTEM}. Prosimy na nią nie odpowiadać.`;
  const company = `${LETTERHEAD.legalName} · ${LETTERHEAD.address}`;

  const text = [
    ...paragraphs,
    '',
    `System: ${SYSTEM} (${appUrl})`,
    `Twój login: ${email}`,
    ...(invite && invitedBy ? [`Zaproszenie od: ${invitedBy}`] : []),
    '',
    `${button}: ${url}`,
    '',
    after,
    '',
    '—',
    signature,
    company,
  ].join('\n');

  const p = (s: string, extra = '') => `<p style="margin-top:0;margin-bottom:12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#1a1a1a;${extra}">${s}</p>`;
  const html = `<!DOCTYPE html>
<html lang="pl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f5" style="background-color:#f4f4f5;"><tr><td align="center" style="padding-top:32px;padding-bottom:32px;padding-left:16px;padding-right:16px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:560px;background-color:#ffffff;border-top:4px solid ${ACCENT};">
<tr><td style="padding-top:26px;padding-bottom:4px;padding-left:32px;padding-right:32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${ACCENT};">Nutri Partners · ${escape(invite ? 'Zaproszenie' : 'Zmiana hasła')}</td></tr>
<tr><td style="padding-top:2px;padding-bottom:18px;padding-left:32px;padding-right:32px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:28px;font-weight:bold;color:#1a1a1a;">${escape(SYSTEM)}</td></tr>
<tr><td style="padding-left:32px;padding-right:32px;">
${paragraphs.map((t) => p(escape(t))).join('\n')}
</td></tr>
<tr><td style="padding-left:32px;padding-right:32px;padding-bottom:20px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f6f7" style="background-color:#f6f6f7;"><tr><td style="padding-top:12px;padding-bottom:12px;padding-left:16px;padding-right:16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:#1a1a1a;">
System: <strong>${escape(SYSTEM)}</strong><br>
Adres: <a href="${escape(appUrl)}" style="color:${ACCENT};">${escape(appUrl.replace(/^https?:\/\//, ''))}</a><br>
Twój login: <strong>${escape(email)}</strong>${invite && invitedBy ? `<br>
Zaproszenie od: ${escape(invitedBy)}` : ''}
</td></tr></table>
</td></tr>
<tr><td style="padding-left:32px;padding-right:32px;padding-bottom:20px;"><table cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="${ACCENT}" style="background-color:${ACCENT};padding-top:12px;padding-bottom:12px;padding-left:22px;padding-right:22px;"><a href="${escape(url)}" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;">${escape(button)}</a></td>
</tr></table></td></tr>
<tr><td style="padding-left:32px;padding-right:32px;padding-bottom:24px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#6b7280;">
<p style="margin-top:0;margin-bottom:10px;">${escape(after)}</p>
<p style="margin-top:0;margin-bottom:0;">Jeśli przycisk nie działa, skopiuj ten adres do przeglądarki:<br><a href="${escape(url)}" style="color:${ACCENT};word-break:break-all;">${escape(url)}</a></p>
</td></tr>
<tr><td style="padding-top:14px;padding-bottom:16px;padding-left:32px;padding-right:32px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:17px;color:#6b7280;">
<p style="margin-top:0;margin-bottom:6px;"><strong style="color:#1a1a1a;">Nutri APEX</strong> · asystent AI Nutri Partners</p>
<p style="margin-top:0;margin-bottom:6px;">${escape(signature)}</p>
<p style="margin-top:0;margin-bottom:0;">${escape(company)}</p>
</td></tr>
</table></td></tr></table>
</body></html>`;
  return { subject, html, text };
}

/** Sends the account e-mail through Resend. Throws an HttpError with a Polish message. */
export async function sendAccountMail(mail: AccountMail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new HttpError(500, 'Wysyłka e-maili nie jest skonfigurowana (brak RESEND_API_KEY).');
  const { subject, html, text } = accountMessage(mail);
  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM(), to: [mail.email], subject, html, text, tags: [{ name: 'type', value: mail.kind }] }),
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

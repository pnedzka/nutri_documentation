import { describe, expect, it } from 'vitest';
import { accountMessage } from './mail.js';

const base = { email: 'jan@nutripartners.co', url: 'https://app.example/?link=abc&type=invite', appUrl: 'https://app.example' };

describe('accountMessage', () => {
  it('invitation: sent by Nutri APEX, clearly for the document neutralization system, valid 24 h', () => {
    const m = accountMessage({ ...base, kind: 'invite', invitedBy: 'Anna Kowalska' });
    expect(m.subject).toBe('Zaproszenie do systemu Neutralizacja dokumentów – Nutri Partners');
    expect(m.text).toContain('jestem Nutri APEX, asystent AI Nutri Partners. Zapraszam Cię do systemu Neutralizacja dokumentów.');
    expect(m.text).toContain('Twój login: jan@nutripartners.co');
    expect(m.text).toContain('Zaproszenie od: Anna Kowalska');
    expect(m.text).toContain('Link jest ważny 24 godziny');
    expect(m.text).toContain('35-021 Rzeszów');
    expect(m.html).toContain('href="https://app.example/?link=abc&amp;type=invite"');
  });

  it('password reset: valid 1 h, no inviter, values escaped in HTML', () => {
    const m = accountMessage({ ...base, kind: 'recovery', email: 'a<b>@x.co', invitedBy: 'x' });
    expect(m.subject).toBe('Neutralizacja dokumentów: ustaw nowe hasło');
    expect(m.text).toContain('Link jest ważny 1 godzinę');
    expect(m.text).not.toContain('Zaproszenie od');
    expect(m.html).toContain('a&lt;b&gt;@x.co');
    expect(m.html).not.toContain('a<b>@x.co');
  });
});

import { describe, expect, it } from 'vitest';
import { accountMessage } from './mail.js';

const base = { email: 'jan@nutripartners.co', url: 'https://app.example/?link=abc&type=invite', appUrl: 'https://app.example' };

describe('accountMessage', () => {
  it('invitation: sent by Nutri APEX, clearly for the document neutralization system, valid 24 h', () => {
    const m = accountMessage({ ...base, kind: 'invite', invitedBy: 'Anna Kowalska' });
    expect(m.subject).toBe('Invitation to Document Neutralization – Nutri Partners');
    expect(m.text).toContain("I'm Nutri APEX, the AI assistant of Nutri Partners. You're invited to the Document Neutralization system.");
    expect(m.text).toContain('Your login: jan@nutripartners.co');
    expect(m.text).toContain('Invited by: Anna Kowalska');
    expect(m.text).toContain('The link is valid for 24 hours');
    expect(m.text).toContain('35-021 Rzeszów');
    expect(m.html).toContain('href="https://app.example/?link=abc&amp;type=invite"');
  });

  it('password reset: valid 1 h, no inviter, values escaped in HTML', () => {
    const m = accountMessage({ ...base, kind: 'recovery', email: 'a<b>@x.co', invitedBy: 'x' });
    expect(m.subject).toBe('Document Neutralization: set a new password');
    expect(m.text).toContain('The link is valid for 1 hour ');
    expect(m.text).not.toContain('Invited by');
    expect(m.html).toContain('a&lt;b&gt;@x.co');
    expect(m.html).not.toContain('a<b>@x.co');
  });
});

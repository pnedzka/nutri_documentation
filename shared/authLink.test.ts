import { describe, expect, it } from 'vitest';
import { EXPIRED_LINK, parseAuthLink } from './authLink.js';

describe('parseAuthLink', () => {
  it('recognises invitation and password reset links', () => {
    expect(parseAuthLink('#access_token=abc&expires_in=3600&refresh_token=def&token_type=bearer&type=invite')).toEqual({ kind: 'invite' });
    expect(parseAuthLink('#access_token=abc&type=recovery')).toEqual({ kind: 'recovery' });
  });

  it('recognises links sent by the app with a one-time token', () => {
    expect(parseAuthLink('', '?token_hash=abc123&type=invite')).toEqual({ kind: 'invite', tokenHash: 'abc123' });
    expect(parseAuthLink('', '?token_hash=abc123&type=recovery')).toEqual({ kind: 'recovery', tokenHash: 'abc123' });
    expect(parseAuthLink('', '?token_hash=abc123&type=signup')).toBeNull();
    expect(parseAuthLink('', '?link=Zm9vYmFyYmF6cXV4cXV1eA&type=invite')).toEqual({ kind: 'invite', linkToken: 'Zm9vYmFyYmF6cXV4cXV1eA' });
  });

  it('ignores ordinary URLs and other sign-in links', () => {
    expect(parseAuthLink('')).toBeNull();
    expect(parseAuthLink('#section')).toBeNull();
    expect(parseAuthLink('#access_token=abc&type=magiclink')).toBeNull();
    expect(parseAuthLink('#type=invite')).toBeNull();
  });

  it('reports expired and invalid links', () => {
    expect(parseAuthLink('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')).toEqual({
      kind: 'error',
      message: EXPIRED_LINK,
    });
    expect(parseAuthLink('', '?error=server_error&error_description=Database+error')).toEqual({
      kind: 'error',
      message: 'This link is invalid (Database error).',
    });
  });
});

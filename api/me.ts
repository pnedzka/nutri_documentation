//   GET /api/me → { profile }
import { requireUser } from './_lib/auth.js';
import { handle, json } from './_lib/http.js';

export function GET(request: Request): Promise<Response> {
  return handle(async () => json({ profile: await requireUser(request) }));
}

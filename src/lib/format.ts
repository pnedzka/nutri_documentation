const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short' });

export const formatDateTime = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : '—');

export const ownerName = (owner: { email: string; full_name: string | null } | null | undefined) =>
  owner ? owner.full_name || owner.email : '—';

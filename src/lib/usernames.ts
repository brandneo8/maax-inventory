/**
 * Usernames: people can be added with a username and password, and an email
 * later. Supabase sign-in needs an email, so until a real one is added the
 * account uses a placeholder on the reserved `.invalid` domain (never
 * mailable, never shown).
 */
const PLACEHOLDER_EMAIL_DOMAIN = "users.pulse.invalid";

/** Lowercase letters, numbers, dots, dashes and underscores; 3–30 characters. */
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function placeholderEmail(username: string) {
  return `${normalizeUsername(username)}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPlaceholderEmail(email: string | null | undefined) {
  return Boolean(email?.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`));
}

/** The email to show for an account: blank while it only has the placeholder. */
export function realEmail(email: string | null | undefined) {
  return email && !isPlaceholderEmail(email) ? email : "";
}

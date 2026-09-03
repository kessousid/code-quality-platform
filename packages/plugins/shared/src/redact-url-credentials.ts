/**
 * Strips the userinfo component (`user[:pass]@`) from any URL embedded in
 * `text` — defense against a credential leaking into a thrown Error's
 * message and from there into logs/alert emails. Needed specifically
 * because a git clone's own progress output never echoes its source URL
 * on success, but its FATAL auth-failure message does ("could not read
 * Password for '<full URL, credential included>'") — confirmed live
 * (2026-09-03) when a staging git token went invalid: its raw value ended
 * up in Railway's persistent logs and a crash-alert email before this
 * existed. Generic on purpose (matches any `scheme://user@` or
 * `scheme://user:pass@`, not just GitHub's PAT-as-username convention) so
 * it also covers GitLab's `oauth2:token` form and any other git host.
 */
export function redactUrlCredentials(text: string): string {
  return text.replace(/(\w+:\/\/)[^\s@/]+@/g, '$1***REDACTED***@');
}

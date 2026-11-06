// One definition of "this staff account may hold a session in this realm".
// Login, MFA, passkey sign-in and per-request session validation all use it, so a
// sign-in can never mint a session that the next authenticated request rejects.

export function productionVerified(account, config) {
  if (config.nodeEnv !== 'production') return true;
  return Boolean(account.emailVerifiedAt) && account.verificationSource !== 'DEVELOPMENT_PREVIEW';
}

/**
 * Returns null when the account may authenticate, otherwise a diagnostic stage name
 * that is safe to log (it never contains identifiers or secrets).
 */
export function staffIneligibility(account, realm, config, { now = Date.now(), checkLock = false } = {}) {
  if (!account) return 'account_not_found';
  if (account.status !== 'ACTIVE') return 'account_inactive';
  if (!account.mfaEnabled) return 'mfa_disabled';
  if ((realm === 'owner') !== (account.role === 'OWNER')) return 'account_role_mismatch';
  if (checkLock && account.lockedUntil && new Date(account.lockedUntil).getTime() > now) return 'account_locked';
  if (!productionVerified(account, config)) return 'account_not_production_verified';
  return null;
}

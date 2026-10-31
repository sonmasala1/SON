export function classifyStartupFailure(error) {
  const message = error?.message || '';
  if (error?.code === 'MISSING_ENV_VARIABLE' || error?.code === 'ENOENT') return 'MISSING_ENV_VARIABLE';
  if (error?.code === 'INVALID_ENV_CONFIGURATION' || /Staff MFA encryption key|invalid Base64|Production staff security/.test(message)) return 'INVALID_SECURITY_CONFIGURATION';
  if (error?.code === 'MONGODB_URI_INVALID' || /MongoDB/.test(message)) return 'DATABASE_CONNECTION_FAILED';
  return 'startup_error';
}

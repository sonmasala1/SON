import mongoose from 'mongoose';
import { initializeModels, modelsAreReady } from './models.js';
import { logEvent } from '../services/logger.js';

mongoose.set('bufferCommands', false);

const retryBaseMs = 1000;
const retryMaxMs = 60000;
let activeUri = null;
let connectionPromise = null;
let retryTimer = null;
let retryCount = 0;
let initializationPromise = null;
let lastError = null;
let lastLoggedError = null;
let modelsInitialized = false;
let activeDatabaseName = null;

function errorChain(error) {
  const errors = [];
  const pending = error ? [error] : [];
  while (pending.length) {
    const current = pending.shift();
    if (!current || errors.includes(current)) continue;
    errors.push(current);
    if (current.cause) pending.push(current.cause);
    if (current.reason?.cause) pending.push(current.reason.cause);
    for (const server of current.reason?.servers?.values?.() || []) {
      if (server.error) pending.push(server.error);
    }
  }
  return errors;
}

export function classifyDatabaseError(error) {
  const errors = errorChain(error);
  const codes = errors.map(value => value.code || value.codeName).filter(Boolean);
  const messages = errors.map(value => value.message || '').join(' ');
  if (codes.includes('DATABASE_NAME_REQUIRED')) {
    return 'MongoDB URI has no database name and defaults to "test". Confirm the SON MASALA database before setting it in MONGODB_URI.';
  }
  if (codes.includes('DATABASE_CONTENT_MISMATCH')) {
    return 'The selected MongoDB database does not contain the existing SON MASALA products collection. No collections were created.';
  }
  if (codes.some(code => String(code).startsWith('ERR_SSL')) || /TLS handshake|SSL handshake/i.test(messages)) {
    return 'MongoDB TLS handshake failed before authentication. Check that your current public IP is allowed in Atlas Network Access, that the cluster is available, and that your firewall or VPN permits TLS on port 27017.';
  }
  if (codes.includes(86) || codes.includes('IndexKeySpecsConflict')) {
    return 'An existing MongoDB index conflicts with the application schema. Resolve the index migration before the API can become ready.';
  }
  if (codes.includes(18) || codes.includes('AuthenticationFailed')) {
    return 'MongoDB authentication failed. Check the Atlas database user credentials.';
  }
  if (/querySrv|ENOTFOUND|ENODATA/i.test(messages) || codes.some(code => ['ENOTFOUND', 'ENODATA', 'ESERVFAIL'].includes(code))) {
    return 'MongoDB DNS SRV lookup failed. Check configured DNS resolver access and the Atlas hostname.';
  }
  if (codes.includes('ECONNREFUSED') && /srv|dns/i.test(messages)) {
    return 'MongoDB DNS resolver refused the SRV lookup. Check configured DNS resolver access.';
  }
  if (codes.includes('ECONNREFUSED')) {
    return 'MongoDB connection was refused. Check Atlas network access and port 27017 reachability.';
  }
  if (/ServerSelectionError|server selection timed out|timed out/i.test(messages)) {
    return 'MongoDB server selection timed out. Check Atlas network access and cluster availability.';
  }
  if (codes.some(code => ['ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH'].includes(code))) {
    return 'MongoDB network connection failed. Check Atlas network access and cluster availability.';
  }
  return 'MongoDB connection unavailable. Check Atlas credentials, network access, and cluster availability.';
}

function setStateError(error) {
  lastError = error ? classifyDatabaseError(error) : null;
}

function isIndexDefinitionConflict(error) {
  return errorChain(error).some(value => value.code === 86 || value.codeName === 'IndexKeySpecsConflict');
}

function logEventOnce(event, message) {
  if (lastLoggedError === message) return;
  lastLoggedError = message;
  const diagnostic = /TLS/i.test(message) ? 'database_tls' : /authentication failed/i.test(message) ? 'database_authentication' : /DNS/i.test(message) ? 'database_dns' : /index/i.test(message) ? 'database_index_conflict' : /products collection/i.test(message) ? 'database_content_mismatch' : /database name|not configured|invalid/i.test(message) ? 'database_configuration' : /selection timed out/i.test(message) ? 'database_selection_timeout' : 'database_network';
  logEvent(event === 'disconnected' ? 'WARN' : 'ERROR', event === 'disconnected' ? 'database.disconnected' : event === 'configuration-error' ? 'database.configuration_error' : 'database.error', { reason: 'database_unavailable', diagnostic, code: event });
}

mongoose.connection.on('connected', () => {
  setStateError(null);
  if (activeUri && modelsInitialized) {
    lastLoggedError = null;
    logEvent('INFO', 'database.reconnected');
  }
});

mongoose.connection.on('reconnected', () => {
  setStateError(null);
  retryCount = 0;
  if (modelsInitialized) {
    lastLoggedError = null;
  }
});

mongoose.connection.on('disconnected', () => {
  if (!activeUri) return;
  setStateError(new Error('MongoDB connection disconnected'));
  logEventOnce('disconnected', `MongoDB connection unavailable: ${lastError}. Reconnecting with controlled backoff.`);
  scheduleRetry();
});

mongoose.connection.on('error', error => {
  if (!activeUri) return;
  setStateError(error);
  logEventOnce('connection-error', `MongoDB connection unavailable: ${lastError}. Retrying with controlled backoff.`);
});

export function getDatabaseStatus() {
  const readyState = mongoose.connection.readyState;
  const connected = readyState === 1 && (modelsInitialized || modelsAreReady()) && !lastError;
  const state = connected
    ? 'connected'
    : readyState === 2 || initializationPromise
      ? 'connecting'
      : readyState === 3
        ? 'disconnecting'
        : 'disconnected';
  return {
    connected,
    state,
    database: connected ? mongoose.connection.name : null,
    error: connected ? null : lastError,
  };
}

export function connectDatabase(uri, databaseNameOption = '') {
  if (!uri) return Promise.reject(new Error('MONGODB_URI is not configured.'));
  if (activeUri && activeUri !== uri) {
    return Promise.reject(new Error('A different MongoDB URI is already active for this process.'));
  }
  let databaseName;
  try {
    const uriDatabaseName = decodeURIComponent(new URL(uri).pathname.replace(/^\/+/, ''));
    if (databaseNameOption && uriDatabaseName && databaseNameOption !== uriDatabaseName) {
      return Promise.reject(new Error('MONGODB_DB_NAME does not match the database selected in MONGODB_URI.'));
    }
    databaseName = uriDatabaseName || databaseNameOption;
  } catch {
    const error = new Error('MONGODB_URI is invalid.');
    error.code = 'MONGODB_URI_INVALID';
    return Promise.reject(error);
  }
  if (!databaseName) {
    const error = new Error('MONGODB_URI has no explicit database name.');
    error.code = 'DATABASE_NAME_REQUIRED';
    return Promise.reject(error);
  }
  if (activeDatabaseName && activeDatabaseName !== databaseName) {
    return Promise.reject(new Error('A different MongoDB database is already active for this process.'));
  }
  activeUri = uri;
  activeDatabaseName = databaseName;
  if (mongoose.connection.readyState === 1) {
    if (mongoose.connection.name !== databaseName) return Promise.reject(new Error('Connected MongoDB database does not match MONGODB_URI.'));
    return Promise.resolve(mongoose.connection);
  }
  if (connectionPromise) return connectionPromise;

  connectionPromise = mongoose.connect(uri, {
    ...(databaseNameOption && !new URL(uri).pathname.replace(/^\/+/, '') ? { dbName: databaseNameOption } : {}),
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    heartbeatFrequencyMS: 10000,
  }).finally(() => {
    connectionPromise = null;
  });
  return connectionPromise;
}

async function initializeConnectedDatabase() {
  if (modelsInitialized) return;
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    const collections = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
    const existingNames = new Set(collections.map(collection => collection.name));
    if (!existingNames.has('products') && activeDatabaseName !== 'son_masala') {
      const error = new Error('The selected database is not an existing SON MASALA store.');
      error.code = 'DATABASE_CONTENT_MISMATCH';
      throw error;
    }
    await initializeModels();
    modelsInitialized = true;
    lastError = null;
    retryCount = 0;
    lastLoggedError = null;
    logEvent('INFO', 'database.connected');
  })().finally(() => {
    initializationPromise = null;
  });
  return initializationPromise;
}

function scheduleRetry() {
  if (!activeUri || retryTimer || connectionPromise || initializationPromise) return;
  const delay = Math.min(retryBaseMs * (2 ** retryCount), retryMaxMs);
  retryCount += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void maintainDatabaseConnection(activeUri, activeDatabaseName);
  }, delay);
  retryTimer.unref();
}

export async function maintainDatabaseConnection(uri, databaseName = '') {
  if (!uri) {
    lastError = 'MONGODB_URI is not configured.';
    logEventOnce('configuration-error', lastError);
    return false;
  }
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  try {
    await connectDatabase(uri, databaseName);
    await initializeConnectedDatabase();
    return true;
  } catch (error) {
    setStateError(error);
    logEventOnce(error.code || 'retryable-error', `MongoDB connection unavailable: ${lastError}. Retrying with controlled backoff.`);
    if (error.code === 'DATABASE_CONTENT_MISMATCH') {
      activeUri = null;
      activeDatabaseName = null;
      await mongoose.disconnect();
    } else if (!['DATABASE_NAME_REQUIRED', 'MONGODB_URI_INVALID'].includes(error.code) && !isIndexDefinitionConflict(error)) {
      scheduleRetry();
    }
    return false;
  }
}

export async function disconnectDatabase() {
  const wasConnected = mongoose.connection.readyState !== 0;
  activeUri = null;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryCount = 0;
  modelsInitialized = false;
  activeDatabaseName = null;
  lastError = null;
  lastLoggedError = null;
  await mongoose.disconnect();
  if (wasConnected) logEvent('INFO', 'database.disconnected');
}

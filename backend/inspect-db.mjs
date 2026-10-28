import mongoose from 'mongoose';
import { getEnv } from './src/config/env.js';
import { connectDatabase, disconnectDatabase, classifyDatabaseError } from './src/config/db.js';

// Check the same configuration as the API without creating collections or indexes.
try {
  const env = getEnv();
  await connectDatabase(env.MONGODB_URI, env.MONGODB_DB_NAME);
  await mongoose.connection.db.command({ ping: 1 });
  console.log(`MongoDB ping succeeded: ${mongoose.connection.name}`);
} catch (error) {
  console.error(classifyDatabaseError(error));
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}

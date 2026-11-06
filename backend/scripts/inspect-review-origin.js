// Read-only investigation: never initializes models, collections or indexes.
import mongoose from 'mongoose';
import dns from 'node:dns';
import { getEnv } from '../src/config/env.js';
const systemDns = dns.getServers();
const env = getEnv();
if (process.argv.includes('--system-dns')) dns.setServers(systemDns);
if (process.argv.includes('--https-dns')) {
  const query = async (hostname, type) => {
    const response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=${type}`, { signal: AbortSignal.timeout(10000) });
    const result = await response.json();
    if (result.Status !== 0 || !result.Answer) throw new Error('HTTPS DNS lookup unavailable');
    return result.Answer;
  };
  dns.promises.resolveSrv = async hostname => (await query(hostname, 'SRV')).filter(row => row.type === 33).map(row => {
    const [priority, weight, port, name] = row.data.split(' ');
    return { priority: Number(priority), weight: Number(weight), port: Number(port), name: name.replace(/\.$/, '') };
  });
  dns.promises.resolveTxt = async hostname => (await query(hostname, 'TXT')).filter(row => row.type === 16).map(row => [row.data.replace(/^"|"$/g, '')]);
}
try {
  console.log(JSON.stringify({ environment: env.NODE_ENV, database: new URL(env.MONGODB_URI).pathname.slice(1) || env.MONGODB_DB_NAME, remote: !/^mongodb:\/\/(localhost|127\.0\.0\.1)/.test(env.MONGODB_URI), authDevPreview: env.AUTH_DEV_PREVIEW }));
  await mongoose.connect(env.MONGODB_URI, { ...(env.MONGODB_DB_NAME ? { dbName: env.MONGODB_DB_NAME } : {}), serverSelectionTimeoutMS: 10000, autoCreate: false, autoIndex: false });
  const db = mongoose.connection.db;
  const reviews = await db.collection('reviews').find({ displayName: /^Anjali$/i }).toArray();
  for (const review of reviews) {
    const product = await db.collection('products').findOne({ _id: review.productId }, { projection: { name: 1, slug: 1, status: 1, isDemo: 1 } });
    const user = await db.collection('users').findOne({ _id: review.userId }, { projection: { name: 1, createdAt: 1, emailVerified: 1, phoneVerified: 1, emailVerificationSource: 1, phoneVerificationSource: 1 } });
    console.log(JSON.stringify({ review, product, user }));
    const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name);
    const sessionCollections = collections.filter(name => /customersessions|adminaudits|auditevents|auditlogs/i.test(name));
    for (const collection of sessionCollections) {
      const filter = /session/i.test(collection) ? { userId: review.userId } : { targetId: String(review._id) };
      console.log(JSON.stringify({ collection, records: await db.collection(collection).find(filter, { projection: { tokenHash: 0, csrfToken: 0 } }).limit(10).toArray() }));
    }
    console.log(JSON.stringify({ relatedNonDemoPaidOrders: await db.collection('orders').countDocuments({ userId: review.userId, isDemo: false, paymentStatus: 'PAID', 'items.productId': review.productId }) }));
  }
  console.log(JSON.stringify({ matchingReviews: reviews.length, reviewIndexes: await db.collection('reviews').indexes(), products: await db.collection('products').aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).toArray() }));
} catch (error) { console.error(JSON.stringify({ error: error.name, code: error.code, syscall: error.syscall })); process.exitCode = 1; }
finally { await mongoose.disconnect(); }

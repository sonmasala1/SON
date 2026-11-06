// Read-only comparison against the repository baseline. No model/index initialization.
import mongoose from 'mongoose';
import dns from 'node:dns';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { getEnv } from '../src/config/env.js';
import { listProducts } from '../src/services/productService.js';

const env = getEnv();
if (process.argv.includes('--https-dns')) {
  const lookup = async (name, type) => {
    const response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`, { signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    if (data.Status || !data.Answer) throw new Error('Diagnostic DNS unavailable');
    return data.Answer;
  };
  dns.promises.resolveSrv = async name => (await lookup(name, 'SRV')).filter(row => row.type === 33).map(row => {
    const [priority, weight, port, host] = row.data.split(' ');
    return { priority: Number(priority), weight: Number(weight), port: Number(port), name: host.replace(/\.$/, '') };
  });
  dns.promises.resolveTxt = async name => (await lookup(name, 'TXT')).filter(row => row.type === 16).map(row => [row.data.replace(/^"|"$/g, '')]);
}
try {
  await mongoose.connect(env.MONGODB_URI, { ...(env.MONGODB_DB_NAME ? { dbName: env.MONGODB_DB_NAME } : {}), autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10000 });
  const sourceURL = new URL('../src/services/productService.js', import.meta.url);
  const baseline = execFileSync('git', ['show', 'HEAD:backend/src/services/productService.js'], { encoding: 'utf8' }).replace(/from '(\.\.\/[^']+)'/g, (_, relative) => `from '${new URL(relative, sourceURL).href}'`);
  const before = await import(`data:text/javascript;base64,${Buffer.from(baseline).toString('base64')}`);
  const samples = [], fingerprints = [];
  for (const [name, implementation] of [['before', before.listProducts], ['after', listProducts], ['before', before.listProducts], ['after', listProducts]]) {
    const counts = {};
    mongoose.set('debug', (collection, method) => { const key = `${collection}.${method}`; counts[key] = (counts[key] || 0) + 1; });
    const start = performance.now();
    const result = await implementation({ page: 1, limit: 12 });
    samples.push({ name, ms: Math.round(performance.now() - start), products: result.products.length, queries: counts });
    fingerprints.push(JSON.stringify(result.products.map(product => ({ id: product._id, variants: product.variants.map(variant => ({ id: variant._id, stock: variant.stock, price: variant.unitPricePaise })) }))));
  }
  const files = ['../src/services/productService.js'].map(file => ({ file, bytes: readFileSync(new URL(file, import.meta.url)).length }));
  const report = { samples, equivalentPricesAndStock: fingerprints.every(value => value === fingerprints[0]), files };
  writeFileSync(new URL('../.runtime/catalogue-performance.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) { console.error(JSON.stringify({ error: error.name, code: error.code })); process.exitCode = 1; }
finally { mongoose.set('debug', false); await mongoose.disconnect(); }

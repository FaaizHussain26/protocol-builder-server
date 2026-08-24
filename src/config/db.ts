import mongoose from 'mongoose';
import { env } from './env';

// Live connection state, read straight from the driver (1 = connected).
//
// This is deliberately NOT cached in a boolean. A cached flag is a one-way latch:
// it flips false on 'disconnected'/'error', but the driver reconnects on its own
// without the app noticing, so the flag stays false and every persistence call
// 503s until the process is restarted — looking exactly like an Atlas allowlist
// problem when the network is in fact fine.
export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

// Accurate reason for a 503 when persistence is requested but unavailable.
export function dbUnavailableMessage(): string {
  if (!env.mongoUri) return 'MONGODB_URI is not configured on the server.';
  if (mongoose.connection.readyState === 2) return 'the database connection is still being established — please retry in a moment.';
  return 'the database is not reachable — check that the Atlas cluster is running (an idle free-tier cluster pauses itself) and that Network Access allows this server.';
}

// Connect to MongoDB if a URI is provided. Never throws — the server still boots
// without a database. The initial connect RETRIES every 15s, so once the cluster
// is reachable it connects on its own with no restart; after that the driver owns
// reconnection.
export async function connectMongo(uri: string): Promise<void> {
  if (!uri) return;

  mongoose.connection.on('connected', () => console.log('[db] MongoDB connected'));
  mongoose.connection.on('reconnected', () => console.log('[db] MongoDB reconnected'));
  mongoose.connection.on('disconnected', () => console.warn('[db] MongoDB disconnected — the driver will reconnect'));
  mongoose.connection.on('error', (err: unknown) => console.error('[db] MongoDB error:', (err as Error).message));

  const attempt = async (): Promise<void> => {
    if (mongoose.connection.readyState === 1) return; // already connected
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    } catch (err) {
      console.error('[db] connection failed — retrying in 15s:', (err as Error).message);
      setTimeout(() => { void attempt(); }, 15000);
    }
  };

  await attempt();
}

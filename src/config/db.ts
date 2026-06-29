import mongoose from 'mongoose';
import { env } from './env';

let connected = false;

export function isMongoConnected(): boolean {
  return connected && mongoose.connection.readyState === 1;
}

// Accurate reason for a 503 when persistence is requested but unavailable.
export function dbUnavailableMessage(): string {
  return env.mongoUri
    ? 'the database is not reachable yet — check the Atlas IP allowlist (Network Access) and that the cluster is running.'
    : 'MONGODB_URI is not configured on the server.';
}

// Connect to MongoDB if a URI is provided. Never throws — the server still boots
// without a database. On failure it RETRIES every 15s, so once the IP is
// whitelisted (or the cluster comes up) it connects on its own — no restart.
export async function connectMongo(uri: string): Promise<void> {
  if (!uri) return;

  mongoose.connection.on('disconnected', () => { connected = false; });
  mongoose.connection.on('error', () => { connected = false; });

  const attempt = async (): Promise<void> => {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
      connected = true;
      console.log('[db] MongoDB connected');
    } catch (err) {
      connected = false;
      console.error('[db] connection failed — retrying in 15s:', (err as Error).message);
      setTimeout(() => { void attempt(); }, 15000);
    }
  };

  await attempt();
}

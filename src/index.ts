import { createApp } from './app';
import { env, logConfigWarnings } from './config/env';
import { connectMongo } from './config/db';
import { ensureVectorIndex } from './services/memory.service';

async function main(): Promise<void> {
  logConfigWarnings();
  await connectMongo(env.mongoUri);
  await ensureVectorIndex();
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[server] listening on http://localhost:${env.port}`);
  });
}

void main();

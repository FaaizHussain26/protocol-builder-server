import { Router } from 'express';
import { azureConfigured } from '../config/env';
import { isMongoConnected } from '../config/db';
import { EMBED_MODEL, isEmbeddingsLoaded } from '../services/embeddings.service';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    ok: true,
    mongo: isMongoConnected(),
    azureConfigured,
    embeddings: { provider: 'local', model: EMBED_MODEL, loaded: isEmbeddingsLoaded() },
  });
});

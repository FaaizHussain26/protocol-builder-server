import dotenv from 'dotenv';

dotenv.config();

// Make the Mongo URI forgiving: if the password contains raw special characters
// (e.g. an '@' like "Godzilla@1"), URL-encode it automatically, and default the
// database name to "esource" when none is given. This lets you paste the Atlas
// connection string verbatim without hand-encoding.
export function normalizeMongoUri(raw: string): string {
  if (!raw) return raw;
  const m = /^(mongodb(?:\+srv)?:\/\/)([^/?]+)(\/[^?]*)?(\?.*)?$/.exec(raw);
  if (!m) return raw;
  let [, scheme, authority, path = '', query = ''] = m;
  const at = authority.lastIndexOf('@'); // host has no '@', so the last '@' splits creds from host
  if (at !== -1) {
    const creds = authority.slice(0, at);
    const host = authority.slice(at + 1);
    const colon = creds.indexOf(':');
    if (colon !== -1) {
      const user = creds.slice(0, colon);
      const pass = creds.slice(colon + 1);
      const needsEnc = (s: string) => /[@:/?#[\]]/.test(s);
      const encPass = needsEnc(pass) ? encodeURIComponent(pass) : pass;
      const encUser = needsEnc(user) ? encodeURIComponent(user) : user;
      authority = `${encUser}:${encPass}@${host}`;
    }
  }
  if (!path || path === '/') path = '/esource';
  return `${scheme}${authority}${path}${query}`;
}

export const env = {
  port: Number(process.env.PORT) || 8080,
  mongoUri: normalizeMongoUri(process.env.MONGODB_URI || ''),
  azure: {
    endpoint: (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, ''),
    apiKey: process.env.AZURE_OPENAI_API_KEY || '',
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1',
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-10-21',
  },
  corsOrigins: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

export const azureConfigured = !!env.azure.endpoint && !!env.azure.apiKey;

export function logConfigWarnings(): void {
  if (!azureConfigured) console.warn('[config] Azure OpenAI not configured — /api/build will fail until AZURE_OPENAI_* are set.');
  if (!env.mongoUri) console.warn('[config] MONGODB_URI not set — /api/studies persistence endpoints will return 503.');
}

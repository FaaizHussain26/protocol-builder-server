import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserDoc } from '../models/User.model';
import { env } from '../config/env';
import { HttpError } from '../middleware/errorHandler';
import { isMongoConnected, dbUnavailableMessage } from '../config/db';

function ensureDb(): void {
  if (!isMongoConnected()) throw new HttpError(503, `Persistence unavailable: ${dbUnavailableMessage()}`);
}

const BCRYPT_ROUNDS = 10;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'builder' | 'site';
  active: boolean;
}

export interface TokenPayload {
  sub: string;
  role: AuthUser['role'];
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function issueToken(user: AuthUser): string {
  if (!env.jwtSecret) throw new HttpError(500, 'Authentication is not configured on the server (JWT_SECRET missing).');
  const payload: TokenPayload = { sub: user.id, role: user.role };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

export function verifyToken(token: string): TokenPayload {
  if (!env.jwtSecret) throw new HttpError(500, 'Authentication is not configured on the server (JWT_SECRET missing).');
  try {
    return jwt.verify(token, env.jwtSecret) as TokenPayload;
  } catch {
    throw new HttpError(401, 'Invalid or expired session. Please log in again.');
  }
}

function toAuthUser(doc: InstanceType<typeof UserDoc>): AuthUser {
  return { id: String(doc._id), name: doc.get('name'), email: doc.get('email'), role: doc.get('role'), active: doc.get('active') };
}

export async function register(input: { name: string; email: string; password: string; inviteCode?: string }): Promise<{ user: AuthUser; token: string }> {
  ensureDb();
  const email = input.email.trim().toLowerCase();
  const existing = await UserDoc.findOne({ email });
  if (existing) throw new HttpError(409, 'An account with that email already exists.');

  const isFirstUser = (await UserDoc.countDocuments()) === 0;
  if (!isFirstUser) {
    if (!env.registrationInviteCode) throw new HttpError(403, 'Registration is closed — ask an admin for an invite code.');
    if (input.inviteCode !== env.registrationInviteCode) throw new HttpError(403, 'Invalid invite code.');
  }

  const passwordHash = await hashPassword(input.password);
  const doc = await UserDoc.create({
    name: input.name.trim(),
    email,
    passwordHash,
    role: isFirstUser ? 'admin' : 'site',
  });
  const user = toAuthUser(doc);
  return { user, token: issueToken(user) };
}

export async function login(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
  ensureDb();
  const doc = await UserDoc.findOne({ email: email.trim().toLowerCase() });
  if (!doc || !(await verifyPassword(password, doc.get('passwordHash')))) {
    throw new HttpError(401, 'Incorrect email or password.');
  }
  if (!doc.get('active')) throw new HttpError(403, 'This account has been deactivated.');
  const user = toAuthUser(doc);
  return { user, token: issueToken(user) };
}

export async function getUserById(id: string): Promise<AuthUser> {
  ensureDb();
  const doc = await UserDoc.findById(id);
  if (!doc) throw new HttpError(401, 'Account not found.');
  return toAuthUser(doc);
}

export async function listUsers(): Promise<AuthUser[]> {
  ensureDb();
  const docs = await UserDoc.find().sort({ createdAt: 1 });
  return docs.map(toAuthUser);
}

export async function updateUser(id: string, patch: { role?: AuthUser['role']; active?: boolean }): Promise<AuthUser> {
  ensureDb();
  const doc = await UserDoc.findByIdAndUpdate(id, patch, { new: true });
  if (!doc) throw new HttpError(404, 'User not found.');
  return toAuthUser(doc);
}

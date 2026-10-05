import type { Request, Response } from 'express';
import type { AppUserDoc } from './mongoHelpers';
import { isSuperAdminUser } from './mongoHelpers';
import {
  checkLoginRateLimit,
  clearLoginFailures,
  hashPassword,
  recordLoginFailure,
  setAuthCookie,
  signAuthToken,
  toUserProfile,
  validatePasswordPolicy,
  verifyPassword,
  verifyAuthToken,
  getTokenFromRequest,
  clearAuthCookie,
} from './authSecurity';

export type UserStoreDeps = {
  getAllUsers: () => Promise<AppUserDoc[]>;
  saveUser: (user: AppUserDoc) => Promise<AppUserDoc>;
};

export async function handleLoginRequest(req: Request, res: Response, deps: UserStoreDeps) {
  const { mobileNo, password } = req.body;

  if (!mobileNo || !password) {
    return res.status(400).json({ success: false, error: 'Mobile number and password are required.' });
  }

  const cleanMobile = String(mobileNo).trim();
  const rate = checkLoginRateLimit(req, cleanMobile);
  if (!rate.allowed) {
    return res.status(429).json({
      success: false,
      error: `Too many failed login attempts. Try again in ${rate.retryAfterSec} seconds.`,
    });
  }

  const allUsers = await deps.getAllUsers();
  const candidates = allUsers
    .filter((u) => u.mobileNo.trim() === cleanMobile)
    .sort((a, b) => (isSuperAdminUser(b) ? 1 : 0) - (isSuperAdminUser(a) ? 1 : 0));

  let matchedUser: AppUserDoc | undefined;
  for (const user of candidates) {
    if (await verifyPassword(String(password), user.password)) {
      matchedUser = user;
      break;
    }
  }

  if (!matchedUser) {
    recordLoginFailure(req, cleanMobile);
    return res.status(401).json({
      success: false,
      error: 'Invalid mobile number or password.',
    });
  }

  clearLoginFailures(req, cleanMobile);

  if (matchedUser.password && !matchedUser.password.startsWith('$2')) {
    matchedUser.password = await hashPassword(String(password));
    await deps.saveUser(matchedUser);
  }

  const profile = toUserProfile(matchedUser);
  const token = signAuthToken({
    sub: matchedUser.id,
    name: matchedUser.name,
    team: matchedUser.team || '',
    mobileNo: matchedUser.mobileNo,
    role: matchedUser.userType,
    isSuperAdmin: profile.isSuperAdmin,
  });

  setAuthCookie(res, token);
  return res.json({ success: true, user: profile });
}

export function handleLogoutRequest(_req: Request, res: Response) {
  clearAuthCookie(res);
  return res.json({ success: true, message: 'Logged out.' });
}

export function handleMeRequest(req: Request, res: Response) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Not authenticated.' });
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
  }
  return res.json({
    success: true,
    user: {
      id: payload.sub,
      name: payload.name,
      team: payload.team || '',
      mobileNo: payload.mobileNo,
      role: payload.role,
      isSuperAdmin: payload.isSuperAdmin,
      loggedInAt: new Date().toISOString(),
    },
  });
}

export async function hashPasswordForStorage(plain: string): Promise<string | { error: string }> {
  const policyError = validatePasswordPolicy(plain);
  if (policyError) return { error: policyError };
  return hashPassword(plain);
}

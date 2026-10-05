import type { Db } from 'mongodb';
import { verifyPassword } from './authSecurity';
import { SUPER_ADMIN_MOBILE, type AppUserDoc } from './mongoHelpers';

export const DEFAULT_SUPER_ADMIN_PASSWORD = '3112';

/** Default super admin — mobile login (not CPS). Password plain until first successful login. */
export const DEFAULT_SUPER_ADMIN: AppUserDoc = {
  id: 'usr-subash-superadmin',
  name: 'subash',
  mobileNo: SUPER_ADMIN_MOBILE,
  password: DEFAULT_SUPER_ADMIN_PASSWORD,
  userType: 'admin',
  isSuperAdmin: true,
  createdAt: new Date().toISOString(),
};

/** Insert or repair super admin so default mobile + password work after JSON sync / stale Atlas docs. */
export async function ensureSuperAdminUser(
  db: Db
): Promise<'inserted' | 'updated' | 'unchanged'> {
  const usersCol = db.collection<AppUserDoc>('users');
  const existing = await usersCol.findOne({ id: DEFAULT_SUPER_ADMIN.id });

  if (!existing) {
    await usersCol.insertOne({ ...DEFAULT_SUPER_ADMIN });
    return 'inserted';
  }

  const mobileOk = existing.mobileNo?.trim() === SUPER_ADMIN_MOBILE;
  const roleOk = existing.userType === 'admin' && existing.isSuperAdmin === true;
  const passwordOk =
    !!existing.password && (await verifyPassword(DEFAULT_SUPER_ADMIN_PASSWORD, existing.password));

  if (mobileOk && roleOk && passwordOk) {
    return 'unchanged';
  }

  await usersCol.updateOne(
    { id: DEFAULT_SUPER_ADMIN.id },
    {
      $set: {
        name: DEFAULT_SUPER_ADMIN.name,
        mobileNo: SUPER_ADMIN_MOBILE,
        password: DEFAULT_SUPER_ADMIN_PASSWORD,
        userType: 'admin',
        isSuperAdmin: true,
      },
    }
  );
  return 'updated';
}

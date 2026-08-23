import { cookies } from 'next/headers';
import { db } from './db';
import crypto from 'crypto';

export interface SessionUser {
  id: string;
  username: string;
  role: 'OWNER' | 'MANAGER';
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('auth_user_id')?.value;
    const role = cookieStore.get('auth_role')?.value;
    const username = cookieStore.get('auth_username')?.value;

    if (!userId || !role || !username) {
      return null;
    }

    // Verify user still exists and role matches
    const user = await db.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user || !user.active || user.role.name !== role) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role.name as 'OWNER' | 'MANAGER',
    };
  } catch (error) {
    console.error('Error fetching session:', error);
    return null;
  }
}

export async function loginUser(username: string, passwordHash: string): Promise<SessionUser | null> {
  const user = await db.user.findFirst({
    where: {
      username: { equals: username.toLowerCase() },
      passwordHash: passwordHash,
      active: true,
    },
    include: { role: true },
  });

  if (!user) {
    return null;
  }

  const sessionUser: SessionUser = {
    id: user.id,
    username: user.username,
    role: user.role.name as 'OWNER' | 'MANAGER',
  };

  const cookieStore = await cookies();
  cookieStore.set('auth_user_id', sessionUser.id, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 60 * 60 * 24 });
  cookieStore.set('auth_role', sessionUser.role, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 60 * 60 * 24 });
  cookieStore.set('auth_username', sessionUser.username, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 60 * 60 * 24 });

  return sessionUser;
}

export async function logoutUser() {
  const cookieStore = await cookies();
  cookieStore.delete('auth_user_id');
  cookieStore.delete('auth_role');
  cookieStore.delete('auth_username');
}

export async function requireAuth(allowedRoles?: ('OWNER' | 'MANAGER')[]) {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  if (allowedRoles && !allowedRoles.includes(session.role)) {
    throw new Error('Forbidden');
  }

  return session;
}

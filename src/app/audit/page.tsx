import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function AuditPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  redirect('/dashboard?tab=audit');
}

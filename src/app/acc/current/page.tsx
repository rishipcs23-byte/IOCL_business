import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AccCurrentPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  redirect('/dashboard?tab=current-duty');
}

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function StockPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  redirect('/dashboard?tab=reports&sub=stock');
}

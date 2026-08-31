import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getStaticData, getActiveDutySession, getDashboardStats, getHistoricalDuties, getStaffPerformanceReport, getCreditLedgerReport, getExpenseReport, getOilSalesReport, getOilPurchasesReport, getStockReport, getAuditLogs } from '@/lib/actions';
import DashboardContainer from '@/components/DashboardContainer';

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  // Fetch initial data on the server
  const staticData = await getStaticData();
  const activeDuty = await getActiveDutySession();
  const stats = await getDashboardStats();
  const historicalDuties = await getHistoricalDuties();
  
  // Reports data (we can also fetch these dynamically or initially)
  const staffPerformance = await getStaffPerformanceReport();
  const creditLedger = await getCreditLedgerReport();
  const expenses = await getExpenseReport();
  const oilSales = await getOilSalesReport();
  const oilPurchases = await getOilPurchasesReport();
  const stockHistory = await getStockReport();
  const auditLogs = session.role === 'OWNER' ? await getAuditLogs() : [];

  return (
    <DashboardContainer
      session={session}
      staticData={staticData}
      initialActiveDuty={activeDuty}
      stats={stats}
      initialHistoricalDuties={historicalDuties}
      initialStaffPerformance={staffPerformance}
      initialCreditLedger={creditLedger}
      initialExpenses={expenses}
      initialOilSales={oilSales}
      initialOilPurchases={oilPurchases}
      initialStockHistory={stockHistory}
      initialAuditLogs={auditLogs}
    />
  );
}

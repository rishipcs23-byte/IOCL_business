const { getStaticData, getActiveDutySession, getDashboardStats, getHistoricalDuties, getStaffPerformanceReport, getCreditLedgerReport, getExpenseReport, getOilSalesReport, getOilPurchasesReport, getStockReport, getAuditLogs } = require('./src/lib/actions');

async function testAll() {
  console.log('Testing actions...');
  try {
    const sData = await getStaticData();
    console.log('✓ getStaticData succeeded:', Object.keys(sData));

    const activeDuty = await getActiveDutySession();
    console.log('✓ getActiveDutySession succeeded');

    const stats = await getDashboardStats();
    console.log('✓ getDashboardStats succeeded');

    const historical = await getHistoricalDuties();
    console.log('✓ getHistoricalDuties succeeded:', historical.length);

    const staffPerf = await getStaffPerformanceReport();
    console.log('✓ getStaffPerformanceReport succeeded');

    const credit = await getCreditLedgerReport();
    console.log('✓ getCreditLedgerReport succeeded');

    const exp = await getExpenseReport();
    console.log('✓ getExpenseReport succeeded');

    const oilS = await getOilSalesReport();
    console.log('✓ getOilSalesReport succeeded');

    const oilP = await getOilPurchasesReport();
    console.log('✓ getOilPurchasesReport succeeded');

    const stock = await getStockReport();
    console.log('✓ getStockReport succeeded');

    const audit = await getAuditLogs();
    console.log('✓ getAuditLogs succeeded');

    console.log('\n🎉 ALL ACTIONS TESTED OK!');
  } catch (err) {
    console.error('❌ ACTION TEST FAILED:', err);
  }
}

testAll();

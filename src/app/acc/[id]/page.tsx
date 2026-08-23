import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getDutyReport } from '@/lib/actions';
import Link from 'next/link';
import { Fuel, Printer, ArrowLeft } from 'lucide-react';
import PrintButton from '@/components/PrintButton';

export default async function DutyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const { id } = await params;
  const duty = await getDutyReport(id);

  if (!duty) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center space-y-4 max-w-md">
          <h2 className="text-xl font-bold text-white">Duty Record Not Found</h2>
          <p className="text-slate-400 text-sm">The requested duty session ID does not exist in the database.</p>
          <Link href="/dashboard" className="inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const fuelSalesTotal = duty.meterReadings.reduce((sum, mr) => sum + mr.salesAmount, 0);
  const oilSalesTotal = duty.oilSales.reduce((sum, os) => sum + os.totalAmount, 0);
  const totalSales = fuelSalesTotal + oilSalesTotal;
  const cashExpenses = duty.expenses.filter(e => e.paymentMethod === 'Cash').reduce((sum, e) => sum + e.amount, 0);
  const creditSales = duty.creditTransactions.filter(t => t.transactionType === 'CREDIT_SALE').reduce((sum, t) => sum + t.amount, 0);
  const creditCollections = duty.creditTransactions.filter(t => t.transactionType === 'COLLECTION').reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 print:bg-white print:text-black">
      {/* Navigation & Header (Hidden on Print) */}
      <div className="max-w-4xl mx-auto flex items-center justify-between mb-8 print:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-200 transition-all">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
        
        <PrintButton />
      </div>

      {/* Main Invoice / Bill Area */}
      <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-8 md:p-12 shadow-2xl space-y-8 print:border-0 print:bg-white print:p-0 print:shadow-none">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-800 pb-8 print:border-slate-300">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white print:bg-black">
                <Fuel className="h-5 w-5" />
              </div>
              <span className="text-lg font-black tracking-wider uppercase">Petrol Bunk ACC</span>
            </div>
            <p className="text-xs text-slate-400 print:text-slate-500">Daily Accounting & Operational Report</p>
          </div>
          <div className="text-right space-y-1">
            <span className="inline-flex px-3 py-1 rounded bg-indigo-600/10 text-indigo-400 font-bold text-xs uppercase tracking-widest print:bg-slate-100 print:text-black">
              Session #{duty.dutyNumber}
            </span>
            <p className="text-xs text-slate-400 print:text-slate-500 mt-2">Status: <strong className="uppercase text-emerald-400 print:text-black">{duty.status}</strong></p>
          </div>
        </div>

        {/* Shift Details */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-xs bg-slate-950 p-6 rounded-2xl border border-slate-850 print:bg-slate-50 print:border-slate-200 print:text-black">
          <div>
            <span className="text-slate-450 block font-bold uppercase tracking-wider text-[10px]">Manager</span>
            <span className="font-bold text-slate-200 print:text-black">{duty.manager.username}</span>
          </div>
          <div>
            <span className="text-slate-450 block font-bold uppercase tracking-wider text-[10px]">Shift Opened</span>
            <span className="font-mono text-slate-200 print:text-black">{new Date(duty.startTime).toLocaleString()}</span>
          </div>
          <div>
            <span className="text-slate-450 block font-bold uppercase tracking-wider text-[10px]">Shift Closed</span>
            <span className="font-mono text-slate-200 print:text-black">{duty.endTime ? new Date(duty.endTime).toLocaleString() : 'N/A'}</span>
          </div>
          <div>
            <span className="text-slate-450 block font-bold uppercase tracking-wider text-[10px]">Staff Assigned</span>
            <span className="font-bold text-slate-200 print:text-black">{duty.assignments.length} persons</span>
          </div>
        </div>

        {/* Meter Readings */}
        <div className="space-y-4">
          <h4 className="font-extrabold text-white text-sm uppercase tracking-wider print:text-black">1. Fuel Meter Log Readings</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs print:text-black">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-850 text-slate-400 uppercase font-bold print:bg-slate-100 print:border-slate-300">
                  <th className="p-3">Gun Name</th>
                  <th className="p-3">Fuel Type</th>
                  <th className="p-3 text-right">Previous Reading</th>
                  <th className="p-3 text-right">Current Reading</th>
                  <th className="p-3 text-right">Volume (Litres)</th>
                  <th className="p-3 text-right">Rate Used</th>
                  <th className="p-3 text-right">Sales Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 print:divide-slate-200">
                {duty.meterReadings.map((mr, idx) => (
                  <tr key={idx} className="hover:bg-slate-950/10">
                    <td className="p-3 font-semibold text-slate-200 print:text-black">{mr.gun.name}</td>
                    <td className="p-3 text-slate-350">{mr.gun.fuelType}</td>
                    <td className="p-3 text-right font-mono text-slate-400">{mr.previousReading.toFixed(2)}</td>
                    <td className="p-3 text-right font-mono text-slate-400">{mr.currentReading.toFixed(2)}</td>
                    <td className="p-3 text-right font-mono text-white font-bold print:text-black">{mr.litresSold.toFixed(2)} L</td>
                    <td className="p-3 text-right font-mono text-slate-400">₹{mr.priceUsed.toFixed(2)}</td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-400 print:text-black">₹{mr.salesAmount.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-950/30 font-bold print:bg-slate-50">
                  <td colSpan={4} className="p-3 text-slate-300 print:text-black">Total Fuel Sales</td>
                  <td className="p-3 text-right font-mono text-white print:text-black">
                    {duty.meterReadings.reduce((sum, mr) => sum + mr.litresSold, 0).toFixed(2)} L
                  </td>
                  <td className="p-3"></td>
                  <td className="p-3 text-right font-mono text-indigo-400 print:text-black">
                    ₹{fuelSalesTotal.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Oil & Lubricants */}
        {duty.oilSales.length > 0 && (
          <div className="space-y-4">
            <h4 className="font-extrabold text-white text-sm uppercase tracking-wider print:text-black">2. Oil & Lubricant Sales</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs print:text-black">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-850 text-slate-400 uppercase font-bold print:bg-slate-100 print:border-slate-300">
                    <th className="p-3">Product Name</th>
                    <th className="p-3 text-right">Quantity</th>
                    <th className="p-3 text-right">Unit Price</th>
                    <th className="p-3 text-right">Total Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 print:divide-slate-200">
                  {duty.oilSales.map((os, idx) => (
                    <tr key={idx}>
                      <td className="p-3 font-semibold text-slate-200 print:text-black">{os.productName}</td>
                      <td className="p-3 text-right font-mono text-slate-350">{os.quantity}</td>
                      <td className="p-3 text-right font-mono text-slate-350">₹{os.unitPrice.toFixed(2)}</td>
                      <td className="p-3 text-right font-mono font-bold text-indigo-400 print:text-black">₹{os.totalAmount.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-950/30 font-bold print:bg-slate-50">
                    <td colSpan={3} className="p-3 text-slate-300 print:text-black">Total Oil Sales</td>
                    <td className="p-3 text-right font-mono text-indigo-400 print:text-black">₹{oilSalesTotal.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Payouts / Expenses */}
        {duty.expenses.length > 0 && (
          <div className="space-y-4">
            <h4 className="font-extrabold text-white text-sm uppercase tracking-wider print:text-black">3. Shift Operating Expenses</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs print:text-black">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-850 text-slate-400 uppercase font-bold print:bg-slate-100 print:border-slate-300">
                    <th className="p-3">Category</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Payment Method</th>
                    <th className="p-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 print:divide-slate-200">
                  {duty.expenses.map((ex, idx) => (
                    <tr key={idx}>
                      <td className="p-3 font-semibold text-slate-200 print:text-black">{ex.category.name}</td>
                      <td className="p-3 text-slate-350">{ex.description}</td>
                      <td className="p-3 text-slate-350 capitalize">{ex.paymentMethod}</td>
                      <td className="p-3 text-right font-mono font-bold text-red-405 print:text-black">₹{ex.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-950/30 font-bold print:bg-slate-50">
                    <td colSpan={3} className="p-3 text-slate-300 print:text-black">Total Shift Expenses</td>
                    <td className="p-3 text-right font-mono text-red-405 print:text-black">₹{duty.expenses.reduce((sum, e) => sum + e.amount, 0).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Customer Credit Ledger */}
        {duty.creditTransactions.length > 0 && (
          <div className="space-y-4">
            <h4 className="font-extrabold text-white text-sm uppercase tracking-wider print:text-black">4. Customer Credit Transactions</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs print:text-black">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-850 text-slate-400 uppercase font-bold print:bg-slate-100 print:border-slate-300">
                    <th className="p-3">Customer Account</th>
                    <th className="p-3">Mode</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 print:divide-slate-200">
                  {duty.creditTransactions.map((ct, idx) => (
                    <tr key={idx}>
                      <td className="p-3 font-semibold text-slate-200 print:text-black">{ct.customer.name}</td>
                      <td className="p-3">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          ct.transactionType === 'CREDIT_SALE' ? 'bg-amber-500/10 text-amber-400 print:text-black' : 'bg-emerald-500/10 text-emerald-400 print:text-black'
                        }`}>
                          {ct.transactionType}
                        </span>
                      </td>
                      <td className="p-3 text-slate-350">{ct.description || '-'}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-200 print:text-black">₹{ct.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Underground Dip Logs */}
        {duty.tankDips.length > 0 && (
          <div className="space-y-4">
            <h4 className="font-extrabold text-white text-sm uppercase tracking-wider print:text-black">5. Underground Dip stock variance</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {duty.tankDips.map((td, idx) => (
                <div key={idx} className="bg-slate-950 border border-slate-850 p-4 rounded-xl space-y-2 print:border-slate-300 print:bg-slate-50">
                  <div className="flex justify-between font-bold">
                    <span className="text-slate-400 print:text-black uppercase tracking-wider text-[10px]">{td.fuelType} Underground Tank</span>
                    <span className="text-indigo-400 print:text-black text-xs font-mono">{new Date(td.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs pt-2">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Expected Closing</span>
                      <span className="font-mono font-semibold text-slate-300 print:text-black">{td.expectedClosing.toFixed(2)} L</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Physical Dip</span>
                      <span className="font-mono font-semibold text-slate-300 print:text-black">{td.physicalDip.toFixed(2)} L</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Variance L</span>
                      <span className={`font-mono font-bold ${td.variance < 0 ? 'text-red-400 print:text-black' : 'text-slate-300 print:text-black'}`}>
                        {td.variance < 0 ? `-${Math.abs(td.variance).toFixed(2)} L` : `+${td.variance.toFixed(2)} L`}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Final Financial Settlement */}
        <div className="border-t border-slate-800 pt-8 print:border-slate-300">
          <h4 className="font-extrabold text-white text-sm uppercase tracking-wider mb-4 print:text-black">6. Shift Cash Settlement & Reconciliation</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-slate-950 p-8 rounded-3xl border border-slate-850 print:bg-slate-50 print:border-slate-200 print:text-black">
            
            <div className="space-y-2 text-xs font-semibold text-slate-350">
              <div className="flex justify-between">
                <span>Total Fuel Sales:</span>
                <span className="font-mono text-white print:text-black">₹{fuelSalesTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Oil Product Sales:</span>
                <span className="font-mono text-white print:text-black">₹{oilSalesTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
              <div className="flex justify-between border-t border-slate-900 pt-2 mt-2">
                <span>Total Revenue (Gross):</span>
                <span className="font-mono text-white print:text-black">₹{totalSales.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
              <div className="flex justify-between">
                <span>Less: Digital/UPI/Card Collections:</span>
                <span className="font-mono text-red-400 print:text-black">-₹{duty.expectedCash ? Math.max(0, (totalSales - duty.expectedCash - creditSales - cashExpenses + creditCollections)).toLocaleString(undefined, {minimumFractionDigits: 2}) : '0.00'}</span>
              </div>
              <div className="flex justify-between">
                <span>Less: Customer Credit Sales:</span>
                <span className="font-mono text-red-400 print:text-black">-₹{creditSales.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
              <div className="flex justify-between">
                <span>Less: Cash Operating Expenses:</span>
                <span className="font-mono text-red-400 print:text-black">-₹{cashExpenses.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
              <div className="flex justify-between">
                <span>Add: Cash Credit Collections:</span>
                <span className="font-mono text-emerald-450 print:text-black">+₹{creditCollections.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
            </div>

            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-3 text-center print:bg-white print:border-slate-300">
              <div>
                <span className="text-[10px] text-slate-450 font-bold uppercase tracking-widest block">Expected Cash Collection</span>
                <h3 className="text-2xl font-black text-white print:text-black mt-1">₹{duty.expectedCash.toLocaleString(undefined, {minimumFractionDigits: 2})}</h3>
              </div>
              <div>
                <span className="text-[10px] text-slate-450 font-bold uppercase tracking-widest block">Actual Cash Counted</span>
                <h3 className="text-2xl font-black text-white print:text-black mt-1">₹{duty.actualCash.toLocaleString(undefined, {minimumFractionDigits: 2})}</h3>
              </div>
              <div className="border-t border-slate-800 pt-3 mt-3">
                <span className="text-[10px] text-slate-450 font-bold uppercase tracking-widest block">Settlement Difference</span>
                <h3 className={`text-xl font-extrabold mt-1 ${
                  duty.cashDifference < 0 ? 'text-red-400 print:text-black' : duty.cashDifference > 0 ? 'text-emerald-400 print:text-black' : 'text-slate-400 print:text-black'
                }`}>
                  {duty.cashDifference < 0 ? `-₹${Math.abs(duty.cashDifference).toLocaleString()}` : duty.cashDifference > 0 ? `+₹${duty.cashDifference.toLocaleString()}` : '₹0.00 (BALANCED)'}
                </h3>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}

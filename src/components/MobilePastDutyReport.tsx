'use client';

import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, Settings, X, Activity, BarChart3, List, FileText } from 'lucide-react';

interface MobilePastDutyReportProps {
  analyticsSummary: any;
  filteredDuties: any[];
  periodLabel: string;
  targetDuty: any;
  settlement: any;
  handleSelectDuty: (dutyId: string) => void;
  renderFilters: () => React.ReactNode;
}

export default function MobilePastDutyReport({
  analyticsSummary,
  filteredDuties,
  periodLabel,
  targetDuty,
  settlement,
  handleSelectDuty,
  renderFilters
}: MobilePastDutyReportProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const totalPages = 4;

  const handleNext = () => setCurrentPage(p => Math.min(p + 1, totalPages));
  const handlePrev = () => setCurrentPage(p => Math.max(p - 1, 1));
  const handleSwipeLeft = () => handleNext();
  const handleSwipeRight = () => handlePrev();

  // Touch handlers for swipe
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  }

  const onTouchMove = (e: React.TouchEvent) => setTouchEnd(e.targetTouches[0].clientX);

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isLeftSwipe) {
      handleSwipeLeft();
    }
    if (isRightSwipe) {
      handleSwipeRight();
    }
  }

  const msTotal = analyticsSummary.totalMsLitres || 0;
  const hsdTotal = analyticsSummary.totalHsdLitres || 0;
  const totalFuel = analyticsSummary.totalFuelLitres || 0;
  const msPct = totalFuel > 0 ? Math.round((msTotal / totalFuel) * 100) : 0;
  const hsdPct = totalFuel > 0 ? 100 - msPct : 0;

  const renderPage1 = () => (
    <div className="flex-1 flex flex-col items-center justify-center space-y-6 p-6 animate-in slide-in-from-right-4 duration-300">
      <div className="text-center w-full mt-4">
        <h1 className="text-2xl font-black text-white uppercase tracking-wider mb-2">PAST DUTY REPORT</h1>
        <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl py-3 px-4 inline-block">
          <p className="text-lg font-bold text-indigo-400">{periodLabel}</p>
          <p className="text-sm font-semibold text-slate-400">{analyticsSummary.completedDutiesCount} DUTIES</p>
        </div>
      </div>

      <div className="w-full space-y-4 my-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center shadow-lg relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent"></div>
          <p className="text-sm font-extrabold text-slate-400 uppercase tracking-wider mb-2">Total Fuel</p>
          <p className="text-3xl font-black text-white font-mono">{totalFuel.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center shadow-lg relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent"></div>
          <p className="text-sm font-extrabold text-slate-400 uppercase tracking-wider mb-2">Total Sales</p>
          <p className="text-3xl font-black text-emerald-400 font-mono">₹{(analyticsSummary.totalFuelSales || 0).toLocaleString('en-IN')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 w-full">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 text-center">
          <p className="text-xs font-bold text-amber-500 mb-1">MS</p>
          <p className="text-lg font-black text-white font-mono">{msTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</p>
          <p className="text-[10px] text-slate-400 mt-2 font-mono">₹{(analyticsSummary.totalMsSales || 0).toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 text-center">
          <p className="text-xs font-bold text-blue-500 mb-1">HSD</p>
          <p className="text-lg font-black text-white font-mono">{hsdTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</p>
          <p className="text-[10px] text-slate-400 mt-2 font-mono">₹{(analyticsSummary.totalHsdSales || 0).toLocaleString('en-IN')}</p>
        </div>
      </div>
      
      <div className="text-center text-slate-500 text-xs mt-4 mb-4 animate-pulse">
        Swipe or tap Next &rarr;
      </div>
    </div>
  );

  const renderPage2 = () => (
    <div className="flex-1 flex flex-col p-6 animate-in slide-in-from-right-4 duration-300">
      <div className="mb-6">
        <h2 className="text-xl font-black text-white uppercase tracking-wider">Fuel Performance</h2>
        <p className="text-sm text-slate-400 mt-1">{periodLabel}</p>
      </div>

      <div className="flex-1 space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
          <div className="flex justify-between items-center pb-4 border-b border-slate-800">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Volume</p>
              <p className="text-2xl font-black text-white font-mono">{totalFuel.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Sales</p>
              <p className="text-2xl font-black text-emerald-400 font-mono">₹{(analyticsSummary.totalFuelSales || 0).toLocaleString('en-IN')}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-950 p-4 rounded-2xl border border-amber-500/20 text-center">
              <p className="text-lg font-black text-amber-500 mb-1">MS</p>
              <p className="text-xl font-bold text-white font-mono mb-2">{msTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</p>
              <div className="bg-amber-500/10 text-amber-400 text-sm font-bold py-1 px-3 rounded-full inline-block border border-amber-500/20">{msPct}%</div>
              <p className="text-[10px] font-mono text-slate-500 mt-3">₹{(analyticsSummary.totalMsSales || 0).toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-slate-950 p-4 rounded-2xl border border-blue-500/20 text-center">
              <p className="text-lg font-black text-blue-500 mb-1">HSD</p>
              <p className="text-xl font-bold text-white font-mono mb-2">{hsdTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</p>
              <div className="bg-blue-500/10 text-blue-400 text-sm font-bold py-1 px-3 rounded-full inline-block border border-blue-500/20">{hsdPct}%</div>
              <p className="text-[10px] font-mono text-slate-500 mt-3">₹{(analyticsSummary.totalHsdSales || 0).toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>

        {/* Simple Visual Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg">
           <p className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider">Product Mix Trend</p>
           <div className="h-6 w-full rounded-full flex overflow-hidden">
             <div style={{ width: `${msPct}%` }} className="bg-amber-500 transition-all"></div>
             <div style={{ width: `${hsdPct}%` }} className="bg-blue-500 transition-all"></div>
           </div>
        </div>
      </div>
    </div>
  );

  const renderPage3 = () => (
    <div className="flex-1 flex flex-col p-6 animate-in slide-in-from-right-4 duration-300">
      <div className="mb-6">
        <h2 className="text-xl font-black text-white uppercase tracking-wider">Duty Breakdown</h2>
        <p className="text-sm text-slate-400 mt-1">{filteredDuties.length} Duties matching filter</p>
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-4 pb-12">
         {filteredDuties.map((d: any) => {
            const dMs = d.meterReadings?.filter((mr: any) => mr.gun?.fuelType === 'MS' || String(mr.gunId).toUpperCase().includes('MS')).reduce((sum: number, mr: any) => sum + (mr.litresSold || (mr.currentReading - mr.previousReading) || 0), 0) || 0;
            const dHsd = d.meterReadings?.filter((mr: any) => mr.gun?.fuelType === 'HSD' || String(mr.gunId).toUpperCase().includes('HSD')).reduce((sum: number, mr: any) => sum + (mr.litresSold || (mr.currentReading - mr.previousReading) || 0), 0) || 0;
            const dTot = dMs + dHsd;
            
            const dMsSales = d.meterReadings?.filter((mr: any) => mr.gun?.fuelType === 'MS' || String(mr.gunId).toUpperCase().includes('MS')).reduce((sum: number, mr: any) => sum + (mr.salesAmount || ((mr.litresSold || (mr.currentReading - mr.previousReading)) * (mr.priceUsed || 112.15)) || 0), 0) || 0;
            const dHsdSales = d.meterReadings?.filter((mr: any) => mr.gun?.fuelType === 'HSD' || String(mr.gunId).toUpperCase().includes('HSD')).reduce((sum: number, mr: any) => sum + (mr.salesAmount || ((mr.litresSold || (mr.currentReading - mr.previousReading)) * (mr.priceUsed || 100.08)) || 0), 0) || 0;
            const dTotSales = dMsSales + dHsdSales;

            return (
              <div key={d.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg">
                <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-lg font-black text-white">DUTY #{d.dutyNumber}</h3>
                    <p className="text-xs text-slate-400">{new Date(d.startTime).toLocaleDateString('en-IN')}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${d.status === 'CLOSED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    {d.status}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm font-mono mb-5">
                  <div className="flex justify-between text-slate-300">
                    <span className="text-amber-500 font-bold">MS</span>
                    <span>{dMs.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-blue-500 font-bold">HSD</span>
                    <span>{dHsd.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</span>
                  </div>
                  <div className="col-span-2 flex justify-between font-bold text-white border-t border-slate-800 pt-2">
                    <span>TOTAL</span>
                    <span>{dTot.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</span>
                  </div>
                  <div className="col-span-2 flex justify-between font-black text-emerald-400 text-base bg-slate-950 p-2.5 rounded-xl mt-1 shadow-inner border border-slate-800/50">
                    <span>SALES</span>
                    <span>₹{dTotSales.toLocaleString('en-IN')}</span>
                  </div>
                </div>
                
                <button 
                  onClick={() => {
                    handleSelectDuty(d.id);
                    setCurrentPage(4);
                  }}
                  className="w-full bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 font-bold py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
                >
                  View Details <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            );
         })}
      </div>
    </div>
  );

  const renderPage4 = () => (
    <div className="flex-1 flex flex-col p-6 animate-in slide-in-from-right-4 duration-300">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-wider">Detailed Analysis</h2>
          <p className="text-sm text-slate-400 mt-1">{targetDuty && targetDuty.id !== 'ALL' ? `Duty #${targetDuty.dutyNumber}` : periodLabel}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pb-12">
        {targetDuty && targetDuty.id !== 'ALL' && settlement ? (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg">
               <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Financial Settlement</h3>
               <div className="space-y-3 text-sm font-mono">
                 <div className="flex justify-between"><span className="text-slate-400">Gross Inflow</span><span className="font-bold text-blue-400">₹{settlement.grossInflow.toLocaleString()}</span></div>
                 <div className="flex justify-between"><span className="text-slate-400">Digital Payments</span><span className="font-bold text-sky-400">₹{settlement.digitalPayments.totalDigital.toLocaleString()}</span></div>
                 <div className="flex justify-between"><span className="text-slate-400">Expected Cash</span><span className="font-bold text-emerald-400">₹{settlement.expectedCash.toLocaleString()}</span></div>
                 <div className="flex justify-between"><span className="text-slate-400">Actual Cash</span><span className="font-bold text-amber-400">₹{settlement.actualCash.toLocaleString()}</span></div>
                 <div className="flex justify-between border-t border-slate-800 pt-3"><span className="text-slate-400">Status</span><span className={`font-black ${settlement.settlementStatus === 'BALANCED' ? 'text-emerald-500' : 'text-rose-500'}`}>{settlement.settlementStatus}</span></div>
               </div>
            </div>
            
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg">
               <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Staff Assignment</h3>
               <div className="space-y-3 text-sm">
                 {settlement.assignmentsByPump.map((ap: any, idx: number) => (
                    <div key={idx} className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 shadow-inner">
                      <p className="font-bold text-indigo-400 text-xs mb-2">{ap.pumpName}</p>
                      <p className="text-slate-300 text-xs"><span className="text-amber-500 font-bold inline-block w-8">MS:</span> {ap.msStaff}</p>
                      <p className="text-slate-300 text-xs mt-1.5"><span className="text-blue-500 font-bold inline-block w-8">HSD:</span> {ap.hsdStaff}</p>
                    </div>
                 ))}
               </div>
            </div>
            <button onClick={() => setCurrentPage(1)} className="w-full mt-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors">
              Back to Summary
            </button>
          </div>
        ) : (
          <div className="space-y-4">
             {analyticsSummary.groupedList.map((g: any, idx: number) => (
                <div key={idx} className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-white text-lg">{g.label}</h3>
                    <span className="text-[10px] uppercase font-bold tracking-wider bg-slate-800 text-slate-300 px-2 py-1 rounded-lg">{g.dutiesCount} duties</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                     <div className="bg-slate-950 p-3 rounded-2xl text-center border border-slate-800/50">
                       <p className="text-slate-500 mb-1 font-bold">Vol (L)</p>
                       <p className="font-black text-white text-base">{g.totalLitres.toLocaleString()}</p>
                     </div>
                     <div className="bg-slate-950 p-3 rounded-2xl text-center border border-slate-800/50">
                       <p className="text-slate-500 mb-1 font-bold">Rev (₹)</p>
                       <p className="font-black text-emerald-400 text-base">{g.totalSales.toLocaleString()}</p>
                     </div>
                  </div>
                </div>
             ))}
             <button onClick={() => setCurrentPage(1)} className="w-full mt-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors">
               Back to Summary
             </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div 
      className="fixed inset-0 z-[100] bg-slate-950 flex flex-col overflow-hidden w-full h-full text-slate-200 block md:hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex justify-between items-center p-4 border-b border-slate-800/50 bg-slate-950/90 backdrop-blur-lg shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-indigo-500" />
          <span className="font-black tracking-widest text-sm text-slate-300">PAST REPORTS</span>
        </div>
        <button 
          onClick={() => setShowFilters(true)}
          className="bg-slate-800 hover:bg-slate-700 py-2 px-3 rounded-xl text-slate-300 transition-colors flex items-center gap-2 text-xs font-bold"
        >
          <Settings className="h-4 w-4" /> Filters
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col relative w-full h-full">
        {currentPage === 1 && renderPage1()}
        {currentPage === 2 && renderPage2()}
        {currentPage === 3 && renderPage3()}
        {currentPage === 4 && renderPage4()}
      </div>

      <div className="bg-slate-900 border-t border-slate-800 p-4 shrink-0 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] safe-area-bottom">
        <div className="flex justify-between items-center max-w-sm mx-auto">
          {currentPage === 1 ? (
            <div className="w-[84px]"></div>
          ) : (
            <button 
              onClick={handlePrev} 
              className="px-3 py-2 rounded-2xl flex items-center gap-1 font-bold text-indigo-400 hover:bg-indigo-500/10 active:bg-indigo-500/20 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" /> Back
            </button>
          )}
          
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map(p => (
              <div 
                key={p} 
                className={`h-2.5 rounded-full transition-all duration-300 ${p === currentPage ? 'w-6 bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]' : 'w-2.5 bg-slate-700'}`}
              ></div>
            ))}
          </div>

          {currentPage < totalPages ? (
            <button 
              onClick={handleNext}
              className="px-3 py-2 rounded-2xl flex items-center gap-1 font-bold text-indigo-400 hover:bg-indigo-500/10 active:bg-indigo-500/20 transition-colors"
            >
              Next <ChevronRight className="h-5 w-5" />
            </button>
          ) : (
             <div className="w-[84px]"></div>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="fixed inset-0 z-[110] bg-slate-950 flex flex-col animate-in slide-in-from-bottom-full duration-300">
          <div className="flex justify-between items-center p-5 border-b border-slate-800 bg-slate-950 shadow-md">
            <h2 className="text-xl font-black text-white">Report Filters</h2>
            <button onClick={() => setShowFilters(false)} className="p-2 bg-slate-800 rounded-full text-slate-300 hover:text-white transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 bg-slate-950">
             {renderFilters()}
             <div className="h-10"></div>
          </div>
          <div className="p-5 border-t border-slate-800 bg-slate-900 shrink-0 shadow-[0_-10px_20px_rgba(0,0,0,0.5)]">
             <button onClick={() => setShowFilters(false)} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold py-4 rounded-xl shadow-lg shadow-indigo-500/30 transition-all text-base tracking-wide">
               Apply & Close Filters
             </button>
          </div>
        </div>
      )}
    </div>
  );
}

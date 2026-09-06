'use client';

import React, { useState, useMemo } from 'react';
import { Users, Fuel, AlertTriangle, CheckCircle2, TrendingUp, Calendar, ChevronRight, UserCheck, UserX, Award } from 'lucide-react';
import UniversalFilterBar, { FilterState } from './ui/UniversalFilterBar';
import EmptyStateCard from './ui/EmptyStateCard';

interface StaffPerformanceReportProps {
  staffList: any[];
  historicalDuties: any[];
  staffPerformanceData: any[];
}

export default function StaffPerformanceReport({
  staffList = [],
  historicalDuties = [],
  staffPerformanceData = []
}: StaffPerformanceReportProps) {
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    dateShortcut: 'all',
    startDate: '',
    endDate: '',
    staffId: '',
    fuelType: '',
    pumpId: '',
    paymentType: '',
  });

  const handleFilterChange = (updated: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...updated }));
  };

  const handleClearFilters = () => {
    setFilters({
      searchQuery: '',
      dateShortcut: 'all',
      startDate: '',
      endDate: '',
      staffId: '',
      fuelType: '',
      pumpId: '',
      paymentType: '',
    });
    setSelectedStaffId(null);
  };

  // Filter duties based on date and staff filter
  const filteredDuties = useMemo(() => {
    return historicalDuties.filter((duty) => {
      // Date filter
      if (filters.startDate) {
        const dutyDate = new Date(duty.startTime).toISOString().split('T')[0];
        if (dutyDate < filters.startDate) return false;
      }
      if (filters.endDate) {
        const dutyDate = new Date(duty.startTime).toISOString().split('T')[0];
        if (dutyDate > filters.endDate) return false;
      }

      // Staff filter
      if (filters.staffId) {
        const staffInDuty = duty.meterReadings?.some(
          (mr: any) => mr.assignedStaffId === filters.staffId || mr.assignedStaff?.id === filters.staffId
        );
        if (!staffInDuty) return false;
      }

      // Fuel filter
      if (filters.fuelType) {
        const fuelInDuty = duty.meterReadings?.some(
          (mr: any) => mr.gun?.fuelType === filters.fuelType
        );
        if (!fuelInDuty) return false;
      }

      // Search query
      if (filters.searchQuery) {
        const q = filters.searchQuery.toLowerCase();
        const matchesDuty = duty.dutyNumber?.toString().includes(q);
        const matchesStaff = duty.meterReadings?.some((mr: any) =>
          mr.assignedStaff?.name?.toLowerCase().includes(q)
        );
        if (!matchesDuty && !matchesStaff) return false;
      }

      return true;
    });
  }, [historicalDuties, filters]);

  // Aggregate staff metrics strictly from filtered duties
  const staffSummary = useMemo(() => {
    const map = new Map<string, {
      id: string;
      name: string;
      dutiesCount: number;
      msLitres: number;
      hsdLitres: number;
      totalSalesAmount: number;
      shortageTotal: number;
      surplusTotal: number;
      dutyDates: Set<string>;
    }>();

    // Initialize all active staff members
    staffList.forEach((s) => {
      map.set(s.id, {
        id: s.id,
        name: s.name,
        dutiesCount: 0,
        msLitres: 0,
        hsdLitres: 0,
        totalSalesAmount: 0,
        shortageTotal: 0,
        surplusTotal: 0,
        dutyDates: new Set<string>(),
      });
    });

    // Accumulate metrics strictly from filtered duties
    filteredDuties.forEach((duty) => {
      const dutyDateStr = new Date(duty.startTime).toISOString().split('T')[0];
      const dutyShortage = (duty as any).shortageStaffId ? Number((duty as any).shortageAmount || 0) : 0;
      const shortageStaffId = (duty as any).shortageStaffId;

      // Track staff members assigned to this duty session to ensure 1 Duty Session = 1 Shift Count per Staff
      const staffInThisDuty = new Set<string>();

      duty.meterReadings?.forEach((mr: any) => {
        const staff = mr.assignedStaff;
        if (!staff) return;

        let entry = map.get(staff.id);
        if (!entry) {
          entry = {
            id: staff.id,
            name: staff.name,
            dutiesCount: 0,
            msLitres: 0,
            hsdLitres: 0,
            totalSalesAmount: 0,
            shortageTotal: 0,
            surplusTotal: 0,
            dutyDates: new Set<string>(),
          };
          map.set(staff.id, entry);
        }

        // Increment dutiesCount & dutyDates ONLY ONCE per duty session per staff member
        if (!staffInThisDuty.has(staff.id)) {
          staffInThisDuty.add(staff.id);
          entry.dutiesCount += 1;
          entry.dutyDates.add(dutyDateStr);
        }

        const litres = Number(mr.litresSold || 0);
        const amount = Number(mr.salesAmount || 0);

        if (mr.gun?.fuelType === 'MS') entry.msLitres += litres;
        if (mr.gun?.fuelType === 'HSD') entry.hsdLitres += litres;
        entry.totalSalesAmount += amount;
      });

      // Track shortages
      if (shortageStaffId && map.has(shortageStaffId)) {
        const staffEntry = map.get(shortageStaffId)!;
        if (dutyShortage > 0) staffEntry.shortageTotal += dutyShortage;
        if (dutyShortage < 0) staffEntry.surplusTotal += Math.abs(dutyShortage);
      }
    });

    return Array.from(map.values()).filter((s) => {
      if (filters.staffId && s.id !== filters.staffId) return false;
      return true;
    });
  }, [staffList, filteredDuties, filters]);

  const activeStaff = staffSummary.find((s) => s.id === selectedStaffId);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="google-hero p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-xs px-2.5 py-1 rounded-full font-medium border border-blue-200 dark:border-blue-800">
              Staff Analytics
            </span>
            <span className="text-xs text-[var(--text-muted)]">Continuous Duty Accounting</span>
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Staff Performance &amp; Attendance</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Metrics and duty history derived strictly from filtered duty sessions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-[var(--bg-surface-secondary)] px-4 py-2 rounded-2xl border border-[var(--border-color)] text-center">
            <div className="text-xs text-[var(--text-muted)] font-medium">Total Active Staff</div>
            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{staffSummary.length}</div>
          </div>
          <div className="bg-[var(--bg-surface-secondary)] px-4 py-2 rounded-2xl border border-[var(--border-color)] text-center">
            <div className="text-xs text-[var(--text-muted)] font-medium font-mono">Filtered Duties</div>
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{filteredDuties.length}</div>
          </div>
        </div>
      </div>

      {/* Universal Filter Component */}
      <UniversalFilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
        staffList={staffList}
        resultCount={staffSummary.length}
        showStaffFilter={true}
        showFuelFilter={true}
      />

      {/* Staff Performance Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {staffSummary.map((staff) => {
          const totalLitres = staff.msLitres + staff.hsdLitres;
          const daysPresent = staff.dutyDates.size;
          const isSelected = selectedStaffId === staff.id;

          return (
            <div
              key={staff.id}
              onClick={() => setSelectedStaffId(isSelected ? null : staff.id)}
              className={`cursor-pointer google-card p-5 transition-all hover:border-blue-500/50 ${
                isSelected
                  ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 shadow-md'
                  : ''
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 flex items-center justify-center font-bold text-sm">
                    {staff.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-[var(--text-primary)] text-sm">{staff.name}</h3>
                    <div className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>{daysPresent} Days Active</span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs bg-[var(--bg-surface-secondary)] text-[var(--text-primary)] px-2.5 py-1 rounded-lg border border-[var(--border-color)] font-mono">
                    {staff.dutiesCount} Shifts
                  </span>
                </div>
              </div>

              {/* Volume & Revenue breakdown */}
              <div className="grid grid-cols-2 gap-2 bg-[var(--bg-surface-secondary)] p-3 rounded-xl border border-[var(--border-color)] mb-3 text-xs">
                <div>
                  <div className="text-[var(--text-muted)]">MS (Petrol)</div>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400">{staff.msLitres.toLocaleString('en-IN')} L</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">HSD (Diesel)</div>
                  <div className="font-bold text-amber-600 dark:text-amber-400">{staff.hsdLitres.toLocaleString('en-IN')} L</div>
                </div>
              </div>

              {/* Shortage & Total Litres */}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-[var(--border-color)]">
                <div className="flex items-center gap-1">
                  <Fuel className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="text-[var(--text-muted)]">Total:</span>
                  <strong className="text-[var(--text-primary)] font-mono">{totalLitres.toLocaleString('en-IN')} L</strong>
                </div>

                {staff.shortageTotal > 0 ? (
                  <span className="text-rose-700 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800">
                    Shortage: ₹{staff.shortageTotal.toLocaleString('en-IN')}
                  </span>
                ) : (
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium">Clear Record ✓</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {staffSummary.length === 0 && (
        <EmptyStateCard
          title="No Staff Performance Data Found"
          description="No duty sessions match your selected filters or date range."
          actionText="Reset Filters"
          onActionClick={handleClearFilters}
          icon={Users}
        />
      )}

      {/* Staff Drill-Down Modal / Section */}
      {activeStaff && (
        <div className="google-card border-blue-500/40 p-6 shadow-xl animate-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-4 mb-4">
            <div>
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide">Detailed History</span>
              <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" /> {activeStaff.name}'s Duty Record
              </h3>
            </div>

            <button
              onClick={() => setSelectedStaffId(null)}
              className="btn-secondary text-xs"
            >
              Close History ✕
            </button>
          </div>

          {/* Duties Table for selected staff */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[var(--bg-surface-secondary)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-semibold uppercase tracking-wider">
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Duty #</th>
                  <th className="py-3 px-3">Guns Handled</th>
                  <th className="py-3 px-3 text-right">MS Litres</th>
                  <th className="py-3 px-3 text-right">HSD Litres</th>
                  <th className="py-3 px-3 text-right">Sales Revenue</th>
                  <th className="py-3 px-3 text-right">Shortage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {filteredDuties
                  .filter((duty) =>
                    duty.meterReadings?.some((mr: any) => mr.assignedStaff?.id === activeStaff.id)
                  )
                  .map((duty) => {
                    const staffReadings = duty.meterReadings?.filter(
                      (mr: any) => mr.assignedStaff?.id === activeStaff.id
                    );
                    const msSold = staffReadings?.reduce(
                      (sum: number, mr: any) => sum + (mr.gun?.fuelType === 'MS' ? mr.litresSold || 0 : 0),
                      0
                    );
                    const hsdSold = staffReadings?.reduce(
                      (sum: number, mr: any) => sum + (mr.gun?.fuelType === 'HSD' ? mr.litresSold || 0 : 0),
                      0
                    );
                    const rev = staffReadings?.reduce(
                      (sum: number, mr: any) => sum + (mr.salesAmount || 0),
                      0
                    );
                    const gunsList = staffReadings?.map((mr: any) => mr.gun?.name).join(', ');
                    const isShortageStaff = (duty as any).shortageStaffId === activeStaff.id;
                    const shortageAmt = isShortageStaff ? (duty as any).shortageAmount || 0 : 0;

                    return (
                      <tr key={duty.id} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
                        <td className="py-3 px-3 font-mono text-[var(--text-secondary)]">
                          {new Date(duty.startTime).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="py-3 px-3 font-bold text-blue-600 dark:text-blue-400">Duty #{duty.dutyNumber}</td>
                        <td className="py-3 px-3 text-[var(--text-secondary)]">{gunsList || '-'}</td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                          {msSold?.toLocaleString('en-IN')} L
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-amber-600 dark:text-amber-400">
                          {hsdSold?.toLocaleString('en-IN')} L
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-[var(--text-primary)]">
                          ₹{rev?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {shortageAmt > 0 ? (
                            <span className="text-rose-600 dark:text-rose-400 font-bold">₹{shortageAmt.toLocaleString('en-IN')}</span>
                          ) : (
                            <span className="text-[var(--text-muted)]">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

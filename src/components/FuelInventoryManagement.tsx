'use client';

import React, { useState, useEffect } from 'react';
import { 
  Fuel, 
  PlusCircle, 
  FileText, 
  History, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Filter, 
  RefreshCw,
  Sliders,
  Layers,
  Edit3,
  Trash2
} from 'lucide-react';
import { 
  addFuelReceiptAction, 
  getFuelInventoryAction, 
  setInitialFuelStockAction,
  updateFuelReceiptAction,
  deleteFuelReceiptAction,
  deleteFuelStockMovementAction
} from '@/lib/actions';

interface FuelInventoryProps {
  userRole?: string;
  initialStockMap?: Record<string, number>;
}

export default function FuelInventoryManagement({ userRole = 'MANAGER', initialStockMap }: FuelInventoryProps) {
  const [stock, setStock] = useState<Record<string, number>>(initialStockMap || { MS: 0, HSD: 0 });
  const [receipts, setReceipts] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  
  const [flashMsg, setFlashMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form State for Add Fuel Receipt
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [supplier, setSupplier] = useState<string>('IOCL Depot / Terminal');
  const [fuelType, setFuelType] = useState<'MS' | 'HSD'>('MS');
  const [quantityLitres, setQuantityLitres] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');

  // Initial Stock Modal State (Owner Only)
  const [showInitModal, setShowInitModal] = useState<boolean>(false);
  const [initFuelType, setInitFuelType] = useState<'MS' | 'HSD'>('MS');
  const [initQty, setInitQty] = useState<string>('');
  const [initSubmitting, setInitSubmitting] = useState<boolean>(false);

  // Edit Receipt Modal State
  const [editReceiptModal, setEditReceiptModal] = useState<boolean>(false);
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  const [editInvoiceNumber, setEditInvoiceNumber] = useState<string>('');
  const [editInvoiceDate, setEditInvoiceDate] = useState<string>('');
  const [editSupplier, setEditSupplier] = useState<string>('');
  const [editFuelType, setEditFuelType] = useState<'MS' | 'HSD'>('MS');
  const [editQuantityLitres, setEditQuantityLitres] = useState<string>('');
  const [editRemarks, setEditRemarks] = useState<string>('');
  const [editSubmitting, setEditSubmitting] = useState<boolean>(false);

  // Delete Confirm Modal State
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteConfirmType, setDeleteConfirmType] = useState<'RECEIPT' | 'MOVEMENT' | null>(null);
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState<string>('');
  const [deleteSubmitting, setDeleteSubmitting] = useState<boolean>(false);

  // Search & Filters
  const [movementFilter, setMovementFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getFuelInventoryAction();
      if (res.success) {
        setStock(res.currentStock || { MS: 0, HSD: 0 });
        setReceipts(res.receipts || []);
        setMovements(res.movements || []);
      }
    } catch (err: any) {
      setFlashMsg({ text: err.message || 'Failed to load fuel inventory data.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const triggerFlash = (text: string, type: 'success' | 'error') => {
    setFlashMsg({ text, type });
    setTimeout(() => setFlashMsg(null), 5000);
  };

  const handleAddReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceNumber.trim()) {
      triggerFlash('Invoice / Delivery Note Number is required.', 'error');
      return;
    }
    const qty = Number(quantityLitres);
    if (isNaN(qty) || qty <= 0) {
      triggerFlash('Quantity in litres must be greater than 0.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await addFuelReceiptAction({
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        supplier: supplier.trim(),
        fuelType,
        quantityLitres: qty,
        remarks: remarks.trim() || undefined,
      });

      if (res.success) {
        triggerFlash(`Successfully added fuel receipt of ${qty.toLocaleString()} L for ${fuelType} under Invoice #${invoiceNumber.trim()}`, 'success');
        setInvoiceNumber('');
        setQuantityLitres('');
        setRemarks('');
        await loadData();
      }
    } catch (err: any) {
      triggerFlash(err.message || 'Failed to add fuel receipt.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (m: any) => {
    if (m.fuelReceipt) {
      setEditingReceiptId(m.fuelReceipt.id);
      setEditInvoiceNumber(m.fuelReceipt.invoiceNumber);
      setEditInvoiceDate(new Date(m.fuelReceipt.invoiceDate || m.createdAt).toISOString().split('T')[0]);
      setEditSupplier(m.fuelReceipt.supplier || 'IOCL Depot / Terminal');
      setEditFuelType(m.fuelType as 'MS' | 'HSD');
      setEditQuantityLitres(String(m.quantityLitres));
      setEditRemarks(m.fuelReceipt.remarks || '');
      setEditReceiptModal(true);
    }
  };

  const handleSaveEditReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReceiptId) return;
    if (!editInvoiceNumber.trim()) {
      triggerFlash('Invoice number is required.', 'error');
      return;
    }
    const qty = Number(editQuantityLitres);
    if (isNaN(qty) || qty <= 0) {
      triggerFlash('Quantity in litres must be greater than 0.', 'error');
      return;
    }

    setEditSubmitting(true);
    try {
      const res = await updateFuelReceiptAction(editingReceiptId, {
        invoiceNumber: editInvoiceNumber.trim(),
        invoiceDate: editInvoiceDate,
        supplier: editSupplier.trim(),
        fuelType: editFuelType,
        quantityLitres: qty,
        remarks: editRemarks.trim() || undefined,
      });

      if (res.success) {
        triggerFlash(`Successfully updated receipt invoice #${editInvoiceNumber.trim()}`, 'success');
        setEditReceiptModal(false);
        setEditingReceiptId(null);
        await loadData();
      }
    } catch (err: any) {
      triggerFlash(err.message || 'Failed to update fuel receipt.', 'error');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmId || !deleteConfirmType) return;
    setDeleteSubmitting(true);
    try {
      if (deleteConfirmType === 'RECEIPT') {
        const res = await deleteFuelReceiptAction(deleteConfirmId);
        if (res.success) {
          triggerFlash('Fuel receipt and associated stock movement deleted successfully.', 'success');
        }
      } else {
        const res = await deleteFuelStockMovementAction(deleteConfirmId);
        if (res.success) {
          triggerFlash('Stock movement entry deleted successfully.', 'success');
        }
      }
      setDeleteConfirmId(null);
      setDeleteConfirmType(null);
      await loadData();
    } catch (err: any) {
      triggerFlash(err.message || 'Failed to delete entry.', 'error');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleSetInitialStock = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(initQty);
    if (isNaN(qty) || qty < 0) {
      triggerFlash('Initial baseline stock must be 0 or greater.', 'error');
      return;
    }

    setInitSubmitting(true);
    try {
      const res = await setInitialFuelStockAction(initFuelType, qty);
      if (res.success) {
        triggerFlash(`Baseline initial stock for ${initFuelType} set to ${qty.toLocaleString()} L`, 'success');
        setShowInitModal(false);
        setInitQty('');
        await loadData();
      }
    } catch (err: any) {
      triggerFlash(err.message || 'Failed to update initial stock.', 'error');
    } finally {
      setInitSubmitting(false);
    }
  };

  // Filtered movements
  const filteredMovements = movements.filter((m) => {
    const matchesType = movementFilter === 'ALL' || m.fuelType === movementFilter || m.movementType === movementFilter;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      m.fuelType.toLowerCase().includes(q) ||
      m.movementType.toLowerCase().includes(q) ||
      (m.fuelReceipt?.invoiceNumber && m.fuelReceipt.invoiceNumber.toLowerCase().includes(q)) ||
      (m.dutySession?.dutyNumber && String(m.dutySession.dutyNumber).includes(q));
    return matchesType && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header Notification Banner */}
      {flashMsg && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-xs font-bold ${
          flashMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center gap-2">
            {flashMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />}
            <span>{flashMsg.text}</span>
          </div>
          <button onClick={() => setFlashMsg(null)} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
      )}

      {/* HEADER BANNER - Google Style */}
      <div className="google-hero p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-200 dark:border-blue-800 flex items-center justify-center shrink-0 shadow-sm">
            <Fuel className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Fuel Inventory &amp; Tank Stock</h2>
            <p className="text-xs text-[var(--text-muted)] font-medium mt-0.5">Underground tank stock tracking, fuel tanker receipts &amp; automated duty dispensing ledger</p>
          </div>
        </div>
      </div>

      {/* SECTION 1: UNDERGROUND FUEL STOCK LEDGER SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* MS PETROL STOCK CARD */}
        <div className="google-card p-6 space-y-4">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 font-bold text-sm">
                MS
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">MS Petrol Underground Stock</h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Automated Real-Time Volume</span>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 border border-amber-200 text-amber-800">
              ACTIVE LEDGER
            </span>
          </div>

          <div className="flex items-baseline justify-between border-y border-slate-100 py-4">
            <div>
              <span className="text-xs text-slate-500 font-medium block">Current Tank Volume</span>
              <span className="font-mono text-3xl font-bold text-amber-700">
                {(stock.MS || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-sm font-sans font-bold text-slate-500 ml-1.5">Litres</span>
              </span>
            </div>
            {userRole === 'OWNER' && (
              <button
                onClick={() => { setInitFuelType('MS'); setShowInitModal(true); }}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                Set Baseline
              </button>
            )}
          </div>

          <div className="flex justify-between items-center text-xs text-slate-500 font-medium">
            <span>Deduction: <strong className="text-slate-800">Per Duty Shift Sales</strong></span>
            <span>Receipts: <strong className="text-emerald-700 font-semibold">Invoices Added</strong></span>
          </div>
        </div>

        {/* HSD DIESEL STOCK CARD */}
        <div className="google-card p-6 space-y-4">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 font-bold text-sm">
                HSD
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">HSD Diesel Underground Stock</h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Automated Real-Time Volume</span>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 border border-blue-200 text-blue-800">
              ACTIVE LEDGER
            </span>
          </div>

          <div className="flex items-baseline justify-between border-y border-slate-100 py-4">
            <div>
              <span className="text-xs text-slate-500 font-medium block">Current Tank Volume</span>
              <span className="font-mono text-3xl font-bold text-blue-700">
                {(stock.HSD || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-sm font-sans font-bold text-slate-500 ml-1.5">Litres</span>
              </span>
            </div>
            {userRole === 'OWNER' && (
              <button
                onClick={() => { setInitFuelType('HSD'); setShowInitModal(true); }}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                Set Baseline
              </button>
            )}
          </div>

          <div className="flex justify-between items-center text-xs text-slate-500 font-medium">
            <span>Deduction: <strong className="text-slate-800">Per Duty Shift Sales</strong></span>
            <span>Receipts: <strong className="text-emerald-700 font-semibold">Invoices Added</strong></span>
          </div>
        </div>
      </div>

      {/* SECTION 2: ADD FUEL RECEIPT (DELIVERY INVOICE ENTRY) */}
      <div className="google-card p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-600">
              <PlusCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Record Tanker Delivery / Fuel Receipt</h3>
              <p className="text-xs text-slate-500 font-medium">Enter new fuel tank delivery invoice details in volume litres (Non-monetary inventory receipt)</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 border border-blue-200 text-blue-700">
            VOLUME RECEIPT ENTRY
          </span>
        </div>

        <form onSubmit={handleAddReceipt} className="space-y-4">
          <div className="form-section">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label htmlFor="invoice-no" className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">
                  INVOICE / DELIVERY NOTE # *
                </label>
                <input
                  id="invoice-no"
                  type="text"
                  required
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="e.g. INV-2026-8890"
                  className="google-input w-full font-mono"
                />
              </div>

              <div>
                <label htmlFor="invoice-date" className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">
                  INVOICE DATE *
                </label>
                <input
                  id="invoice-date"
                  type="date"
                  required
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="google-input w-full"
                />
              </div>

              <div>
                <label htmlFor="supplier" className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">
                  DEPOT / SUPPLIER NAME *
                </label>
                <input
                  id="supplier"
                  type="text"
                  required
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="IOCL Terminal / Depot"
                  className="google-input w-full"
                />
              </div>

              <div>
                <label htmlFor="fuel-type-select" className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">
                  FUEL PRODUCT *
                </label>
                <select
                  id="fuel-type-select"
                  value={fuelType}
                  onChange={(e) => setFuelType(e.target.value as 'MS' | 'HSD')}
                  className="google-input w-full font-bold"
                >
                  <option value="MS">MS - Petrol (Motor Spirit)</option>
                  <option value="HSD">HSD - Diesel (High Speed Diesel)</option>
                </select>
              </div>

              <div>
                <label htmlFor="qty-litres" className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">
                  QUANTITY RECEIVED (LITRES) *
                </label>
                <div className="relative">
                  <input
                    id="qty-litres"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={quantityLitres}
                    onChange={(e) => setQuantityLitres(e.target.value)}
                    placeholder="e.g. 12000"
                    className="google-input w-full font-mono font-bold pr-16"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-slate-400 font-semibold">Litres</span>
                </div>
              </div>

              <div>
                <label htmlFor="remarks" className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">
                  REMARKS / TANKER TRUCK #
                </label>
                <input
                  id="remarks"
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Optional delivery details or TT number"
                  className="google-input w-full"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary py-2.5"
            >
              {submitting ? 'Recording Receipt...' : 'Add Fuel Receipt to Tank Inventory'}
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 3: FUEL STOCK MOVEMENT AUDIT LEDGER */}
      <div className="google-card p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-600">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Fuel Inventory Stock Movement Ledger</h3>
              <p className="text-xs text-slate-500 font-medium">Complete audit trail of tanker receipts and automated duty shift dispensing deductions</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ledger..."
                className="google-input pl-8 pr-3 py-2 text-xs"
              />
            </div>

            <select
              value={movementFilter}
              onChange={(e) => setMovementFilter(e.target.value)}
              className="google-input py-2 px-3 text-xs font-semibold"
            >
              <option value="ALL">All Products</option>
              <option value="MS">MS Petrol Only</option>
              <option value="HSD">HSD Diesel Only</option>
              <option value="RECEIPT">Receipts Only</option>
              <option value="DUTY_DISPENSING">Duty Sales Only</option>
            </select>

            <button onClick={loadData} className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 transition-all">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                <th className="p-3.5">Date &amp; Time</th>
                <th className="p-3.5">Fuel</th>
                <th className="p-3.5">Movement Type</th>
                <th className="p-3.5 text-right">Quantity (Litres)</th>
                <th className="p-3.5 text-right">Balance After (Litres)</th>
                <th className="p-3.5">Reference / Notes</th>
                <th className="p-3.5">Logged By</th>
                <th className="p-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 font-sans">
                    No fuel stock movements recorded yet.
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m: any) => {
                  const isPositive = m.quantityLitres > 0;
                  const canEdit = !!m.fuelReceipt;
                  const canDelete = m.movementType === 'RECEIPT' || m.movementType === 'INITIAL_STOCK';

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3.5 text-slate-600 font-sans">
                        {new Date(m.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          m.fuelType === 'MS' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {m.fuelType}
                        </span>
                      </td>
                      <td className="p-3.5 font-sans">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                          m.movementType === 'RECEIPT' ? 'text-emerald-700' : m.movementType === 'INITIAL_STOCK' ? 'text-blue-700' : 'text-slate-700'
                        }`}>
                          {m.movementType === 'RECEIPT' && <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />}
                          {m.movementType === 'DUTY_DISPENSING' && <ArrowUpRight className="h-3.5 w-3.5 text-red-500" />}
                          {m.movementType === 'RECEIPT' ? 'Tanker Receipt' : m.movementType === 'DUTY_DISPENSING' ? 'Duty Dispensing' : 'Baseline Set'}
                        </span>
                      </td>
                      <td className={`p-3.5 text-right font-bold ${isPositive ? 'text-emerald-700' : 'text-red-600'}`}>
                        {isPositive ? `+${m.quantityLitres.toLocaleString(undefined, { minimumFractionDigits: 2 })} L` : `${m.quantityLitres.toLocaleString(undefined, { minimumFractionDigits: 2 })} L`}
                      </td>
                      <td className="p-3.5 text-right font-bold text-slate-900">
                        {m.balanceAfter.toLocaleString(undefined, { minimumFractionDigits: 2 })} L
                      </td>
                      <td className="p-3.5 text-slate-600 font-sans">
                        {m.fuelReceipt ? (
                          <span>Invoice <strong className="text-slate-900">#{m.fuelReceipt.invoiceNumber}</strong> ({m.fuelReceipt.supplier})</span>
                        ) : m.dutySession ? (
                          <span>Duty Session <strong className="text-slate-900">#{m.dutySession.dutyNumber}</strong></span>
                        ) : (
                          <span>Initial Baseline Setup</span>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-500 font-sans">
                        {m.createdBy?.username || 'System'}
                      </td>
                      <td className="p-3.5 text-center font-sans">
                        <div className="flex items-center justify-center gap-2">
                          {canEdit && (
                            <button
                              onClick={() => handleOpenEdit(m)}
                              title="Edit / Modify Invoice"
                              className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-all"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => {
                                setDeleteConfirmId(m.fuelReceipt ? m.fuelReceipt.id : m.id);
                                setDeleteConfirmType(m.fuelReceipt ? 'RECEIPT' : 'MOVEMENT');
                                setDeleteConfirmTitle(m.fuelReceipt ? `Invoice #${m.fuelReceipt.invoiceNumber}` : `Stock Movement (${m.fuelType})`);
                              }}
                              title="Delete Record"
                              className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-all"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {!canEdit && !canDelete && (
                            <span className="text-slate-400 text-[10px] font-sans">Shift Duty</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDIT TANKER RECEIPT MODAL */}
      {editReceiptModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="google-card max-w-lg w-full p-6 space-y-6 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-blue-600" />
                <h4 className="text-base font-bold text-slate-900">Edit Tanker Receipt / Invoice</h4>
              </div>
              <button onClick={() => setEditReceiptModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <form onSubmit={handleSaveEditReceipt} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                    INVOICE / DELIVERY NOTE # *
                  </label>
                  <input
                    type="text"
                    required
                    value={editInvoiceNumber}
                    onChange={(e) => setEditInvoiceNumber(e.target.value)}
                    className="google-input w-full font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                    INVOICE DATE *
                  </label>
                  <input
                    type="date"
                    required
                    value={editInvoiceDate}
                    onChange={(e) => setEditInvoiceDate(e.target.value)}
                    className="google-input w-full"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                    DEPOT / SUPPLIER NAME *
                  </label>
                  <input
                    type="text"
                    required
                    value={editSupplier}
                    onChange={(e) => setEditSupplier(e.target.value)}
                    className="google-input w-full"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                    FUEL PRODUCT *
                  </label>
                  <select
                    value={editFuelType}
                    onChange={(e) => setEditFuelType(e.target.value as 'MS' | 'HSD')}
                    className="google-input w-full font-bold"
                  >
                    <option value="MS">MS - Petrol (Motor Spirit)</option>
                    <option value="HSD">HSD - Diesel (High Speed Diesel)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  QUANTITY RECEIVED (LITRES) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={editQuantityLitres}
                  onChange={(e) => setEditQuantityLitres(e.target.value)}
                  className="google-input w-full font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  REMARKS / TANKER TRUCK #
                </label>
                <input
                  type="text"
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  placeholder="Optional delivery details or TT number"
                  className="google-input w-full"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditReceiptModal(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="btn-primary text-xs"
                >
                  {editSubmitting ? 'Saving Changes...' : 'Save Invoice Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="google-card max-w-md w-full p-6 space-y-6 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-red-600" />
                <h4 className="text-base font-bold text-slate-900">Confirm Deletion</h4>
              </div>
              <button onClick={() => setDeleteConfirmId(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-700">
                Are you sure you want to delete <strong>{deleteConfirmTitle}</strong>?
              </p>
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 font-sans">
                ⚠️ Warning: Deleting this entry will automatically revert its quantity from your active fuel tank inventory volume.
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteSubmitting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs shadow-sm transition-all disabled:opacity-50"
              >
                {deleteSubmitting ? 'Deleting...' : 'Delete Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OWNER MODAL FOR INITIAL BASELINE SETUP */}
      {showInitModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="google-card max-w-md w-full p-6 space-y-6 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h4 className="text-base font-bold text-slate-900">Set Baseline Stock ({initFuelType})</h4>
              <button onClick={() => setShowInitModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <form onSubmit={handleSetInitialStock} className="space-y-4 text-xs">
              <p className="text-slate-600">
                Authorized Owner action: Manually override the initial baseline stock for <strong>{initFuelType}</strong>.
              </p>
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Initial Baseline Volume (Litres) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={initQty}
                  onChange={(e) => setInitQty(e.target.value)}
                  placeholder="e.g. 15000"
                  className="google-input w-full font-mono font-bold"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInitModal(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={initSubmitting}
                  className="btn-primary text-xs"
                >
                  {initSubmitting ? 'Saving...' : 'Save Initial Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

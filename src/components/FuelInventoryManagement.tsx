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
    <div className="space-y-8">
      {/* Header Notification Banner */}
      {flashMsg && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-xs font-bold ${
          flashMsg.type === 'success' ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300' : 'bg-red-950/60 border-red-500/50 text-red-300'
        }`}>
          <div className="flex items-center gap-2">
            {flashMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> : <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />}
            <span>{flashMsg.text}</span>
          </div>
          <button onClick={() => setFlashMsg(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* SECTION 1: UNDERGROUND FUEL STOCK LEDGER SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* MS PETROL STOCK CARD */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden space-y-4">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black">
                MS
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">MS Petrol Underground Stock</h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Automated Real-Time Volume</span>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 text-amber-400">
              ACTIVE LEDGER
            </span>
          </div>

          <div className="flex items-baseline justify-between border-y border-slate-850 py-4">
            <div>
              <span className="text-xs text-slate-400 font-medium block">Current Tank Volume</span>
              <span className="font-mono text-3xl font-black text-amber-400">
                {(stock.MS || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-sm font-sans font-bold text-slate-400 ml-1.5">Litres</span>
              </span>
            </div>
            {userRole === 'OWNER' && (
              <button
                onClick={() => { setInitFuelType('MS'); setShowInitModal(true); }}
                className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                Set Baseline
              </button>
            )}
          </div>

          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>Deduction: <strong className="text-slate-200">Per Duty Shift Meter Sales</strong></span>
            <span>Receipts: <strong className="text-emerald-400">Invoices Added</strong></span>
          </div>
        </div>

        {/* HSD DIESEL STOCK CARD */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden space-y-4">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black">
                HSD
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">HSD Diesel Underground Stock</h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Automated Real-Time Volume</span>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              ACTIVE LEDGER
            </span>
          </div>

          <div className="flex items-baseline justify-between border-y border-slate-850 py-4">
            <div>
              <span className="text-xs text-slate-400 font-medium block">Current Tank Volume</span>
              <span className="font-mono text-3xl font-black text-emerald-400">
                {(stock.HSD || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-sm font-sans font-bold text-slate-400 ml-1.5">Litres</span>
              </span>
            </div>
            {userRole === 'OWNER' && (
              <button
                onClick={() => { setInitFuelType('HSD'); setShowInitModal(true); }}
                className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                Set Baseline
              </button>
            )}
          </div>

          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>Deduction: <strong className="text-slate-200">Per Duty Shift Meter Sales</strong></span>
            <span>Receipts: <strong className="text-emerald-400">Invoices Added</strong></span>
          </div>
        </div>
      </div>

      {/* SECTION 2: ADD FUEL RECEIPT (DELIVERY INVOICE ENTRY) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
              <PlusCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white">Record Tanker Delivery / Fuel Receipt</h3>
              <p className="text-xs text-slate-400">Enter new fuel tank delivery invoice details in volume litres (Non-monetary inventory receipt)</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-blue-500/10 border border-blue-500/30 text-blue-400">
            VOLUME RECEIPT ENTRY
          </span>
        </div>

        <form onSubmit={handleAddReceipt} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label htmlFor="invoice-no" className="block text-[10px] font-extrabold text-slate-300 uppercase mb-1">
                INVOICE / DELIVERY NOTE # *
              </label>
              <input
                id="invoice-no"
                type="text"
                required
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-2026-8890"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 px-3 text-white font-mono focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="invoice-date" className="block text-[10px] font-extrabold text-slate-300 uppercase mb-1">
                INVOICE DATE *
              </label>
              <input
                id="invoice-date"
                type="date"
                required
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 px-3 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="supplier" className="block text-[10px] font-extrabold text-slate-300 uppercase mb-1">
                DEPOT / SUPPLIER NAME *
              </label>
              <input
                id="supplier"
                type="text"
                required
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="IOCL Terminal / Depot"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 px-3 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="fuel-type-select" className="block text-[10px] font-extrabold text-slate-300 uppercase mb-1">
                FUEL PRODUCT *
              </label>
              <select
                id="fuel-type-select"
                value={fuelType}
                onChange={(e) => setFuelType(e.target.value as 'MS' | 'HSD')}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 px-3 text-white font-bold focus:border-blue-500 focus:outline-none"
              >
                <option value="MS">MS - Petrol (Motor Spirit)</option>
                <option value="HSD">HSD - Diesel (High Speed Diesel)</option>
              </select>
            </div>

            <div>
              <label htmlFor="qty-litres" className="block text-[10px] font-extrabold text-slate-300 uppercase mb-1">
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
                  className="w-full rounded-lg border border-emerald-500/50 bg-slate-950 py-2.5 px-3 text-white font-mono font-bold focus:border-emerald-400 focus:outline-none"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">Litres</span>
              </div>
            </div>

            <div>
              <label htmlFor="remarks" className="block text-[10px] font-extrabold text-slate-300 uppercase mb-1">
                REMARKS / TANKER TRUCK #
              </label>
              <input
                id="remarks"
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Optional delivery details or TT number"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 px-3 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white shadow-lg disabled:opacity-50 transition"
            >
              {submitting ? 'Recording Receipt...' : 'Add Fuel Receipt to Tank Inventory'}
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 3: FUEL STOCK MOVEMENT AUDIT LEDGER */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white">Fuel Inventory Stock Movement Ledger</h3>
              <p className="text-xs text-slate-400">Complete audit trail of tanker receipts and automated duty shift dispensing deductions</p>
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
                className="pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <select
              value={movementFilter}
              onChange={(e) => setMovementFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-xs text-slate-300 font-bold focus:outline-none"
            >
              <option value="ALL">All Products</option>
              <option value="MS">MS Petrol Only</option>
              <option value="HSD">HSD Diesel Only</option>
              <option value="RECEIPT">Receipts Only</option>
              <option value="DUTY_DISPENSING">Duty Sales Only</option>
            </select>

            <button onClick={loadData} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
                <th className="p-3.5">Date & Time</th>
                <th className="p-3.5">Fuel</th>
                <th className="p-3.5">Movement Type</th>
                <th className="p-3.5 text-right">Quantity (Litres)</th>
                <th className="p-3.5 text-right">Balance After (Litres)</th>
                <th className="p-3.5">Reference / Notes</th>
                <th className="p-3.5">Logged By</th>
                <th className="p-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850 font-mono">
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
                    <tr key={m.id} className="hover:bg-slate-850/40">
                      <td className="p-3.5 text-slate-300 font-sans">
                        {new Date(m.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          m.fuelType === 'MS' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          {m.fuelType}
                        </span>
                      </td>
                      <td className="p-3.5 font-sans">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                          m.movementType === 'RECEIPT' ? 'text-emerald-400' : m.movementType === 'INITIAL_STOCK' ? 'text-blue-400' : 'text-slate-300'
                        }`}>
                          {m.movementType === 'RECEIPT' && <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-400" />}
                          {m.movementType === 'DUTY_DISPENSING' && <ArrowUpRight className="h-3.5 w-3.5 text-red-400" />}
                          {m.movementType === 'RECEIPT' ? 'Tanker Receipt' : m.movementType === 'DUTY_DISPENSING' ? 'Duty Dispensing' : 'Baseline Set'}
                        </span>
                      </td>
                      <td className={`p-3.5 text-right font-extrabold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isPositive ? `+${m.quantityLitres.toLocaleString(undefined, { minimumFractionDigits: 2 })} L` : `${m.quantityLitres.toLocaleString(undefined, { minimumFractionDigits: 2 })} L`}
                      </td>
                      <td className="p-3.5 text-right font-bold text-white">
                        {m.balanceAfter.toLocaleString(undefined, { minimumFractionDigits: 2 })} L
                      </td>
                      <td className="p-3.5 text-slate-300 font-sans">
                        {m.fuelReceipt ? (
                          <span>Invoice <strong className="text-white">#{m.fuelReceipt.invoiceNumber}</strong> ({m.fuelReceipt.supplier})</span>
                        ) : m.dutySession ? (
                          <span>Duty Session <strong className="text-white">#{m.dutySession.dutyNumber}</strong></span>
                        ) : (
                          <span>Initial Baseline Setup</span>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-400 font-sans">
                        {m.createdBy?.username || 'System'}
                      </td>
                      <td className="p-3.5 text-center font-sans">
                        <div className="flex items-center justify-center gap-2">
                          {canEdit && (
                            <button
                              onClick={() => handleOpenEdit(m)}
                              title="Edit / Modify Invoice"
                              className="p-1.5 rounded bg-blue-950/60 hover:bg-blue-900 text-blue-400 border border-blue-500/30 transition"
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
                              className="p-1.5 rounded bg-red-950/60 hover:bg-red-900 text-red-400 border border-red-500/30 transition"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {!canEdit && !canDelete && (
                            <span className="text-slate-600 text-[10px] font-sans">Shift Duty</span>
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-blue-400" />
                <h4 className="text-base font-extrabold text-white">Edit Tanker Receipt / Invoice</h4>
              </div>
              <button onClick={() => setEditReceiptModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveEditReceipt} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-300 uppercase mb-1">
                    INVOICE / DELIVERY NOTE # *
                  </label>
                  <input
                    type="text"
                    required
                    value={editInvoiceNumber}
                    onChange={(e) => setEditInvoiceNumber(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 px-3 text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-300 uppercase mb-1">
                    INVOICE DATE *
                  </label>
                  <input
                    type="date"
                    required
                    value={editInvoiceDate}
                    onChange={(e) => setEditInvoiceDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 px-3 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-300 uppercase mb-1">
                    DEPOT / SUPPLIER NAME *
                  </label>
                  <input
                    type="text"
                    required
                    value={editSupplier}
                    onChange={(e) => setEditSupplier(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 px-3 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-300 uppercase mb-1">
                    FUEL PRODUCT *
                  </label>
                  <select
                    value={editFuelType}
                    onChange={(e) => setEditFuelType(e.target.value as 'MS' | 'HSD')}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 px-3 text-white font-bold focus:border-blue-500 focus:outline-none"
                  >
                    <option value="MS">MS - Petrol (Motor Spirit)</option>
                    <option value="HSD">HSD - Diesel (High Speed Diesel)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-300 uppercase mb-1">
                  QUANTITY RECEIVED (LITRES) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={editQuantityLitres}
                  onChange={(e) => setEditQuantityLitres(e.target.value)}
                  className="w-full rounded-lg border border-emerald-500/50 bg-slate-950 py-2.5 px-3 text-white font-mono font-bold focus:border-emerald-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-300 uppercase mb-1">
                  REMARKS / TANKER TRUCK #
                </label>
                <input
                  type="text"
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  placeholder="Optional delivery details or TT number"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 px-3 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditReceiptModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-5 py-2 rounded-lg bg-blue-600 text-white font-extrabold hover:bg-blue-500 shadow-lg disabled:opacity-50"
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-red-400" />
                <h4 className="text-base font-extrabold text-white">Confirm Deletion</h4>
              </div>
              <button onClick={() => setDeleteConfirmId(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300">
                Are you sure you want to delete <strong>{deleteConfirmTitle}</strong>?
              </p>
              <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 font-sans">
                ⚠️ Warning: Deleting this entry will automatically revert its quantity from your active fuel tank inventory volume.
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteSubmitting}
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-lg bg-red-600 text-white font-extrabold hover:bg-red-500 shadow-lg disabled:opacity-50"
              >
                {deleteSubmitting ? 'Deleting...' : 'Delete Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OWNER MODAL FOR INITIAL BASELINE SETUP */}
      {showInitModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h4 className="text-base font-extrabold text-white">Set Baseline Stock ({initFuelType})</h4>
              <button onClick={() => setShowInitModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSetInitialStock} className="space-y-4 text-xs">
              <p className="text-slate-400">
                Authorized Owner action: Manually override the initial baseline stock for <strong>{initFuelType}</strong>.
              </p>
              <div>
                <label className="block text-[10px] font-extrabold text-slate-300 uppercase mb-1">Initial Baseline Volume (Litres) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={initQty}
                  onChange={(e) => setInitQty(e.target.value)}
                  placeholder="e.g. 15000"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 px-3 text-white font-mono font-bold focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInitModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={initSubmitting}
                  className="px-5 py-2 rounded-lg bg-emerald-600 text-white font-extrabold hover:bg-emerald-500"
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

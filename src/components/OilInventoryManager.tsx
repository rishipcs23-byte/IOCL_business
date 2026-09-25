'use client';

import React, { useState } from 'react';
import {
  HardDrive, Building2, DollarSign, Plus, Trash2, Calendar, FileText,
  AlertTriangle, CheckCircle2, TrendingUp, Filter, Search, ArrowRight, ShieldCheck,
  Edit3, RefreshCw, X, PackagePlus
} from 'lucide-react';
import {
  recordOilPurchaseAction,
  deleteOilPurchaseAction,
  addOilSaleAction,
  deleteOilSaleAction,
  updateOilProductOpeningStockAction,
  createOilProductAction,
  updateOilProductAction,
  deleteOilProductAction
} from '@/lib/actions';

interface OilInventoryManagerProps {
  initialSubTab?: 'purchases' | 'sales' | 'inventory';
  staticData: any;
  oilSales: any[];
  oilPurchases: any[];
  activeDuty: any;
  onRefresh: () => Promise<void>;
  flashMessage: (msg: string, type: 'success' | 'error') => void;
}

export default function OilInventoryManager({
  initialSubTab = 'inventory',
  staticData,
  oilSales,
  oilPurchases,
  activeDuty,
  onRefresh,
  flashMessage
}: OilInventoryManagerProps) {
  const [subTab, setSubTab] = useState<'purchases' | 'sales' | 'inventory'>(initialSubTab);

  // New Oil Purchase Invoice Form State
  const [supplierName, setSupplierName] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [purchaseNotes, setPurchaseNotes] = useState<string>('');
  const [purchaseItems, setPurchaseItems] = useState<Array<{ productId: string; quantity: number; unitPurchasePrice: number }>>([
    { productId: staticData?.products?.[0]?.id || '', quantity: 1, unitPurchasePrice: staticData?.products?.[0]?.purchasePrice || 0 }
  ]);
  const [isSubmittingPurchase, setIsSubmittingPurchase] = useState<boolean>(false);

  // New Oil Sale Form State
  const [oilProdId, setOilProdId] = useState<string>(staticData?.products?.[0]?.id || '');
  const [oilQty, setOilQty] = useState<number>(1);
  const [isSubmittingSale, setIsSubmittingSale] = useState<boolean>(false);

  // Filter & Search states
  const [selectedProductFilter, setSelectedProductFilter] = useState<string>('ALL');

  // Edit Product Modal State
  const [editingProd, setEditingProd] = useState<any | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editPurchasePrice, setEditPurchasePrice] = useState<number>(0);
  const [editMinStock, setEditMinStock] = useState<number>(5);
  const [editOpeningStock, setEditOpeningStock] = useState<number>(0);
  const [isSavingProd, setIsSavingProd] = useState<boolean>(false);

  // Create Product Modal State
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newPrice, setNewPrice] = useState<number>(100);
  const [newPurchasePrice, setNewPurchasePrice] = useState<number>(80);
  const [newMinStock, setNewMinStock] = useState<number>(5);
  const [newOpeningStock, setNewOpeningStock] = useState<number>(0);
  const [isCreatingProd, setIsCreatingProd] = useState<boolean>(false);

  const products = staticData?.products || [];

  // Currently selected product for sale form
  const selectedSaleProduct = products.find((p: any) => p.id === oilProdId) || products[0];
  const availableSaleStock = selectedSaleProduct ? (selectedSaleProduct.stockQuantity || 0) : 0;
  const isSelectedSaleProductOutOfStock = availableSaleStock <= 0;
  const isSelectedSaleQtyExcessive = oilQty > availableSaleStock;

  // Helper for adding/removing line items in purchase form
  const handleAddItemRow = () => {
    const defaultProd = products[0];
    setPurchaseItems([
      ...purchaseItems,
      { productId: defaultProd?.id || '', quantity: 1, unitPurchasePrice: defaultProd?.purchasePrice || 0 }
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (purchaseItems.length === 1) return;
    setPurchaseItems(purchaseItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: 'productId' | 'quantity' | 'unitPurchasePrice', val: any) => {
    const updated = [...purchaseItems];
    if (field === 'productId') {
      const prod = products.find((p: any) => p.id === val);
      updated[index] = {
        ...updated[index],
        productId: val,
        unitPurchasePrice: prod?.purchasePrice || 0,
      };
    } else {
      updated[index] = {
        ...updated[index],
        [field]: Number(val),
      };
    }
    setPurchaseItems(updated);
  };

  // Calculate Invoice Total
  const invoiceTotalAmount = purchaseItems.reduce((sum, item) => sum + (item.quantity * item.unitPurchasePrice), 0);

  // Submit Purchase Invoice
  const handleRecordPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingPurchase) return;

    const trimmedSupplier = supplierName.trim();
    const trimmedInvoice = invoiceNumber.trim();

    if (!trimmedSupplier) {
      flashMessage('Please enter the Supplier / Vendor name.', 'error');
      return;
    }
    if (!trimmedInvoice) {
      flashMessage('Please enter the Invoice / Bill Number.', 'error');
      return;
    }
    if (!invoiceDate) {
      flashMessage('Please select the Invoice Date.', 'error');
      return;
    }
    if (products.length === 0) {
      flashMessage('No oil products found in inventory. Please click "+ New Product" above to create an oil product before recording an invoice.', 'error');
      return;
    }

    const hasMissingProduct = purchaseItems.some(item => !item.productId);
    if (hasMissingProduct) {
      flashMessage('Please select a valid product for every item row.', 'error');
      return;
    }

    const validItems = purchaseItems.filter(item => item.productId && item.quantity > 0 && item.unitPurchasePrice >= 0);
    if (validItems.length === 0) {
      flashMessage('Please enter a quantity greater than 0 and valid unit cost for at least one item.', 'error');
      return;
    }

    setIsSubmittingPurchase(true);
    try {
      const res = await recordOilPurchaseAction(trimmedSupplier, trimmedInvoice, invoiceDate, validItems, purchaseNotes);
      if (res && res.success) {
        flashMessage('Oil purchase invoice recorded and stock updated successfully!', 'success');
        setSupplierName('');
        setInvoiceNumber('');
        setPurchaseNotes('');
        setPurchaseItems([{ productId: products[0]?.id || '', quantity: 1, unitPurchasePrice: products[0]?.purchasePrice || 0 }]);
        await onRefresh();
      } else {
        flashMessage(res?.error || 'Failed to record purchase invoice', 'error');
      }
    } catch (err: any) {
      flashMessage(err.message || 'Failed to record purchase invoice', 'error');
    } finally {
      setIsSubmittingPurchase(false);
    }
  };

  const handleDeletePurchase = async (id: string) => {
    if (!confirm('Are you sure you want to delete this purchase invoice? Stock and weighted costs will be recalculated.')) return;
    try {
      const res = await deleteOilPurchaseAction(id);
      if (res && res.success) {
        flashMessage('Purchase invoice deleted and stock recalculated!', 'success');
        await onRefresh();
      } else {
        flashMessage(res?.error || 'Failed to delete purchase invoice', 'error');
      }
    } catch (err: any) {
      flashMessage(err.message || 'Failed to delete purchase invoice', 'error');
    }
  };

  // Submit Oil Sale
  const handleRecordSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingSale || !activeDuty) return;

    if (!oilProdId || oilQty <= 0) {
      flashMessage('Please select product and enter valid quantity', 'error');
      return;
    }

    if (isSelectedSaleProductOutOfStock) {
      flashMessage(`Out of stock! "${selectedSaleProduct?.name}" has 0 units remaining. Cannot sell.`, 'error');
      return;
    }

    if (isSelectedSaleQtyExcessive) {
      flashMessage(`Insufficient stock! Cannot sell ${oilQty} units of "${selectedSaleProduct?.name}". Only ${availableSaleStock} units available.`, 'error');
      return;
    }

    setIsSubmittingSale(true);
    try {
      const res = await addOilSaleAction(activeDuty.id, oilProdId, oilQty);
      if (res && res.success) {
        flashMessage('Oil sale recorded and inventory ledger updated!', 'success');
        setOilQty(1);
        await onRefresh();
      } else {
        flashMessage(res?.error || 'Failed to record oil sale', 'error');
      }
    } catch (err: any) {
      flashMessage(err.message || 'Failed to record oil sale', 'error');
    } finally {
      setIsSubmittingSale(false);
    }
  };

  const handleDeleteSale = async (id: string) => {
    if (!confirm('Are you sure you want to delete this oil sale? Stock will be restored in ledger.')) return;
    try {
      const res = await deleteOilSaleAction(id);
      if (res && res.success) {
        flashMessage('Oil sale deleted and stock restored in ledger!', 'success');
        await onRefresh();
      } else {
        flashMessage(res?.error || 'Failed to delete oil sale', 'error');
      }
    } catch (err: any) {
      flashMessage(err.message, 'error');
    }
  };

  // Product Master Management Actions
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingProd) return;
    setIsCreatingProd(true);
    try {
      const res = await createOilProductAction(newName, newPrice, newPurchasePrice, newMinStock, newOpeningStock);
      if (res && res.success) {
        flashMessage(`Product "${newName}" created successfully!`, 'success');
        setShowCreateModal(false);
        setNewName('');
        await onRefresh();
      } else {
        flashMessage(res?.error || 'Failed to create product', 'error');
      }
    } catch (err: any) {
      flashMessage(err.message || 'Failed to create product', 'error');
    } finally {
      setIsCreatingProd(false);
    }
  };

  const handleOpenEditProduct = (prod: any) => {
    setEditingProd(prod);
    setEditName(prod.name);
    setEditPrice(prod.price || 0);
    setEditPurchasePrice(prod.purchasePrice || 0);
    setEditMinStock(prod.minStockAlert || 5);
    setEditOpeningStock(prod.openingStock || 0);
  };

  const handleSaveEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProd || isSavingProd) return;
    setIsSavingProd(true);
    try {
      const res = await updateOilProductAction(editingProd.id, {
        name: editName,
        price: editPrice,
        purchasePrice: editPurchasePrice,
        minStockAlert: editMinStock,
        openingStock: editOpeningStock,
      });
      if (res && res.success) {
        flashMessage(`Product "${editName}" updated successfully!`, 'success');
        setEditingProd(null);
        await onRefresh();
      } else {
        flashMessage(res?.error || 'Failed to update product', 'error');
      }
    } catch (err: any) {
      flashMessage(err.message || 'Failed to update product', 'error');
    } finally {
      setIsSavingProd(false);
    }
  };

  const handleDeleteProduct = async (prod: any) => {
    if (!confirm(`Are you sure you want to delete product "${prod.name}"? This will delete the product master and recalculate inventory balances.`)) return;
    try {
      const res = await deleteOilProductAction(prod.id);
      if (res && res.success) {
        flashMessage(`Product "${prod.name}" deleted successfully!`, 'success');
        await onRefresh();
      } else {
        flashMessage(res?.error || 'Failed to delete product', 'error');
      }
    } catch (err: any) {
      flashMessage(err.message || 'Failed to delete product', 'error');
    }
  };

  // Compute Inventory Balances & Valuation (Derived exclusively from ledger: Opening + Purchases - Sales)
  const inventorySummary = products.map((prod: any) => {
    const openingStock = prod.openingStock || 0.0;

    let purchasedQty = 0;
    for (const p of oilPurchases) {
      for (const item of p.items || []) {
        if (item.productId === prod.id) {
          purchasedQty += item.quantity;
        }
      }
    }

    let soldQty = 0;
    for (const s of oilSales) {
      if (s.productId === prod.id) {
        soldQty += s.quantity;
      }
    }

    // Direct ledger formula: Opening + Purchases - Sales
    const rawLedgerQty = openingStock + purchasedQty - soldQty;
    const currentQty = Number(rawLedgerQty.toFixed(2));
    const purchaseCost = prod.purchasePrice || 0;
    const sellingPrice = prod.price || 0;

    // Financial valuation should be non-negative for display sanity
    const validQtyForValuation = Math.max(0, currentQty);
    const inventoryCostValue = validQtyForValuation * purchaseCost;
    const potentialRetailValue = validQtyForValuation * sellingPrice;

    const minAlert = prod.minStockAlert || 5.0;
    const isNegativeStock = currentQty < 0;
    const isOutOfStock = currentQty <= 0;
    const isLowStock = currentQty > 0 && currentQty <= minAlert;

    return {
      id: prod.id,
      name: prod.name,
      openingStock,
      purchasedQty,
      soldQty,
      currentQty,
      purchaseCost,
      sellingPrice,
      inventoryCostValue,
      potentialRetailValue,
      minAlert,
      isNegativeStock,
      isOutOfStock,
      isLowStock,
      rawProductObj: prod,
    };
  });

  const totalInventoryCostVal = inventorySummary.reduce((sum: number, p: any) => sum + p.inventoryCostValue, 0);
  const totalPotentialRetailVal = inventorySummary.reduce((sum: number, p: any) => sum + p.potentialRetailValue, 0);
  const totalLowStockAlerts = inventorySummary.filter((p: any) => p.isLowStock || p.isOutOfStock || p.isNegativeStock).length;

  // Traceable Movement Log with Chronological Running Balances
  const productMovements: Array<{
    timestamp: string;
    type: 'OPENING' | 'PURCHASE' | 'SALE';
    productId: string;
    productName: string;
    quantityChange: number;
    unitPrice: number;
    runningBalance: number;
    reference: string;
    enteredBy: string;
  }> = [];

  products.forEach((prod: any) => {
    let rBalance = prod.openingStock || 0;

    const events: Array<{
      timestamp: string;
      type: 'OPENING' | 'PURCHASE' | 'SALE';
      quantityChange: number;
      unitPrice: number;
      reference: string;
      enteredBy: string;
    }> = [];

    if (prod.openingStock > 0) {
      events.push({
        timestamp: prod.createdAt || '2026-08-01T00:00:00Z',
        type: 'OPENING',
        quantityChange: prod.openingStock,
        unitPrice: prod.purchasePrice || 0,
        reference: 'Initial Baseline Opening Stock',
        enteredBy: 'System Master',
      });
    }

    oilPurchases.forEach((p: any) => {
      (p.items || []).forEach((item: any) => {
        if (item.productId === prod.id) {
          events.push({
            timestamp: p.invoiceDate || p.createdAt,
            type: 'PURCHASE',
            quantityChange: item.quantity,
            unitPrice: item.unitPurchasePrice,
            reference: `Supplier: ${p.supplierName} (Inv #${p.invoiceNumber})`,
            enteredBy: p.createdBy?.username || 'Owner',
          });
        }
      });
    });

    oilSales.forEach((s: any) => {
      if (s.productId === prod.id) {
        events.push({
          timestamp: s.timestamp,
          type: 'SALE',
          quantityChange: -s.quantity,
          unitPrice: s.unitPrice,
          reference: `Duty #${s.dutySession?.dutyNumber || '-'}`,
          enteredBy: s.enteredBy?.username || 'Manager',
        });
      }
    });

    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    events.forEach((ev) => {
      rBalance += ev.quantityChange;
      productMovements.push({
        timestamp: ev.timestamp,
        type: ev.type,
        productId: prod.id,
        productName: prod.name,
        quantityChange: ev.quantityChange,
        unitPrice: ev.unitPrice,
        runningBalance: Number(rBalance.toFixed(2)),
        reference: ev.reference,
        enteredBy: ev.enteredBy,
      });
    });
  });

  const filteredMovements = productMovements.filter(m => selectedProductFilter === 'ALL' || m.productId === selectedProductFilter);
  const sortedMovements = filteredMovements.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="space-y-6">
      {/* HEADER BANNER - Google Style */}
      <div className="google-hero p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-200 dark:border-blue-800 flex items-center justify-center shrink-0 shadow-sm">
            <HardDrive className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Oil &amp; Lubricants</h2>
            <p className="text-xs text-[var(--text-muted)] font-medium mt-0.5">Manage inventory, purchases and oil sales • Stock = Opening + Purchases - Sales</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Add New Product Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
          >
            <PackagePlus className="h-4 w-4" />
            + New Product
          </button>

          {/* Sub-Tab Selector */}
          <div className="flex items-center bg-[var(--bg-surface-secondary)] p-1 rounded-xl border border-[var(--border-color)] text-xs">
            <button
              onClick={() => setSubTab('inventory')}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${subTab === 'inventory' ? 'bg-[var(--bg-surface)] text-blue-600 dark:text-blue-400 shadow-sm border border-[var(--border-color)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            >
              Inventory
            </button>
            <button
              onClick={() => setSubTab('purchases')}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${subTab === 'purchases' ? 'bg-[var(--bg-surface)] text-blue-600 dark:text-blue-400 shadow-sm border border-[var(--border-color)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            >
              Purchases ({oilPurchases.length})
            </button>
            <button
              onClick={() => setSubTab('sales')}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${subTab === 'sales' ? 'bg-[var(--bg-surface)] text-blue-600 dark:text-blue-400 shadow-sm border border-[var(--border-color)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            >
              Oil Sales ({oilSales.length})
            </button>
          </div>
        </div>
      </div>

      {/* SUB-TAB 1: CURRENT INVENTORY BALANCE & VALUATION */}
      {subTab === 'inventory' && (
        <div className="space-y-6">
          {/* STAT CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider block">Inventory Cost Value (Purchase Cost)</span>
              <div className="mt-2">
                <span className="text-2xl font-bold text-slate-900 font-mono">₹{totalInventoryCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider block">Potential Retail Value (Selling Price)</span>
              <div className="mt-2">
                <span className="text-2xl font-bold text-emerald-700 font-mono">₹{totalPotentialRetailVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider block">Low / Out of Stock Alerts</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className={`text-2xl font-bold font-mono ${totalLowStockAlerts > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                  {totalLowStockAlerts} Products
                </span>
                {totalLowStockAlerts > 0 && (
                  <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">Attention Required</span>
                )}
              </div>
            </div>
          </div>

          {/* INVENTORY BALANCE & VALUATION TABLE */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Current Oil Inventory Ledger &amp; Retail Valuation</h3>
                <p className="text-xs text-slate-500 font-medium">Current Stock = Opening Stock + Total Purchases - Total Sales</p>
              </div>
              <button
                onClick={onRefresh}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-all border border-slate-200 shadow-sm"
              >
                <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
                Sync Ledger
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="p-3.5">Product Name</th>
                    <th className="p-3.5 text-right">Opening Stock</th>
                    <th className="p-3.5 text-right">Purchased</th>
                    <th className="p-3.5 text-right">Sold</th>
                    <th className="p-3.5 text-right">Current Stock</th>
                    <th className="p-3.5 text-right">Purchase Cost (₹)</th>
                    <th className="p-3.5 text-right">Selling Price (₹)</th>
                    <th className="p-3.5 text-right">Cost Value</th>
                    <th className="p-3.5 text-right">Retail Value</th>
                    <th className="p-3.5 text-center">Status</th>
                    <th className="p-3.5 text-center">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {inventorySummary.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-slate-500">No oil products configured in system master data.</td>
                    </tr>
                  ) : (
                    inventorySummary.map((p: any) => (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3.5 font-semibold text-slate-900 flex items-center gap-2">
                          <HardDrive className="h-4 w-4 text-blue-600 shrink-0" />
                          {p.name}
                        </td>
                        <td className="p-3.5 text-right font-mono text-slate-600">{p.openingStock}</td>
                        <td className="p-3.5 text-right font-mono text-emerald-700 font-semibold">+{p.purchasedQty}</td>
                        <td className="p-3.5 text-right font-mono text-red-600 font-semibold">-{p.soldQty}</td>

                        {/* Current Stock Column */}
                        <td className="p-3.5 text-right font-mono font-bold">
                          {p.isNegativeStock ? (
                            <span className="text-red-600">{p.currentQty} Units (Invalid)</span>
                          ) : (
                            <span className="text-blue-700">{p.currentQty} Units</span>
                          )}
                        </td>

                        <td className="p-3.5 text-right font-mono text-slate-500">₹{p.purchaseCost.toFixed(2)}</td>
                        <td className="p-3.5 text-right font-mono text-slate-900 font-semibold">₹{p.sellingPrice.toFixed(2)}</td>
                        <td className="p-3.5 text-right font-mono font-semibold text-amber-700">₹{p.inventoryCostValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="p-3.5 text-right font-mono font-semibold text-emerald-700">₹{p.potentialRetailValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        
                        <td className="p-3.5 text-center">
                          {p.isNegativeStock ? (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold badge-consumer-danger">
                              Invalid Negative Stock ({p.currentQty})
                            </span>
                          ) : p.isOutOfStock ? (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold badge-consumer-danger">
                              Out of Stock (0 Units)
                            </span>
                          ) : p.isLowStock ? (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold badge-consumer-warning">
                              Low Stock ({p.currentQty} &le; {p.minAlert})
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold badge-consumer-success">
                              Normal Stock ({p.currentQty} Units)
                            </span>
                          )}
                        </td>

                        {/* Action buttons */}
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenEditProduct(p.rawProductObj)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                              title="Edit Product Details & Opening Stock"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(p.rawProductObj)}
                              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Delete Product Master"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* TRACEABLE MOVEMENT LOG WITH RUNNING BALANCES */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex flex-wrap justify-between items-center gap-4 bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Traceable Inventory Movement Ledger (Audit Trail)</h3>
                <p className="text-xs text-slate-500 font-medium">Timestamped record of all stock transactions with running balances</p>
              </div>

              {/* Product Filter Selector */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-600 font-semibold">Filter Product:</span>
                <select
                  value={selectedProductFilter}
                  onChange={(e) => setSelectedProductFilter(e.target.value)}
                  className="bg-white border border-slate-300 text-slate-800 rounded-xl p-2 font-medium focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none"
                >
                  <option value="ALL">All Products Master</option>
                  {products.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="p-3.5">Timestamp</th>
                    <th className="p-3.5">Type</th>
                    <th className="p-3.5">Product Name</th>
                    <th className="p-3.5 text-right">Qty Change</th>
                    <th className="p-3.5 text-right">Running Balance</th>
                    <th className="p-3.5 text-right">Unit Rate (₹)</th>
                    <th className="p-3.5">Reference / Details</th>
                    <th className="p-3.5">User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {sortedMovements.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500">No stock movements recorded for selected product filter.</td>
                    </tr>
                  ) : (
                    sortedMovements.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3.5 font-mono text-slate-500" suppressHydrationWarning>{new Date(m.timestamp).toLocaleString()}</td>
                        <td className="p-3.5">
                          {m.type === 'OPENING' ? (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Opening Baseline</span>
                          ) : m.type === 'PURCHASE' ? (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold badge-consumer-success">Purchase (+)</span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold badge-consumer-danger">Sale (-)</span>
                          )}
                        </td>
                        <td className="p-3.5 font-semibold text-slate-900">{m.productName}</td>
                        <td className={`p-3.5 text-right font-mono font-semibold ${m.quantityChange > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-blue-700">
                          {m.runningBalance} Units
                        </td>
                        <td className="p-3.5 text-right font-mono text-slate-600">
                          ₹{m.unitPrice.toFixed(2)}
                        </td>
                        <td className="p-3.5 text-slate-600">{m.reference}</td>
                        <td className="p-3.5 text-slate-700 font-semibold">{m.enteredBy}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: OIL PURCHASES / INVOICES */}
      {subTab === 'purchases' && (
        <div className="space-y-6">
          {/* NEW PURCHASE INVOICE RECORDING FORM */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4 flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-blue-600" />
                  Record Purchase Invoice
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-1">Log new stock arrivals from oil suppliers to update inventory levels automatically.</p>
              </div>
            </div>

            <form onSubmit={handleRecordPurchase} className="space-y-6">
              {/* Supplier Details */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Supplier Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="text-slate-700 font-semibold block mb-1">Supplier / Vendor Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Indian Oil Corporation / Dealer"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2.5 font-medium focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-slate-700 font-semibold block mb-1">Invoice / Bill Number *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. INV-2026-9921"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2.5 font-medium focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-slate-700 font-semibold block mb-1">Invoice Date *</label>
                    <input
                      type="date"
                      required
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2.5 font-medium focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Invoice Items Table */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Invoice Line Items</h4>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs border border-blue-200 transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    + Add Item Line
                  </button>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  {purchaseItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-xs bg-white p-3 rounded-xl border border-slate-200">
                      <div className="md:col-span-5">
                        <label className="text-[11px] text-slate-500 font-semibold block mb-1">Product *</label>
                        <select
                          value={item.productId}
                          onChange={(e) => handleItemChange(idx, 'productId', e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl p-2 font-medium focus:border-blue-600 outline-none"
                        >
                          {products.length === 0 ? (
                            <option value="">-- No products created (Click + New Product above) --</option>
                          ) : (
                            <>
                              <option value="">-- Select Product --</option>
                              {products.map((prod: any) => (
                                <option key={prod.id} value={prod.id}>{prod.name} (Stock: {prod.stockQuantity})</option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <label className="text-[11px] text-slate-500 font-semibold block mb-1">Quantity *</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity || ''}
                          onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl p-2 font-mono font-medium focus:border-blue-600 outline-none"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="text-[11px] text-slate-500 font-semibold block mb-1">Unit Cost (₹) *</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPurchasePrice || ''}
                          onChange={(e) => handleItemChange(idx, 'unitPurchasePrice', e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl p-2 font-mono font-medium focus:border-blue-600 outline-none"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="text-[11px] text-slate-500 font-semibold block mb-1">Total</label>
                        <div className="text-sm font-bold text-slate-900 font-mono py-1.5">
                          ₹{(item.quantity * item.unitPurchasePrice).toLocaleString()}
                        </div>
                      </div>

                      <div className="md:col-span-1 text-center pt-3">
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(idx)}
                          disabled={purchaseItems.length === 1}
                          className="text-slate-400 hover:text-red-600 disabled:opacity-30 p-1 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-700">Total Invoice Amount:</span>
                    <span className="text-xl font-bold text-blue-700 font-mono">₹{invoiceTotalAmount.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-slate-700 font-semibold block mb-1 text-xs">Remarks / Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Received via Batch #102 truck delivery"
                  value={purchaseNotes}
                  onChange={(e) => setPurchaseNotes(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2.5 text-xs focus:border-blue-600 outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setSupplierName('');
                    setInvoiceNumber('');
                    setPurchaseNotes('');
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPurchase || invoiceTotalAmount <= 0}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs transition-all shadow-sm flex items-center gap-2"
                >
                  <Building2 className="h-4 w-4" />
                  {isSubmittingPurchase ? 'Saving Invoice...' : 'Save Invoice'}
                </button>
              </div>
            </form>
          </div>

          {/* PREVIOUS PURCHASES HISTORY */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Historical Purchase Invoices</h3>
                <p className="text-xs text-slate-500 font-medium">Past supplier invoices recorded into the system</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="p-3.5">Invoice Date</th>
                    <th className="p-3.5">Supplier Name</th>
                    <th className="p-3.5">Invoice #</th>
                    <th className="p-3.5">Items Included</th>
                    <th className="p-3.5 text-right">Invoice Total (₹)</th>
                    <th className="p-3.5">Entered By</th>
                    <th className="p-3.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {oilPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">No purchase invoices recorded yet.</td>
                    </tr>
                  ) : (
                    oilPurchases.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3.5 font-mono text-slate-600" suppressHydrationWarning>{new Date(p.invoiceDate).toLocaleDateString()}</td>
                        <td className="p-3.5 font-semibold text-slate-900">{p.supplierName}</td>
                        <td className="p-3.5 font-mono text-blue-700 font-bold">{p.invoiceNumber}</td>
                        <td className="p-3.5 text-slate-600">
                          {p.items?.map((i: any) => `${i.product?.name || 'Oil'} (${i.quantity} @ ₹${i.unitPurchasePrice})`).join(', ')}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-emerald-700">₹{p.totalAmount.toLocaleString()}</td>
                        <td className="p-3.5 text-slate-600">{p.createdBy?.username || 'Owner'}</td>
                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => handleDeletePurchase(p.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Delete Invoice & Recalculate Stock"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: OIL SALES */}
      {subTab === 'sales' && (
        <div className="space-y-6">
          {/* RECORD OIL SALE FORM WITH OUT-OF-STOCK & LOW-STOCK PROTECTION */}
          <div className="google-card p-6 space-y-5">
            <div className="border-b border-[var(--border-color)] pb-4">
              <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2.5">
                <div className="h-9 w-9 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-200 dark:border-emerald-800 flex items-center justify-center">
                  <DollarSign className="h-5 w-5" />
                </div>
                Record Oil Sale
              </h3>
              <p className="text-sm text-[var(--text-muted)] font-medium mt-1">Recording an oil sale reduces inventory stock quantity automatically in the central ledger.</p>
            </div>

            {!activeDuty ? (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-300 text-sm font-semibold">
                No active duty session running. Start a duty session to log oil sales.
              </div>
            ) : (
              <form onSubmit={handleRecordSale} className="space-y-4">
                <div className="form-section">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end text-sm">
                    <div>
                      <label className="text-[var(--text-primary)] font-bold block mb-2 text-sm md:text-base">Select Oil Product *</label>
                      <select
                        value={oilProdId}
                        onChange={(e) => setOilProdId(e.target.value)}
                        className="google-input w-full font-semibold text-sm md:text-base py-3"
                      >
                        {products.map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.name} - ₹{p.price}/unit (Stock: {p.stockQuantity})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[var(--text-primary)] font-bold block mb-2 text-sm md:text-base">Quantity Sold *</label>
                      <input
                        type="number"
                        min="1"
                        value={oilQty}
                        onChange={(e) => setOilQty(Number(e.target.value))}
                        disabled={isSelectedSaleProductOutOfStock}
                        className="google-input w-full font-mono font-bold text-sm md:text-base py-3 disabled:opacity-40"
                      />
                    </div>

                    <div>
                      <label className="text-[var(--text-primary)] font-bold block mb-2 text-sm md:text-base">Total Sale Calculation</label>
                      <div className="highlight-callout py-2.5 px-4 rounded-xl flex items-center justify-between border border-[var(--success-border)] bg-[var(--success-bg)]">
                        <span className="text-xs md:text-sm font-bold text-[var(--success-text)] uppercase tracking-wider">Total:</span>
                        <span className="text-lg md:text-2xl font-extrabold font-mono text-[var(--success-text)]">
                          ₹{((selectedSaleProduct?.price || 0) * (oilQty > 0 ? oilQty : 0)).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div>
                      <button
                        type="submit"
                        disabled={isSubmittingSale || oilQty <= 0 || isSelectedSaleProductOutOfStock || isSelectedSaleQtyExcessive}
                        className="btn-primary w-full py-3 text-sm md:text-base font-bold shadow-md"
                      >
                        <DollarSign className="h-5 w-5" />
                        {isSubmittingSale ? 'Recording...' : 'Record Oil Sale'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* VISUAL STOCK ALARM / WARNING BANNERS */}
                {isSelectedSaleProductOutOfStock && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                    <span><strong>Out of Stock Alert:</strong> "{selectedSaleProduct?.name}" has 0 units available in ledger stock. Sales are disabled.</span>
                  </div>
                )}

                {!isSelectedSaleProductOutOfStock && isSelectedSaleQtyExcessive && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span><strong>Insufficient Stock:</strong> Cannot sell {oilQty} units. Only {availableSaleStock} units available for "{selectedSaleProduct?.name}".</span>
                  </div>
                )}

                {!isSelectedSaleProductOutOfStock && availableSaleStock > 0 && availableSaleStock <= (selectedSaleProduct?.minStockAlert || 5) && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span><strong>Low Stock Warning:</strong> Only {availableSaleStock} units remaining for "{selectedSaleProduct?.name}".</span>
                  </div>
                )}
              </form>
            )}
          </div>

          {/* HISTORICAL OIL SALES TABLE */}
          <div className="google-card shadow-sm overflow-hidden">
            <div className="p-5 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--bg-surface-secondary)]">
              <div>
                <h3 className="font-bold text-[var(--text-primary)] text-base md:text-lg">Historical Oil Sales Records</h3>
                <p className="text-xs md:text-sm text-[var(--text-muted)] font-medium">All oil sales transactions recorded across duty sessions</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-[var(--bg-surface-secondary)] border-b border-[var(--border-color)] text-[var(--text-secondary)] font-bold text-xs md:text-sm uppercase tracking-wider">
                    <th className="py-4 px-4">Date &amp; Time</th>
                    <th className="py-4 px-4">Duty Session</th>
                    <th className="py-4 px-4">Product Name</th>
                    <th className="py-4 px-4 text-right">Quantity</th>
                    <th className="py-4 px-4 text-right">Unit Price (₹)</th>
                    <th className="py-4 px-4 text-right">Total Amount (₹)</th>
                    <th className="py-4 px-4">Entered By</th>
                    <th className="py-4 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)] text-[var(--text-primary)]">
                  {oilSales.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-[var(--text-muted)] text-sm md:text-base">No oil sales recorded.</td>
                    </tr>
                  ) : (
                    oilSales.map((s) => (
                      <tr key={s.id} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
                        <td className="py-4 px-4 font-mono text-xs md:text-sm text-[var(--text-muted)]" suppressHydrationWarning>{new Date(s.timestamp).toLocaleString()}</td>
                        <td className="py-4 px-4 text-blue-600 dark:text-blue-400 font-bold text-sm md:text-base">Duty #{s.dutySession?.dutyNumber || '-'}</td>
                        <td className="py-4 px-4 font-bold text-[var(--text-primary)] text-sm md:text-base">{s.productName}</td>
                        <td className="py-4 px-4 text-right font-mono text-[var(--text-primary)] font-bold text-sm md:text-base">{s.quantity} Units</td>
                        <td className="py-4 px-4 text-right font-mono text-[var(--text-muted)] text-sm md:text-base">₹{s.unitPrice}</td>
                        <td className="py-4 px-4 text-right font-mono font-extrabold text-base md:text-lg text-[var(--success-text)]">₹{s.totalAmount.toLocaleString()}</td>
                        <td className="py-4 px-4 text-[var(--text-secondary)] font-semibold text-sm">{s.enteredBy?.username || 'Staff'}</td>
                        <td className="py-4 px-4 text-center">
                          <button
                            onClick={() => handleDeleteSale(s.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-all"
                            title="Delete Sale & Restore Stock"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* EDIT PRODUCT MODAL */}
      {editingProd && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl space-y-5">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-blue-600" />
                Edit Product Master
              </h3>
              <button
                onClick={() => setEditingProd(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditProduct} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-700 font-semibold block mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2.5 font-medium focus:border-blue-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Selling Price (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={editPrice}
                    onChange={(e) => setEditPrice(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2.5 font-mono font-medium focus:border-blue-600 outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Purchase Cost (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editPurchasePrice}
                    onChange={(e) => setEditPurchasePrice(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2.5 font-mono font-medium focus:border-blue-600 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Opening Stock</label>
                  <input
                    type="number"
                    min="0"
                    value={editOpeningStock}
                    onChange={(e) => setEditOpeningStock(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2.5 font-mono font-medium focus:border-blue-600 outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Min Alert Threshold</label>
                  <input
                    type="number"
                    min="1"
                    value={editMinStock}
                    onChange={(e) => setEditMinStock(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2.5 font-mono font-medium focus:border-blue-600 outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingProd(null)}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingProd}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm"
                >
                  {isSavingProd ? 'Saving Changes...' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE NEW PRODUCT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl space-y-5">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <PackagePlus className="h-5 w-5 text-blue-600" />
                Add New Oil Product
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-700 font-semibold block mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Servo Futura Synthetic 5W-30"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2.5 font-medium focus:border-blue-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Selling Price (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={newPrice}
                    onChange={(e) => setNewPrice(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2.5 font-mono font-medium focus:border-blue-600 outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Purchase Cost (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newPurchasePrice}
                    onChange={(e) => setNewPurchasePrice(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2.5 font-mono font-medium focus:border-blue-600 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Opening Stock</label>
                  <input
                    type="number"
                    min="0"
                    value={newOpeningStock}
                    onChange={(e) => setNewOpeningStock(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2.5 font-mono font-medium focus:border-blue-600 outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Min Alert Threshold</label>
                  <input
                    type="number"
                    min="1"
                    value={newMinStock}
                    onChange={(e) => setNewMinStock(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2.5 font-mono font-medium focus:border-blue-600 outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingProd}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm"
                >
                  {isCreatingProd ? 'Creating...' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

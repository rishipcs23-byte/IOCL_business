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

    const validItems = purchaseItems.filter(item => item.productId && item.quantity > 0 && item.unitPurchasePrice >= 0);
    if (!supplierName || !invoiceNumber || !invoiceDate || validItems.length === 0) {
      flashMessage('Please fill all required invoice fields and at least one item.', 'error');
      return;
    }

    setIsSubmittingPurchase(true);
    try {
      const res = await recordOilPurchaseAction(supplierName, invoiceNumber, invoiceDate, validItems, purchaseNotes);
      if (res.success) {
        flashMessage('Oil purchase invoice recorded and stock updated successfully!', 'success');
        setSupplierName('');
        setInvoiceNumber('');
        setPurchaseNotes('');
        setPurchaseItems([{ productId: products[0]?.id || '', quantity: 1, unitPurchasePrice: products[0]?.purchasePrice || 0 }]);
        await onRefresh();
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
      await deleteOilPurchaseAction(id);
      flashMessage('Purchase invoice deleted and stock recalculated!', 'success');
      await onRefresh();
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
      if (res.success) {
        flashMessage('Oil sale recorded and inventory ledger updated!', 'success');
        setOilQty(1);
        await onRefresh();
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
      await deleteOilSaleAction(id);
      flashMessage('Oil sale deleted and stock restored in ledger!', 'success');
      await onRefresh();
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
      await createOilProductAction(newName, newPrice, newPurchasePrice, newMinStock, newOpeningStock);
      flashMessage(`Product "${newName}" created successfully!`, 'success');
      setShowCreateModal(false);
      setNewName('');
      await onRefresh();
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
      await updateOilProductAction(editingProd.id, {
        name: editName,
        price: editPrice,
        purchasePrice: editPurchasePrice,
        minStockAlert: editMinStock,
        openingStock: editOpeningStock,
      });
      flashMessage(`Product "${editName}" updated successfully!`, 'success');
      setEditingProd(null);
      await onRefresh();
    } catch (err: any) {
      flashMessage(err.message || 'Failed to update product', 'error');
    } finally {
      setIsSavingProd(false);
    }
  };

  const handleDeleteProduct = async (prod: any) => {
    if (!confirm(`Are you sure you want to delete product "${prod.name}"? This will delete the product master and recalculate inventory balances.`)) return;
    try {
      await deleteOilProductAction(prod.id);
      flashMessage(`Product "${prod.name}" deleted successfully!`, 'success');
      await onRefresh();
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
    <div className="space-y-8">
      {/* HEADER BANNER */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30 flex items-center justify-center">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white uppercase tracking-wider">OIL & LUBRICANTS INVENTORY MANAGEMENT</h2>
            <p className="text-xs text-slate-400">Authoritative Ledger Stock Model: Current Stock = Opening Stock + Purchases - Sales</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Add New Product Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md"
          >
            <PackagePlus className="h-4 w-4" />
            + New Product
          </button>

          {/* Sub-Tab Selector */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setSubTab('inventory')}
              className={`px-4 py-2 rounded-lg font-extrabold transition-all ${subTab === 'inventory' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              Current Inventory & Cost
            </button>
            <button
              onClick={() => setSubTab('purchases')}
              className={`px-4 py-2 rounded-lg font-extrabold transition-all ${subTab === 'purchases' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              Purchases / Invoices ({oilPurchases.length})
            </button>
            <button
              onClick={() => setSubTab('sales')}
              className={`px-4 py-2 rounded-lg font-extrabold transition-all ${subTab === 'sales' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              Oil Sales ({oilSales.length})
            </button>
          </div>
        </div>
      </div>

      {/* SUB-TAB 1: CURRENT INVENTORY BALANCE & VALUATION */}
      {subTab === 'inventory' && (
        <div className="space-y-8">
          {/* STAT CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">INVENTORY COST VALUE (PURCHASE COST)</span>
              <div className="mt-2">
                <span className="text-2xl font-black text-indigo-400 font-mono">₹{totalInventoryCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">POTENTIAL RETAIL VALUE (SELLING PRICE)</span>
              <div className="mt-2">
                <span className="text-2xl font-black text-emerald-400 font-mono">₹{totalPotentialRetailVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">LOW / OUT OF STOCK ALERTS</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className={`text-2xl font-black font-mono ${totalLowStockAlerts > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                  {totalLowStockAlerts} Products
                </span>
                {totalLowStockAlerts > 0 && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/25">ATTENTION REQUIRED</span>
                )}
              </div>
            </div>
          </div>

          {/* INVENTORY BALANCE & VALUATION TABLE */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <div>
                <h3 className="font-extrabold text-white text-base uppercase tracking-wider">Current Oil Inventory Ledger & Retail Valuation</h3>
                <p className="text-xs text-slate-400">Current Stock = Opening Stock + Total Purchases - Total Sales (Single Source of Truth)</p>
              </div>
              <button
                onClick={onRefresh}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5 transition-all"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Sync Ledger
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="p-4">Oil Product Name</th>
                    <th className="p-4 text-right">Opening Stock</th>
                    <th className="p-4 text-right">Purchased</th>
                    <th className="p-4 text-right">Sold</th>
                    <th className="p-4 text-right">Current Ledger Stock</th>
                    <th className="p-4 text-right">Purchase Cost (₹)</th>
                    <th className="p-4 text-right">Selling Price (₹)</th>
                    <th className="p-4 text-right">Inventory Cost Value</th>
                    <th className="p-4 text-right">Potential Retail Value</th>
                    <th className="p-4 text-center">Stock Alert Status</th>
                    <th className="p-4 text-center">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {inventorySummary.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-slate-500">No oil products configured in system master data.</td>
                    </tr>
                  ) : (
                    inventorySummary.map((p: any) => (
                      <tr key={p.id} className="hover:bg-slate-850/40">
                        <td className="p-4 font-bold text-white flex items-center gap-2">
                          <HardDrive className="h-4 w-4 text-indigo-400" />
                          {p.name}
                        </td>
                        <td className="p-4 text-right font-mono text-slate-300">{p.openingStock}</td>
                        <td className="p-4 text-right font-mono text-emerald-400 font-bold">+{p.purchasedQty}</td>
                        <td className="p-4 text-right font-mono text-red-400 font-bold">-{p.soldQty}</td>

                        {/* Current Stock Column: Opening + Purchases - Sales */}
                        <td className="p-4 text-right font-mono font-black text-sm">
                          {p.isNegativeStock ? (
                            <span className="text-red-400 font-bold">{p.currentQty} Units (INVALID)</span>
                          ) : (
                            <span className="text-indigo-300">{p.currentQty} Units</span>
                          )}
                        </td>

                        <td className="p-4 text-right font-mono text-slate-400">₹{p.purchaseCost.toFixed(2)}</td>
                        <td className="p-4 text-right font-mono text-slate-200 font-bold">₹{p.sellingPrice.toFixed(2)}</td>
                        <td className="p-4 text-right font-mono font-bold text-amber-400">₹{p.inventoryCostValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="p-4 text-right font-mono font-bold text-emerald-400">₹{p.potentialRetailValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        
                        <td className="p-4 text-center">
                          {p.isNegativeStock ? (
                            <span className="px-2.5 py-1 rounded text-[10px] font-black bg-red-600/30 text-red-300 border border-red-500/50 animate-pulse">
                              INVALID NEGATIVE STOCK ({p.currentQty})
                            </span>
                          ) : p.isOutOfStock ? (
                            <span className="px-2.5 py-1 rounded text-[10px] font-black bg-red-600/20 text-red-400 border border-red-500/40">
                              OUT OF STOCK (0 Units)
                            </span>
                          ) : p.isLowStock ? (
                            <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              LOW STOCK ({p.currentQty} &le; {p.minAlert})
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                              NORMAL STOCK ({p.currentQty} Units)
                            </span>
                          )}
                        </td>

                        {/* Action buttons: Edit & Delete Product */}
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenEditProduct(p.rawProductObj)}
                              className="p-1.5 text-indigo-400 hover:text-indigo-300 hover:bg-slate-800 rounded transition-all"
                              title="Edit Product Details & Opening Stock"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(p.rawProductObj)}
                              className="p-1.5 text-red-400 hover:text-red-300 hover:bg-slate-800 rounded transition-all"
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex flex-wrap justify-between items-center gap-4 bg-slate-900/50">
              <div>
                <h3 className="font-extrabold text-white text-base uppercase tracking-wider">Traceable Inventory Movement Ledger (Audit Trail)</h3>
                <p className="text-xs text-slate-400">Timestamped record of all stock transactions with verified chronological running balances</p>
              </div>

              {/* Product Filter Selector */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 font-bold">Filter Product:</span>
                <select
                  value={selectedProductFilter}
                  onChange={(e) => setSelectedProductFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-white rounded-lg p-2 font-bold focus:outline-none"
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
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Product Name</th>
                    <th className="p-3 text-right">Qty Change</th>
                    <th className="p-3 text-right">Running Balance</th>
                    <th className="p-3 text-right">Unit Rate (₹)</th>
                    <th className="p-3">Reference / Details</th>
                    <th className="p-3">User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {sortedMovements.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500">No stock movements recorded for selected product filter.</td>
                    </tr>
                  ) : (
                    sortedMovements.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-850/40">
                        <td className="p-3 font-mono text-slate-400" suppressHydrationWarning>{new Date(m.timestamp).toLocaleString()}</td>
                        <td className="p-3">
                          {m.type === 'OPENING' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/25">OPENING BASELINE</span>
                          ) : m.type === 'PURCHASE' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">PURCHASE (+)</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/25">SALE (-)</span>
                          )}
                        </td>
                        <td className="p-3 font-bold text-white">{m.productName}</td>
                        <td className={`p-3 text-right font-mono font-bold ${m.quantityChange > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                        </td>
                        <td className="p-3 text-right font-mono font-black text-indigo-300">
                          {m.runningBalance} Units
                        </td>
                        <td className="p-3 text-right font-mono text-slate-400">
                          ₹{m.unitPrice.toFixed(2)}
                        </td>
                        <td className="p-3 text-slate-300">{m.reference}</td>
                        <td className="p-3 text-indigo-400 font-semibold">{m.enteredBy}</td>
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
        <div className="space-y-8">
          {/* NEW PURCHASE INVOICE RECORDING FORM */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="border-b border-slate-800 pb-4">
              <h3 className="text-base font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                <Building2 className="h-5 w-5 text-indigo-400" />
                Record New Oil Purchase Invoice (Stock Addition)
              </h3>
              <p className="text-xs text-slate-400 mt-1">Recording an invoice automatically updates stock quantity and recalculates weighted average cost.</p>
            </div>

            <form onSubmit={handleRecordPurchase} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Supplier / Vendor Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Indian Oil Corporation / Dealer"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 font-bold focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-400 font-bold block mb-1">Invoice / Bill Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. INV-2026-9921"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 font-bold focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-400 font-bold block mb-1">Invoice Date *</label>
                  <input
                    type="date"
                    required
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 font-bold focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Invoice Line Items</h4>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white font-bold text-xs border border-indigo-500/30 transition-all flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Item Line
                  </button>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  {purchaseItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-xs">
                      <div className="md:col-span-5">
                        <label className="text-[10px] text-slate-500 font-bold block mb-1">Product *</label>
                        <select
                          value={item.productId}
                          onChange={(e) => handleItemChange(idx, 'productId', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2 font-bold focus:outline-none"
                        >
                          {products.map((prod: any) => (
                            <option key={prod.id} value={prod.id}>{prod.name} (Current Stock: {prod.stockQuantity})</option>
                          ))}
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <label className="text-[10px] text-slate-500 font-bold block mb-1">Quantity *</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity || ''}
                          onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2 font-bold focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="text-[10px] text-slate-500 font-bold block mb-1">Unit Cost (₹) *</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPurchasePrice || ''}
                          onChange={(e) => handleItemChange(idx, 'unitPurchasePrice', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2 font-bold focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="text-[10px] text-slate-500 font-bold block mb-1">Line Total</label>
                        <div className="text-sm font-black text-amber-400 font-mono py-1.5">
                          ₹{(item.quantity * item.unitPurchasePrice).toLocaleString()}
                        </div>
                      </div>

                      <div className="md:col-span-1 text-center pt-3">
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(idx)}
                          disabled={purchaseItems.length === 1}
                          className="text-red-400 hover:text-red-300 disabled:opacity-30 p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="border-t border-slate-800 pt-3 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400">Total Invoice Amount:</span>
                    <span className="text-xl font-black text-emerald-400 font-mono">₹{invoiceTotalAmount.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1 text-xs">Remarks / Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Received via Batch #102 truck delivery"
                  value={purchaseNotes}
                  onChange={(e) => setPurchaseNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 text-xs focus:outline-none"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmittingPurchase || invoiceTotalAmount <= 0}
                  className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs transition-all shadow-lg shadow-emerald-600/10 flex items-center gap-2"
                >
                  <Building2 className="h-4 w-4" />
                  {isSubmittingPurchase ? 'Saving Invoice...' : 'Save Invoice & Add Stock'}
                </button>
              </div>
            </form>
          </div>

          {/* PREVIOUS PURCHASES HISTORY */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <div>
                <h3 className="font-extrabold text-white text-base uppercase tracking-wider">Historical Purchase Invoices</h3>
                <p className="text-xs text-slate-400">Past supplier invoices recorded into the system</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="p-3">Invoice Date</th>
                    <th className="p-3">Supplier Name</th>
                    <th className="p-3">Invoice #</th>
                    <th className="p-3">Items Included</th>
                    <th className="p-3 text-right">Invoice Total (₹)</th>
                    <th className="p-3">Entered By</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {oilPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">No purchase invoices recorded yet.</td>
                    </tr>
                  ) : (
                    oilPurchases.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-850/40">
                        <td className="p-3 font-mono text-slate-300" suppressHydrationWarning>{new Date(p.invoiceDate).toLocaleDateString()}</td>
                        <td className="p-3 font-bold text-white">{p.supplierName}</td>
                        <td className="p-3 font-mono text-indigo-400 font-bold">{p.invoiceNumber}</td>
                        <td className="p-3 text-slate-300">
                          {p.items?.map((i: any) => `${i.product?.name || 'Oil'} (${i.quantity} @ ₹${i.unitPurchasePrice})`).join(', ')}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-400">₹{p.totalAmount.toLocaleString()}</td>
                        <td className="p-3 text-slate-400">{p.createdBy?.username || 'Owner'}</td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleDeletePurchase(p.id)}
                            className="p-1 text-red-400 hover:text-red-300 hover:bg-slate-800 rounded transition-all"
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
        <div className="space-y-8">
          {/* RECORD OIL SALE FORM WITH OUT-OF-STOCK & LOW-STOCK PROTECTION */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-400" />
                Record Oil Sale (Stock Reduction)
              </h3>
              <p className="text-xs text-slate-400 mt-1">Recording an oil sale reduces inventory stock quantity automatically in the movement ledger.</p>
            </div>

            {!activeDuty ? (
              <div className="p-4 bg-amber-950/30 border border-amber-500/30 rounded-xl text-amber-400 text-xs">
                No active duty session running. Start a duty session to log oil sales.
              </div>
            ) : (
              <form onSubmit={handleRecordSale} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end text-xs">
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Select Oil Product *</label>
                    <select
                      value={oilProdId}
                      onChange={(e) => setOilProdId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 font-bold focus:outline-none"
                    >
                      {products.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name} - ₹{p.price}/unit (Available Stock: {p.stockQuantity})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Quantity Sold *</label>
                    <input
                      type="number"
                      min="1"
                      value={oilQty}
                      onChange={(e) => setOilQty(Number(e.target.value))}
                      disabled={isSelectedSaleProductOutOfStock}
                      className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 font-bold focus:outline-none disabled:opacity-40"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Total Amount (₹)</label>
                    <div className="text-lg font-black text-emerald-400 font-mono py-1.5">
                      ₹{((selectedSaleProduct?.price || 0) * (oilQty > 0 ? oilQty : 0)).toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <button
                      type="submit"
                      disabled={isSubmittingSale || oilQty <= 0 || isSelectedSaleProductOutOfStock || isSelectedSaleQtyExcessive}
                      className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs transition-all shadow-md"
                    >
                      {isSubmittingSale ? 'Recording...' : 'Record Oil Sale'}
                    </button>
                  </div>
                </div>

                {/* VISUAL STOCK ALARM / WARNING BANNERS */}
                {isSelectedSaleProductOutOfStock && (
                  <div className="p-3 bg-red-950/60 border border-red-500/50 rounded-xl text-red-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                    <span><strong>OUT OF STOCK ALERT:</strong> "{selectedSaleProduct?.name}" has 0 units available in ledger stock. Sales are disabled.</span>
                  </div>
                )}

                {!isSelectedSaleProductOutOfStock && isSelectedSaleQtyExcessive && (
                  <div className="p-3 bg-amber-950/60 border border-amber-500/50 rounded-xl text-amber-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                    <span><strong>INSUFFICIENT STOCK:</strong> Cannot sell {oilQty} units. Only {availableSaleStock} units available for "{selectedSaleProduct?.name}".</span>
                  </div>
                )}

                {!isSelectedSaleProductOutOfStock && availableSaleStock > 0 && availableSaleStock <= (selectedSaleProduct?.minStockAlert || 5) && (
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                    <span><strong>LOW STOCK WARNING:</strong> Only {availableSaleStock} units remaining for "{selectedSaleProduct?.name}". Reorder recommended.</span>
                  </div>
                )}
              </form>
            )}
          </div>

          {/* HISTORICAL OIL SALES TABLE */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <div>
                <h3 className="font-extrabold text-white text-base uppercase tracking-wider">Historical Oil Sales Records</h3>
                <p className="text-xs text-slate-400">All oil sales transactions recorded across duty sessions</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="p-3">Date & Time</th>
                    <th className="p-3">Duty Session</th>
                    <th className="p-3">Product Name</th>
                    <th className="p-3 text-right">Quantity</th>
                    <th className="p-3 text-right">Unit Price (₹)</th>
                    <th className="p-3 text-right">Total Amount (₹)</th>
                    <th className="p-3">Entered By</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {oilSales.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500">No oil sales recorded.</td>
                    </tr>
                  ) : (
                    oilSales.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-850/40">
                        <td className="p-3 font-mono text-slate-400" suppressHydrationWarning>{new Date(s.timestamp).toLocaleString()}</td>
                        <td className="p-3 text-indigo-400 font-semibold">Duty #{s.dutySession?.dutyNumber || '-'}</td>
                        <td className="p-3 font-bold text-white">{s.productName}</td>
                        <td className="p-3 text-right font-mono text-white">{s.quantity}</td>
                        <td className="p-3 text-right font-mono text-slate-400">₹{s.unitPrice}</td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-400">₹{s.totalAmount.toLocaleString()}</td>
                        <td className="p-3 text-slate-300">{s.enteredBy?.username || 'Staff'}</td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleDeleteSale(s.id)}
                            className="p-1 text-red-400 hover:text-red-300 hover:bg-slate-800 rounded transition-all"
                            title="Delete Sale & Restore Stock"
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

      {/* EDIT PRODUCT MODAL */}
      {editingProd && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-indigo-400" />
                Edit Product Master
              </h3>
              <button
                onClick={() => setEditingProd(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditProduct} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 font-bold focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Selling Retail Price (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={editPrice}
                    onChange={(e) => setEditPrice(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 font-bold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-400 font-bold block mb-1">Purchase Cost (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editPurchasePrice}
                    onChange={(e) => setEditPurchasePrice(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Opening Stock Baseline</label>
                  <input
                    type="number"
                    min="0"
                    value={editOpeningStock}
                    onChange={(e) => setEditOpeningStock(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 font-bold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-400 font-bold block mb-1">Min Stock Alert Threshold</label>
                  <input
                    type="number"
                    min="1"
                    value={editMinStock}
                    onChange={(e) => setEditMinStock(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingProd(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingProd}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg"
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
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <PackagePlus className="h-5 w-5 text-emerald-400" />
                Add New Oil Product
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Servo Futura Synthetic 5W-30"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 font-bold focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Selling Retail Price (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={newPrice}
                    onChange={(e) => setNewPrice(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 font-bold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-400 font-bold block mb-1">Purchase Cost (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newPurchasePrice}
                    onChange={(e) => setNewPurchasePrice(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Opening Stock Baseline</label>
                  <input
                    type="number"
                    min="0"
                    value={newOpeningStock}
                    onChange={(e) => setNewOpeningStock(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 font-bold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-400 font-bold block mb-1">Min Stock Alert Threshold</label>
                  <input
                    type="number"
                    min="1"
                    value={newMinStock}
                    onChange={(e) => setNewMinStock(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingProd}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg"
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

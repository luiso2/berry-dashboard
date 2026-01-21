// Budget View - Self-contained event budget and finance management
import { useState, useEffect, useCallback } from 'react';
import type { BudgetCategory, BudgetItem } from '../types';
import { API_URL } from '../constants';

interface BudgetViewProps {
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const DEFAULT_CATEGORIES: BudgetCategory[] = [
  { id: 1, name: 'Venue', icon: '🏛️', color: '#8b5cf6', isIncome: false, sortOrder: 1 },
  { id: 2, name: 'Catering', icon: '🍽️', color: '#f59e0b', isIncome: false, sortOrder: 2 },
  { id: 3, name: 'Entertainment', icon: '🎵', color: '#ec4899', isIncome: false, sortOrder: 3 },
  { id: 4, name: 'Marketing', icon: '📢', color: '#3b82f6', isIncome: false, sortOrder: 4 },
  { id: 5, name: 'Staff', icon: '👥', color: '#22c55e', isIncome: false, sortOrder: 5 },
  { id: 6, name: 'Equipment', icon: '🎛️', color: '#6b7280', isIncome: false, sortOrder: 6 },
  { id: 7, name: 'Decor', icon: '✨', color: '#d4af37', isIncome: false, sortOrder: 7 },
  { id: 8, name: 'Miscellaneous', icon: '📦', color: '#64748b', isIncome: false, sortOrder: 8 },
  { id: 9, name: 'Ticket Sales', icon: '🎫', color: '#22c55e', isIncome: true, sortOrder: 9 },
  { id: 10, name: 'Sponsorships', icon: '🤝', color: '#d4af37', isIncome: true, sortOrder: 10 },
  { id: 11, name: 'VIP Tables', icon: '🥂', color: '#8b5cf6', isIncome: true, sortOrder: 11 },
];

export function BudgetView({ onToast }: BudgetViewProps) {
  // State
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [categories] = useState<BudgetCategory[]>(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState<number | 'all' | 'income' | 'expense'>('all');
  const [filterPaid, setFilterPaid] = useState<'all' | 'paid' | 'unpaid'>('all');

  const [formData, setFormData] = useState({
    categoryId: 1,
    description: '',
    vendorName: '',
    estimatedAmount: 0,
    actualAmount: 0,
    isPaid: false,
    paidDate: '',
    paymentMethod: '',
    notes: '',
    dueDate: '',
  });

  // Fetch budget items
  const fetchBudgetItems = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/budget/items`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch budget items:', err);
      // Mock data for demo
      setItems([
        {
          id: 1,
          budgetId: 1,
          categoryId: 1,
          categoryName: 'Venue',
          icon: '🏛️',
          color: '#8b5cf6',
          isIncome: false,
          description: 'Main venue rental',
          vendorName: 'Grand Ballroom',
          estimatedAmount: 5000,
          actualAmount: 4800,
          isPaid: true,
          paidDate: new Date(Date.now() - 7 * 24 * 60 * 60000).toISOString(),
          paymentMethod: 'Bank Transfer',
          status: 'paid',
        },
        {
          id: 2,
          budgetId: 1,
          categoryId: 2,
          categoryName: 'Catering',
          icon: '🍽️',
          color: '#f59e0b',
          isIncome: false,
          description: 'Food & beverages for 300 guests',
          vendorName: 'Elite Catering Co.',
          estimatedAmount: 8000,
          actualAmount: 8500,
          isPaid: false,
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60000).toISOString(),
          status: 'pending',
        },
        {
          id: 3,
          budgetId: 1,
          categoryId: 3,
          categoryName: 'Entertainment',
          icon: '🎵',
          color: '#ec4899',
          isIncome: false,
          description: 'DJ & sound system',
          vendorName: 'DJ MaxBeats',
          estimatedAmount: 2500,
          isPaid: false,
          status: 'pending',
        },
        {
          id: 4,
          budgetId: 1,
          categoryId: 9,
          categoryName: 'Ticket Sales',
          icon: '🎫',
          color: '#22c55e',
          isIncome: true,
          description: 'General admission tickets (200)',
          estimatedAmount: 10000,
          actualAmount: 12500,
          isPaid: true,
          status: 'received',
        },
        {
          id: 5,
          budgetId: 1,
          categoryId: 11,
          categoryName: 'VIP Tables',
          icon: '🥂',
          color: '#8b5cf6',
          isIncome: true,
          description: 'VIP table reservations (10)',
          estimatedAmount: 15000,
          actualAmount: 18000,
          isPaid: true,
          status: 'received',
        },
        {
          id: 6,
          budgetId: 1,
          categoryId: 10,
          categoryName: 'Sponsorships',
          icon: '🤝',
          color: '#d4af37',
          isIncome: true,
          description: 'Brand X sponsorship',
          estimatedAmount: 5000,
          actualAmount: 5000,
          isPaid: true,
          status: 'received',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBudgetItems();
  }, [fetchBudgetItems]);

  // Get category info
  const getCategoryInfo = (categoryId: number) => {
    return categories.find(c => c.id === categoryId) || categories[0];
  };

  // Save item
  const handleSaveItem = async () => {
    if (!formData.description || formData.estimatedAmount <= 0) {
      onToast('Please fill in description and amount', 'error');
      return;
    }

    const category = getCategoryInfo(formData.categoryId);

    try {
      const url = editingId ? `${API_URL}/budget/items/${editingId}` : `${API_URL}/budget/items`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        onToast(editingId ? 'Item updated' : 'Item added', 'success');
        await fetchBudgetItems();
        resetForm();
      } else {
        // Fallback for demo
        const newItem: BudgetItem = {
          id: editingId || Date.now(),
          budgetId: 1,
          categoryId: formData.categoryId,
          categoryName: category.name,
          icon: category.icon,
          color: category.color,
          isIncome: category.isIncome,
          description: formData.description,
          vendorName: formData.vendorName,
          estimatedAmount: formData.estimatedAmount,
          actualAmount: formData.actualAmount || undefined,
          isPaid: formData.isPaid,
          paidDate: formData.paidDate || undefined,
          paymentMethod: formData.paymentMethod || undefined,
          notes: formData.notes || undefined,
          dueDate: formData.dueDate || undefined,
          status: formData.isPaid ? (category.isIncome ? 'received' : 'paid') : 'pending',
        };

        if (editingId) {
          setItems(prev => prev.map(i => i.id === editingId ? newItem : i));
        } else {
          setItems(prev => [newItem, ...prev]);
        }
        onToast(editingId ? 'Item updated' : 'Item added', 'success');
        resetForm();
      }
    } catch (err) {
      onToast('Failed to save item', 'error');
    }
  };

  // Mark as paid
  const handleMarkPaid = async (id: number) => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    try {
      await fetch(`${API_URL}/budget/items/${id}/paid`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPaid: true, paidDate: new Date().toISOString() }),
      });
    } catch (err) {
      // Continue with local update
    }

    setItems(prev => prev.map(i => i.id === id ? {
      ...i,
      isPaid: true,
      paidDate: new Date().toISOString(),
      status: i.isIncome ? 'received' : 'paid',
    } : i));
    onToast(`Marked as ${item.isIncome ? 'received' : 'paid'}`, 'success');
  };

  // Delete item
  const handleDeleteItem = async (id: number) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      await fetch(`${API_URL}/budget/items/${id}`, { method: 'DELETE' });
    } catch (err) {
      // Continue with local delete
    }
    setItems(prev => prev.filter(i => i.id !== id));
    onToast('Item deleted', 'success');
  };

  // Edit item
  const handleEditItem = (item: BudgetItem) => {
    setFormData({
      categoryId: item.categoryId,
      description: item.description,
      vendorName: item.vendorName || '',
      estimatedAmount: item.estimatedAmount,
      actualAmount: item.actualAmount || 0,
      isPaid: item.isPaid,
      paidDate: item.paidDate || '',
      paymentMethod: item.paymentMethod || '',
      notes: item.notes || '',
      dueDate: item.dueDate || '',
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      categoryId: 1,
      description: '',
      vendorName: '',
      estimatedAmount: 0,
      actualAmount: 0,
      isPaid: false,
      paidDate: '',
      paymentMethod: '',
      notes: '',
      dueDate: '',
    });
    setEditingId(null);
    setShowForm(false);
  };

  // Filter items
  const filteredItems = items.filter(item => {
    if (filterCategory === 'income' && !item.isIncome) return false;
    if (filterCategory === 'expense' && item.isIncome) return false;
    if (typeof filterCategory === 'number' && item.categoryId !== filterCategory) return false;
    if (filterPaid === 'paid' && !item.isPaid) return false;
    if (filterPaid === 'unpaid' && item.isPaid) return false;
    return true;
  });

  // Calculate totals
  const incomeItems = items.filter(i => i.isIncome);
  const expenseItems = items.filter(i => !i.isIncome);

  const stats = {
    totalIncome: incomeItems.reduce((sum, i) => sum + (i.actualAmount || i.estimatedAmount), 0),
    estimatedIncome: incomeItems.reduce((sum, i) => sum + i.estimatedAmount, 0),
    totalExpenses: expenseItems.reduce((sum, i) => sum + (i.actualAmount || i.estimatedAmount), 0),
    estimatedExpenses: expenseItems.reduce((sum, i) => sum + i.estimatedAmount, 0),
    paidExpenses: expenseItems.filter(i => i.isPaid).reduce((sum, i) => sum + (i.actualAmount || i.estimatedAmount), 0),
    unpaidExpenses: expenseItems.filter(i => !i.isPaid).reduce((sum, i) => sum + (i.actualAmount || i.estimatedAmount), 0),
  };

  const netProfit = stats.totalIncome - stats.totalExpenses;
  const estimatedProfit = stats.estimatedIncome - stats.estimatedExpenses;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #222', borderTopColor: '#d4af37', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#666' }}>Loading budget...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Financial Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'linear-gradient(135deg, #22c55e20 0%, #0a0a0a 100%)', border: '1px solid #22c55e30', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Total Income</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>${stats.totalIncome.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Est: ${stats.estimatedIncome.toLocaleString()}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #ef444420 0%, #0a0a0a 100%)', border: '1px solid #ef444430', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Total Expenses</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#ef4444' }}>${stats.totalExpenses.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Est: ${stats.estimatedExpenses.toLocaleString()}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #f59e0b20 0%, #0a0a0a 100%)', border: '1px solid #f59e0b30', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Unpaid</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>${stats.unpaidExpenses.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Paid: ${stats.paidExpenses.toLocaleString()}</div>
        </div>
        <div style={{
          background: netProfit >= 0
            ? 'linear-gradient(135deg, #d4af3720 0%, #0a0a0a 100%)'
            : 'linear-gradient(135deg, #ef444420 0%, #0a0a0a 100%)',
          border: `1px solid ${netProfit >= 0 ? '#d4af37' : '#ef4444'}30`,
          borderRadius: 12,
          padding: 20,
        }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Net Profit</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: netProfit >= 0 ? '#d4af37' : '#ef4444' }}>
            {netProfit >= 0 ? '+' : '-'}${Math.abs(netProfit).toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Est: ${estimatedProfit.toLocaleString()}</div>
        </div>
      </div>

      {/* Actions & Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          onClick={() => setShowForm(true)}
          style={{ background: '#d4af37', color: '#000', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
        >
          + Add Item
        </button>
        <select
          value={filterCategory}
          onChange={(e) => {
            const val = e.target.value;
            setFilterCategory(val === 'all' || val === 'income' || val === 'expense' ? val : parseInt(val));
          }}
          style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: 8 }}
        >
          <option value="all">All Categories</option>
          <option value="income">Income Only</option>
          <option value="expense">Expenses Only</option>
          <optgroup label="Expenses">
            {categories.filter(c => !c.isIncome).map(cat => (
              <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
            ))}
          </optgroup>
          <optgroup label="Income">
            {categories.filter(c => c.isIncome).map(cat => (
              <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
            ))}
          </optgroup>
        </select>
        <select
          value={filterPaid}
          onChange={(e) => setFilterPaid(e.target.value as 'all' | 'paid' | 'unpaid')}
          style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: 8 }}
        >
          <option value="all">All Status</option>
          <option value="paid">Paid/Received</option>
          <option value="unpaid">Unpaid/Pending</option>
        </select>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600 }}>
              {editingId ? 'Edit Budget Item' : 'Add Budget Item'}
            </h3>

            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Category *</label>
                <select
                  value={formData.categoryId}
                  onChange={(e) => setFormData(prev => ({ ...prev, categoryId: parseInt(e.target.value) }))}
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                >
                  <optgroup label="Expenses">
                    {categories.filter(c => !c.isIncome).map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Income">
                    {categories.filter(c => c.isIncome).map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Description *</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="e.g., Main venue rental"
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Vendor/Source</label>
                <input
                  type="text"
                  value={formData.vendorName}
                  onChange={(e) => setFormData(prev => ({ ...prev, vendorName: e.target.value }))}
                  placeholder="e.g., Grand Ballroom"
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Estimated Amount *</label>
                  <input
                    type="number"
                    value={formData.estimatedAmount}
                    onChange={(e) => setFormData(prev => ({ ...prev, estimatedAmount: parseFloat(e.target.value) || 0 }))}
                    min={0}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Actual Amount</label>
                  <input
                    type="number"
                    value={formData.actualAmount}
                    onChange={(e) => setFormData(prev => ({ ...prev, actualAmount: parseFloat(e.target.value) || 0 }))}
                    min={0}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Due Date</label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Payment Method</label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData(prev => ({ ...prev, paymentMethod: e.target.value }))}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  >
                    <option value="">Select method</option>
                    <option value="Cash">Cash</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Check">Check</option>
                    <option value="PayPal">PayPal</option>
                    <option value="Venmo">Venmo</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.isPaid}
                    onChange={(e) => setFormData(prev => ({ ...prev, isPaid: e.target.checked }))}
                  />
                  <span style={{ fontSize: 14 }}>
                    {getCategoryInfo(formData.categoryId).isIncome ? 'Already received' : 'Already paid'}
                  </span>
                </label>
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8, resize: 'vertical' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                onClick={resetForm}
                style={{ flex: 1, background: '#333', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveItem}
                style={{ flex: 1, background: '#d4af37', color: '#000', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
              >
                {editingId ? 'Update' : 'Add'} Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Budget Items List */}
      <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Category</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Description</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Vendor</th>
              <th style={{ textAlign: 'right', padding: '12px 16px', color: '#888', fontSize: 13 }}>Estimated</th>
              <th style={{ textAlign: 'right', padding: '12px 16px', color: '#888', fontSize: 13 }}>Actual</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Status</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(item => {
              const variance = item.actualAmount ? item.actualAmount - item.estimatedAmount : 0;
              const varianceColor = item.isIncome
                ? (variance >= 0 ? '#22c55e' : '#ef4444')
                : (variance <= 0 ? '#22c55e' : '#ef4444');

              return (
                <tr key={item.id} style={{ borderBottom: '1px solid #111' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        background: item.color + '20',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                      }}>
                        {item.icon}
                      </span>
                      <span style={{ color: item.color, fontSize: 13, fontWeight: 500 }}>{item.categoryName}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 500 }}>{item.description}</div>
                    {item.notes && <div style={{ fontSize: 12, color: '#666' }}>{item.notes}</div>}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#888' }}>{item.vendorName || '-'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: item.isIncome ? '#22c55e' : '#ef4444' }}>
                    {item.isIncome ? '+' : '-'}${item.estimatedAmount.toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    {item.actualAmount ? (
                      <div>
                        <div style={{ color: item.isIncome ? '#22c55e' : '#ef4444' }}>
                          {item.isIncome ? '+' : '-'}${item.actualAmount.toLocaleString()}
                        </div>
                        {variance !== 0 && (
                          <div style={{ fontSize: 11, color: varianceColor }}>
                            ({variance > 0 ? '+' : ''}{variance.toLocaleString()})
                          </div>
                        )}
                      </div>
                    ) : '-'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      background: item.isPaid ? '#22c55e20' : '#f59e0b20',
                      color: item.isPaid ? '#22c55e' : '#f59e0b',
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 500,
                    }}>
                      {item.isPaid ? (item.isIncome ? 'Received' : 'Paid') : 'Pending'}
                    </span>
                    {!item.isPaid && item.dueDate && (
                      <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                        Due: {new Date(item.dueDate).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {!item.isPaid && (
                        <button
                          onClick={() => handleMarkPaid(item.id)}
                          style={{ background: '#22c55e', color: '#000', border: 'none', padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                        >
                          {item.isIncome ? 'Received' : 'Paid'}
                        </button>
                      )}
                      <button
                        onClick={() => handleEditItem(item)}
                        style={{ background: '#333', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        style={{ background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredItems.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💰</div>
            <p style={{ color: '#888', fontSize: 16 }}>No budget items found</p>
            <button
              onClick={() => setShowForm(true)}
              style={{ marginTop: 16, background: '#d4af37', color: '#000', border: 'none', padding: '12px 24px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
            >
              + Add First Item
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

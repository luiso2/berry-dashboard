// Vendors View - Self-contained vendor/contractor management
import { useState, useEffect, useCallback } from 'react';
import type { Vendor } from '../types';
import { API_URL } from '../constants';

interface VendorsViewProps {
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const CATEGORIES = [
  'Venue',
  'Catering',
  'Entertainment',
  'Photography',
  'Videography',
  'Audio/Visual',
  'Lighting',
  'Decor',
  'Florist',
  'Security',
  'Transportation',
  'Rentals',
  'Printing',
  'Other',
];

export function VendorsView({ onToast }: VendorsViewProps) {
  // State
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterPreferred, setFilterPreferred] = useState<'all' | 'preferred' | 'regular'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    category: 'Other',
    contactName: '',
    email: '',
    phone: '',
    website: '',
    address: '',
    city: '',
    notes: '',
    isPreferred: false,
  });

  // Fetch vendors
  const fetchVendors = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/vendors`);
      if (res.ok) {
        const data = await res.json();
        setVendors(data.vendors || []);
      }
    } catch (err) {
      console.error('Failed to fetch vendors:', err);
      // Mock data for demo
      setVendors([
        {
          id: 1,
          name: 'Grand Ballroom',
          category: 'Venue',
          contactName: 'Sarah Miller',
          email: 'sarah@grandballroom.com',
          phone: '+1 555-0101',
          website: 'www.grandballroom.com',
          address: '123 Main St',
          city: 'Miami',
          rating: 4.8,
          notes: 'Great for large events, 500+ capacity',
          isPreferred: true,
          totalSpent: 25000,
          eventsCount: 5,
          createdAt: new Date().toISOString(),
        },
        {
          id: 2,
          name: 'Elite Catering Co.',
          category: 'Catering',
          contactName: 'Marco Rodriguez',
          email: 'marco@elitecatering.com',
          phone: '+1 555-0102',
          rating: 4.5,
          notes: 'Specializes in Latin fusion cuisine',
          isPreferred: true,
          totalSpent: 18500,
          eventsCount: 6,
          createdAt: new Date().toISOString(),
        },
        {
          id: 3,
          name: 'DJ MaxBeats',
          category: 'Entertainment',
          contactName: 'Max Johnson',
          email: 'max@djmaxbeats.com',
          phone: '+1 555-0103',
          website: 'www.djmaxbeats.com',
          rating: 4.9,
          isPreferred: true,
          totalSpent: 8000,
          eventsCount: 8,
          createdAt: new Date().toISOString(),
        },
        {
          id: 4,
          name: 'Moments Photography',
          category: 'Photography',
          contactName: 'Lisa Chen',
          email: 'lisa@momentsphotography.com',
          phone: '+1 555-0104',
          rating: 4.7,
          isPreferred: false,
          totalSpent: 3500,
          eventsCount: 2,
          createdAt: new Date().toISOString(),
        },
        {
          id: 5,
          name: 'Secure Events',
          category: 'Security',
          contactName: 'James Wilson',
          email: 'james@secureevents.com',
          phone: '+1 555-0105',
          rating: 4.6,
          isPreferred: false,
          totalSpent: 6000,
          eventsCount: 4,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  // Save vendor
  const handleSaveVendor = async () => {
    if (!formData.name) {
      onToast('Please enter vendor name', 'error');
      return;
    }

    try {
      const url = editingId ? `${API_URL}/vendors/${editingId}` : `${API_URL}/vendors`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        onToast(editingId ? 'Vendor updated' : 'Vendor added', 'success');
        await fetchVendors();
        resetForm();
      } else {
        // Fallback for demo
        const newVendor: Vendor = {
          id: editingId || Date.now(),
          name: formData.name,
          category: formData.category,
          contactName: formData.contactName,
          email: formData.email,
          phone: formData.phone,
          website: formData.website,
          address: formData.address,
          city: formData.city,
          notes: formData.notes,
          isPreferred: formData.isPreferred,
          rating: 5.0,
          totalSpent: 0,
          eventsCount: 0,
          createdAt: new Date().toISOString(),
        };

        if (editingId) {
          setVendors(prev => prev.map(v => v.id === editingId ? { ...prev.find(v => v.id === editingId)!, ...newVendor } : v));
        } else {
          setVendors(prev => [newVendor, ...prev]);
        }
        onToast(editingId ? 'Vendor updated' : 'Vendor added', 'success');
        resetForm();
      }
    } catch (err) {
      onToast('Failed to save vendor', 'error');
    }
  };

  // Toggle preferred
  const handleTogglePreferred = async (id: number) => {
    const vendor = vendors.find(v => v.id === id);
    if (!vendor) return;

    try {
      await fetch(`${API_URL}/vendors/${id}/preferred`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPreferred: !vendor.isPreferred }),
      });
    } catch (err) {
      // Continue with local update
    }

    setVendors(prev => prev.map(v => v.id === id ? { ...v, isPreferred: !v.isPreferred } : v));
    onToast(vendor.isPreferred ? 'Removed from preferred' : 'Added to preferred', 'info');
  };

  // Delete vendor
  const handleDeleteVendor = async (id: number) => {
    if (!confirm('Are you sure you want to delete this vendor?')) return;

    try {
      await fetch(`${API_URL}/vendors/${id}`, { method: 'DELETE' });
    } catch (err) {
      // Continue with local delete
    }
    setVendors(prev => prev.filter(v => v.id !== id));
    onToast('Vendor deleted', 'success');
  };

  // Edit vendor
  const handleEditVendor = (vendor: Vendor) => {
    setFormData({
      name: vendor.name,
      category: vendor.category || 'Other',
      contactName: vendor.contactName || '',
      email: vendor.email || '',
      phone: vendor.phone || '',
      website: vendor.website || '',
      address: vendor.address || '',
      city: vendor.city || '',
      notes: vendor.notes || '',
      isPreferred: vendor.isPreferred,
    });
    setEditingId(vendor.id);
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      category: 'Other',
      contactName: '',
      email: '',
      phone: '',
      website: '',
      address: '',
      city: '',
      notes: '',
      isPreferred: false,
    });
    setEditingId(null);
    setShowForm(false);
  };

  // Filter vendors
  const filteredVendors = vendors.filter(v => {
    if (filterCategory !== 'all' && v.category !== filterCategory) return false;
    if (filterPreferred === 'preferred' && !v.isPreferred) return false;
    if (filterPreferred === 'regular' && v.isPreferred) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        v.name.toLowerCase().includes(query) ||
        v.contactName?.toLowerCase().includes(query) ||
        v.email?.toLowerCase().includes(query) ||
        v.category?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Stats
  const stats = {
    total: vendors.length,
    preferred: vendors.filter(v => v.isPreferred).length,
    totalSpent: vendors.reduce((sum, v) => sum + v.totalSpent, 0),
    avgRating: vendors.length > 0
      ? (vendors.reduce((sum, v) => sum + v.rating, 0) / vendors.length).toFixed(1)
      : '0',
  };

  // Render star rating
  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;
    return (
      <span style={{ color: '#d4af37' }}>
        {'★'.repeat(fullStars)}
        {hasHalf && '½'}
        {'☆'.repeat(5 - fullStars - (hasHalf ? 1 : 0))}
      </span>
    );
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #222', borderTopColor: '#d4af37', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#666' }}>Loading vendors...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Total Vendors</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{stats.total}</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Preferred</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#d4af37' }}>{stats.preferred}</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Total Spent</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#8b5cf6' }}>${stats.totalSpent.toLocaleString()}</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Avg Rating</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#d4af37' }}>⭐ {stats.avgRating}</div>
        </div>
      </div>

      {/* Actions & Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          onClick={() => setShowForm(true)}
          style={{ background: '#d4af37', color: '#000', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
        >
          + Add Vendor
        </button>
        <input
          type="text"
          placeholder="Search vendors..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: 8, minWidth: 200 }}
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: 8 }}
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select
          value={filterPreferred}
          onChange={(e) => setFilterPreferred(e.target.value as 'all' | 'preferred' | 'regular')}
          style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: 8 }}
        >
          <option value="all">All Vendors</option>
          <option value="preferred">Preferred Only</option>
          <option value="regular">Regular Only</option>
        </select>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600 }}>
              {editingId ? 'Edit Vendor' : 'Add Vendor'}
            </h3>

            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Company Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Contact Name</label>
                <input
                  type="text"
                  value={formData.contactName}
                  onChange={(e) => setFormData(prev => ({ ...prev, contactName: e.target.value }))}
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Website</label>
                <input
                  type="url"
                  value={formData.website}
                  onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                  placeholder="https://"
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8, resize: 'vertical' }}
                />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.isPreferred}
                    onChange={(e) => setFormData(prev => ({ ...prev, isPreferred: e.target.checked }))}
                  />
                  <span style={{ fontSize: 14, color: '#d4af37' }}>⭐ Preferred Vendor</span>
                </label>
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
                onClick={handleSaveVendor}
                style={{ flex: 1, background: '#d4af37', color: '#000', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
              >
                {editingId ? 'Update' : 'Add'} Vendor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vendors Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {filteredVendors.map(vendor => (
          <div
            key={vendor.id}
            style={{
              background: '#0a0a0a',
              border: vendor.isPreferred ? '1px solid #d4af3750' : '1px solid #1a1a1a',
              borderRadius: 12,
              padding: 20,
              position: 'relative',
            }}
          >
            {vendor.isPreferred && (
              <div style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: '#d4af37',
                color: '#000',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
              }}>
                ⭐ PREFERRED
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{vendor.name}</div>
              <span style={{
                background: '#333',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 12,
                color: '#888',
              }}>
                {vendor.category}
              </span>
            </div>

            {vendor.contactName && (
              <div style={{ fontSize: 14, color: '#888', marginBottom: 8 }}>
                Contact: {vendor.contactName}
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              {vendor.email && (
                <div style={{ fontSize: 13, color: '#666' }}>✉️ {vendor.email}</div>
              )}
              {vendor.phone && (
                <div style={{ fontSize: 13, color: '#666' }}>📱 {vendor.phone}</div>
              )}
              {vendor.website && (
                <div style={{ fontSize: 13, color: '#3b82f6' }}>🌐 {vendor.website}</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>Rating</div>
                <div style={{ fontSize: 14 }}>{renderStars(vendor.rating)} ({vendor.rating})</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>Events</div>
                <div style={{ fontSize: 14, color: '#fff' }}>{vendor.eventsCount}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>Total Spent</div>
                <div style={{ fontSize: 14, color: '#22c55e' }}>${vendor.totalSpent.toLocaleString()}</div>
              </div>
            </div>

            {vendor.notes && (
              <div style={{ background: '#111', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13, color: '#888' }}>
                {vendor.notes}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => handleTogglePreferred(vendor.id)}
                style={{
                  background: vendor.isPreferred ? '#333' : '#d4af3720',
                  color: vendor.isPreferred ? '#888' : '#d4af37',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {vendor.isPreferred ? 'Remove Preferred' : '⭐ Make Preferred'}
              </button>
              <button
                onClick={() => handleEditVendor(vendor)}
                style={{ background: '#333', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
              >
                Edit
              </button>
              <button
                onClick={() => handleDeleteVendor(vendor.id)}
                style={{ background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredVendors.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🤝</div>
          <p style={{ color: '#888', fontSize: 16 }}>No vendors found</p>
          <button
            onClick={() => setShowForm(true)}
            style={{ marginTop: 16, background: '#d4af37', color: '#000', border: 'none', padding: '12px 24px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
          >
            + Add First Vendor
          </button>
        </div>
      )}
    </div>
  );
}

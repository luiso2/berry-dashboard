// Staff Management View - Self-contained staff management system
import { useState, useEffect, useCallback } from 'react';
import type { Staff } from '../types';
import { API_URL } from '../constants';

interface StaffFormData {
  name: string;
  email: string;
  phone: string;
  role: string;
  secondaryRole: string;
  instagram: string;
  hourlyRate: number;
  dayRate: number;
  experienceLevel: Staff['experienceLevel'];
  skills: string[];
  notes: string;
  emergencyContact: string;
  emergencyPhone: string;
  availability: { weekdays: boolean; weekends: boolean };
}

interface StaffViewProps {
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const ROLES = [
  'Security',
  'Bartender',
  'Server',
  'Host/Hostess',
  'DJ',
  'Photographer',
  'Videographer',
  'Event Coordinator',
  'Manager',
  'Promoter',
  'Valet',
  'Cleaning Staff',
  'Setup Crew',
  'Other',
];

const EXPERIENCE_LEVELS: Staff['experienceLevel'][] = ['beginner', 'intermediate', 'advanced', 'expert'];

const EXPERIENCE_COLORS: Record<string, string> = {
  beginner: '#6b7280',
  intermediate: '#3b82f6',
  advanced: '#8b5cf6',
  expert: '#d4af37',
};

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  inactive: '#6b7280',
  unavailable: '#ef4444',
};

export function StaffView({ onToast }: StaffViewProps) {
  // State
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const [formData, setFormData] = useState<StaffFormData>({
    name: '',
    email: '',
    phone: '',
    role: 'Server',
    secondaryRole: '',
    instagram: '',
    hourlyRate: 25,
    dayRate: 200,
    experienceLevel: 'intermediate',
    skills: [],
    notes: '',
    emergencyContact: '',
    emergencyPhone: '',
    availability: { weekdays: true, weekends: true },
  });

  const [newSkill, setNewSkill] = useState('');

  // Fetch staff
  const fetchStaff = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/staff`);
      if (res.ok) {
        const data = await res.json();
        setStaff(data.staff || []);
      }
    } catch (err) {
      console.error('Failed to fetch staff:', err);
      // Mock data for demo
      setStaff([
        {
          id: 1,
          name: 'Maria Garcia',
          email: 'maria@email.com',
          phone: '+1234567890',
          role: 'Bartender',
          experienceLevel: 'expert',
          skills: ['Mixology', 'Customer Service', 'POS Systems'],
          status: 'active',
          rating: 4.8,
          totalEvents: 45,
          totalEarned: 8500,
          hourlyRate: 35,
          dayRate: 280,
          availability: { weekdays: true, weekends: true },
          createdAt: new Date().toISOString(),
        },
        {
          id: 2,
          name: 'James Wilson',
          email: 'james@email.com',
          phone: '+1234567891',
          role: 'Security',
          experienceLevel: 'advanced',
          skills: ['Crowd Control', 'First Aid', 'Conflict Resolution'],
          status: 'active',
          rating: 4.5,
          totalEvents: 30,
          totalEarned: 6000,
          hourlyRate: 30,
          dayRate: 240,
          availability: { weekdays: false, weekends: true },
          createdAt: new Date().toISOString(),
        },
        {
          id: 3,
          name: 'Sofia Martinez',
          email: 'sofia@email.com',
          phone: '+1234567892',
          role: 'Host/Hostess',
          experienceLevel: 'intermediate',
          skills: ['Guest Relations', 'Reservations', 'Bilingual'],
          status: 'active',
          rating: 4.9,
          totalEvents: 25,
          totalEarned: 4500,
          hourlyRate: 25,
          dayRate: 200,
          availability: { weekdays: true, weekends: true },
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  // Add skill
  const handleAddSkill = () => {
    if (newSkill.trim() && !formData.skills.includes(newSkill.trim())) {
      setFormData(prev => ({ ...prev, skills: [...prev.skills, newSkill.trim()] }));
      setNewSkill('');
    }
  };

  // Remove skill
  const handleRemoveSkill = (skill: string) => {
    setFormData(prev => ({ ...prev, skills: prev.skills.filter(s => s !== skill) }));
  };

  // Create/Update staff
  const handleSubmit = async () => {
    if (!formData.name || !formData.role) {
      onToast('Please fill in name and role', 'error');
      return;
    }

    try {
      const url = editingId ? `${API_URL}/staff/${editingId}` : `${API_URL}/staff`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        onToast(editingId ? 'Staff member updated' : 'Staff member added', 'success');
        await fetchStaff();
        resetForm();
      } else {
        // Fallback for demo
        const newStaffMember: Staff = {
          id: editingId || Date.now(),
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          role: formData.role,
          secondaryRole: formData.secondaryRole,
          instagram: formData.instagram,
          hourlyRate: formData.hourlyRate,
          dayRate: formData.dayRate,
          experienceLevel: formData.experienceLevel,
          skills: formData.skills,
          notes: formData.notes,
          status: 'active',
          rating: 5.0,
          totalEvents: 0,
          totalEarned: 0,
          availability: formData.availability,
          emergencyContact: formData.emergencyContact,
          emergencyPhone: formData.emergencyPhone,
          createdAt: new Date().toISOString(),
        };

        if (editingId) {
          setStaff(prev => prev.map(s => s.id === editingId ? newStaffMember : s));
        } else {
          setStaff(prev => [newStaffMember, ...prev]);
        }
        onToast(editingId ? 'Staff member updated' : 'Staff member added', 'success');
        resetForm();
      }
    } catch (err) {
      onToast('Failed to save staff member', 'error');
    }
  };

  // Update status
  const handleUpdateStatus = async (id: number, status: Staff['status']) => {
    try {
      await fetch(`${API_URL}/staff/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      // Continue with local update
    }
    setStaff(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    onToast(`Status updated to ${status}`, 'success');
  };

  // Delete staff
  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to remove this staff member?')) return;

    try {
      await fetch(`${API_URL}/staff/${id}`, { method: 'DELETE' });
    } catch (err) {
      // Continue with local delete
    }
    setStaff(prev => prev.filter(s => s.id !== id));
    onToast('Staff member removed', 'success');
  };

  // Edit staff
  const handleEdit = (member: Staff) => {
    setFormData({
      name: member.name,
      email: member.email || '',
      phone: member.phone || '',
      role: member.role,
      secondaryRole: member.secondaryRole || '',
      instagram: member.instagram || '',
      hourlyRate: member.hourlyRate || 25,
      dayRate: member.dayRate || 200,
      experienceLevel: member.experienceLevel,
      skills: member.skills || [],
      notes: member.notes || '',
      emergencyContact: member.emergencyContact || '',
      emergencyPhone: member.emergencyPhone || '',
      availability: member.availability || { weekdays: true, weekends: true },
    });
    setEditingId(member.id);
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      role: 'Server',
      secondaryRole: '',
      instagram: '',
      hourlyRate: 25,
      dayRate: 200,
      experienceLevel: 'intermediate',
      skills: [],
      notes: '',
      emergencyContact: '',
      emergencyPhone: '',
      availability: { weekdays: true, weekends: true },
    });
    setEditingId(null);
    setShowForm(false);
    setNewSkill('');
  };

  // Filter staff
  const filteredStaff = staff.filter(s => {
    if (filterRole !== 'all' && s.role !== filterRole) return false;
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        s.name.toLowerCase().includes(query) ||
        s.email?.toLowerCase().includes(query) ||
        s.role.toLowerCase().includes(query) ||
        s.skills?.some(skill => skill.toLowerCase().includes(query))
      );
    }
    return true;
  });

  // Stats
  const stats = {
    total: staff.length,
    active: staff.filter(s => s.status === 'active').length,
    avgRating: staff.length > 0 ? (staff.reduce((sum, s) => sum + s.rating, 0) / staff.length).toFixed(1) : '0',
    totalPaid: staff.reduce((sum, s) => sum + s.totalEarned, 0),
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #222', borderTopColor: '#d4af37', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#666' }}>Loading staff...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Total Staff</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{stats.total}</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Active</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>{stats.active}</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Avg Rating</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#d4af37' }}>⭐ {stats.avgRating}</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Total Paid</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#8b5cf6' }}>${stats.totalPaid.toLocaleString()}</div>
        </div>
      </div>

      {/* Actions & Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={() => setShowForm(true)}
          style={{ background: '#d4af37', color: '#000', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
        >
          + Add Staff Member
        </button>
        <input
          type="text"
          placeholder="Search by name, email, role, skills..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: 8, minWidth: 250 }}
        />
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: 8 }}
        >
          <option value="all">All Roles</option>
          {ROLES.map(role => (
            <option key={role} value={role}>{role}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: 8 }}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="unavailable">Unavailable</option>
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button
            onClick={() => setViewMode('grid')}
            style={{ background: viewMode === 'grid' ? '#333' : 'transparent', color: '#fff', border: '1px solid #333', padding: '8px 12px', borderRadius: 6, cursor: 'pointer' }}
          >
            ▦ Grid
          </button>
          <button
            onClick={() => setViewMode('table')}
            style={{ background: viewMode === 'table' ? '#333' : 'transparent', color: '#fff', border: '1px solid #333', padding: '8px 12px', borderRadius: 6, cursor: 'pointer' }}
          >
            ☰ Table
          </button>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 16, padding: 24, width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600 }}>
              {editingId ? 'Edit Staff Member' : 'Add Staff Member'}
            </h3>

            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Full Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Primary Role *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  >
                    {ROLES.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Secondary Role</label>
                  <select
                    value={formData.secondaryRole}
                    onChange={(e) => setFormData(prev => ({ ...prev, secondaryRole: e.target.value }))}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  >
                    <option value="">None</option>
                    {ROLES.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Experience Level</label>
                  <select
                    value={formData.experienceLevel}
                    onChange={(e) => setFormData(prev => ({ ...prev, experienceLevel: e.target.value as Staff['experienceLevel'] }))}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  >
                    {EXPERIENCE_LEVELS.map(level => (
                      <option key={level} value={level}>{level.charAt(0).toUpperCase() + level.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Hourly Rate ($)</label>
                  <input
                    type="number"
                    value={formData.hourlyRate}
                    onChange={(e) => setFormData(prev => ({ ...prev, hourlyRate: parseFloat(e.target.value) || 0 }))}
                    min={0}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Day Rate ($)</label>
                  <input
                    type="number"
                    value={formData.dayRate}
                    onChange={(e) => setFormData(prev => ({ ...prev, dayRate: parseFloat(e.target.value) || 0 }))}
                    min={0}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Instagram</label>
                  <input
                    type="text"
                    value={formData.instagram}
                    onChange={(e) => setFormData(prev => ({ ...prev, instagram: e.target.value }))}
                    placeholder="@username"
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Skills</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  {formData.skills.map(skill => (
                    <span
                      key={skill}
                      style={{ background: '#333', padding: '4px 10px', borderRadius: 4, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      {skill}
                      <button
                        onClick={() => handleRemoveSkill(skill)}
                        style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 0 }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddSkill()}
                    placeholder="Add a skill..."
                    style={{ flex: 1, background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '8px 12px', borderRadius: 6 }}
                  />
                  <button
                    onClick={handleAddSkill}
                    style={{ background: '#333', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}
                  >
                    Add
                  </button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Availability</label>
                <div style={{ display: 'flex', gap: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.availability.weekdays}
                      onChange={(e) => setFormData(prev => ({ ...prev, availability: { ...prev.availability, weekdays: e.target.checked } }))}
                    />
                    Weekdays
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.availability.weekends}
                      onChange={(e) => setFormData(prev => ({ ...prev, availability: { ...prev.availability, weekends: e.target.checked } }))}
                    />
                    Weekends
                  </label>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Emergency Contact</label>
                  <input
                    type="text"
                    value={formData.emergencyContact}
                    onChange={(e) => setFormData(prev => ({ ...prev, emergencyContact: e.target.value }))}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Emergency Phone</label>
                  <input
                    type="tel"
                    value={formData.emergencyPhone}
                    onChange={(e) => setFormData(prev => ({ ...prev, emergencyPhone: e.target.value }))}
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
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                onClick={resetForm}
                style={{ flex: 1, background: '#333', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                style={{ flex: 1, background: '#d4af37', color: '#000', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
              >
                {editingId ? 'Update' : 'Add'} Staff Member
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staff Grid/Table */}
      {viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filteredStaff.map(member => (
            <div
              key={member.id}
              style={{
                background: '#0a0a0a',
                border: '1px solid #1a1a1a',
                borderRadius: 12,
                padding: 20,
                borderTop: `3px solid ${EXPERIENCE_COLORS[member.experienceLevel]}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    background: EXPERIENCE_COLORS[member.experienceLevel] + '30',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    fontWeight: 600,
                    color: EXPERIENCE_COLORS[member.experienceLevel],
                  }}>
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>{member.name}</div>
                    <div style={{ fontSize: 13, color: '#888' }}>{member.role}</div>
                  </div>
                </div>
                <span style={{
                  background: STATUS_COLORS[member.status] + '20',
                  color: STATUS_COLORS[member.status],
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  textTransform: 'capitalize',
                }}>
                  {member.status}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>Rating</div>
                  <div style={{ fontSize: 14, color: '#d4af37' }}>⭐ {member.rating.toFixed(1)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>Events</div>
                  <div style={{ fontSize: 14, color: '#fff' }}>{member.totalEvents}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>Earned</div>
                  <div style={{ fontSize: 14, color: '#22c55e' }}>${member.totalEarned.toLocaleString()}</div>
                </div>
              </div>

              {member.skills && member.skills.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {member.skills.slice(0, 3).map(skill => (
                    <span key={skill} style={{ background: '#222', padding: '2px 8px', borderRadius: 4, fontSize: 11, color: '#888' }}>
                      {skill}
                    </span>
                  ))}
                  {member.skills.length > 3 && (
                    <span style={{ fontSize: 11, color: '#666' }}>+{member.skills.length - 3} more</span>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, fontSize: 12, color: '#666', marginBottom: 12 }}>
                <span>${member.hourlyRate}/hr</span>
                <span>•</span>
                <span>${member.dayRate}/day</span>
                {member.availability && (
                  <>
                    <span>•</span>
                    <span>
                      {member.availability.weekdays && member.availability.weekends ? 'Full availability' :
                       member.availability.weekends ? 'Weekends only' : 'Weekdays only'}
                    </span>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={member.status}
                  onChange={(e) => handleUpdateStatus(member.id, e.target.value as Staff['status'])}
                  style={{ background: '#222', border: '1px solid #333', color: '#fff', padding: '6px 10px', borderRadius: 6, fontSize: 12 }}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="unavailable">Unavailable</option>
                </select>
                <button
                  onClick={() => handleEdit(member)}
                  style={{ background: '#333', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(member.id)}
                  style={{ background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Name</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Role</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Experience</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Rating</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Events</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Rates</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Status</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.map(member => (
                <tr key={member.id} style={{ borderBottom: '1px solid #111' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 500 }}>{member.name}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>{member.email}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>{member.role}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      background: EXPERIENCE_COLORS[member.experienceLevel] + '20',
                      color: EXPERIENCE_COLORS[member.experienceLevel],
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      textTransform: 'capitalize',
                    }}>
                      {member.experienceLevel}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#d4af37' }}>⭐ {member.rating.toFixed(1)}</td>
                  <td style={{ padding: '12px 16px' }}>{member.totalEvents}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13 }}>${member.hourlyRate}/hr • ${member.dayRate}/day</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      background: STATUS_COLORS[member.status] + '20',
                      color: STATUS_COLORS[member.status],
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      textTransform: 'capitalize',
                    }}>
                      {member.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => handleEdit(member)}
                        style={{ background: '#333', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(member.id)}
                        style={{ background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filteredStaff.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
          <p style={{ color: '#888', fontSize: 16 }}>No staff members found</p>
          <button
            onClick={() => setShowForm(true)}
            style={{ marginTop: 16, background: '#d4af37', color: '#000', border: 'none', padding: '12px 24px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
          >
            + Add First Staff Member
          </button>
        </div>
      )}
    </div>
  );
}

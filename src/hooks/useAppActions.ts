// App Actions Hook - Centralized action handlers
import { useCallback } from 'react';
import { API_URL, ENDPOINTS } from '../constants';
import { calculateAIScore, statusToCategory } from '../utils';
import type { Guest, GuestCategory, Ticket, EventbriteEventMetrics } from '../types';
import type { AppState } from './useAppState';

export function useAppActions(state: AppState, token?: string, userId?: number) {
  const {
    setGuests, setLoading, setToasts,
    setModels, setModelStats,
    setTables, setTableStats,
    setTickets, setTicketStats,
    setOrders, setOrderStats,
    setSponsors, setSponsorStats,
    setPromoters, setPromoterStats, setPromoterLeaderboard,
    setEvents, setEventStats,
    setBudgetCategories, setBudgetItems, setBudgetSummary,
    setVendors,
    setStaffMembers, setStaffStats,
    setIntegrations,
    setEventbriteMetrics, setLoadingEventbriteMetrics,
    setSmsStats,
    integrations,
  } = state;

  // Toast notifications
  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, [setToasts]);

  // Fetch Guests
  const fetchGuests = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}${ENDPOINTS.guests}`);
      const responseData = await res.json();
      const data = responseData.entries || responseData.data || responseData;

      const transformedData = Array.isArray(data) ? data.map((g: any) => ({
        id: String(g.id),
        name: g.name || '',
        email: g.email || '',
        phone: g.phone || '',
        instagram: g.instagram || '',
        partySize: g.numberOfGuests || g.partySize || g.number_of_guests || 1,
        eventDate: g.eventDate || g.event_date || new Date().toISOString(),
        notes: g.notes || g.vipPreferences || '',
        category: g.category || statusToCategory(g.status),
        status: g.status,
        emailSent: g.emailSent || g.email_sent || false,
        emailSentAt: g.emailSentAt || g.email_sent_at,
        createdAt: g.createdAt || g.created_at || new Date().toISOString(),
        checkedInAt: g.checkedInAt || g.checked_in_at,
        eventId: g.eventId || g.event_id,
      })) : [];

      const guestsWithScores = transformedData.map((g: Guest) => ({
        ...g,
        aiScore: calculateAIScore(g),
      }));
      setGuests(guestsWithScores);
    } catch (error) {
      console.error('Error fetching guests:', error);
      addToast('Error loading guests', 'error');
    } finally {
      setLoading(false);
    }
  }, [setGuests, setLoading, addToast]);

  // Fetch Models
  const fetchModels = useCallback(async () => {
    try {
      const [modelsRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/models`),
        fetch(`${API_URL}/models/stats`)
      ]);
      const modelsData = await modelsRes.json();
      const statsData = await statsRes.json();
      setModels(modelsData.models || []);
      setModelStats(statsData);
    } catch (error) {
      console.error('Error fetching models:', error);
    }
  }, [setModels, setModelStats]);

  // Fetch Tables
  const fetchTables = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/table-reservations`);
      const data = await res.json();
      const rawReservations = data.reservations || data;
      const reservations = (Array.isArray(rawReservations) ? rawReservations : []).map((r: any) => ({
        ...r,
        zone: r.zone || 'Standard',
        tableName: r.tableName || `Table ${r.tableId}`,
      }));
      setTables(reservations);
      setTableStats({
        total: reservations.length,
        pending: reservations.filter((r: any) => r.status === 'pending').length,
        confirmed: reservations.filter((r: any) => r.status === 'confirmed').length,
        revenue: reservations.filter((r: any) => r.status === 'confirmed').reduce((sum: number, r: any) => sum + (r.minimumSpend || 0), 0),
      });
    } catch (error) {
      console.error('Error fetching tables:', error);
    }
  }, [setTables, setTableStats]);

  // Fetch Tickets
  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/tickets`);
      const data = await res.json();
      const rawTickets = data.tickets || data;
      const ticketList = Array.isArray(rawTickets) ? rawTickets : [];
      setTickets(ticketList);
      setTicketStats({
        total: ticketList.length,
        valid: ticketList.filter((t: Ticket) => t.status === 'valid').length,
        used: ticketList.filter((t: Ticket) => t.status === 'used').length,
        revenue: ticketList.reduce((sum: number, t: Ticket) => sum + (t.price || 0), 0),
      });
    } catch (error) {
      console.error('Error fetching tickets:', error);
    }
  }, [setTickets, setTicketStats]);

  // Fetch Orders
  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/orders`);
      const data = await res.json();
      setOrders(data.orders || []);
      if (data.stats) {
        setOrderStats({
          total_orders: parseInt(data.stats.total_orders) || 0,
          total_tickets: parseInt(data.stats.total_tickets) || 0,
          total_revenue: parseFloat(data.stats.total_revenue) || 0,
          active_orders: parseInt(data.stats.active_orders) || 0,
          refunded_orders: parseInt(data.stats.refunded_orders) || 0,
        });
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  }, [setOrders, setOrderStats]);

  // Fetch Sponsors
  const fetchSponsors = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/sponsors`);
      const data = await res.json();
      const rawSponsors = data.submissions || data;
      const sponsorList = Array.isArray(rawSponsors) ? rawSponsors : [];
      setSponsors(sponsorList);
      setSponsorStats({
        total: sponsorList.length,
        pending: sponsorList.filter((s: any) => s.status === 'pending').length,
        active: sponsorList.filter((s: any) => s.status === 'active').length,
        revenue: sponsorList.filter((s: any) => s.status === 'active').reduce((sum: number, s: any) => sum + (s.tierPrice || 0), 0),
      });
    } catch (error) {
      console.error('Error fetching sponsors:', error);
    }
  }, [setSponsors, setSponsorStats]);

  // Fetch Promoters
  const fetchPromoters = useCallback(async () => {
    try {
      const [promotersRes, leaderboardRes] = await Promise.all([
        fetch(`${API_URL}/promoters`),
        fetch(`${API_URL}/promoters/leaderboard`)
      ]);
      const promotersData = await promotersRes.json();
      const leaderboardData = await leaderboardRes.json();

      const promoterList = promotersData.promoters || [];
      setPromoters(promoterList);
      setPromoterStats({
        total: promoterList.length,
        active: promoterList.filter((p: any) => p.status === 'active').length,
        totalSales: promoterList.reduce((sum: number, p: any) => sum + (p.salesCount || 0), 0),
        totalCommission: promoterList.reduce((sum: number, p: any) => sum + (p.totalCommission || 0), 0),
      });
      setPromoterLeaderboard(leaderboardData.leaderboard || []);
    } catch (error) {
      console.error('Error fetching promoters:', error);
    }
  }, [setPromoters, setPromoterStats, setPromoterLeaderboard]);

  // Fetch Events
  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/events`);
      const data = await res.json();
      const eventList = data.events || [];
      setEvents(eventList);

      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      setEventStats({
        total: eventList.length,
        planning: eventList.filter((e: any) => e.status === 'planning').length,
        confirmed: eventList.filter((e: any) => e.status === 'confirmed').length,
        completed: eventList.filter((e: any) => e.status === 'completed').length,
        upcoming: eventList.filter((e: any) => new Date(e.eventDate) > now).length,
        thisMonth: eventList.filter((e: any) => {
          const eventDate = new Date(e.eventDate);
          return eventDate >= thisMonth && eventDate <= nextMonth;
        }).length,
      });
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  }, [setEvents, setEventStats]);

  // Fetch Budget
  const fetchBudget = useCallback(async (eventId?: number) => {
    try {
      const [categoriesRes, itemsRes, summaryRes] = await Promise.all([
        fetch(`${API_URL}/budget/categories`),
        fetch(`${API_URL}/budget/items${eventId ? `?eventId=${eventId}` : ''}`),
        fetch(`${API_URL}/budget/summary${eventId ? `?eventId=${eventId}` : ''}`)
      ]);

      const categoriesData = await categoriesRes.json();
      const itemsData = await itemsRes.json();
      const summaryData = await summaryRes.json();

      setBudgetCategories(categoriesData.categories || []);
      setBudgetItems(itemsData.items || []);
      setBudgetSummary(summaryData);
    } catch (error) {
      console.error('Error fetching budget:', error);
    }
  }, [setBudgetCategories, setBudgetItems, setBudgetSummary]);

  // Fetch Vendors
  const fetchVendors = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/vendors`);
      const data = await res.json();
      setVendors(data.vendors || []);
    } catch (error) {
      console.error('Error fetching vendors:', error);
    }
  }, [setVendors]);

  // Fetch Staff
  const fetchStaff = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/staff`);
      const data = await res.json();
      const staffList = data.staff || [];
      setStaffMembers(staffList);
      setStaffStats({
        total: staffList.length,
        active: staffList.filter((s: any) => s.isActive).length,
        inactive: staffList.filter((s: any) => !s.isActive).length,
        avgRating: staffList.length > 0
          ? staffList.reduce((sum: number, s: any) => sum + (s.rating || 0), 0) / staffList.length
          : 0,
      });
    } catch (error) {
      console.error('Error fetching staff:', error);
    }
  }, [setStaffMembers, setStaffStats]);

  // Fetch Integrations
  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/integrations`);
      const data = await res.json();
      let integrationsList = data.integrations || [];

      if (userId) {
        try {
          const eventbriteRes = await fetch(`${API_URL}/auth/eventbrite/status?userId=${userId}`);
          const eventbriteData = await eventbriteRes.json();

          integrationsList = integrationsList.map((int: any) => {
            if (int.provider === 'eventbrite') {
              return {
                ...int,
                status: eventbriteData.connected ? 'connected' : 'disconnected',
                connectedUser: eventbriteData.user,
                lastSync: eventbriteData.lastSync
              };
            }
            return int;
          });
        } catch (e) {
          console.error('Error checking Eventbrite status:', e);
        }
      }

      setIntegrations(integrationsList);
    } catch (error) {
      console.error('Error fetching integrations:', error);
    }
  }, [setIntegrations, userId]);

  // Fetch Eventbrite Metrics
  const fetchEventbriteMetrics = useCallback(async () => {
    const eventbriteIntegration = integrations.find(i => i.provider === 'eventbrite');
    if (!eventbriteIntegration || eventbriteIntegration.status !== 'connected') {
      setEventbriteMetrics(prev => ({ ...prev, connected: false }));
      return;
    }

    setLoadingEventbriteMetrics(true);
    try {
      const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`${API_URL}/integrations/eventbrite/metrics`, { headers });

      if (res.ok) {
        const data = await res.json();
        const eventsData = data.events || [];
        const totalPageViews = eventsData.reduce((sum: number, e: EventbriteEventMetrics) => sum + (e.pageViews || 0), 0);
        const totalUniqueVisitors = eventsData.reduce((sum: number, e: EventbriteEventMetrics) => sum + (e.uniqueVisitors || 0), 0);
        const totalGrossRevenue = eventsData.reduce((sum: number, e: EventbriteEventMetrics) => sum + (e.grossRevenue || 0), 0);
        const totalFees = eventsData.reduce((sum: number, e: EventbriteEventMetrics) => sum + (e.fees || 0), 0);
        const totalRefunds = eventsData.reduce((sum: number, e: EventbriteEventMetrics) => sum + (e.refunds || 0), 0);
        const totalTickets = data.totalTicketsSold || 0;
        const conversionRate = totalUniqueVisitors > 0 ? (totalTickets / totalUniqueVisitors) * 100 : 0;

        const allSalesByDay = eventsData.flatMap((e: EventbriteEventMetrics) => e.salesByDay || []);
        const last7Days = allSalesByDay.slice(-7);
        const avgDailySales = last7Days.length > 0
          ? last7Days.reduce((sum: number, d: { tickets: number }) => sum + d.tickets, 0) / last7Days.length
          : 0;

        const recentSales = last7Days.slice(-3).reduce((sum: number, d: { tickets: number }) => sum + d.tickets, 0) / 3;
        const olderSales = last7Days.slice(0, 3).reduce((sum: number, d: { tickets: number }) => sum + d.tickets, 0) / 3;
        const salesTrend: 'up' | 'down' | 'stable' = recentSales > olderSales * 1.1 ? 'up' : recentSales < olderSales * 0.9 ? 'down' : 'stable';

        setEventbriteMetrics({
          connected: true,
          organizationName: data.organizationName,
          totalEvents: data.totalEvents || 0,
          activeEvents: data.activeEvents || 0,
          totalTicketsSold: totalTickets,
          totalRevenue: data.totalRevenue || totalGrossRevenue - totalFees - totalRefunds,
          totalAttendees: data.totalAttendees || 0,
          checkedIn: data.checkedIn || 0,
          conversionRate: Math.round(conversionRate * 10) / 10,
          events: eventsData,
          lastSync: new Date().toISOString(),
          totalPageViews,
          totalUniqueVisitors,
          totalGrossRevenue,
          totalFees,
          totalRefunds,
          totalNetRevenue: totalGrossRevenue - totalFees - totalRefunds,
          avgDailySales: Math.round(avgDailySales * 10) / 10,
          salesTrend,
        });
      }
    } catch (error) {
      console.error('Error fetching Eventbrite metrics:', error);
    } finally {
      setLoadingEventbriteMetrics(false);
    }
  }, [integrations, token, setEventbriteMetrics, setLoadingEventbriteMetrics]);

  // Fetch SMS Stats
  const fetchSmsStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/sms/stats`);
      const data = await res.json();
      setSmsStats(data);
    } catch (error) {
      console.error('Error fetching SMS stats:', error);
    }
  }, [setSmsStats]);

  // Remove Guest
  const removeGuest = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_URL}${ENDPOINTS.guests}/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setGuests(prev => prev.filter(g => g.id !== id));
        addToast('Guest removed successfully', 'success');
      }
    } catch (error) {
      console.error('Error removing guest:', error);
      addToast('Failed to remove guest', 'error');
    }
  }, [setGuests, addToast]);

  // Update Guest Category
  const updateGuestCategory = useCallback(async (ids: string[], category: GuestCategory) => {
    try {
      await Promise.all(ids.map(id =>
        fetch(`${API_URL}${ENDPOINTS.guests}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category })
        })
      ));
      await fetchGuests();
      addToast(`Updated ${ids.length} guest(s) to ${category}`, 'success');
    } catch (error) {
      console.error('Error updating guests:', error);
      addToast('Failed to update guests', 'error');
    }
  }, [fetchGuests, addToast]);

  // Check In Guest
  const checkInGuest = useCallback(async (guest: Guest) => {
    try {
      const res = await fetch(`${API_URL}${ENDPOINTS.guests}/${guest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkedInAt: new Date().toISOString() })
      });
      if (res.ok) {
        setGuests(prev => prev.map(g =>
          g.id === guest.id ? { ...g, checkedInAt: new Date().toISOString() } : g
        ));
        addToast(`${guest.name} checked in!`, 'success');
      }
    } catch (error) {
      console.error('Error checking in guest:', error);
      addToast('Failed to check in guest', 'error');
    }
  }, [setGuests, addToast]);

  // Delete Staff
  const deleteStaff = useCallback(async (id: number) => {
    if (!confirm('Are you sure you want to delete this staff member?')) return;
    try {
      const res = await fetch(`${API_URL}/staff/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchStaff();
        addToast('Staff member deleted', 'success');
      }
    } catch (error) {
      console.error('Error deleting staff:', error);
      addToast('Failed to delete staff', 'error');
    }
  }, [fetchStaff, addToast]);

  // Update Sponsor
  const updateSponsor = useCallback(async (id: string, updates: { status?: string; logoUrl?: string; notes?: string }) => {
    try {
      const res = await fetch(`${API_URL}/sponsors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        fetchSponsors();
        addToast('Sponsor updated', 'success');
      }
    } catch (error) {
      console.error('Error updating sponsor:', error);
      addToast('Failed to update sponsor', 'error');
    }
  }, [fetchSponsors, addToast]);

  // Delete Sponsor
  const deleteSponsor = useCallback(async (id: string) => {
    if (!confirm('Are you sure you want to delete this sponsor?')) return;
    try {
      const res = await fetch(`${API_URL}/sponsors/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchSponsors();
        addToast('Sponsor deleted', 'success');
      }
    } catch (error) {
      console.error('Error deleting sponsor:', error);
      addToast('Failed to delete sponsor', 'error');
    }
  }, [fetchSponsors, addToast]);

  // Send Email to Guest (approval/confirmation)
  const sendGuestEmail = useCallback(async (guest: Guest, emailType: 'approval' | 'confirmation' | 'custom', _customMessage?: string) => {
    try {
      // First, update the guest record to mark email as sent
      const updateRes = await fetch(`${API_URL}${ENDPOINTS.guests}/${guest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailSent: true,
          emailSentAt: new Date().toISOString()
        })
      });

      if (updateRes.ok) {
        setGuests(prev => prev.map(g =>
          g.id === guest.id ? { ...g, emailSent: true, emailSentAt: new Date().toISOString() } : g
        ));

        // Try to send email via Resend MCP (if available)
        // For now, we mark as sent - actual email sending happens via backend webhook or manual process
        const emailTypeLabels = {
          approval: 'approval',
          confirmation: 'confirmation',
          custom: 'custom'
        };
        addToast(`${emailTypeLabels[emailType]} email marked for ${guest.name}`, 'success');
        return true;
      } else {
        addToast('Failed to update email status', 'error');
        return false;
      }
    } catch (error) {
      console.error('Error sending email:', error);
      addToast('Failed to send email', 'error');
      return false;
    }
  }, [setGuests, addToast]);

  // Send Bulk Emails to Multiple Guests
  const sendBulkGuestEmails = useCallback(async (
    guestIds: string[],
    emailType: 'approval' | 'confirmation' | 'reminder' | 'custom',
    _subject?: string,
    _customMessage?: string
  ) => {
    try {
      // Update all guests to mark emails as sent
      const updatePromises = guestIds.map(id =>
        fetch(`${API_URL}${ENDPOINTS.guests}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emailSent: true,
            emailSentAt: new Date().toISOString()
          })
        })
      );

      const results = await Promise.all(updatePromises);
      const successCount = results.filter(r => r.ok).length;

      if (successCount > 0) {
        setGuests(prev => prev.map(g =>
          guestIds.includes(g.id) ? { ...g, emailSent: true, emailSentAt: new Date().toISOString() } : g
        ));
        addToast(`${emailType} emails marked for ${successCount} guests`, 'success');
        return true;
      } else {
        addToast('Failed to update email status', 'error');
        return false;
      }
    } catch (error) {
      console.error('Error sending bulk emails:', error);
      addToast('Failed to send emails', 'error');
      return false;
    }
  }, [setGuests, addToast]);

  // Approve Guest (move to category and optionally send email)
  const approveGuest = useCallback(async (guest: Guest, category: GuestCategory, sendEmail: boolean = true) => {
    try {
      // Update category
      const res = await fetch(`${API_URL}${ENDPOINTS.guests}/${guest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category })
      });
      if (res.ok) {
        setGuests(prev => prev.map(g =>
          g.id === guest.id ? { ...g, category } : g
        ));

        // Send approval email if requested
        if (sendEmail) {
          await sendGuestEmail(guest, 'approval');
        }

        addToast(`${guest.name} approved as ${category === 'A' ? 'VIP' : category === 'B' ? 'Priority' : 'Standard'}`, 'success');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error approving guest:', error);
      addToast('Failed to approve guest', 'error');
      return false;
    }
  }, [setGuests, sendGuestEmail, addToast]);

  // Reject Guest
  const rejectGuest = useCallback(async (guest: Guest, _sendEmail: boolean = false) => {
    try {
      const res = await fetch(`${API_URL}${ENDPOINTS.guests}/${guest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'rejected' })
      });
      if (res.ok) {
        setGuests(prev => prev.map(g =>
          g.id === guest.id ? { ...g, category: 'rejected' as GuestCategory } : g
        ));
        addToast(`${guest.name} has been rejected`, 'info');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error rejecting guest:', error);
      addToast('Failed to reject guest', 'error');
      return false;
    }
  }, [setGuests, addToast]);

  // Bulk Approve Guests
  const bulkApproveGuests = useCallback(async (guestIds: string[], category: GuestCategory, sendEmails: boolean = true) => {
    try {
      await Promise.all(guestIds.map(id =>
        fetch(`${API_URL}${ENDPOINTS.guests}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category })
        })
      ));

      setGuests(prev => prev.map(g =>
        guestIds.includes(g.id) ? { ...g, category } : g
      ));

      if (sendEmails) {
        await sendBulkGuestEmails(guestIds, 'approval');
      }

      addToast(`${guestIds.length} guests approved as ${category === 'A' ? 'VIP' : category === 'B' ? 'Priority' : 'Standard'}`, 'success');
      return true;
    } catch (error) {
      console.error('Error bulk approving guests:', error);
      addToast('Failed to approve guests', 'error');
      return false;
    }
  }, [setGuests, sendBulkGuestEmails, addToast]);

  return {
    addToast,
    fetchGuests,
    fetchModels,
    fetchTables,
    fetchTickets,
    fetchOrders,
    fetchSponsors,
    fetchPromoters,
    fetchEvents,
    fetchBudget,
    fetchVendors,
    fetchStaff,
    fetchIntegrations,
    fetchEventbriteMetrics,
    fetchSmsStats,
    removeGuest,
    updateGuestCategory,
    checkInGuest,
    deleteStaff,
    updateSponsor,
    deleteSponsor,
    // Email & Approval functions
    sendGuestEmail,
    sendBulkGuestEmails,
    approveGuest,
    rejectGuest,
    bulkApproveGuests,
  };
}

export type AppActions = ReturnType<typeof useAppActions>;

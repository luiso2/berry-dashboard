// App Context - Centralized state management
import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useAppState } from '../hooks/useAppState';
import { useAppActions } from '../hooks/useAppActions';
import type { AppState } from '../hooks/useAppState';
import type { AppActions } from '../hooks/useAppActions';

interface AppContextValue {
  state: AppState;
  actions: AppActions;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const state = useAppState();
  const actions = useAppActions(state, token ?? undefined, user?.id);

  // Initialize data on mount - wait for token to be available
  useEffect(() => {
    if (!token) return; // Don't fetch until authenticated

    actions.fetchGuests();
    actions.fetchEvents();
    actions.fetchIntegrations();

    // Set up polling interval
    const interval = setInterval(() => {
      actions.fetchGuests();
      state.setLastRefresh(new Date());
    }, 10000);

    return () => clearInterval(interval);
  }, [token]);

  // Fetch module data when view changes
  useEffect(() => {
    if (!token) return; // Don't fetch until authenticated

    const view = state.activeView;

    if (view === 'events') actions.fetchEvents();
    if (view === 'tickets') {
      actions.fetchTickets();
      actions.fetchOrders();
    }
    if (view === 'tables') actions.fetchTables();
    if (view === 'sponsors') actions.fetchSponsors();
    if (view === 'staff') actions.fetchStaff();
    if (view === 'integrations') actions.fetchIntegrations();
    if (view === 'models') actions.fetchModels();
    if (view === 'promoters') actions.fetchPromoters();
    if (view === 'eventbrite') actions.fetchEventbriteMetrics();
    if (view === 'sms') actions.fetchSmsStats();
  }, [state.activeView, token]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // N = New guest
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        state.setShowForm(true);
      }
      // R = Refresh all data
      if (e.key === 'r' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        actions.fetchGuests();
        actions.fetchEvents();
        actions.addToast('Data refreshed', 'success');
      }
      // Esc = Close modals
      if (e.key === 'Escape') {
        state.setShowForm(false);
        state.setShowFilters(false);
        state.setConfirmation({ show: false, guests: [], category: null, emailOnly: false });
        state.setQRModal({ show: false, guest: null });
        state.setReminderModal({ show: false, guests: [] });
        state.setSidebarOpen(false);
      }
      // G+O = Overview
      if (e.key === 'o' && e.shiftKey) {
        e.preventDefault();
        state.setActiveView('analytics');
      }
      // G+G = Guests
      if (e.key === 'g' && !e.shiftKey && !e.metaKey) {
        e.preventDefault();
        state.setActiveView('guests');
      }
      // G+E = Events
      if (e.key === 'e' && !e.metaKey) {
        e.preventDefault();
        state.setActiveView('events');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, actions]);

  const value = useMemo(() => ({ state, actions }), [state, actions]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

// Convenience hooks
export function useAppToasts() {
  const { state, actions } = useApp();
  return {
    toasts: state.toasts,
    addToast: actions.addToast,
  };
}

export function useAppView() {
  const { state } = useApp();
  return {
    activeView: state.activeView,
    setActiveView: state.setActiveView,
    sidebarOpen: state.sidebarOpen,
    setSidebarOpen: state.setSidebarOpen,
  };
}

// ActionMenuPortal.tsx - Robust dropdown menu using Portal
// Renders menu to document.body to escape overflow/transform issues

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ActionMenuPortalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement>;
  children: React.ReactNode;
  maxHeight?: number;
}

export function ActionMenuPortal({
  isOpen,
  onClose,
  triggerRef,
  children,
  maxHeight = 400,
}: ActionMenuPortalProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');

  // Calculate position relative to trigger
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const menuWidth = 320;
      const menuHeight = Math.min(maxHeight, 500);

      // Check if menu fits below or needs to go above
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      const fitsBelow = spaceBelow >= menuHeight + 8;
      const shouldPlaceAbove = !fitsBelow && spaceAbove > spaceBelow;

      // Calculate left position (prefer right-aligned, but keep in viewport)
      let left = rect.right - menuWidth;
      if (left < 8) left = 8;
      if (left + menuWidth > viewportWidth - 8) {
        left = viewportWidth - menuWidth - 8;
      }

      // Calculate top position
      let top: number;
      if (shouldPlaceAbove) {
        top = rect.top - menuHeight - 8;
        setPlacement('top');
      } else {
        top = rect.bottom + 8;
        setPlacement('bottom');
      }

      // Clamp to viewport
      top = Math.max(8, Math.min(top, viewportHeight - menuHeight - 8));

      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, triggerRef, maxHeight]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  const menu = (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 99999, // Very high to escape any stacking context
        minWidth: 320,
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: maxHeight,
        overflowY: 'auto',
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)',
        animation: placement === 'bottom'
          ? 'slideDownFadeIn 0.15s ease-out'
          : 'slideUpFadeIn 0.15s ease-out',
      }}
      role="menu"
      aria-orientation="vertical"
    >
      {children}
    </div>
  );

  // Render to document.body via Portal
  return createPortal(menu, document.body);
}

// Backdrop overlay for modal-style menu
export function ActionMenuModal({
  isOpen,
  onClose,
  guestName,
  guestEmail,
  children,
  maxHeight = 500,
}: {
  isOpen: boolean;
  onClose: () => void;
  guestName: string;
  guestEmail: string;
  children: React.ReactNode;
  maxHeight?: number;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const modal = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99998,
        padding: 16,
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-menu-title"
    >
      <div
        ref={menuRef}
        style={{
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: 16,
          width: '100%',
          maxWidth: 380,
          maxHeight: `min(${maxHeight}px, calc(100vh - 32px))`,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 80px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.05)',
          animation: 'scaleIn 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #333',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            <h3
              id="action-menu-title"
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 600,
                color: '#fff',
              }}
            >
              {guestName}
            </h3>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 13,
                color: '#888',
              }}
            >
              {guestEmail}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#222',
              border: '1px solid #333',
              borderRadius: 8,
              color: '#888',
              fontSize: 18,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#333';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#222';
              e.currentTarget.style.color = '#888';
            }}
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        {/* Content with scroll */}
        <div
          style={{
            overflowY: 'auto',
            flexGrow: 1,
            padding: '12px 8px',
          }}
        >
          {children}
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes slideDownFadeIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes slideUpFadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );

  return createPortal(modal, document.body);
}

// Menu Section component
export function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        style={{
          margin: '8px 16px 8px',
          fontSize: 11,
          color: '#666',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontWeight: 600,
        }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

// Menu Item component
export function MenuItem({
  icon,
  label,
  description,
  onClick,
  variant = 'default',
}: {
  icon: string;
  label: string;
  description?: string;
  onClick: () => void;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const colors = {
    default: { hover: '#ffffff10', text: '#fff' },
    success: { hover: '#22c55e20', text: '#22c55e' },
    warning: { hover: '#f59e0b20', text: '#f59e0b' },
    danger: { hover: '#ef444420', text: '#ef4444' },
  };

  const color = colors[variant];

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        background: 'transparent',
        border: 'none',
        padding: '12px 16px',
        color: variant === 'default' ? '#fff' : color.text,
        fontSize: 14,
        cursor: 'pointer',
        borderRadius: 8,
        textAlign: 'left',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = color.hover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      role="menuitem"
    >
      <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>{label}</div>
        {description && (
          <div
            style={{
              fontSize: 12,
              color: '#666',
              marginTop: 2,
            }}
          >
            {description}
          </div>
        )}
      </div>
    </button>
  );
}

// Divider component
export function MenuDivider() {
  return (
    <div
      style={{
        height: 1,
        background: '#333',
        margin: '8px 16px',
      }}
    />
  );
}

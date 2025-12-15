import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface MeatballMenuProps {
  onCopyLink: () => void;
  onShare: () => void;
  onAddNote?: () => void;
  onDelete: () => void;
  buttonClassName?: string;
  iconClassName?: string;
}

export default function MeatballMenu({ 
  onCopyLink, 
  onShare, 
  onAddNote, 
  onDelete,
  buttonClassName = '',
  iconClassName = 'w-6 h-6 sm:w-5 sm:h-5'
}: MeatballMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  // Calculate menu position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8, // 8px gap below button
        left: rect.left,
      });
    }
  }, [isOpen]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isOnButton = buttonRef.current?.contains(target);
      const isOnMenu = menuRef.current?.contains(target);

      if (!isOnButton && !isOnMenu) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const menuItems = [
    {
      label: 'Copy Link',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      ),
      action: () => {
        onCopyLink();
        setIsOpen(false);
      },
    },
    {
      label: 'Share',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
      ),
      action: () => {
        onShare();
        setIsOpen(false);
      },
    },
    ...(onAddNote ? [{
      label: 'Add note',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
      action: () => {
        onAddNote();
        setIsOpen(false);
      },
    }] : []),
    {
      label: 'Delete',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      ),
      action: () => {
        onDelete();
        setIsOpen(false);
      },
      isDestructive: true,
    },
  ];

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`transition-colors p-2 sm:p-2 rounded-md touch-manipulation ${buttonClassName}`}
        style={{ color: 'var(--theme-text-muted)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--theme-text)';
          e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--theme-text-muted)';
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
        title="More options"
        aria-label="More options"
      >
        <svg className={iconClassName} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
        </svg>
      </button>

      {/* Menu Card */}
      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="fixed shadow-xl py-1 z-[101] min-w-[160px]"
          style={{
            backgroundColor: 'var(--theme-card-bg)',
            border: '1px solid var(--theme-border)',
            top: menuPosition.top,
            left: menuPosition.left,
          }}
        >
          {menuItems.map((item, index) => (
            <button
              key={item.label}
              onClick={(e) => {
                e.stopPropagation();
                item.action();
              }}
              className="w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center gap-2"
              style={{
                color: item.isDestructive ? '#dc2626' : 'var(--theme-text-secondary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = item.isDestructive ? '#dc2626' : 'var(--theme-text)';
                e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = item.isDestructive ? '#dc2626' : 'var(--theme-text-secondary)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <span style={{ color: 'inherit' }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

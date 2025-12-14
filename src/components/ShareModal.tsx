import { createPortal } from 'react-dom';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  title: string;
}

export default function ShareModal({ isOpen, onClose, url, title }: ShareModalProps) {
  if (!isOpen) return null;

  const shareOptions = [
    {
      label: 'Copy Link',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      ),
      action: async () => {
        try {
          await navigator.clipboard.writeText(url);
          onClose();
        } catch (error) {
          console.error('Failed to copy link:', error);
        }
      },
    },
    {
      label: 'Email',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      action: () => {
        window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`;
        onClose();
      },
    },
    {
      label: 'Messages',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      action: () => {
        window.location.href = `sms:?body=${encodeURIComponent(`${title}\n${url}`)}`;
        onClose();
      },
    },
    {
      label: 'WhatsApp',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
        </svg>
      ),
      action: () => {
        window.open(`https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`, '_blank');
        onClose();
      },
    },
    {
      label: 'Messenger',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path fillRule="evenodd" clipRule="evenodd" d="M12.0015 2C6.36855 2 1.99997 6.12644 1.99997 11.7011C1.99997 14.6169 3.19537 17.1356 5.1402 18.8751C5.30189 19.0215 5.40074 19.2238 5.4084 19.4444L5.46357 21.2245C5.46753 21.3554 5.50362 21.4833 5.56865 21.5969C5.63368 21.7106 5.72567 21.8065 5.8365 21.8762C5.94733 21.9459 6.07361 21.9873 6.2042 21.9968C6.3348 22.0062 6.46572 21.9834 6.58541 21.9303L8.57085 21.0552C8.7402 20.9816 8.92794 20.9671 9.10418 21.0146C10.0161 21.2651 10.9869 21.4008 11.9984 21.4008C17.6314 21.4008 22 17.2751 22 11.7004C22 6.12644 17.6322 2 12.0015 2ZM17.2528 9.57854L14.7486 13.5502C14.6544 13.6997 14.5302 13.8281 14.3839 13.9272C14.2376 14.0263 14.0724 14.0941 13.8986 14.1262C13.7248 14.1583 13.5462 14.154 13.3742 14.1137C13.2021 14.0734 13.0403 13.9979 12.8988 13.892L10.9065 12.3992C10.8178 12.3329 10.71 12.2971 10.5992 12.2971C10.4884 12.2971 10.3807 12.3329 10.2919 12.3992L7.6038 14.4398C7.24748 14.7119 6.77621 14.282 7.0153 13.9034L9.51951 9.9318C9.61375 9.7823 9.73793 9.65394 9.88424 9.55481C10.0305 9.45568 10.1958 9.38793 10.3696 9.35582C10.5434 9.32371 10.7219 9.32795 10.894 9.36826C11.066 9.40857 11.2279 9.48408 11.3693 9.59004L13.3617 11.0828C13.4504 11.149 13.5582 11.1849 13.6689 11.1849C13.7797 11.1849 13.8875 11.149 13.9762 11.0828L16.6643 9.04215C17.0245 8.76628 17.4958 9.19617 17.2528 9.57854Z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        </svg>
      ),
      action: () => {
        window.open(`https://www.facebook.com/dialog/send?link=${encodeURIComponent(url)}&app_id=YOUR_APP_ID`, '_blank');
        onClose();
      },
    },
    {
      label: 'Twitter',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      ),
      action: () => {
        window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`, '_blank');
        onClose();
      },
    },
  ];

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div
        className="fixed inset-0 z-[151] flex items-end sm:items-center justify-center p-4"
        onClick={(e) => {
          // Close if clicking outside modal content
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div
          className="w-full max-w-md shadow-xl"
          style={{
            backgroundColor: 'var(--theme-card-bg)',
            border: '1px solid var(--theme-border)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--theme-border)' }}>
            <h2 className="text-lg font-medium" style={{ color: 'var(--theme-text)' }}>
              Share this article
            </h2>
            <button
              onClick={onClose}
              className="p-1 transition-colors touch-manipulation"
              style={{ color: 'var(--theme-text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--theme-text)';
                e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--theme-text-muted)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Share Options Grid */}
          <div className="p-4">
            <div className="grid grid-cols-2 gap-3">
              {shareOptions.map((option) => (
                <button
                  key={option.label}
                  onClick={option.action}
                  className="flex items-center gap-3 p-3 border transition-colors touch-manipulation text-left"
                  style={{
                    backgroundColor: 'var(--theme-card-bg)',
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--theme-card-bg)';
                  }}
                >
                  <span style={{ color: 'var(--theme-text-muted)' }}>{option.icon}</span>
                  <span className="text-sm font-medium">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

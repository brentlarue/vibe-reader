import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function BackToTop() {
  const [isVisible, setIsVisible] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const location = useLocation();

  // Detect standalone/PWA mode
  useEffect(() => {
    // Check if running in standalone mode (PWA/home screen app)
    const checkStandalone = () => {
      // Method 1: Check display-mode media query
      if (window.matchMedia('(display-mode: standalone)').matches) {
        setIsStandalone(true);
        return;
      }
      
      // Method 2: Check if running in iOS standalone mode
      // @ts-ignore - navigator.standalone is iOS-specific
      if (window.navigator.standalone === true) {
        setIsStandalone(true);
        return;
      }
      
      // Method 3: Check if running in Android standalone mode
      if (window.matchMedia('(display-mode: fullscreen)').matches) {
        setIsStandalone(true);
        return;
      }
      
      setIsStandalone(false);
    };

    checkStandalone();
    
    // Listen for changes (e.g., if user adds to home screen while app is open)
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleChange = () => checkStandalone();
    mediaQuery.addEventListener('change', handleChange);
    
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Show/hide button based on scroll position
  useEffect(() => {
    const scrollContainer = document.querySelector('main');
    if (!scrollContainer) return;

    const handleScroll = () => {
      // Show button after scrolling down 300px
      const scrollThreshold = 300;
      setIsVisible(scrollContainer.scrollTop > scrollThreshold);
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    
    // Check initial scroll position
    handleScroll();

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [location.pathname]); // Re-run when route changes

  const scrollToTop = () => {
    const scrollContainer = document.querySelector('main');
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  };

  // Don't show on article pages (they have the "next" button)
  const isArticlePage = location.pathname.startsWith('/article');

  // Only show in standalone mode and when scrolled down
  if (!isStandalone || !isVisible || isArticlePage) {
    return null;
  }

  return (
    <button
      onClick={scrollToTop}
      className="fixed bottom-8 left-6 sm:bottom-10 sm:left-8 z-30 p-2 rounded transition-colors touch-manipulation"
      style={{
        color: 'var(--theme-text-muted)',
        backgroundColor: 'var(--theme-card-bg)',
        border: '1px solid var(--theme-border)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        // Extra bottom padding for iOS safe area
        marginBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--theme-text-secondary)';
        e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--theme-text-muted)';
        e.currentTarget.style.backgroundColor = 'var(--theme-card-bg)';
      }}
      aria-label="Scroll to top"
      title="Scroll to top"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
      </svg>
    </button>
  );
}


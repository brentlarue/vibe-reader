import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function BackToTop() {
  const [isVisible, setIsVisible] = useState(false);
  const location = useLocation();

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

  // Only show when scrolled down
  if (!isVisible) {
    return null;
  }

  const isArticlePage = location.pathname.startsWith('/article');
  
  // On article pages, stack above the next button (which is at bottom-8 right-6)
  // On other pages, use the same position as the next button would be
  const bottomClass = isArticlePage 
    ? 'bottom-20 sm:bottom-24' // Stacked above next button
    : 'bottom-8 sm:bottom-10';  // Same position as next button
  const rightClass = 'right-6 sm:right-8';

  return (
    <button
      onClick={scrollToTop}
      className={`fixed ${bottomClass} ${rightClass} z-30 p-2 rounded transition-colors touch-manipulation`}
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


import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Sidebar from './Sidebar';
import FeedList from './FeedList';
import ArticleReader from './ArticleReader';
import NotesPage from './NotesPage';
import WorkflowInspector from './WorkflowInspector/WorkflowInspector';
import BackToTop from './BackToTop';
import { Feed } from '../types';

interface AppContentProps {
  feeds: Feed[];
  selectedFeedId: string | null;
  setSelectedFeedId: (id: string | null) => void;
  handleFeedsChange: () => void;
  handleRefreshAllFeeds: (clearFirst: boolean) => Promise<void>;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  isMobileDrawerOpen: boolean;
  setIsMobileDrawerOpen: (open: boolean) => void;
}

function AppContent({
  feeds,
  selectedFeedId,
  setSelectedFeedId,
  handleFeedsChange,
  handleRefreshAllFeeds,
  isSidebarCollapsed,
  toggleSidebar,
  isMobileDrawerOpen,
  setIsMobileDrawerOpen,
}: AppContentProps) {
  const location = useLocation();

  const toggleMobileDrawer = () => {
    setIsMobileDrawerOpen(!isMobileDrawerOpen);
  };

  const closeMobileDrawer = () => {
    setIsMobileDrawerOpen(false);
  };

  // Close mobile drawer when route changes
  useEffect(() => {
    setIsMobileDrawerOpen(false);
  }, [location.pathname, setIsMobileDrawerOpen]);

  return (
    <div 
      className="flex h-screen relative"
      style={{ backgroundColor: 'var(--theme-bg)' }}
    >
      {/* Mobile sidebar toggle button - only visible on mobile when drawer is closed */}
      {!isMobileDrawerOpen && (
        <button
          onClick={toggleMobileDrawer}
          className="lg:hidden fixed top-6 left-6 z-50 p-2 rounded transition-colors touch-manipulation"
          style={{
            color: 'var(--theme-text-muted)',
            backgroundColor: 'var(--theme-card-bg)',
            border: '1px solid var(--theme-border)',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--theme-text-secondary)';
            e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--theme-text-muted)';
            e.currentTarget.style.backgroundColor = 'var(--theme-card-bg)';
          }}
          aria-label="Open menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="3" width="18" height="18" rx="1" strokeWidth="2" />
            <line x1="9" y1="3" x2="9" y2="21" strokeWidth="2" />
          </svg>
        </button>
      )}

      {/* Mobile drawer overlay */}
      {isMobileDrawerOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={closeMobileDrawer}
        />
      )}

      {/* Sidebar - visible on desktop, drawer on mobile */}
      {(!isSidebarCollapsed || isMobileDrawerOpen) && (
        <div
          className={`
            ${isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            fixed lg:static inset-y-0 left-0 z-40
            transition-transform duration-300 ease-in-out
            ${isSidebarCollapsed && !isMobileDrawerOpen ? 'hidden lg:block' : ''}
            flex-shrink-0
          `}
        >
          <Sidebar 
            feeds={feeds} 
            selectedFeedId={selectedFeedId}
            onFeedsChange={handleFeedsChange}
            onRefreshFeeds={() => handleRefreshAllFeeds(false)}
            onFeedSelect={setSelectedFeedId}
            onToggle={toggleSidebar}
            onCloseMobileDrawer={closeMobileDrawer}
            isMobileDrawerOpen={isMobileDrawerOpen}
          />
        </div>
      )}

      {/* Desktop sidebar toggle - only visible on desktop when collapsed */}
      {isSidebarCollapsed && (
        <button
          onClick={toggleSidebar}
          className="hidden lg:block absolute left-8 top-8 p-2 rounded transition-colors z-10"
          style={{
            color: 'var(--theme-text-muted)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--theme-text-secondary)';
            e.currentTarget.style.backgroundColor = 'var(--theme-hover-bg)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--theme-text-muted)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="3" width="18" height="18" rx="1" strokeWidth="2" />
            <line x1="9" y1="3" x2="9" y2="21" strokeWidth="2" />
          </svg>
          <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-white bg-black whitespace-nowrap opacity-0 group-hover/toggle:opacity-100 pointer-events-none transition-opacity duration-0">
            Open sidebar
          </span>
        </button>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden px-6 sm:px-6 md:px-8 lg:px-12 pt-6 pb-6 sm:py-8 lg:py-12 w-0 min-w-0">
        <Routes>
          <Route path="/" element={<Navigate to="/inbox" replace />} />
          <Route path="/inbox" element={<FeedList status="inbox" selectedFeedId={selectedFeedId} feeds={feeds} onRefresh={() => handleRefreshAllFeeds(false)} />} />
          <Route path="/saved" element={<FeedList status="saved" selectedFeedId={selectedFeedId} feeds={feeds} onRefresh={() => handleRefreshAllFeeds(false)} />} />
          <Route path="/bookmarks" element={<FeedList status="bookmarked" selectedFeedId={selectedFeedId} feeds={feeds} onRefresh={() => handleRefreshAllFeeds(false)} />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/archive" element={<FeedList status="archived" selectedFeedId={selectedFeedId} feeds={feeds} onRefresh={() => handleRefreshAllFeeds(false)} />} />
          <Route path="/workflows/:slug" element={<WorkflowInspector />} />
          <Route path="/article/:id" element={<ArticleReader />} />
        </Routes>
      </main>
      
      {/* Back to top button */}
      <BackToTop />
    </div>
  );
}

export default AppContent;


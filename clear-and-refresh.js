// Script to clear all feed items and refresh feeds
// Run this in the browser console or as a Node script

// For browser console:
if (typeof window !== 'undefined') {
  // Clear all feed items
  localStorage.setItem('vibe-reader-feed-items', JSON.stringify([]));
  console.log('✓ Cleared all feed items');
  
  // Trigger a page reload to refresh feeds
  console.log('Please click the refresh button in the sidebar to fetch the latest 5 items from each feed.');
  // Or automatically trigger refresh if we're in the app context
  window.dispatchEvent(new CustomEvent('clearAndRefresh'));
} else {
  // For Node.js
  console.log('This script should be run in the browser console.');
  console.log('Open your browser console and run:');
  console.log('localStorage.setItem("vibe-reader-feed-items", JSON.stringify([]));');
  console.log('Then click the refresh button in the sidebar.');
}


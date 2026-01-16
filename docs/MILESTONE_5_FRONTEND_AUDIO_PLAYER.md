# Milestone 5: Frontend Audio Player

## Overview
This milestone creates a Spotify-like full-screen audio player in your React app to play the daily brief audio files generated in Milestone 4.

## Prerequisites
- ✅ Milestone 4 completed (audio files stored in Supabase Storage)
- Audio file URLs accessible via `feed_items.audio_brief_url` or `daily_brief_runs` metadata

## Step 1: Create BriefPlayer Component

Create a new component file: `src/components/BriefPlayer.tsx`

### Basic Structure

```typescript
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

interface BriefPlayerProps {
  audioUrl: string;
  date: string;
  articleCount: number;
  onClose: () => void;
}

export default function BriefPlayer({ audioUrl, date, articleCount, onClose }: BriefPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    audio.currentTime = percent * duration;
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors p-2"
        aria-label="Close"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="text-center max-w-md w-full px-6">
        {/* Date and metadata */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-white mb-2">Daily Brief</h2>
          <p className="text-gray-400">{new Date(date).toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}</p>
          <p className="text-gray-500 text-sm mt-1">{articleCount} articles</p>
        </div>

        {/* Play/Pause button */}
        <button
          onClick={togglePlayPause}
          disabled={isLoading}
          className="w-24 h-24 mx-auto mb-8 rounded-full bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-wait"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isLoading ? (
            <svg className="w-12 h-12 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : isPlaying ? (
            <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="w-12 h-12 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Progress bar */}
        <div className="mb-4">
          <div
            onClick={handleSeek}
            className="h-1 bg-gray-700 rounded-full cursor-pointer relative"
          >
            <div
              className="h-1 bg-white rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Time display */}
        <div className="flex justify-between text-sm text-gray-400">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Hidden audio element */}
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onError={(e) => {
            console.error('Audio playback error:', e);
            setIsLoading(false);
          }}
        />
      </div>
    </div>
  );
}
```

## Step 2: Create Brief Page Component

Create `src/components/BriefPage.tsx` to fetch and display the brief:

```typescript
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BriefPlayer from './BriefPlayer';
import { storage } from '../utils/storage';
import { FeedItem } from '../types';

export default function BriefPage() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [articleCount, setArticleCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);

  useEffect(() => {
    loadBriefData();
  }, [date]);

  const loadBriefData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const briefDate = date || new Date().toISOString().split('T')[0];
      
      // Get brief metadata
      const metadataResponse = await fetch(`/api/brief/metadata?date=${briefDate}`, {
        credentials: 'include',
      });

      if (!metadataResponse.ok) {
        throw new Error('Failed to load brief metadata');
      }

      const metadata = await metadataResponse.json();
      setArticleCount(metadata.articleCount || 0);

      // Get items to find audio URL
      const itemsResponse = await fetch(`/api/brief/items?date=${briefDate}`, {
        credentials: 'include',
      });

      if (!itemsResponse.ok) {
        throw new Error('Failed to load brief items');
      }

      const items: FeedItem[] = await itemsResponse.json();
      
      // Find the first item with an audio brief URL
      const itemWithAudio = items.find(item => item.audioBriefUrl);
      
      if (itemWithAudio?.audioBriefUrl) {
        setAudioUrl(itemWithAudio.audioBriefUrl);
        setShowPlayer(true);
      } else {
        setError('No audio brief available for this date');
      }
    } catch (err) {
      console.error('Error loading brief:', err);
      setError(err instanceof Error ? err.message : 'Failed to load daily brief');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading daily brief...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md px-6">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-800 dark:hover:bg-gray-600"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!audioUrl) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md px-6">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            No audio brief available for {date || 'today'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-800 dark:hover:bg-gray-600"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {showPlayer && (
        <BriefPlayer
          audioUrl={audioUrl}
          date={date || new Date().toISOString().split('T')[0]}
          articleCount={articleCount}
          onClose={() => navigate('/')}
        />
      )}
    </>
  );
}
```

## Step 3: Add Route to App

Update `src/App.tsx` to include the brief route:

```typescript
// Add import
import BriefPage from './components/BriefPage';

// In your routes, add:
<Route path="/brief/:date?" element={<BriefPage />} />
```

## Step 4: Add Navigation Link

Update `src/components/Sidebar.tsx` to add a "Daily Brief" link:

```typescript
// Add to navItems array or create a new section:
{
  name: 'Daily Brief',
  path: '/brief',
  icon: '🎧', // or use an SVG icon
}
```

## Step 5: Enhanced Features (Optional)

### Add Article List Toggle

In `BriefPlayer`, add a collapsible article list:

```typescript
const [showArticles, setShowArticles] = useState(false);
const [articles, setArticles] = useState<FeedItem[]>([]);

// Fetch articles when component mounts
useEffect(() => {
  const loadArticles = async () => {
    const response = await fetch(`/api/brief/items?date=${date}`, {
      credentials: 'include',
    });
    if (response.ok) {
      const items = await response.json();
      setArticles(items.filter((item: FeedItem) => item.aiSummary));
    }
  };
  loadArticles();
}, [date]);

// Add to JSX:
<button
  onClick={() => setShowArticles(!showArticles)}
  className="mt-4 text-sm text-gray-400 hover:text-white"
>
  {showArticles ? 'Hide' : 'Show'} Articles ({articles.length})
</button>

{showArticles && (
  <div className="mt-4 max-h-64 overflow-y-auto text-left">
    {articles.map((article) => (
      <div key={article.id} className="py-2 border-b border-gray-800">
        <p className="text-white font-medium">{article.title}</p>
        <p className="text-gray-400 text-sm">{article.source}</p>
      </div>
    ))}
  </div>
)}
```

### Add Playback Speed Control

```typescript
const [playbackRate, setPlaybackRate] = useState(1);

useEffect(() => {
  const audio = audioRef.current;
  if (audio) {
    audio.playbackRate = playbackRate;
  }
}, [playbackRate]);

// Add speed selector:
<select
  value={playbackRate}
  onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
  className="mt-4 bg-gray-800 text-white rounded px-2 py-1"
>
  <option value="0.75">0.75x</option>
  <option value="1">1x</option>
  <option value="1.25">1.25x</option>
  <option value="1.5">1.5x</option>
  <option value="2">2x</option>
</select>
```

## Step 6: Testing

1. **Test with existing audio:**
   - Navigate to `/brief/2026-01-16` (or today's date)
   - Verify player loads and plays audio
   - Test play/pause
   - Test progress bar scrubbing
   - Test close button

2. **Test error handling:**
   - Navigate to `/brief/2026-01-01` (date with no audio)
   - Verify error message displays

3. **Test mobile:**
   - Open on mobile device
   - Verify full-screen player works
   - Test touch controls

## Styling Notes

- Use dark background (`bg-black/95`) for full-screen overlay
- Large, centered play button (Spotify-style)
- Smooth transitions for play/pause state
- Progress bar should be clickable for seeking
- Time display should update smoothly

## Next Steps

Once the player is working:
- ✅ Audio plays correctly
- ✅ Progress tracking works
- ✅ Mobile-responsive
- ✅ Ready for Milestone 6: Integration & Polish

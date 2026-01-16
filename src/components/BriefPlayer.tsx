import { useState, useEffect, useRef } from 'react';

interface BriefPlayerProps {
  audioUrl: string;
  date: string;
  articleCount: number;
  thumbnail?: string | null;
  onClose?: () => void;
  onDelete?: () => void;
}

export default function BriefPlayer({ audioUrl, date, articleCount, thumbnail, onClose, onDelete }: BriefPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Set the audio source
    console.log('[BriefPlayer] Setting audio URL:', audioUrl);
    audio.src = audioUrl;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
        setIsLoading(false);
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    const handleError = (e: Event) => {
      const audioElement = e.target as HTMLAudioElement;
      const error = audioElement.error;
      let errorMessage = 'Failed to load audio file';
      
      if (error) {
        switch (error.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorMessage = 'Audio loading was aborted';
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            errorMessage = 'Network error while loading audio';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorMessage = 'Audio decoding error';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = 'Audio format not supported';
            break;
        }
        console.error('[BriefPlayer] Audio error:', error.code, errorMessage, 'URL:', audioUrl);
      }
      setError(errorMessage);
      setIsLoading(false);
    };
    const handleLoadStart = () => {
      setIsLoading(true);
      setError(null);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('canplay', () => {
      setIsLoading(false);
      console.log('[BriefPlayer] Audio can play, duration:', audio.duration);
    });
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('loadstart', handleLoadStart);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('canplay', () => setIsLoading(false));
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('loadstart', handleLoadStart);
    };
  }, [audioUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = '';
      }
    };
  }, []);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch((err) => {
        console.error('Error playing audio:', err);
        setError('Failed to play audio');
      });
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    audio.currentTime = percent * duration;
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimeRemaining = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const remaining = duration - seconds;
    const mins = Math.floor(remaining / 60);
    const secs = Math.floor(remaining % 60);
    return `-${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const formattedDateFull = new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Format date for display: "Friday, January 16" (mobile) or full (web)
  const formattedDate = new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const handleDelete = () => {
    if (onDelete && confirm('Are you sure you want to delete this brief?')) {
      onDelete();
    }
  };

  return (
    <div className="w-full">
      {/* Header with back button, "The Signal" (mobile), and delete */}
      <div className="flex items-center justify-between mb-5 lg:mb-8">
        {onClose && (
          <button
            onClick={onClose}
            className="text-sm transition-colors touch-manipulation p-2 -ml-2"
            style={{ color: 'var(--theme-text)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.7';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
            aria-label="Back"
          >
            <svg className="w-5 h-5 inline mr-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Back
          </button>
        )}
        {/* "The Signal" text - centered on mobile only */}
        <div className="flex-1 flex justify-center lg:hidden">
          <h2 
            className="font-bold"
            style={{ 
              color: 'var(--theme-text)',
              fontSize: '14px',
              letterSpacing: '-0.02em',
            }}
          >
            The Signal
          </h2>
        </div>
        {/* Spacer for desktop */}
        <div className="flex-1 hidden lg:block" />
        {/* Delete icon - feather style */}
        {onDelete && (
          <button
            onClick={handleDelete}
            className="p-2 -mr-2 transition-opacity touch-manipulation"
            style={{ color: 'var(--theme-text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#dc2626';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--theme-text-muted)';
            }}
            aria-label="Delete"
          >
            <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        )}
      </div>

      {/* Main content - centered on web, left-aligned on mobile */}
      <div className="w-full lg:flex lg:flex-col lg:items-center">

        {/* Square thumbnail with rounded corners - 8px rounded */}
        {thumbnail && (
          <div 
            className="w-full lg:max-w-sm aspect-square overflow-hidden mt-8 lg:mt-10 mb-8 lg:mb-10 rounded-lg"
            style={{ 
              backgroundColor: 'var(--theme-border)',
              borderRadius: '8px',
            }}
          >
            <img
              src={thumbnail}
              alt=""
              className="w-full h-full object-cover"
              style={{ borderRadius: '8px' }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Track info - left aligned on mobile, centered on web */}
        <div className="w-full mb-5 lg:mb-6 text-left lg:text-center">
          <h1 
            className="font-bold leading-tight"
            style={{ 
              color: 'var(--theme-text)',
              fontSize: '24px',
              letterSpacing: '-0.02em',
            }}
          >
            Daily Brief
          </h1>
          <p 
            className="font-medium"
            style={{ 
              color: 'var(--theme-text-muted)',
              fontSize: '16px',
              letterSpacing: '-0.02em',
            }}
          >
            {formattedDate}
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div
            className="mb-5 lg:mb-6 px-4 py-3 text-sm"
            style={{
              backgroundColor: 'var(--theme-error-bg, rgba(220, 38, 38, 0.1))',
              color: 'var(--theme-error-text, #dc2626)',
            }}
          >
            {error}
          </div>
        )}

        {/* Progress bar with nob */}
        <div className="w-full mb-10 lg:mb-12">
          <div
            onClick={handleSeek}
            className="cursor-pointer relative group touch-manipulation mb-2"
            style={{ 
              backgroundColor: 'var(--theme-border)',
              height: '4px',
              borderRadius: '2px',
            }}
          >
            {/* Progress fill */}
            <div
              className="transition-all absolute top-0 left-0"
              style={{
                width: `${progress}%`,
                backgroundColor: 'var(--theme-accent)',
                height: '4px',
                borderRadius: '2px',
              }}
            />
            {/* Knob (handle/indicator) - 14x14px circle */}
            <div
              className="absolute top-1/2 -translate-y-1/2 rounded-full transition-all"
              style={{
                left: `${progress}%`,
                transform: 'translate(-50%, -50%)',
                width: '14px',
                height: '14px',
                backgroundColor: 'var(--theme-text)',
              }}
            />
          </div>
          <div className="flex justify-between text-xs" style={{ color: 'var(--theme-text-muted)' }}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTimeRemaining(currentTime)}</span>
          </div>
        </div>

        {/* Playback controls */}
        <div className="flex items-center justify-center gap-6 lg:gap-8">
          {/* Previous track - feather icon, 29px (20% larger) */}
          <button
            className="p-2 transition-opacity touch-manipulation"
            style={{ color: 'var(--theme-accent)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.7';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
            aria-label="Previous"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ width: '29px', height: '29px' }}>
              <polygon points="11 19 2 12 11 5 11 19"></polygon>
              <polygon points="22 19 13 12 22 5 22 19"></polygon>
            </svg>
          </button>

          {/* Play/Pause button - feather icons, 77px circle (20% larger) */}
          <button
            onClick={togglePlayPause}
            disabled={isLoading || !!error}
            className="rounded-full transition-transform touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 flex items-center justify-center"
            style={{
              backgroundColor: 'var(--theme-accent)',
              color: 'var(--theme-button-text)',
              width: '77px',
              height: '77px',
            }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isLoading ? (
              <svg className="animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ width: '29px', height: '29px' }}>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : isPlaying ? (
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ color: 'var(--theme-button-text)', width: '29px', height: '29px' }}>
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
            ) : (
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ color: 'var(--theme-button-text)', width: '29px', height: '29px' }}>
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            )}
          </button>

          {/* Next track - feather icon, 29px (20% larger) */}
          <button
            className="p-2 transition-opacity touch-manipulation"
            style={{ color: 'var(--theme-accent)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.7';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
            aria-label="Next"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ width: '29px', height: '29px' }}>
              <polygon points="13 19 22 12 13 5 13 19"></polygon>
              <polygon points="2 19 11 12 2 5 2 19"></polygon>
            </svg>
          </button>
        </div>
      </div>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        preload="metadata"
        crossOrigin="anonymous"
      />
    </div>
  );
}

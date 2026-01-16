import { useState, useEffect, useRef } from 'react';

interface BriefPlayerProps {
  audioUrl: string;
  date: string;
  articleCount: number;
}

export default function BriefPlayer({ audioUrl, date, articleCount }: BriefPlayerProps) {
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

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const formattedDate = new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div 
      className="w-full p-6 rounded-lg border"
      style={{
        backgroundColor: 'var(--theme-card-bg)',
        borderColor: 'var(--theme-border)',
      }}
    >
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--theme-text)' }}>
          Daily Brief
        </h2>
        <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
          {formattedDate} · {articleCount} {articleCount === 1 ? 'article' : 'articles'}
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div 
          className="mb-4 p-3 rounded text-sm"
          style={{
            backgroundColor: 'var(--theme-error-bg, rgba(220, 38, 38, 0.1))',
            borderColor: 'var(--theme-error-border, rgba(220, 38, 38, 0.3))',
            color: 'var(--theme-error-text, #dc2626)',
            border: '1px solid',
          }}
        >
          {error}
        </div>
      )}

      {/* Play/Pause button and controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={togglePlayPause}
          disabled={isLoading || !!error}
          className="w-16 h-16 rounded-full transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 touch-manipulation"
          style={{
            backgroundColor: 'var(--theme-button-bg)',
            color: 'var(--theme-button-text)',
          }}
          onMouseEnter={(e) => {
            if (!isLoading && !error) {
              e.currentTarget.style.opacity = '0.9';
            }
          }}
          onMouseLeave={(e) => {
            if (!isLoading && !error) {
              e.currentTarget.style.opacity = '1';
            }
          }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isLoading ? (
            <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24" style={{ color: 'var(--theme-button-text)' }}>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : isPlaying ? (
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Progress bar and time */}
        <div className="flex-1">
          <div
            onClick={handleSeek}
            className="h-1 rounded-full cursor-pointer relative group mb-1"
            style={{ backgroundColor: 'var(--theme-border)' }}
          >
            <div
              className="h-1 rounded-full transition-all"
              style={{ 
                width: `${progress}%`,
                backgroundColor: 'var(--theme-accent)',
              }}
            />
          </div>
          <div className="flex justify-between text-xs" style={{ color: 'var(--theme-text-muted)' }}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
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

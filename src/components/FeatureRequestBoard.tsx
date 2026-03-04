import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch';

interface FeatureRequest {
  id: string;
  title: string;
  description: string | null;
  voteCount: number;
  hasVoted: boolean;
  userEmail: string;
  createdAt: string;
}

export default function FeatureRequestBoard() {
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sort, setSort] = useState<'top' | 'new'>('top');

  const loadRequests = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiFetch(`/api/feature-requests?sort=${sort}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to load feature requests');
      }
      const data = await response.json();
      setRequests(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feature requests');
    } finally {
      setIsLoading(false);
    }
  }, [sort]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const response = await apiFetch('/api/feature-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create request');
      }

      setTitle('');
      setDescription('');
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVote = async (requestId: string, currentlyVoted: boolean) => {
    try {
      const response = await apiFetch(`/api/feature-requests/${requestId}/vote`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to toggle vote');
      }

      // Optimistic update
      setRequests(
        requests.map(r =>
          r.id === requestId
            ? {
                ...r,
                hasVoted: !currentlyVoted,
                voteCount: currentlyVoted ? r.voteCount - 1 : r.voteCount + 1,
              }
            : r
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle vote');
    }
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  };

  const getEmailPrefix = (email: string) => {
    return email.split('@')[0];
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '600', color: 'var(--theme-text)' }}>Feature Requests</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setSort('top')}
            style={{
              padding: '8px 16px',
              backgroundColor: sort === 'top' ? 'var(--theme-button-bg)' : 'var(--theme-hover-bg)',
              color: sort === 'top' ? 'var(--theme-button-text)' : 'var(--theme-text-secondary)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              border: 'none',
              transition: 'colors 0.2s',
            }}
          >
            Top
          </button>
          <button
            onClick={() => setSort('new')}
            style={{
              padding: '8px 16px',
              backgroundColor: sort === 'new' ? 'var(--theme-button-bg)' : 'var(--theme-hover-bg)',
              color: sort === 'new' ? 'var(--theme-button-text)' : 'var(--theme-text-secondary)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              border: 'none',
              transition: 'colors 0.2s',
            }}
          >
            New
          </button>
        </div>
      </div>

      {/* Submit form */}
      <form
        onSubmit={handleSubmit}
        style={{
          marginBottom: '24px',
          borderBottom: '1px solid var(--theme-border)',
          paddingBottom: '16px',
        }}
      >
        <input
          type="text"
          placeholder="What feature would you like?"
          value={title}
          onChange={e => setTitle(e.target.value)}
          disabled={isSubmitting}
          style={{
            width: '100%',
            padding: '10px',
            marginBottom: '10px',
            border: '1px solid var(--theme-border)',
            borderRadius: '4px',
            fontSize: '14px',
            boxSizing: 'border-box',
            background: 'var(--theme-bg)',
            color: 'var(--theme-text)',
          }}
        />
        <textarea
          placeholder="Optional description..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          disabled={isSubmitting}
          rows={3}
          style={{
            width: '100%',
            padding: '10px',
            marginBottom: '10px',
            border: '1px solid var(--theme-border)',
            borderRadius: '4px',
            fontSize: '14px',
            boxSizing: 'border-box',
            background: 'var(--theme-bg)',
            color: 'var(--theme-text)',
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
        <button
          type="submit"
          disabled={isSubmitting || !title.trim()}
          style={{
            padding: '10px 20px',
            background: 'var(--theme-accent)',
            color: 'var(--theme-button-text)',
            border: 'none',
            borderRadius: '4px',
            cursor: isSubmitting || !title.trim() ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            opacity: isSubmitting || !title.trim() ? 0.5 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </button>
      </form>

      {error && (
        <div
          style={{
            padding: '12px',
            background: '#fee',
            border: '1px solid #faa',
            borderRadius: '4px',
            color: '#c33',
            marginBottom: '16px',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      {/* Requests list */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--theme-text-muted)' }}>
          Loading...
        </div>
      ) : requests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--theme-text-muted)' }}>
          No feature requests yet. Be the first to share an idea!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {requests.map(request => (
            <div
              key={request.id}
              style={{
                display: 'flex',
                gap: '12px',
                padding: '16px 0',
                borderBottom: '1px solid var(--theme-border)',
              }}
            >
              {/* Vote button */}
              <button
                onClick={() => handleVote(request.id, request.hasVoted)}
                style={{
                  flexShrink: 0,
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: request.hasVoted ? 'var(--theme-accent)' : 'var(--theme-text-muted)',
                  fontSize: '18px',
                  transition: 'color 0.2s',
                }}
                title={request.hasVoted ? 'Unvote' : 'Upvote'}
              >
                <div>▲</div>
                <div style={{ fontSize: '12px', marginTop: '2px' }}>{request.voteCount}</div>
              </button>

              {/* Request content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3
                  style={{
                    margin: '0 0 6px 0',
                    fontSize: '16px',
                    fontWeight: '600',
                    color: 'var(--theme-text)',
                  }}
                >
                  {request.title}
                </h3>
                {request.description && (
                  <p
                    style={{
                      margin: '0 0 8px 0',
                      fontSize: '14px',
                      color: 'var(--theme-text-muted)',
                      lineHeight: '1.4',
                    }}
                  >
                    {request.description}
                  </p>
                )}
                <div
                  style={{
                    fontSize: '13px',
                    color: 'var(--theme-text-muted)',
                  }}
                >
                  <span>{getEmailPrefix(request.userEmail)}</span>
                  {' · '}
                  <span>{formatDate(request.createdAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

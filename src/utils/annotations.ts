import { apiFetch } from './apiFetch';
import { Annotation } from '../types';

/**
 * Create a new annotation (highlight or note)
 */
export async function createAnnotation(
  feedItemId: string,
  feedId: string,
  type: 'highlight' | 'note',
  content: string
): Promise<Annotation> {
  const response = await apiFetch('/api/annotations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedItemId, feedId, type, content }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Get all annotations
 */
export async function getAnnotations(): Promise<Annotation[]> {
  const response = await apiFetch('/api/annotations', {
    method: 'GET',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Get annotations for a specific article
 */
export async function getAnnotationsForArticle(feedItemId: string): Promise<Annotation[]> {
  const response = await apiFetch(`/api/annotations/article/${encodeURIComponent(feedItemId)}`, {
    method: 'GET',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Delete an annotation by ID
 */
export async function deleteAnnotation(annotationId: string): Promise<void> {
  const url = `/api/annotations/${encodeURIComponent(annotationId)}`;
  console.log('[Client] Deleting annotation:', annotationId, 'URL:', url);
  
  const response = await apiFetch(url, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Request failed');
    let error;
    try {
      error = JSON.parse(errorText);
    } catch {
      error = { error: errorText || `HTTP ${response.status}` };
    }
    console.error('[Client] Delete failed:', response.status, error);
    throw new Error(error.error || error.message || `HTTP ${response.status}`);
  }
}

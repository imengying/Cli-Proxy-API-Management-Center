/**
 * 版本相关 API
 */

import { apiClient } from './client';

const DEFAULT_WEBUI_REPOSITORY = 'imengying/CPA-Management';

const getStringField = (record: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

const normalizeGitHubRepository = (repository?: string | null): string => {
  const trimmed = String(repository ?? '').trim();
  if (!trimmed) return DEFAULT_WEBUI_REPOSITORY;

  const normalizePath = (path: string) => {
    const [owner = '', repo = ''] = path.replace(/^\/+/, '').split('/').filter(Boolean);
    const normalizedRepo = repo.replace(/\.git$/i, '');
    return owner && normalizedRepo ? `${owner}/${normalizedRepo}` : DEFAULT_WEBUI_REPOSITORY;
  };

  try {
    const url = new URL(trimmed);
    if (url.hostname.toLowerCase() === 'github.com') {
      return normalizePath(url.pathname);
    }
  } catch {
    // Plain owner/repo slugs are accepted below.
  }

  return normalizePath(trimmed.replace(/^https?:\/\/github\.com\//i, ''));
};

const fetchGitHubJson = async <T>(repository: string, path: string): Promise<T> => {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}`);
  }

  return response.json() as Promise<T>;
};

export const versionApi = {
  checkLatest: () => apiClient.get<Record<string, unknown>>('/latest-version'),
  checkLatestApp: async (repository?: string | null) => {
    const normalizedRepository = normalizeGitHubRepository(repository);

    try {
      const release = await fetchGitHubJson<Record<string, unknown>>(
        normalizedRepository,
        '/releases/latest'
      );
      const latest = getStringField(release, ['tag_name', 'name']);
      if (latest) {
        return { latest };
      }
    } catch (releaseError) {
      const tags = await fetchGitHubJson<Record<string, unknown>[]>(
        normalizedRepository,
        '/tags?per_page=1'
      );
      const tag = Array.isArray(tags) ? tags[0] : null;
      const latest = tag ? getStringField(tag, ['name']) : '';

      if (!latest) {
        throw releaseError;
      }

      return { latest };
    }

    const tags = await fetchGitHubJson<Record<string, unknown>[]>(
      normalizedRepository,
      '/tags?per_page=1'
    );
    const tag = Array.isArray(tags) ? tags[0] : null;
    return { latest: tag ? getStringField(tag, ['name']) : '' };
  },
};

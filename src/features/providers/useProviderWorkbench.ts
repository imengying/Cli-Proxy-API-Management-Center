import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ampcodeApi, providersApi } from '@/services/api';
import { getErrorMessage } from '@/utils/helpers';
import { useAuthStore, useConfigStore } from '@/stores';
import {
  withDisableAllModelsRule,
  withoutDisableAllModelsRule,
} from '@/components/providers/utils';
import type {
  AmpcodeConfig,
  GeminiKeyConfig,
  ModelAlias,
  OpenAIProviderConfig,
  ProviderKeyConfig,
} from '@/types';
import {
  ampcodeToResource,
  claudeToResource,
  codexToResource,
  geminiToResource,
  openaiToResource,
  vertexToResource,
} from './adapters';
import { PROVIDER_BRAND_ORDER } from './descriptors';
import type {
  ProviderBrand,
  ProviderEntryFormInput,
  ProviderGroup,
  ProviderResource,
  ProviderSnapshot,
} from './types';

export interface UseProviderWorkbenchResult {
  connected: boolean;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  errorMessage: string | null;
  snapshot: ProviderSnapshot | null;
  refetch: () => Promise<void>;

  createProvider: (brand: ProviderBrand, input: ProviderEntryFormInput) => Promise<void>;
  updateProvider: (resource: ProviderResource, input: ProviderEntryFormInput) => Promise<void>;
  deleteProvider: (resource: ProviderResource) => Promise<void>;
  toggleDisabled: (resource: ProviderResource, disabled: boolean) => Promise<void>;
  saveAmpcode: (config: AmpcodeConfig) => Promise<void>;
  mutating: boolean;
  refreshSnapshot: () => void;
}

/* -------------------------------------------------------------------------- */
/* form -> backend config 转换                                                 */
/* -------------------------------------------------------------------------- */

const parseTextList = (text: string): string[] =>
  text
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const headersFromEntries = (
  entries: Array<{ key: string; value: string }>
): Record<string, string> => {
  const out: Record<string, string> = {};
  entries.forEach((entry) => {
    const key = entry.key.trim();
    if (!key) return;
    out[key] = entry.value;
  });
  return out;
};

const parseThinkingJson = (value: string | undefined): Record<string, unknown> | undefined => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return undefined;
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Thinking config must be a JSON object');
  }
  return parsed as Record<string, unknown>;
};

const buildExcludedModels = (
  textValue: string,
  disabled: boolean,
  brand: ProviderBrand
): string[] | undefined => {
  const list = parseTextList(textValue);
  const filtered = list.filter((v) => v !== '*');
  if (brand === 'openaiCompatibility') {
    return filtered.length ? filtered : undefined;
  }
  if (disabled) {
    return withDisableAllModelsRule(filtered);
  }
  return filtered.length ? filtered : undefined;
};

const buildModelAliases = (
  models: ProviderEntryFormInput['models'] | undefined,
  includeOpenAIFields = false
): ModelAlias[] =>
  (models ?? [])
    .map((m) => {
      const entry: ModelAlias = {
        name: m.name.trim(),
        alias: m.alias?.trim() || undefined,
        priority: m.priority,
        testModel: m.testModel,
      };
      if (includeOpenAIFields) {
        entry.image = m.image === true;
        entry.thinking = parseThinkingJson(m.thinkingJson);
      }
      return entry;
    })
    .filter((m) => m.name);

const buildProviderKeyConfig = (
  brand: 'gemini' | 'codex' | 'claude' | 'vertex',
  input: ProviderEntryFormInput,
  existing?: ProviderKeyConfig | GeminiKeyConfig | null
): ProviderKeyConfig | GeminiKeyConfig => {
  const headers = headersFromEntries(input.headers);
  const models = buildModelAliases(input.models);
  const excluded = buildExcludedModels(input.excludedModelsText, input.disabled, brand);
  const apiKeyChanged = input.apiKey.trim().length > 0;
  const next: ProviderKeyConfig = {
    apiKey: apiKeyChanged ? input.apiKey.trim() : (existing?.apiKey ?? ''),
    priority: input.priority,
    prefix: input.prefix.trim() || undefined,
    baseUrl: input.baseUrl.trim() || undefined,
    proxyUrl: input.proxyUrl.trim() || undefined,
    models: models.length ? models : undefined,
    headers: Object.keys(headers).length ? headers : undefined,
    excludedModels: excluded,
    disableCooling: input.disableCooling === true,
    authIndex: existing?.authIndex,
  };
  if (brand === 'codex' && input.websockets !== undefined) {
    next.websockets = input.websockets;
  }
  if (brand === 'claude' && input.cloak) {
    next.cloak = {
      mode: input.cloak.mode.trim() || undefined,
      strictMode: input.cloak.strictMode,
      sensitiveWords: parseTextList(input.cloak.sensitiveWordsText),
      cacheUserId: input.cloak.cacheUserId === true,
    };
  }
  if (brand === 'claude') {
    next.experimentalCchSigning = input.experimentalCchSigning === true;
  }
  return next;
};

const buildOpenAIConfig = (
  input: ProviderEntryFormInput,
  existing?: OpenAIProviderConfig | null
): OpenAIProviderConfig => {
  const headers = headersFromEntries(input.headers);
  const models = buildModelAliases(input.models, true);
  const apiKeyEntries =
    input.apiKeyEntries
      ?.map((entry, index) => {
        const fallbackApiKey =
          entry.existingApiKey?.trim() || existing?.apiKeyEntries?.[index]?.apiKey?.trim() || '';
        return {
          apiKey: entry.apiKey.trim() || fallbackApiKey,
          proxyUrl: entry.proxyUrl.trim() || undefined,
          authIndex: entry.authIndex?.trim() || undefined,
        };
      })
      .filter((entry) => entry.apiKey) ?? [];

  return {
    ...(existing ?? {}),
    name: input.name.trim(),
    baseUrl: input.baseUrl.trim(),
    prefix: input.prefix.trim() || undefined,
    apiKeyEntries,
    disabled: input.disabled,
    disableCooling: input.disableCooling === true,
    headers: Object.keys(headers).length ? headers : undefined,
    models: models.length ? models : undefined,
    priority: input.priority,
    testModel: input.testModel?.trim() || undefined,
  };
};

/* -------------------------------------------------------------------------- */
/* hook                                                                       */
/* -------------------------------------------------------------------------- */

export function useProviderWorkbench(): UseProviderWorkbenchResult {
  const connectionStatus = useAuthStore((s) => s.connectionStatus);
  const config = useConfigStore((s) => s.config);
  const fetchConfig = useConfigStore((s) => s.fetchConfig);
  const updateConfigValue = useConfigStore((s) => s.updateConfigValue);
  const clearCache = useConfigStore((s) => s.clearCache);
  const isCacheValid = useConfigStore((s) => s.isCacheValid);

  const [isPending, setIsPending] = useState<boolean>(() => !isCacheValid());
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mutating, setMutating] = useState<boolean>(false);
  const [fetchedAt, setFetchedAt] = useState<string>(() => new Date().toISOString());

  const hasFetchedRef = useRef(false);

  const connected = connectionStatus === 'connected';

  const refetch = useCallback(async () => {
    setIsFetching(true);
    setErrorMessage(null);
    try {
      const [configResult, vertexResult, openaiResult] = await Promise.allSettled([
        fetchConfig(undefined, true),
        providersApi.getVertexConfigs(),
        providersApi.getOpenAIProviders(),
      ]);
      if (configResult.status !== 'fulfilled') {
        throw configResult.reason;
      }
      if (vertexResult.status === 'fulfilled') {
        updateConfigValue('vertex-api-key', vertexResult.value || []);
        clearCache('vertex-api-key');
      }
      if (openaiResult.status === 'fulfilled') {
        updateConfigValue('openai-compatibility', openaiResult.value || []);
        clearCache('openai-compatibility');
      }
      setFetchedAt(new Date().toISOString());
    } catch (err) {
      setErrorMessage(getErrorMessage(err) || 'Failed to load providers');
    } finally {
      setIsPending(false);
      setIsFetching(false);
    }
  }, [clearCache, fetchConfig, updateConfigValue]);

  const refreshSnapshot = useCallback(() => {
    setFetchedAt(new Date().toISOString());
  }, []);

  useEffect(() => {
    if (hasFetchedRef.current) return;
    if (!connected) return;
    hasFetchedRef.current = true;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      refetch().catch(() => {});
    });

    return () => {
      cancelled = true;
    };
  }, [connected, refetch]);

  /* ------------------- snapshot 计算 ------------------- */

  const snapshot = useMemo<ProviderSnapshot | null>(() => {
    if (!config) return null;
    const groups: ProviderGroup[] = PROVIDER_BRAND_ORDER.map((brand) => {
      let resources: ProviderResource[] = [];
      switch (brand) {
        case 'gemini':
          resources = (config.geminiApiKeys ?? []).map((c, i) => geminiToResource(c, i));
          break;
        case 'codex':
          resources = (config.codexApiKeys ?? []).map((c, i) => codexToResource(c, i));
          break;
        case 'claude':
          resources = (config.claudeApiKeys ?? []).map((c, i) => claudeToResource(c, i));
          break;
        case 'vertex':
          resources = (config.vertexApiKeys ?? []).map((c, i) => vertexToResource(c, i));
          break;
        case 'openaiCompatibility':
          resources = (config.openaiCompatibility ?? []).map((c, i) => openaiToResource(c, i));
          break;
        case 'ampcode':
          resources = [ampcodeToResource(config.ampcode)];
          break;
      }
      return {
        id: brand,
        resources,
      };
    });
    return {
      fetchedAt,
      groups,
    };
  }, [config, fetchedAt]);

  /* ------------------- mutations ------------------- */

  const createProvider = useCallback(
    async (brand: ProviderBrand, input: ProviderEntryFormInput) => {
      setMutating(true);
      try {
        if (brand === 'gemini') {
          await providersApi.createGeminiKey(
            buildProviderKeyConfig('gemini', input) as GeminiKeyConfig
          );
        } else if (brand === 'codex') {
          await providersApi.createCodexConfig(
            buildProviderKeyConfig('codex', input) as ProviderKeyConfig
          );
        } else if (brand === 'claude') {
          await providersApi.createClaudeConfig(
            buildProviderKeyConfig('claude', input) as ProviderKeyConfig
          );
        } else if (brand === 'vertex') {
          await providersApi.createVertexConfig(
            buildProviderKeyConfig('vertex', input) as ProviderKeyConfig
          );
        } else if (brand === 'openaiCompatibility') {
          await providersApi.createOpenAIProvider(buildOpenAIConfig(input));
        } else if (brand === 'ampcode') {
          throw new Error('Use saveAmpcode for ampcode create/update');
        }
        await refetch();
      } finally {
        setMutating(false);
      }
    },
    [refetch]
  );

  const updateProvider = useCallback(
    async (resource: ProviderResource, input: ProviderEntryFormInput) => {
      setMutating(true);
      try {
        const brand = resource.brand;
        const selector = resource.selector;
        if (brand === 'gemini' && selector.brand === 'gemini') {
          await providersApi.updateGeminiKey(
            selector.apiKey,
            selector.baseUrl,
            buildProviderKeyConfig(
              'gemini',
              input,
              resource.raw as GeminiKeyConfig
            ) as GeminiKeyConfig
          );
        } else if (brand === 'codex' && selector.brand === 'codex') {
          await providersApi.updateCodexConfig(
            selector.apiKey,
            selector.baseUrl,
            buildProviderKeyConfig(
              'codex',
              input,
              resource.raw as ProviderKeyConfig
            ) as ProviderKeyConfig
          );
        } else if (brand === 'claude' && selector.brand === 'claude') {
          await providersApi.updateClaudeConfig(
            selector.apiKey,
            selector.baseUrl,
            buildProviderKeyConfig(
              'claude',
              input,
              resource.raw as ProviderKeyConfig
            ) as ProviderKeyConfig
          );
        } else if (brand === 'vertex' && selector.brand === 'vertex') {
          await providersApi.updateVertexConfig(
            selector.apiKey,
            selector.baseUrl,
            buildProviderKeyConfig(
              'vertex',
              input,
              resource.raw as ProviderKeyConfig
            ) as ProviderKeyConfig
          );
        } else if (brand === 'openaiCompatibility' && selector.brand === 'openaiCompatibility') {
          await providersApi.updateOpenAIProvider(
            selector.name,
            selector.index,
            buildOpenAIConfig(input, resource.raw as OpenAIProviderConfig)
          );
        } else if (brand === 'ampcode') {
          throw new Error('Use saveAmpcode for ampcode update');
        }
        await refetch();
      } finally {
        setMutating(false);
      }
    },
    [refetch]
  );

  const deleteProvider = useCallback(
    async (resource: ProviderResource) => {
      setMutating(true);
      try {
        const sel = resource.selector;
        if (sel.brand === 'gemini') {
          await providersApi.deleteGeminiKey(sel.apiKey, sel.baseUrl);
        } else if (sel.brand === 'codex') {
          await providersApi.deleteCodexConfig(sel.apiKey, sel.baseUrl);
        } else if (sel.brand === 'claude') {
          await providersApi.deleteClaudeConfig(sel.apiKey, sel.baseUrl);
        } else if (sel.brand === 'vertex') {
          await providersApi.deleteVertexConfig(sel.apiKey, sel.baseUrl);
        } else if (sel.brand === 'openaiCompatibility') {
          await providersApi.deleteOpenAIProvider(sel.index);
        } else if (sel.brand === 'ampcode') {
          await Promise.allSettled([
            ampcodeApi.clearUpstreamUrl(),
            ampcodeApi.clearUpstreamApiKey(),
            ampcodeApi.saveUpstreamApiKeys([]),
            ampcodeApi.clearModelMappings(),
            ampcodeApi.updateForceModelMappings(false),
          ]);
          updateConfigValue('ampcode', {});
          clearCache('ampcode');
        }
        if (sel.brand === 'ampcode') refreshSnapshot();
        else await refetch();
      } finally {
        setMutating(false);
      }
    },
    [clearCache, refetch, refreshSnapshot, updateConfigValue]
  );

  const toggleDisabled = useCallback(
    async (resource: ProviderResource, disabled: boolean) => {
      setMutating(true);
      try {
        const brand = resource.brand;
        const selector = resource.selector;
        if (brand === 'gemini' && selector.brand === 'gemini') {
          const current = resource.raw as GeminiKeyConfig;
          const excluded = disabled
            ? withDisableAllModelsRule(current.excludedModels)
            : withoutDisableAllModelsRule(current.excludedModels);
          await providersApi.updateGeminiKey(selector.apiKey, selector.baseUrl, {
            ...current,
            excludedModels: excluded,
          });
        } else if (brand === 'codex' && selector.brand === 'codex') {
          const current = resource.raw as ProviderKeyConfig;
          const excluded = disabled
            ? withDisableAllModelsRule(current.excludedModels)
            : withoutDisableAllModelsRule(current.excludedModels);
          await providersApi.updateCodexConfig(selector.apiKey, selector.baseUrl, {
            ...current,
            excludedModels: excluded,
          });
        } else if (brand === 'claude' && selector.brand === 'claude') {
          const current = resource.raw as ProviderKeyConfig;
          const excluded = disabled
            ? withDisableAllModelsRule(current.excludedModels)
            : withoutDisableAllModelsRule(current.excludedModels);
          await providersApi.updateClaudeConfig(selector.apiKey, selector.baseUrl, {
            ...current,
            excludedModels: excluded,
          });
        } else if (brand === 'vertex' && selector.brand === 'vertex') {
          const current = resource.raw as ProviderKeyConfig;
          const excluded = disabled
            ? withDisableAllModelsRule(current.excludedModels)
            : withoutDisableAllModelsRule(current.excludedModels);
          await providersApi.updateVertexConfig(selector.apiKey, selector.baseUrl, {
            ...current,
            excludedModels: excluded,
          });
        } else if (brand === 'openaiCompatibility' && selector.brand === 'openaiCompatibility') {
          await providersApi.updateOpenAIProviderDisabled(selector.index, disabled);
        } else if (brand === 'ampcode') {
          return;
        }
        await refetch();
      } finally {
        setMutating(false);
      }
    },
    [refetch]
  );

  const saveAmpcode = useCallback(
    async (next: AmpcodeConfig) => {
      setMutating(true);
      try {
        const url = (next.upstreamUrl ?? '').trim();
        if (url) {
          await ampcodeApi.updateUpstreamUrl(url);
        } else {
          await ampcodeApi.clearUpstreamUrl();
        }

        const fallbackKey = (next.upstreamApiKey ?? '').trim();
        if (fallbackKey) {
          await ampcodeApi.updateUpstreamApiKey(fallbackKey);
        } else {
          await ampcodeApi.clearUpstreamApiKey();
        }

        await ampcodeApi.saveUpstreamApiKeys(next.upstreamApiKeys ?? []);

        if (next.modelMappings?.length) {
          await ampcodeApi.saveModelMappings(next.modelMappings);
        } else {
          await ampcodeApi.clearModelMappings();
        }

        await ampcodeApi.updateForceModelMappings(next.forceModelMappings === true);

        updateConfigValue('ampcode', next);
        clearCache('ampcode');
        refreshSnapshot();
      } finally {
        setMutating(false);
      }
    },
    [clearCache, refreshSnapshot, updateConfigValue]
  );

  return {
    connected,
    isPending,
    isFetching,
    isError: Boolean(errorMessage),
    errorMessage,
    snapshot,
    refetch,
    createProvider,
    updateProvider,
    deleteProvider,
    toggleDisabled,
    saveAmpcode,
    mutating,
    refreshSnapshot,
  };
}

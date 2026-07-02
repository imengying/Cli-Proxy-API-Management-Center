import type { Config } from '@/types';
import { isRecord } from '@/utils/helpers';

export const isPluginUiEnabled = (supportsPlugin: boolean, config: Config | null): boolean => {
  if (!supportsPlugin) return false;

  const plugins = config?.raw?.plugins;
  if (!isRecord(plugins)) return false;

  return plugins.enabled === true;
};

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  IconKey,
  IconBot,
  IconFileText,
  IconSatellite,
  IconSidebarQuota,
} from '@/components/ui/icons';
import { useAuthStore, useConfigStore, useModelsStore, useNotificationStore } from '@/stores';
import { authFilesApi, versionApi } from '@/services/api';
import { useApiKeysForModels } from '@/hooks/useApiKeysForModels';
import type { Config } from '@/types';
import { formatDateTimeValue } from '@/utils/format';
import { isRecord } from '@/utils/helpers';
import styles from './DashboardPage.module.scss';

interface QuickStat {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  path: string;
  loading?: boolean;
  sublabel?: string;
}

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

const parseVersionSegments = (version?: string | null) => {
  if (!version) return null;
  const cleaned = version.trim().replace(/^v/i, '');
  if (!cleaned) return null;
  const parts = cleaned
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((segment) => Number.parseInt(segment, 10))
    .filter(Number.isFinite);
  return parts.length ? parts : null;
};

const compareVersions = (latest?: string | null, current?: string | null) => {
  const latestParts = parseVersionSegments(latest);
  const currentParts = parseVersionSegments(current);
  if (!latestParts || !currentParts) return null;
  const length = Math.max(latestParts.length, currentParts.length);
  for (let i = 0; i < length; i++) {
    const l = latestParts[i] || 0;
    const c = currentParts[i] || 0;
    if (l > c) return 1;
    if (l < c) return -1;
  }
  return 0;
};

const pickVersionString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return '';
};

const getPanelRepositoryFromConfig = (config?: Config | null): string => {
  const remoteManagement = isRecord(config?.raw?.['remote-management'])
    ? config.raw['remote-management']
    : null;
  const repository = remoteManagement?.['panel-github-repository'];
  return typeof repository === 'string' ? repository.trim() : '';
};

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const apiBase = useAuthStore((state) => state.apiBase);
  const serverVersion = useAuthStore((state) => state.serverVersion);
  const serverBuildDate = useAuthStore((state) => state.serverBuildDate);
  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);

  const models = useModelsStore((state) => state.models);
  const modelsLoading = useModelsStore((state) => state.loading);
  const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);

  const [authFilesCount, setAuthFilesCount] = useState<number | null>(null);
  const [authFilesLoading, setAuthFilesLoading] = useState(false);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(getTimeOfDay);
  const [checkingAppVersion, setCheckingAppVersion] = useState(false);
  const [checkingApiVersion, setCheckingApiVersion] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setTimeOfDay(getTimeOfDay());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const resolveApiKeysForModels = useApiKeysForModels();
  const appVersionRaw = __APP_VERSION__ || '';
  const appVersion = appVersionRaw || t('system_info.version_unknown');
  const apiVersion = serverVersion || t('system_info.version_unknown');
  const buildTime =
    formatDateTimeValue(serverBuildDate, i18n.language) || t('system_info.version_unknown');

  const fetchModels = useCallback(async () => {
    if (connectionStatus !== 'connected' || !apiBase) {
      return;
    }

    try {
      const apiKeys = await resolveApiKeysForModels();
      const primaryKey = apiKeys[0];
      await fetchModelsFromStore(apiBase, primaryKey);
    } catch {
      // Ignore model fetch errors on dashboard
    }
  }, [connectionStatus, apiBase, resolveApiKeysForModels, fetchModelsFromStore]);

  const runVersionCheck = useCallback(
    async (
      currentVersion: string | null | undefined,
      setChecking: (checking: boolean) => void,
      loadLatestVersion: () => Promise<string>
    ) => {
      setChecking(true);
      try {
        const latest = await loadLatestVersion();
        const comparison = compareVersions(latest, currentVersion);

        if (!latest) {
          showNotification(t('system_info.version_check_error'), 'error');
          return;
        }

        if (comparison === null) {
          showNotification(t('system_info.version_current_missing'), 'warning');
          return;
        }

        if (comparison > 0) {
          showNotification(
            t('system_info.version_update_available', { version: latest }),
            'warning'
          );
        } else {
          showNotification(t('system_info.version_is_latest'), 'success');
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : typeof error === 'string' ? error : '';
        const suffix = message ? `: ${message}` : '';
        showNotification(`${t('system_info.version_check_error')}${suffix}`, 'error');
      } finally {
        setChecking(false);
      }
    },
    [showNotification, t]
  );

  const handleAppVersionCheck = useCallback(
    () =>
      runVersionCheck(appVersionRaw, setCheckingAppVersion, async () => {
        let panelRepository = getPanelRepositoryFromConfig(config);
        if (!panelRepository) {
          const latestConfig = await fetchConfig().catch(() => null);
          panelRepository = getPanelRepositoryFromConfig(latestConfig);
        }

        const data = await versionApi.checkLatestApp(panelRepository);
        return pickVersionString(data.latest);
      }),
    [appVersionRaw, config, fetchConfig, runVersionCheck]
  );

  const handleApiVersionCheck = useCallback(
    () =>
      runVersionCheck(serverVersion, setCheckingApiVersion, async () => {
        const data = await versionApi.checkLatest();
        return pickVersionString(data['latest-version'], data.latest_version, data.latest);
      }),
    [runVersionCheck, serverVersion]
  );

  useEffect(() => {
    if (connectionStatus !== 'connected') {
      return;
    }

    let cancelled = false;

    const loadAuthFiles = async () => {
      setAuthFilesLoading(true);
      try {
        const res = await authFilesApi.list();
        if (!cancelled) setAuthFilesCount(res.files.length);
      } catch {
        if (!cancelled) setAuthFilesCount(null);
      } finally {
        setAuthFilesLoading(false);
      }
    };

    // 提供商/密钥统计直接来自 config store；这里只需保证配置已加载并取认证文件数。
    fetchConfig().catch(() => undefined);
    fetchModels();
    void loadAuthFiles();

    return () => {
      cancelled = true;
    };
  }, [connectionStatus, fetchConfig, fetchModels]);

  const configLoading = !config;
  const providerStats = config
    ? {
        gemini: config.geminiApiKeys?.length ?? 0,
        codex: config.codexApiKeys?.length ?? 0,
        claude: config.claudeApiKeys?.length ?? 0,
        vertex: config.vertexApiKeys?.length ?? 0,
        openai: config.openaiCompatibility?.length ?? 0,
      }
    : null;
  const totalProviderKeys = providerStats
    ? Object.values(providerStats).reduce((sum, count) => sum + count, 0)
    : 0;

  const quickStats: QuickStat[] = [
    {
      label: t('dashboard.management_keys'),
      value: config ? (config.apiKeys?.length ?? 0) : '-',
      icon: <IconKey size={24} />,
      path: '/config',
      loading: configLoading,
      sublabel: t('nav.config_management'),
    },
    {
      label: t('nav.ai_providers'),
      value: providerStats ? totalProviderKeys : '-',
      icon: <IconBot size={24} />,
      path: '/ai-providers',
      loading: configLoading,
      sublabel: providerStats
        ? t('dashboard.provider_keys_detail', {
            gemini: providerStats.gemini,
            codex: providerStats.codex,
            claude: providerStats.claude,
            vertex: providerStats.vertex,
            openai: providerStats.openai,
          })
        : undefined,
    },
    {
      label: t('nav.auth_files'),
      value: authFilesCount ?? '-',
      icon: <IconFileText size={24} />,
      path: '/auth-files',
      loading: authFilesLoading && authFilesCount === null,
      sublabel: t('dashboard.oauth_credentials'),
    },
    {
      label: t('dashboard.available_models'),
      value: modelsLoading ? '-' : models.length,
      icon: <IconSatellite size={24} />,
      path: '/system',
      loading: modelsLoading,
      sublabel: t('dashboard.available_models_desc'),
    },
    {
      label: t('nav.quota_management'),
      value: t('nav.quota_management'),
      icon: <IconSidebarQuota size={24} />,
      path: '/quota',
      sublabel: t('nav_meta.quota_management'),
    },
  ];

  const routingStrategyRaw = config?.routingStrategy?.trim() || '';
  const routingStrategyDisplay = !routingStrategyRaw
    ? '-'
    : routingStrategyRaw === 'round-robin'
      ? t('basic_settings.routing_strategy_round_robin')
      : routingStrategyRaw === 'fill-first'
        ? t('basic_settings.routing_strategy_fill_first')
        : routingStrategyRaw;
  const routingStrategyBadgeClass = !routingStrategyRaw
    ? styles.configBadgeUnknown
    : routingStrategyRaw === 'round-robin'
      ? styles.configBadgeRoundRobin
      : routingStrategyRaw === 'fill-first'
        ? styles.configBadgeFillFirst
        : styles.configBadgeUnknown;
  const greetingKey = `dashboard.greeting_${timeOfDay}`;
  const caringKey = `dashboard.caring_${timeOfDay}`;
  const connectionStatusLabel = t(`common.${connectionStatus}_status`);
  const connectionLabel = t('connection.status').replace(/[：:]\s*$/, '');
  const connectionAddress = apiBase || '-';
  const connectionStateClass =
    connectionStatus === 'connected'
      ? styles.connected
      : connectionStatus === 'connecting'
        ? styles.connecting
        : styles.disconnected;

  return (
    <div className={styles.dashboard}>
      <section className={styles.pageHeader}>
        <div className={styles.titleBlock}>
          <span className={styles.eyebrow}>{t(greetingKey)}</span>
          <h1 className={styles.pageTitle}>{t('dashboard.welcome_back')}</h1>
          <p className={styles.pageSubtitle}>{t(caringKey)}</p>
        </div>
        <div className={styles.connectionBlock}>
          <span className={styles.connectionEyebrow}>
            <span className={`${styles.statusDot} ${connectionStateClass}`} />
            {connectionLabel}
          </span>
          <h2 className={`${styles.connectionTitle} ${connectionStateClass}`}>
            {connectionStatusLabel}
          </h2>
          <p className={styles.connectionSubtitle} title={connectionAddress}>
            {connectionAddress}
          </p>
        </div>
      </section>

      <Card className={styles.aboutCard} title={t('dashboard.system_overview')}>
        <div className={styles.aboutInfoGrid}>
          <div className={styles.infoTile}>
            <div className={styles.tileHeader}>
              <div className={styles.tileLabel}>{t('footer.version')}</div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={styles.tileAction}
                onClick={() => void handleAppVersionCheck()}
                loading={checkingAppVersion}
                title={t('system_info.version_check_button')}
                aria-label={t('system_info.version_check_button')}
              >
                {t('system_info.version_check_button')}
              </Button>
            </div>
            <div className={styles.tileValue}>{appVersion}</div>
          </div>

          <div className={styles.infoTile}>
            <div className={styles.tileHeader}>
              <div className={styles.tileLabel}>{t('footer.api_version')}</div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={styles.tileAction}
                onClick={() => void handleApiVersionCheck()}
                loading={checkingApiVersion}
                title={t('system_info.version_check_button')}
                aria-label={t('system_info.version_check_button')}
              >
                {t('system_info.version_check_button')}
              </Button>
            </div>
            <div className={styles.tileValue}>{apiVersion}</div>
          </div>

          <div className={styles.infoTile}>
            <div className={styles.tileLabel}>{t('footer.build_date')}</div>
            <div className={styles.tileValue}>{buildTime}</div>
          </div>
        </div>
      </Card>

      <section className={styles.section}>
        <div className={styles.statsGrid}>
          {quickStats.map((stat) => (
            <Link key={stat.path} to={stat.path} className={styles.statCard}>
              <div className={styles.statTop}>
                <span className={styles.statIcon}>{stat.icon}</span>
                <span className={styles.statArrow} aria-hidden="true">
                  →
                </span>
              </div>
              <div className={styles.statBody}>
                <span className={styles.statValue}>{stat.loading ? '...' : stat.value}</span>
                <span className={styles.statLabel}>{stat.label}</span>
                {stat.sublabel && !stat.loading && (
                  <span className={styles.statSublabel}>{stat.sublabel}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {config && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>{t('dashboard.current_config')}</h2>
            </div>
          </div>
          <div className={styles.configGrid}>
            <div className={styles.configItem}>
              <span>{t('basic_settings.debug_enable')}</span>
              <strong className={config.debug ? styles.badgeOn : styles.badgeOff}>
                {config.debug ? t('common.yes') : t('common.no')}
              </strong>
            </div>
            <div className={styles.configItem}>
              <span>{t('basic_settings.logging_to_file_enable')}</span>
              <strong className={config.loggingToFile ? styles.badgeOn : styles.badgeOff}>
                {config.loggingToFile ? t('common.yes') : t('common.no')}
              </strong>
            </div>
            <div className={styles.configItem}>
              <span>{t('basic_settings.retry_count_label')}</span>
              <strong>{config.requestRetry ?? 0}</strong>
            </div>
            <div className={styles.configItem}>
              <span>{t('basic_settings.ws_auth_enable')}</span>
              <strong className={config.wsAuth ? styles.badgeOn : styles.badgeOff}>
                {config.wsAuth ? t('common.yes') : t('common.no')}
              </strong>
            </div>
            <div className={styles.configItem}>
              <span>{t('dashboard.routing_strategy')}</span>
              <span className={`${styles.configBadge} ${routingStrategyBadgeClass}`}>
                {routingStrategyDisplay}
              </span>
            </div>
            {config.proxyUrl && (
              <div className={`${styles.configItem} ${styles.configItemWide}`}>
                <span>{t('basic_settings.proxy_url_label')}</span>
                <code>{config.proxyUrl}</code>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

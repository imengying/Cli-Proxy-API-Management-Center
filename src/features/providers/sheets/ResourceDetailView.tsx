import { useTranslation } from 'react-i18next';
import { Collapsible } from '@/components/ui/Collapsible';
import { IconCheck, IconX } from '@/components/ui/icons';
import { getProviderTotalStats, type ProviderRecentUsageMap } from '@/components/providers/utils';
import type { AmpcodeConfig, OpenAIProviderConfig } from '@/types';
import { maskApiKey } from '@/utils/format';
import type { ProviderResource } from '../types';
import styles from './forms/sharedForm.module.scss';

interface ResourceDetailViewProps {
  resource: ProviderResource;
  usageByProvider?: ProviderRecentUsageMap;
}

export function ResourceDetailView({ resource, usageByProvider }: ResourceDetailViewProps) {
  const { t } = useTranslation();

  if (resource.brand === 'ampcode') {
    const raw = (resource.raw as AmpcodeConfig | undefined) ?? {};
    const upstreamMappings = raw.upstreamApiKeys ?? [];
    const modelMappings = raw.modelMappings ?? [];

    return (
      <div>
        <div className={styles.detailHeader}>
          <div className={styles.sectionTitle}>{resource.identifier}</div>
          <p className={styles.sectionDesc}>{t('providersPage.ampcode.detailHint')}</p>
        </div>

        <dl className={styles.dl}>
          <div>
            <dt className={styles.dt}>{t('providersPage.ampcode.upstreamUrl')}</dt>
            <dd className={styles.dd}>{raw.upstreamUrl ?? t('providersPage.status.notSet')}</dd>
          </div>
          <div>
            <dt className={styles.dt}>{t('providersPage.ampcode.upstreamApiKey')}</dt>
            <dd className={styles.dd}>
              {raw.upstreamApiKey
                ? maskApiKey(raw.upstreamApiKey)
                : t('providersPage.status.notSet')}
            </dd>
          </div>
          <div>
            <dt className={styles.dt}>{t('providersPage.ampcode.keyMappings')}</dt>
            <dd className={styles.dd}>{upstreamMappings.length}</dd>
          </div>
          <div>
            <dt className={styles.dt}>{t('providersPage.ampcode.modelMappings')}</dt>
            <dd className={styles.dd}>{modelMappings.length}</dd>
          </div>
          <div>
            <dt className={styles.dt}>{t('providersPage.ampcode.forceModelMappings')}</dt>
            <dd className={styles.dd}>
              {raw.forceModelMappings ? t('common.yes') : t('common.no')}
            </dd>
          </div>
        </dl>

        {modelMappings.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            <Collapsible label={t('providersPage.ampcode.modelMappingsSection')}>
              <dl className={styles.dl}>
                {modelMappings.map((mapping) => (
                  <div key={mapping.from}>
                    <dt className={styles.dt}>{mapping.from}</dt>
                    <dd className={styles.dd}>{mapping.to}</dd>
                  </div>
                ))}
              </dl>
            </Collapsible>
          </div>
        ) : null}
      </div>
    );
  }

  const primary: Array<[string, string]> = [
    ['identifier', resource.identifier],
    ['baseUrl', resource.baseUrl ?? t('providersPage.status.notSet')],
    ['proxyUrl', resource.proxyUrl ?? t('providersPage.status.notSet')],
    ['prefix', resource.prefix ?? t('providersPage.status.none')],
    ['models', String(resource.modelCount)],
    ['headers', String(resource.headerCount)],
  ];

  const metadata: Array<[string, string]> = [
    ['authIndex', resource.authIndex ?? t('providersPage.status.notSet')],
    ['excludedModels', String(resource.excludedModelCount)],
    ['apiKeyEntries', String(resource.apiKeyEntryCount)],
  ];

  const openaiConfig =
    resource.brand === 'openaiCompatibility' ? (resource.raw as OpenAIProviderConfig) : null;
  const apiKeyEntries = openaiConfig?.apiKeyEntries ?? [];

  return (
    <div>
      <div className={styles.detailHeader}>
        <div className={styles.sectionTitle}>{resource.name ?? resource.identifier}</div>
      </div>

      <dl className={styles.dl}>
        {primary.map(([key, value]) => (
          <div key={key}>
            <dt className={styles.dt}>{t(`providersPage.detail.fields.${key}`)}</dt>
            <dd className={styles.dd}>{value}</dd>
          </div>
        ))}
      </dl>

      {openaiConfig && apiKeyEntries.length > 0 ? (
        <div className={styles.apiKeyEntriesSection}>
          <div className={styles.apiKeyEntriesLabel}>
            {t('providersPage.form.apiKeyEntriesSection')}: {apiKeyEntries.length}
          </div>
          <div className={styles.apiKeyEntryList}>
            {apiKeyEntries.map((entry, entryIndex) => {
              const entryStats = usageByProvider
                ? getProviderTotalStats(
                    usageByProvider,
                    openaiConfig.name,
                    entry.apiKey,
                    openaiConfig.baseUrl
                  )
                : { success: 0, failure: 0 };
              return (
                <div key={`${entry.apiKey}-${entryIndex}`} className={styles.apiKeyEntryCard}>
                  <span className={styles.apiKeyEntryIndex}>{entryIndex + 1}</span>
                  <span className={styles.apiKeyEntryKey}>{maskApiKey(entry.apiKey)}</span>
                  {entry.proxyUrl ? (
                    <span className={styles.apiKeyEntryProxy}>{entry.proxyUrl}</span>
                  ) : null}
                  <div className={styles.apiKeyEntryStats}>
                    <span className={`${styles.apiKeyEntryStat} ${styles.apiKeyEntryStatSuccess}`}>
                      <IconCheck size={12} /> {entryStats.success}
                    </span>
                    <span className={`${styles.apiKeyEntryStat} ${styles.apiKeyEntryStatFailure}`}>
                      <IconX size={12} /> {entryStats.failure}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 16 }}>
        <Collapsible label={t('providersPage.detail.metadataTitle')}>
          <dl className={styles.dl}>
            {metadata.map(([key, value]) => (
              <div key={key}>
                <dt className={styles.dt}>{t(`providersPage.detail.fields.${key}`)}</dt>
                <dd className={styles.dd}>{value}</dd>
              </div>
            ))}
          </dl>
        </Collapsible>
      </div>
    </div>
  );
}

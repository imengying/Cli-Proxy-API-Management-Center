import { useTranslation } from 'react-i18next';
import {
  IconAlertTriangle,
  IconCheckCircle2,
  IconEye,
  IconPencil,
  IconTrash2,
} from '@/components/ui/icons';
import { ProviderStatusBar } from '@/components/providers/ProviderStatusBar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  getOpenAIProviderLatestSuccessTime,
  getOpenAIProviderRecentStatusData,
  getOpenAIProviderTotalStats,
  getProviderLatestSuccessTime,
  getProviderRecentStatusData,
  getProviderTotalStats,
  type ProviderRecentUsageMap,
} from '@/components/providers/utils';
import type { OpenAIProviderConfig } from '@/types';
import type { StatusBarData } from '@/utils/recentRequests';
import { parseTimestampMs } from '@/utils/timestamp';
import type { ProviderResource } from '../types';
import styles from './ProviderResourceTable.module.scss';
import statusBarStyles from './providerStatusBar.module.scss';

interface ProviderResourceTableProps {
  resources: ProviderResource[];
  selectedId?: string | null;
  disableMutations?: boolean;
  usageByProvider?: ProviderRecentUsageMap;
  onView: (resource: ProviderResource) => void;
  onEdit: (resource: ProviderResource) => void;
  onDelete: (resource: ProviderResource) => void;
  onToggleDisabled?: (resource: ProviderResource, disabled: boolean) => void;
}

const columnWidths = ['112px', '240px', '56px', '132px', '330px', '72px', '118px'];

const formatRecentSuccessTime = (value: string | null): string => {
  if (!value) return '—';
  const timestampMs = parseTimestampMs(value);
  if (!Number.isFinite(timestampMs)) return '—';

  const date = new Date(timestampMs);
  const pad = (num: number) => num.toString().padStart(2, '0');
  return `${pad(date.getMonth() + 1)}:${pad(date.getDate())}:${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`;
};

const resolveTotalStats = (
  resource: ProviderResource,
  usageByProvider: ProviderRecentUsageMap
): { success: number; failure: number } => {
  if (resource.brand === 'openaiCompatibility') {
    return getOpenAIProviderTotalStats(resource.raw as OpenAIProviderConfig, usageByProvider);
  }
  return getProviderTotalStats(
    usageByProvider,
    resource.brand,
    resource.apiKey ?? undefined,
    resource.baseUrl ?? undefined
  );
};

const resolveLatestSuccessTime = (
  resource: ProviderResource,
  usageByProvider: ProviderRecentUsageMap
): string | null => {
  if (resource.brand === 'openaiCompatibility') {
    return getOpenAIProviderLatestSuccessTime(
      resource.raw as OpenAIProviderConfig,
      usageByProvider
    );
  }
  return getProviderLatestSuccessTime(
    usageByProvider,
    resource.brand,
    resource.apiKey ?? undefined,
    resource.baseUrl ?? undefined
  );
};

const resolveStatusBarData = (
  resource: ProviderResource,
  usageByProvider: ProviderRecentUsageMap
): StatusBarData => {
  if (resource.brand === 'openaiCompatibility') {
    return getOpenAIProviderRecentStatusData(resource.raw as OpenAIProviderConfig, usageByProvider);
  }
  return getProviderRecentStatusData(
    usageByProvider,
    resource.brand,
    resource.apiKey ?? undefined,
    resource.baseUrl ?? undefined
  );
};

export function ProviderResourceTable({
  resources,
  selectedId,
  disableMutations,
  usageByProvider,
  onView,
  onEdit,
  onDelete,
  onToggleDisabled,
}: ProviderResourceTableProps) {
  const { t } = useTranslation();

  const renderModelsSummary = (r: ProviderResource) => (
    <span className={styles.modelCount}>{r.modelCount}</span>
  );

  const renderStatus = (r: ProviderResource) => {
    if (r.disabled) {
      return (
        <span className={`${styles.statusBadge} ${styles.statusDisabled}`}>
          <IconAlertTriangle size={14} />
          {t('providersPage.status.disabled')}
        </span>
      );
    }
    return (
      <span className={`${styles.statusBadge} ${styles.statusActive}`}>
        <IconCheckCircle2 size={14} />
        {t('providersPage.status.active')}
      </span>
    );
  };

  const renderPrimary = (r: ProviderResource) => {
    if (r.brand === 'openaiCompatibility') {
      const extra = r.apiKeyEntryCount > 1 ? ` · +${r.apiKeyEntryCount - 1}` : '';
      return (
        <div className={styles.primaryCell}>
          <span className={styles.primaryName}>{r.name ?? r.identifier}</span>
          <span className={styles.primarySub}>{(r.apiKeyPreview ?? '—') + extra}</span>
        </div>
      );
    }
    if (r.brand === 'ampcode') {
      return (
        <div className={styles.primaryCell}>
          <span className={styles.primaryName}>{r.identifier}</span>
          <span className={styles.primarySub}>
            {r.apiKeyPreview ?? t('providersPage.status.notConfigured')}
          </span>
        </div>
      );
    }
    return (
      <div className={styles.primaryCell}>
        <span className={styles.primaryName}>{r.apiKeyPreview ?? '—'}</span>
        {r.authIndex ? <span className={styles.primarySub}>auth: {r.authIndex}</span> : null}
      </div>
    );
  };

  const renderBaseUrl = (r: ProviderResource) => {
    if (r.brand === 'claude' && !r.baseUrl) {
      return (
        <span className={styles.baseUrl}>
          https://api.anthropic.com {t('providersPage.status.defaultSuffix')}
        </span>
      );
    }
    return <span className={styles.baseUrl}>{r.baseUrl ?? t('providersPage.status.notSet')}</span>;
  };

  const renderRecentSuccess = (resource: ProviderResource) => {
    if (!usageByProvider || resource.brand === 'ampcode') {
      return <span className={styles.mutedMono}>—</span>;
    }

    return (
      <span className={styles.recentSuccess}>
        {formatRecentSuccessTime(resolveLatestSuccessTime(resource, usageByProvider))}
      </span>
    );
  };

  const renderStatusSummary = (resource: ProviderResource) => {
    const stats =
      usageByProvider && resource.brand !== 'ampcode'
        ? resolveTotalStats(resource, usageByProvider)
        : { success: 0, failure: 0 };

    return (
      <div className={styles.statusCell}>
        <div className={styles.statusSummary}>
          {renderStatus(resource)}
          <span className={`${styles.statPill} ${styles.statSuccess}`}>
            {t('stats.success')}: {stats.success}
          </span>
          <span className={`${styles.statPill} ${styles.statFailure}`}>
            {t('stats.failure')}: {stats.failure}
          </span>
        </div>
        {usageByProvider && resource.brand !== 'ampcode' ? (
          <div className={styles.statusBarWrap}>
            <ProviderStatusBar
              statusData={resolveStatusBarData(resource, usageByProvider)}
              styles={statusBarStyles}
            />
          </div>
        ) : null}
      </div>
    );
  };

  const renderEnabled = (resource: ProviderResource) => {
    if (!onToggleDisabled || resource.brand === 'ampcode') {
      return (
        <span className={`${styles.enabledBadge} ${styles.enabledBadgeReadonly}`}>
          {resource.disabled
            ? t('providersPage.status.disabled')
            : t('providersPage.status.active')}
        </span>
      );
    }

    return (
      <span className={styles.toggleWrap} onClick={(e) => e.stopPropagation()}>
        <ToggleSwitch
          checked={!resource.disabled}
          disabled={disableMutations}
          onChange={(value) => onToggleDisabled(resource, !value)}
          ariaLabel={
            resource.disabled
              ? t('providersPage.actions.enable')
              : t('providersPage.actions.disable')
          }
        />
      </span>
    );
  };

  return (
    <Table
      className={styles.providerTable}
      cols={columnWidths.map((w, i) => (
        <col key={i} style={{ width: w }} />
      ))}
    >
      <TableHeader>
        <TableRow>
          <TableHead>{t('providersPage.table.key')}</TableHead>
          <TableHead>{t('providersPage.table.baseUrl')}</TableHead>
          <TableHead>{t('providersPage.table.models')}</TableHead>
          <TableHead>{t('providersPage.table.recentSuccess')}</TableHead>
          <TableHead>{t('providersPage.table.status')}</TableHead>
          <TableHead className={styles.enabledHead}>{t('providersPage.table.enabled')}</TableHead>
          <TableHead className={styles.actionsHead}>{t('providersPage.table.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {resources.map((resource) => {
          return (
            <TableRow key={resource.id} selected={resource.id === selectedId}>
              <TableCell>{renderPrimary(resource)}</TableCell>
              <TableCell>{renderBaseUrl(resource)}</TableCell>
              <TableCell>{renderModelsSummary(resource)}</TableCell>
              <TableCell>{renderRecentSuccess(resource)}</TableCell>
              <TableCell className={styles.statusColumn}>{renderStatusSummary(resource)}</TableCell>
              <TableCell className={styles.enabledCell}>{renderEnabled(resource)}</TableCell>
              <TableCell
                className={[
                  styles.actionsCell,
                  resource.id === selectedId ? styles.actionsCellSelected : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label={t('providersPage.actions.view')}
                    title={t('providersPage.actions.view')}
                    onClick={(e) => {
                      e.stopPropagation();
                      onView(resource);
                    }}
                  >
                    <IconEye size={16} />
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label={t('providersPage.actions.edit')}
                    title={t('providersPage.actions.edit')}
                    disabled={disableMutations}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(resource);
                    }}
                  >
                    <IconPencil size={16} />
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                    aria-label={t('providersPage.actions.delete')}
                    title={t('providersPage.actions.delete')}
                    disabled={disableMutations}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(resource);
                    }}
                  >
                    <IconTrash2 size={16} />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

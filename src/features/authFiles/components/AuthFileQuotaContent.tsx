import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthFileQuotaControls } from '@/features/authFiles/hooks/useAuthFileQuotaControls';
import { QuotaProgressBar } from '@/features/authFiles/components/QuotaProgressBar';
import styles from '@/pages/AuthFilesPage.module.scss';

export function AuthFileQuotaContent({ controls }: { controls: AuthFileQuotaControls }) {
  const { t } = useTranslation();
  const { config, quota, quotaStatus, quotaErrorMessage, resetQuotaAction } = controls;

  if (!config || quotaStatus === 'idle') return null;

  return (
    <div className={styles.quotaSection}>
      {quotaStatus === 'loading' ? (
        <div className={styles.quotaMessage}>{t(`${config.i18nPrefix}.loading`)}</div>
      ) : quotaStatus === 'error' ? (
        <div className={styles.quotaError}>
          {t(`${config.i18nPrefix}.load_failed`, {
            message: quotaErrorMessage,
          })}
        </div>
      ) : quota ? (
        (config.renderQuotaItems(quota, t, {
          styles,
          QuotaProgressBar,
        }) as ReactNode)
      ) : (
        <div className={styles.quotaMessage}>{t(`${config.i18nPrefix}.idle`)}</div>
      )}
      {resetQuotaAction && <div className={styles.quotaCardActions}>{resetQuotaAction}</div>}
    </div>
  );
}

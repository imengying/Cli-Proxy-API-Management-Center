import { Navigate, useRoutes, type Location, type RouteObject } from 'react-router-dom';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProvidersWorkbenchPage } from '@/features/providers/ProvidersWorkbenchPage';
import { AuthFilesPage } from '@/pages/AuthFilesPage';
import { AuthFilesOAuthExcludedEditPage } from '@/pages/AuthFilesOAuthExcludedEditPage';
import { AuthFilesOAuthModelAliasEditPage } from '@/pages/AuthFilesOAuthModelAliasEditPage';
import { OAuthPage } from '@/pages/OAuthPage';
import { QuotaPage } from '@/pages/QuotaPage';
import { PluginResourcePage } from '@/features/plugins/PluginResourcePage';
import { PluginsPage } from '@/features/plugins/PluginsPage';
import { PluginStorePage } from '@/features/plugins/PluginStorePage';
import { ConfigPage } from '@/pages/ConfigPage';
import { LogsPage } from '@/pages/LogsPage';
import { SystemPage } from '@/pages/SystemPage';
import { isPluginUiEnabled } from '@/features/plugins/pluginAvailability';
import { useAuthStore, useConfigStore } from '@/stores';

export function MainRoutes({ location }: { location?: Location }) {
  const supportsPlugin = useAuthStore((state) => state.supportsPlugin);
  const config = useConfigStore((state) => state.config);
  const pluginUiEnabled = isPluginUiEnabled(supportsPlugin, config);
  const mainRoutes: RouteObject[] = [
    { path: '/', element: <DashboardPage /> },
    { path: '/dashboard', element: <DashboardPage /> },
    { path: '/ai-providers', element: <ProvidersWorkbenchPage /> },
    { path: '/ai-providers/*', element: <Navigate to="/ai-providers" replace /> },
    { path: '/auth-files', element: <AuthFilesPage /> },
    { path: '/auth-files/oauth-excluded', element: <AuthFilesOAuthExcludedEditPage /> },
    { path: '/auth-files/oauth-model-alias', element: <AuthFilesOAuthModelAliasEditPage /> },
    { path: '/oauth', element: <OAuthPage /> },
    { path: '/quota', element: <QuotaPage /> },
    ...(pluginUiEnabled
      ? [
          { path: '/plugin-pages/:pluginId/:menuIndex', element: <PluginResourcePage /> },
          { path: '/plugins', element: <PluginsPage /> },
          { path: '/plugin-store', element: <PluginStorePage /> },
          { path: '/plugins/*', element: <Navigate to="/plugins" replace /> },
        ]
      : [
          { path: '/plugin-pages/*', element: <Navigate to="/" replace /> },
          { path: '/plugins/*', element: <Navigate to="/" replace /> },
          { path: '/plugins', element: <Navigate to="/" replace /> },
          { path: '/plugin-store', element: <Navigate to="/" replace /> },
        ]),
    { path: '/config', element: <ConfigPage /> },
    { path: '/logs', element: <LogsPage /> },
    { path: '/system', element: <SystemPage /> },
    { path: '*', element: <Navigate to="/" replace /> },
  ];

  return useRoutes(mainRoutes, location);
}

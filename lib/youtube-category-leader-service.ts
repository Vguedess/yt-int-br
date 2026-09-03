import { collectCategoryLeaders24h } from '@/lib/youtube-category-leaders';
import {
  CATEGORY_LEADER_REFRESH_INTERVAL_HOURS,
  getLatestCategoryLeaderDashboard,
  persistCategoryLeaderCollection,
  withCategoryLeaderRefreshLock,
  type LeaderDashboard
} from '@/lib/youtube-category-leaders-db';

export type RefreshLeaderResult = {
  dashboard: LeaderDashboard;
  refreshed: boolean;
  reason: 'initial_load' | 'manual_refresh' | 'still_fresh';
};

async function collectAndPersist(): Promise<LeaderDashboard> {
  const collection = await collectCategoryLeaders24h();
  if (!collection.leaders.length) {
    const detail = collection.errors.map((item) => `${item.categoryKey}: ${item.message}`).join(' | ');
    throw new Error(detail || 'Nenhum líder foi encontrado.');
  }

  await persistCategoryLeaderCollection(collection);
  const dashboard = await getLatestCategoryLeaderDashboard();
  if (!dashboard) throw new Error('A coleta foi concluída, mas não pôde ser lida do banco.');
  return dashboard;
}

export async function getLeaderDashboard(): Promise<LeaderDashboard> {
  const existing = await getLatestCategoryLeaderDashboard();
  if (existing) return existing;

  return withCategoryLeaderRefreshLock(async () => {
    const afterLock = await getLatestCategoryLeaderDashboard();
    if (afterLock) return afterLock;
    return collectAndPersist();
  });
}

export async function refreshLeaderDashboardIfAllowed(): Promise<RefreshLeaderResult> {
  return withCategoryLeaderRefreshLock(async () => {
    const existing = await getLatestCategoryLeaderDashboard();
    if (existing && !existing.canRefresh) {
      return { dashboard: existing, refreshed: false, reason: 'still_fresh' };
    }

    const dashboard = await collectAndPersist();
    return {
      dashboard,
      refreshed: true,
      reason: existing ? 'manual_refresh' : 'initial_load'
    };
  });
}

export { CATEGORY_LEADER_REFRESH_INTERVAL_HOURS };

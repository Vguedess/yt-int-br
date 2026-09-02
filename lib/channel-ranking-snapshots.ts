export type ChannelRankingCategory = 'news-politics' | 'science-technology' | 'entertainment';

export type ChannelRankingSnapshotRow = {
  snapshotDate: '2026-09-02';
  countryCode: 'BR';
  category: ChannelRankingCategory;
  reportedRank: number;
  channelName: string;
  subscribers: number;
  views: number;
  videos: number;
  excluded: boolean;
  exclusionReason: string | null;
};

const D = '2026-09-02' as const;
const BR = 'BR' as const;

export const CHANNEL_RANKING_SNAPSHOT_2026_09_02: ChannelRankingSnapshotRow[] = [
  { snapshotDate: D, countryCode: BR, category: 'news-politics', reportedRank: 1, channelName: 'Jovem Pan News', subscribers: 9_070_000, views: 6_360_000_000, videos: 210_790, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'news-politics', reportedRank: 2, channelName: 'SBT News', subscribers: 8_020_000, views: 6_130_000_000, videos: 138_340, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'news-politics', reportedRank: 3, channelName: 'UOL', subscribers: 5_550_000, views: 6_010_000_000, videos: 124_950, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'news-politics', reportedRank: 4, channelName: 'CNN Brasil', subscribers: 6_780_000, views: 5_260_000_000, videos: 185_010, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'news-politics', reportedRank: 5, channelName: 'Balanço Geral', subscribers: 7_240_000, views: 4_070_000_000, videos: 71_780, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'news-politics', reportedRank: 6, channelName: 'Band Jornalismo', subscribers: 6_730_000, views: 3_870_000_000, videos: 194_360, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'news-politics', reportedRank: 7, channelName: 'Os Pingos nos Is', subscribers: 5_390_000, views: 3_410_000_000, videos: 20_590, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'news-politics', reportedRank: 8, channelName: 'Jornal da Record', subscribers: 5_780_000, views: 2_740_000_000, videos: 87_300, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'news-politics', reportedRank: 9, channelName: 'Marcos Serrano', subscribers: 1_010_000, views: 2_210_000_000, videos: 33_200, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'news-politics', reportedRank: 10, channelName: 'Metrópoles', subscribers: 4_240_000, views: 2_020_000_000, videos: 82_440, excluded: false, exclusionReason: null },

  { snapshotDate: D, countryCode: BR, category: 'science-technology', reportedRank: 1, channelName: 'Emilly Vick', subscribers: 31_800_000, views: 22_960_000_000, videos: 1_430, excluded: true, exclusionReason: 'category-mismatch-childrens-content' },
  { snapshotDate: D, countryCode: BR, category: 'science-technology', reportedRank: 2, channelName: 'Google Brasil', subscribers: 1_410_000, views: 5_870_000_000, videos: 1_000, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'science-technology', reportedRank: 3, channelName: 'Manual do Mundo', subscribers: 20_500_000, views: 5_570_000_000, videos: 3_360, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'science-technology', reportedRank: 4, channelName: 'Coisa de Nerd', subscribers: 11_100_000, views: 3_590_000_000, videos: 2_010, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'science-technology', reportedRank: 5, channelName: 'Samsung Brasil', subscribers: 2_090_000, views: 2_200_000_000, videos: 3_350, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'science-technology', reportedRank: 6, channelName: 'Ciência Todo Dia', subscribers: 7_890_000, views: 2_090_000_000, videos: 1_260, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'science-technology', reportedRank: 7, channelName: 'Nubank', subscribers: 2_210_000, views: 1_910_000_000, videos: 1_070, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'science-technology', reportedRank: 8, channelName: 'Top! Tech', subscribers: 2_280_000, views: 1_500_000_000, videos: 2_780, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'science-technology', reportedRank: 9, channelName: 'Hoje no Mundo Militar', subscribers: 2_890_000, views: 1_380_000_000, videos: 6_450, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'science-technology', reportedRank: 10, channelName: 'Aviões e Músicas', subscribers: 4_170_000, views: 1_280_000_000, videos: 3_270, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'science-technology', reportedRank: 11, channelName: 'Fabricio Rabachim', subscribers: 1_480_000, views: 1_240_000_000, videos: 134, excluded: false, exclusionReason: null },

  { snapshotDate: D, countryCode: BR, category: 'entertainment', reportedRank: 1, channelName: 'Enaldinho', subscribers: 48_100_000, views: 26_070_000_000, videos: 5_710, excluded: true, exclusionReason: 'child-or-preteen-content-global-policy' },
  { snapshotDate: D, countryCode: BR, category: 'entertainment', reportedRank: 2, channelName: 'Natan por Ai', subscribers: 49_800_000, views: 24_130_000_000, videos: 2_320, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'entertainment', reportedRank: 3, channelName: 'Felipe Neto', subscribers: 48_100_000, views: 19_800_000_000, videos: 6_540, excluded: true, exclusionReason: 'child-or-preteen-content-global-policy' },
  { snapshotDate: D, countryCode: BR, category: 'entertainment', reportedRank: 4, channelName: 'Lucan Pevidor', subscribers: 34_500_000, views: 17_300_000_000, videos: 2_490, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'entertainment', reportedRank: 5, channelName: 'DUDU e CAROL', subscribers: 33_600_000, views: 16_100_000_000, videos: 3_470, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'entertainment', reportedRank: 6, channelName: 'LUCCAS NETO', subscribers: 53_600_000, views: 15_570_000_000, videos: 5_110, excluded: true, exclusionReason: 'child-or-preteen-content-global-policy' },
  { snapshotDate: D, countryCode: BR, category: 'entertainment', reportedRank: 7, channelName: 'Giuliana Mafra', subscribers: 15_900_000, views: 15_220_000_000, videos: 1_350, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'entertainment', reportedRank: 8, channelName: 'Gabrielmiranda_ofc', subscribers: 21_300_000, views: 15_070_000_000, videos: 1_740, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'entertainment', reportedRank: 9, channelName: 'Mayca Brasil', subscribers: 14_500_000, views: 14_440_000_000, videos: 8_840, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'entertainment', reportedRank: 10, channelName: 'Rafa & Luiz', subscribers: 35_000_000, views: 14_380_000_000, videos: 5_130, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'entertainment', reportedRank: 11, channelName: 'rezende', subscribers: 34_600_000, views: 14_360_000_000, videos: 13_330, excluded: true, exclusionReason: 'child-or-preteen-content-global-policy' },
  { snapshotDate: D, countryCode: BR, category: 'entertainment', reportedRank: 12, channelName: 'Jooj Natu', subscribers: 19_000_000, views: 14_310_000_000, videos: 1_840, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'entertainment', reportedRank: 13, channelName: 'Valentina Pontes ofc', subscribers: 29_100_000, views: 13_430_000_000, videos: 4_060, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'entertainment', reportedRank: 14, channelName: 's Wagners', subscribers: 12_700_000, views: 11_290_000_000, videos: 1_740, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'entertainment', reportedRank: 15, channelName: 'Ju Araújo', subscribers: 19_200_000, views: 11_270_000_000, videos: 26_520, excluded: false, exclusionReason: null },
  { snapshotDate: D, countryCode: BR, category: 'entertainment', reportedRank: 16, channelName: 'Renato Garcia', subscribers: 31_700_000, views: 10_770_000_000, videos: 5_860, excluded: false, exclusionReason: null }
];

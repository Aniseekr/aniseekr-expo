// Storage keys for every preference backed by MMKV.
//
// This file is intentionally dependency-free so each owning module can import
// its own key without pulling in `app-storage` (which transitively pulls
// `react-native-mmkv`).

// --- Tier 1: theme + pilgrimage/camera (frame-1 critical reads) ---
export const THEME_ID_KEY = '@aniseekr/theme';
export const THEME_CUSTOM_ACCENT_KEY = '@aniseekr/customAccent';
export const THEME_RECENT_ACCENTS_KEY = '@aniseekr/recentAccents';
export const THEME_MODE_KEY = '@aniseekr/themeMode';
export const THEME_TINT_INTENSITY_KEY = '@aniseekr/tintIntensity';
export const THEME_INCREASE_CONTRAST_KEY = '@aniseekr/increaseContrast';
export const MAP_THEME_STORAGE_KEY = 'aniseekr.pilgrimage.mapTheme.v1';
export const VISITED_SPOTS_STORAGE_KEY = 'aniseekr.pilgrimage.visited.v1';
export const SPOT_INTENTS_STORAGE_KEY = 'aniseekr.pilgrimage.spot-intents.v1';
export const CAPTURES_STORAGE_KEY = '@aniseekr/pilgrimage/captures/v1';
export const CAMERA_SETTINGS_STORAGE_KEY = 'aniseekr:camera-settings:v4';

// --- Tier 2: pref services ---
export const USER_PREFS_STORAGE_KEY = 'aniseekr.user.prefs.v1';
export const COLLECTION_SORT_MODE_STORAGE_KEY = 'aniseekr.collection.sortMode.v1';
export const BANGUMI_PREFS_STORAGE_KEY = 'aniseekr.bangumi.prefs.v1';
export const BROWSE_SOURCE_STORAGE_KEY = 'aniseekr.browseSource';
export const ALLOW_R18_STORAGE_KEY = 'aniseekr.allowR18Content';
export const ONBOARDING_COMPLETE_KEY = 'aniseekr.onboarding.complete.v1';

// --- Tier 3: user repository / search / collection / notifications / cloud ---
// These were the remaining AsyncStorage users that all moved to MMKV in one
// pass — same key names, same string formats, just a faster backend.
export const USER_PRIMARY_PLATFORM_KEY = 'aniseekr.user.primaryPlatform';
export const USER_DISPLAY_NAME_KEY = 'aniseekr.user.displayName';
export const USER_AVATAR_URI_KEY = 'aniseekr.user.avatarUri';
export const SEARCH_RECENT_KEY = '@aniseekr/search/recent';
export const COLLECTION_SEARCH_RECENTS_KEY = 'aniseekr.collection.search.recents.v1';
export const NOTIFICATION_PREFS_KEY = '@aniseekr/notifications/prefs';
export const BACKUP_LAST_RUN_KEY = 'aniseekr.cloud.lastBackup.v1';
export const BACKUP_ENCRYPTION_TOGGLE_KEY = 'aniseekr.cloud.encryption.enabled.v1';
export const BACKUP_PROVIDER_KEY = 'aniseekr.cloud.provider.v1';
export const AUTO_BACKUP_PREFS_KEY = 'aniseekr.cloud.autoBackup.prefs.v1';
export const AUTO_BACKUP_LAST_RUN_KEY = 'aniseekr.cloud.autoBackup.lastRunAt';
export const AUTO_BACKUP_LAST_ERR_KEY = 'aniseekr.cloud.autoBackup.lastError';
export const SYNC_PREFS_KEY = '@aniseekr/sync/prefs';
export const SYNC_LAST_RUN_KEY = '@aniseekr/sync/lastRun';
export const LANGUAGE_PRIORITY_KEY = '@aniseekr/title-language-priority';
/** App UI language preference: 'auto' | 'en' | 'zh-Hant' | 'zh-Hans' | 'ja' | 'ko'. */
export const APP_LANGUAGE_KEY = '@aniseekr/app-language';
/** Language used to render anime vocab (genres / tags / studios). 'auto' = follow app language. */
export const ANIME_VOCAB_LANG_KEY = '@aniseekr/anime/vocab-language';
/** Whether to machine-translate synopsis when no localized version exists. P3 turns this on. */
export const ANIME_AUTOTRANSLATE_KEY = '@aniseekr/anime/autotranslate-synopsis';
/** Whether to render original text alongside every translation. */
export const ANIME_SHOW_ORIGINAL_KEY = '@aniseekr/anime/show-original';
export const GACHA_USER_DATA_KEY = '@gacha_user_data';
export const RATE_NATIVE_AD_SUPPRESS_UNTIL_KEY = '@aniseekr/ads/rate-native/suppressUntil';
/** Prefix for one-shot collection tip-dismissal flags (`@aniseekr/${tip}`). */
export const COLLECTION_TIP_KEY_PREFIX = '@aniseekr/';
/** Prefix for swipe-action tip-dismissal flags (`@aniseekr/tip/${id}`). */
export const SWIPE_ACTION_TIP_KEY_PREFIX = '@aniseekr/tip/';

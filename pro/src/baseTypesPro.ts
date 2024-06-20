///////////////////////////////////////////////////////////
// PRO
//////////////////////////////////////////////////////////

export const COMMAND_CALLBACK_PRO = "remotely-save-cb-pro";
export const PRO_CLIENT_ID = process.env.DEFAULT_REMOTELYSAVE_CLIENT_ID;
export const PRO_WEBSITE = process.env.DEFAULT_REMOTELYSAVE_WEBSITE;

export type PRO_FEATURE_TYPE =
  | "feature-smart_conflict"
  | "feature-google_drive"
  | "feature-box"
  | "feature-pcloud"
  | "feature-yandex_disk"
  | "feature-koofr";

export interface FeatureInfo {
  featureName: PRO_FEATURE_TYPE;
  enableAtTimeMs: bigint;
  expireAtTimeMs: bigint;
}

export interface ProConfig {
  email?: string;
  refreshToken?: string;
  accessToken: string;
  accessTokenExpiresInMs: number;
  accessTokenExpiresAtTimeMs: number;
  enabledProFeatures: FeatureInfo[];
  credentialsShouldBeDeletedAtTimeMs?: number;
}

///////////////////////////////////////////////////////////
// smart conflict
//////////////////////////////////////////////////////////

export const MERGABLE_SIZE = 1000 * 1000; // 1 MB

///////////////////////////////////////////////////////////
// Google Drive
//////////////////////////////////////////////////////////

export interface GoogleDriveConfig {
  accessToken: string;
  accessTokenExpiresInMs: number;
  accessTokenExpiresAtTimeMs: number;
  refreshToken: string;
  remoteBaseDir?: string;
  credentialsShouldBeDeletedAtTimeMs?: number;
  scope: "https://www.googleapis.com/auth/drive.file";
  kind: "googledrive";
}

export const DEFAULT_GOOGLEDRIVE_CLIENT_ID =
  process.env.DEFAULT_GOOGLEDRIVE_CLIENT_ID;
export const DEFAULT_GOOGLEDRIVE_CLIENT_SECRET =
  process.env.DEFAULT_GOOGLEDRIVE_CLIENT_SECRET;

///////////////////////////////////////////////////////////
// box
//////////////////////////////////////////////////////////

export const COMMAND_CALLBACK_BOX = "remotely-save-cb-box";
export const BOX_CLIENT_ID = process.env.DEFAULT_BOX_CLIENT_ID;
export const BOX_CLIENT_SECRET = process.env.DEFAULT_BOX_CLIENT_SECRET;

export interface BoxConfig {
  accessToken: string;
  accessTokenExpiresInMs: number;
  accessTokenExpiresAtTimeMs: number;
  refreshToken: string;
  remoteBaseDir?: string;
  credentialsShouldBeDeletedAtTimeMs?: number;
  kind: "box";
}

///////////////////////////////////////////////////////////
// pCloud
//////////////////////////////////////////////////////////

export const COMMAND_CALLBACK_PCLOUD = "remotely-save-cb-pcloud";
export const PCLOUD_CLIENT_ID = process.env.DEFAULT_PCLOUD_CLIENT_ID;
export const PCLOUD_CLIENT_SECRET = process.env.DEFAULT_PCLOUD_CLIENT_SECRET;

export interface PCloudConfig {
  accessToken: string;
  hostname: "eapi.pcloud.com" | "api.pcloud.com";
  locationid: 1 | 2;
  remoteBaseDir?: string;
  credentialsShouldBeDeletedAtTimeMs?: number;
  kind: "pcloud";

  /**
   * @deprecated
   */
  emptyFile: "skip" | "error";
}

///////////////////////////////////////////////////////////
// Yandex Disk
//////////////////////////////////////////////////////////

export const COMMAND_CALLBACK_YANDEXDISK = "remotely-save-cb-yandexdisk";
export const YANDEXDISK_CLIENT_ID = process.env.DEFAULT_YANDEXDISK_CLIENT_ID;
export const YANDEXDISK_CLIENT_SECRET =
  process.env.DEFAULT_YANDEXDISK_CLIENT_SECRET;

export interface YandexDiskConfig {
  accessToken: string;
  accessTokenExpiresInMs: number;
  accessTokenExpiresAtTimeMs: number;
  refreshToken: string;
  remoteBaseDir?: string;
  credentialsShouldBeDeletedAtTimeMs?: number;
  scope: string;
  kind: "yandexdisk";
}

///////////////////////////////////////////////////////////
// Koofr
//////////////////////////////////////////////////////////

export const COMMAND_CALLBACK_KOOFR = "remotely-save-cb-koofr";
export const KOOFR_CLIENT_ID = process.env.DEFAULT_KOOFR_CLIENT_ID;
export const KOOFR_CLIENT_SECRET = process.env.DEFAULT_KOOFR_CLIENT_SECRET;

export interface KoofrConfig {
  accessToken: string;
  accessTokenExpiresInMs: number;
  accessTokenExpiresAtTimeMs: number;
  refreshToken: string;
  remoteBaseDir?: string;
  credentialsShouldBeDeletedAtTimeMs?: number;
  scope: string;
  api: string;
  mountID: string;
  kind: "koofr";
}

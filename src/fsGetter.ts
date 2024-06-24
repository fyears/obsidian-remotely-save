import { FakeFsAzureBlobStorage } from "../pro/src/fsAzureBlobStorage";
import { FakeFsBox } from "../pro/src/fsBox";
import { FakeFsGoogleDrive } from "../pro/src/fsGoogleDrive";
import { FakeFsKoofr } from "../pro/src/fsKoofr";
import { FakeFsOnedriveFull } from "../pro/src/fsOnedriveFull";
import { FakeFsPCloud } from "../pro/src/fsPCloud";
import { FakeFsYandexDisk } from "../pro/src/fsYandexDisk";
import type { RemotelySavePluginSettings } from "./baseTypes";
import type { FakeFs } from "./fsAll";
import { FakeFsDropbox } from "./fsDropbox";
import { FakeFsOnedrive } from "./fsOnedrive";
import { FakeFsS3 } from "./fsS3";
import { FakeFsWebdav } from "./fsWebdav";
import { FakeFsWebdis } from "./fsWebdis";

/**
 * To avoid circular dependency, we need a new file here.
 */
export function getClient(
  settings: RemotelySavePluginSettings,
  vaultName: string,
  saveUpdatedConfigFunc: () => Promise<any>
): FakeFs {
  switch (settings.serviceType) {
    case "s3":
      return new FakeFsS3(settings.s3);
    case "webdav":
      return new FakeFsWebdav(
        settings.webdav,
        vaultName,
        saveUpdatedConfigFunc
      );
    case "dropbox":
      return new FakeFsDropbox(
        settings.dropbox,
        vaultName,
        saveUpdatedConfigFunc
      );
    case "onedrive":
      return new FakeFsOnedrive(
        settings.onedrive,
        vaultName,
        saveUpdatedConfigFunc
      );
    case "onedrivefull":
      return new FakeFsOnedriveFull(
        settings.onedrivefull,
        vaultName,
        saveUpdatedConfigFunc
      );
    case "webdis":
      return new FakeFsWebdis(
        settings.webdis,
        vaultName,
        saveUpdatedConfigFunc
      );
    case "googledrive":
      return new FakeFsGoogleDrive(
        settings.googledrive,
        vaultName,
        saveUpdatedConfigFunc
      );
    case "box":
      return new FakeFsBox(settings.box, vaultName, saveUpdatedConfigFunc);
    case "pcloud":
      return new FakeFsPCloud(
        settings.pcloud,
        vaultName,
        saveUpdatedConfigFunc
      );
    case "yandexdisk":
      return new FakeFsYandexDisk(
        settings.yandexdisk,
        vaultName,
        saveUpdatedConfigFunc
      );
    case "koofr":
      return new FakeFsKoofr(settings.koofr, vaultName, saveUpdatedConfigFunc);
    case "azureblobstorage":
      return new FakeFsAzureBlobStorage(settings.azureblobstorage, vaultName);
    default:
      throw Error(`cannot init client for serviceType=${settings.serviceType}`);
  }
}

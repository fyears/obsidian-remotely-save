import type { Entity } from "./baseTypes";
import { FakeFsWebdav, getNormPath } from "./fsWebdav";
import localforage from "localforage";
import { XMLParser } from "fast-xml-parser";
import { toBase64 } from "js-base64";
import { requestUrl } from "obsidian";
import type { FileStat } from "webdav";
import Bottleneck from "bottleneck";
import { DEFAULT_DB_NAME, DEFAULT_TBL_NUTSTORE_DELTA_CACHE } from "./localdb";
import { isEqual, isNil } from "lodash";
import { dirname } from "path";

const fromWebdavItemToEntity = (
  x: Omit<FileStat, "etag">,
  remoteBaseDir: string
): Entity => {
  let key = getNormPath(x.filename, remoteBaseDir);

  if (x.type === "directory" && !key.endsWith("/")) {
    key = `${key}/`;
  }
  const mtimeSvr = Date.parse(x.lastmod).valueOf();
  return {
    key: key,
    keyRaw: key,
    mtimeSvr: mtimeSvr,
    mtimeCli: mtimeSvr, // TODO: no universal way to set mtime in webdav
    size: x.size,
    sizeRaw: x.size,
  };
};

interface DeltaCache {
  files: Entity[];
  originCursor: string;
  deltas: DeltaResponse[];
}

const deltaCache = localforage.createInstance({
  name: DEFAULT_DB_NAME,
  storeName: DEFAULT_TBL_NUTSTORE_DELTA_CACHE,
});

const getDeltaCache = async (baseDir: string) => {
  return await deltaCache.getItem<DeltaCache>(baseDir);
};

const setDeltaCache = (baseDir: string, deltas: DeltaCache) => {
  return deltaCache.setItem(baseDir, deltas);
};

interface DeltaEntry {
  path: string;
  size: number;
  isDeleted: boolean;
  isDir: boolean;
  modified: string;
  revision: number;
}

interface DeltaResponse {
  reset: boolean;
  cursor: string;
  hasMore: boolean;
  delta: {
    entry: DeltaEntry[];
  };
}

function NSAPI(name: "delta" | "latestDeltaCursor") {
  return `https://dav.jianguoyun.com/nsdav/${name}`;
}

function encodeToken(username: string, password: string) {
  return toBase64(`${username}:${password}`);
}

function parseXml<T>(xml: string) {
  const parser = new XMLParser({
    attributeNamePrefix: "",
    removeNSPrefix: true,
  });
  return parser.parse(xml) as T;
}

const limiter = new Bottleneck({
  maxConcurrent: 2,
  minTime: 1000,
});

interface GetDeltaInput {
  folderName: string;
  cursor?: string;
  username: string;
  password: string;
}

const getDelta = limiter.wrap(
  async ({ folderName, username, password, cursor }: GetDeltaInput) => {
    const body = `<?xml version="1.0" encoding="utf-8"?>
            <s:delta xmlns:s="http://ns.jianguoyun.com">
                <s:folderName>${folderName}</s:folderName>
                <s:cursor>${cursor ?? ""}</s:cursor>
            </s:delta>`;
    const token = encodeToken(username, password);
    const xml = await requestUrl({
      url: NSAPI("delta"),
      method: "POST",
      headers: {
        Authorization: `Basic ${token}`,
        "Content-Type": "application/xml",
      },
      body,
    });
    const result = parseXml<{ response: DeltaResponse }>(xml.text);
    if (!isNil(result?.response?.cursor)) {
      result.response.cursor = result.response.cursor.toString();
    }
    if (result.response.delta) {
        const entry = result.response.delta.entry
        if(!Array.isArray(entry)) {
            result.response.delta.entry = [entry]
        }
    }else{
      result.response.delta = {
        entry: [],
      };
    }
    return result;
  }
);

interface GetLatestDeltaCursorInput {
  folderName: string;
  username: string;
  password: string;
}

const getLatestDeltaCursor = limiter.wrap(
  async ({ folderName, username, password }: GetLatestDeltaCursorInput) => {
    const body = `<?xml version="1.0" encoding="utf-8"?>
            <s:delta xmlns:s="http://ns.jianguoyun.com">
                <s:folderName>${folderName}</s:folderName>
            </s:delta>`;
    const token = encodeToken(username, password);
    const headers = {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/xml",
    };
    const response = await requestUrl({
      url: NSAPI("latestDeltaCursor"),
      method: "POST",
      headers,
      body,
    });
    const result = parseXml<{
      response: {
        cursor: string;
      };
    }>(response.text);
    return result;
  }
);

export class FakeFsNutStore extends FakeFsWebdav {
  async walk(): Promise<Entity[]> {
    await this._init();
    const auth = {
      username: this.webdavConfig.username,
      password: this.webdavConfig.password,
    };
    let deltaCache = await getDeltaCache(this.remoteBaseDir);
    if (deltaCache) {
      let cursor = deltaCache.deltas.at(-1)?.cursor ?? deltaCache.originCursor;
      while (true) {
        const events = await getDelta({
          ...auth,
          cursor,
          folderName: this.remoteBaseDir,
        });
        if (events.response.cursor === cursor) {
          break;
        }
        if (events.response.reset) {
          deltaCache.deltas = [];
          deltaCache.files = await super.walk();
          cursor = await getLatestDeltaCursor({
            ...auth,
            folderName: this.remoteBaseDir,
          }).then((d) => d?.response?.cursor);
        } else if (events.response.delta.entry.length > 0) {
          deltaCache.deltas.push(events.response);
          if (events.response.hasMore) {
            cursor = events.response.cursor;
          } else {
            break
          }
        } else {
          break;
        }
      }
    } else {
      const files = await super.walk();
      const {
        response: { cursor: originCursor },
      } = await getLatestDeltaCursor({
        ...auth,
        folderName: this.remoteBaseDir,
      });
      deltaCache = {
        files,
        originCursor,
        deltas: [],
      };
    }
    await setDeltaCache(this.remoteBaseDir, deltaCache);
    const deltasMap = new Map(
      deltaCache.deltas.flatMap((d) => d.delta.entry.map((d) => [d.path, d]))
    );
    const filesMap = new Map(deltaCache.files.map((d) => [d.key, d]));
    for (const delta of deltasMap.values()) {
      const entity = fromWebdavItemToEntity(
        {
          filename: delta.path,
          lastmod: delta.modified,
          type: delta.isDir ? "directory" : "file",
          basename: dirname(delta.path),
          size: delta.size,
        },
        this.remoteBaseDir
      );
      if (delta.isDeleted) {
        filesMap.delete(entity.key);
      } else {
        filesMap.set(entity.key, entity);
      }
    }
    return [...filesMap.values()].filter((x) => x.keyRaw !== "/");
  }
}

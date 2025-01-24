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

const deltaCache = localforage.createInstance({
  name: DEFAULT_DB_NAME,
  storeName: DEFAULT_TBL_NUTSTORE_DELTA_CACHE,
});

const getDeltaCache = async (baseDir: string) => {
  const res = await deltaCache.getItem<DeltaResponse[]>(baseDir);
  return res ?? [];
};

const setDeltaCache = (baseDir: string, deltas: DeltaResponse[]) => {
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

function NSAPI(name: "delta") {
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
    if (!result.response.delta) {
      result.response.delta = {
        entry: [],
      };
    }
    return result;
  }
);

async function getDeltasFromRemote(options: GetDeltaInput) {
  let deltas = await getDeltaCache(options.folderName);
  let cursor: string | undefined = undefined;
  if (deltas.length > 0) {
    const cachedFirstDelta = deltas[0];
    if (cachedFirstDelta.hasMore) {
      const { response: remoteFirstDelta } = await getDelta(options);
      if (!isEqual(remoteFirstDelta, cachedFirstDelta)) {
        deltas = [remoteFirstDelta];
        if (!remoteFirstDelta.hasMore) {
          return deltas;
        }
      }
    }
    const d = deltas.at(-1);
    if (d?.hasMore) {
      cursor = d.cursor;
    } else {
      cursor = deltas.at(-2)?.cursor;
    }
  }
  while (true) {
    const events = await getDelta(options);
    if (events.response.cursor === cursor) {
      break;
    }
    if (events.response.reset) {
      cursor = undefined;
      deltas = [];
      continue;
    }
    if (deltas.length === 0) {
      deltas.push(events.response);
    } else if (isNil(cursor)) {
      deltas = [events.response];
    } else {
      const cursorIdx = deltas.findIndex((d) => d.cursor === cursor);
      if (cursorIdx === -1) {
        throw new Error(`Unknown cursor: ${cursor}`);
      }
      deltas.splice(
        cursorIdx + 1,
        deltas.length - cursorIdx - 1,
        events.response
      );
    }
    if (events.response.hasMore) {
      cursor = events.response.cursor;
    } else {
      break;
    }
  }
  return deltas;
}

export class FakeFsNutStore extends FakeFsWebdav {
  async walk(): Promise<Entity[]> {
    await this._init();

    const deltas = await getDeltasFromRemote({
      folderName: this.remoteBaseDir,
      username: this.webdavConfig.username,
      password: this.webdavConfig.password,
    });
    await setDeltaCache(this.remoteBaseDir, deltas);
    const res: Omit<FileStat, "etag">[] = [];
    const deltasMap = new Map(
      deltas.flatMap((d) => d.delta.entry.map((d) => [d.path, d]))
    );
    for (const item of deltasMap.values()) {
      if (item.isDeleted) {
        continue;
      }
      res.push({
        filename: item.path,
        basename: dirname(item.path),
        lastmod: item.modified,
        type: item.isDir ? "directory" : "file",
        size: item.size,
      });
    }

    return res
      .map((x) => fromWebdavItemToEntity(x, this.remoteBaseDir))
      .filter((x) => x.keyRaw !== "/");
  }
}

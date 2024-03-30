import { Platform, Vault } from "obsidian";
import * as path from "path";

import { base32, base64url } from "rfc4648";
import XRegExp from "xregexp";
import emojiRegex from "emoji-regex";

declare global {
  interface Window {
    moment: (...data: any) => any;
  }
}

/**
 * If any part of the file starts with '.' or '_' then it's a hidden file.
 * @param item
 * @param dot
 * @param underscore
 * @returns
 */
export const isHiddenPath = (
  item: string,
  dot: boolean = true,
  underscore: boolean = true
) => {
  if (!(dot || underscore)) {
    throw Error("parameter error for isHiddenPath");
  }
  const k = path.posix.normalize(item); // TODO: only unix path now
  const k2 = k.split("/"); // TODO: only unix path now
  // console.info(k2)
  for (const singlePart of k2) {
    if (singlePart === "." || singlePart === ".." || singlePart === "") {
      continue;
    }
    if (dot && singlePart[0] === ".") {
      return true;
    }
    if (underscore && singlePart[0] === "_") {
      return true;
    }
  }
  return false;
};

/**
 * Util func for mkdir -p based on the "path" of original file or folder
 * "a/b/c/" => ["a", "a/b", "a/b/c"]
 * "a/b/c/d/e.txt" => ["a", "a/b", "a/b/c", "a/b/c/d"]
 * @param x string
 * @returns string[] might be empty
 */
export const getFolderLevels = (x: string, addEndingSlash: boolean = false) => {
  const res: string[] = [];

  if (x === "" || x === "/") {
    return res;
  }

  const y1 = x.split("/");
  let i = 0;
  for (let index = 0; index + 1 < y1.length; index++) {
    let k = y1.slice(0, index + 1).join("/");
    if (k === "" || k === "/") {
      continue;
    }
    if (addEndingSlash) {
      k = `${k}/`;
    }
    res.push(k);
  }
  return res;
};

export const mkdirpInVault = async (thePath: string, vault: Vault) => {
  // console.info(thePath);
  const foldersToBuild = getFolderLevels(thePath);
  // console.info(foldersToBuild);
  for (const folder of foldersToBuild) {
    const r = await vault.adapter.exists(folder);
    // console.info(r);
    if (!r) {
      console.info(`mkdir ${folder}`);
      await vault.adapter.mkdir(folder);
    }
  }
};

/**
 * https://stackoverflow.com/questions/8609289
 * @param b Buffer
 * @returns ArrayBuffer
 */
export const bufferToArrayBuffer = (
  b: Buffer | Uint8Array | ArrayBufferView
) => {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

/**
 * Simple func.
 * @param b
 * @returns
 */
export const arrayBufferToBuffer = (b: ArrayBuffer) => {
  return Buffer.from(b);
};

export const arrayBufferToBase64 = (b: ArrayBuffer) => {
  return arrayBufferToBuffer(b).toString("base64");
};

export const arrayBufferToHex = (b: ArrayBuffer) => {
  return arrayBufferToBuffer(b).toString("hex");
};

export const base64ToArrayBuffer = (b64text: string) => {
  return bufferToArrayBuffer(Buffer.from(b64text, "base64"));
};

export const copyArrayBuffer = (src: ArrayBuffer) => {
  var dst = new ArrayBuffer(src.byteLength);
  new Uint8Array(dst).set(new Uint8Array(src));
  return dst;
};

/**
 * https://stackoverflow.com/questions/43131242
 * @param hex
 * @returns
 */
export const hexStringToTypedArray = (hex: string) => {
  const f = hex.match(/[\da-f]{2}/gi);
  if (f === null) {
    throw Error(`input ${hex} is not hex, no way to transform`);
  }
  return new Uint8Array(
    f.map(function (h) {
      return parseInt(h, 16);
    })
  );
};

export const base64ToBase32 = (a: string) => {
  return base32.stringify(Buffer.from(a, "base64"));
};

export const base64ToBase64url = (a: string, pad: boolean = false) => {
  let b = a.replace(/\+/g, "-").replace(/\//g, "_");
  if (!pad) {
    b = b.replace(/=/g, "");
  }
  return b;
};

/**
 * iOS Safari could decrypt string with invalid password!
 * So we need an extra way to test the decrypted result.
 * One simple way is testing the result are "valid", printable chars or not.
 *
 * https://stackoverflow.com/questions/6198986
 * https://www.regular-expressions.info/unicode.html
 * Manual test shows that emojis like '🍎' match '\\p{Cs}',
 * so we need to write the regrex in a form that \p{C} minus \p{Cs}
 * @param a
 */
export const isVaildText = (a: string) => {
  if (a === undefined) {
    return false;
  }
  // If the regex matches, the string is invalid.
  return !XRegExp("\\p{Cc}|\\p{Cf}|\\p{Co}|\\p{Cn}|\\p{Zl}|\\p{Zp}", "A").test(
    a
  );
};

/**
 * Use regex to detect a text contains emoji or not.
 * @param a
 * @returns
 */
export const hasEmojiInText = (a: string) => {
  const regex = emojiRegex();
  return regex.test(a);
};

/**
 * Convert the headers to a normal object.
 * @param h
 * @param toLower
 * @returns
 */
export const headersToRecord = (h: Headers, toLower: boolean = true) => {
  const res: Record<string, string> = {};
  h.forEach((v, k) => {
    if (toLower) {
      res[k.toLowerCase()] = v;
    } else {
      res[k] = v;
    }
  });
  return res;
};

/**
 * If input is already a folder, returns it as is;
 * And if input is a file, returns its direname.
 * @param a
 * @returns
 */
export const getPathFolder = (a: string) => {
  if (a.endsWith("/")) {
    return a;
  }
  const b = path.posix.dirname(a);
  return b.endsWith("/") ? b : `${b}/`;
};

/**
 * If input is already a folder, returns its folder;
 * And if input is a file, returns its direname.
 * @param a
 * @returns
 */
export const getParentFolder = (a: string) => {
  const b = path.posix.dirname(a);
  if (b === "." || b === "/") {
    // the root
    return "/";
  }
  if (b.endsWith("/")) {
    return b;
  }
  return `${b}/`;
};

/**
 * https://stackoverflow.com/questions/54511144
 * @param a
 * @param delimiter
 * @returns
 */
export const setToString = (a: Set<string>, delimiter: string = ",") => {
  return [...a].join(delimiter);
};

export const extractSvgSub = (x: string, subEl: string = "rect") => {
  const parser = new window.DOMParser();
  const dom = parser.parseFromString(x, "image/svg+xml");
  const svg = dom.querySelector("svg")!;
  svg.setAttribute("viewbox", "0 0 10 10");
  return svg.innerHTML;
};

/**
 * https://stackoverflow.com/questions/18230217
 * @param min
 * @param max
 * @returns
 */
export const getRandomIntInclusive = (min: number, max: number) => {
  const randomBuffer = new Uint32Array(1);
  window.crypto.getRandomValues(randomBuffer);
  let randomNumber = randomBuffer[0] / (0xffffffff + 1);
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(randomNumber * (max - min + 1)) + min;
};

/**
 * Random buffer
 * @param byteLength
 * @returns
 */
export const getRandomArrayBuffer = (byteLength: number) => {
  const k = window.crypto.getRandomValues(new Uint8Array(byteLength));
  return bufferToArrayBuffer(k);
};

/**
 * https://stackoverflow.com/questions/958908
 * @param x
 * @returns
 */
export const reverseString = (x: string) => {
  return [...x].reverse().join("");
};

export interface SplitRange {
  partNum: number; // startting from 1
  start: number;
  end: number; // exclusive
}
export const getSplitRanges = (bytesTotal: number, bytesEachPart: number) => {
  const res: SplitRange[] = [];
  if (bytesEachPart >= bytesTotal) {
    res.push({
      partNum: 1,
      start: 0,
      end: bytesTotal,
    });
    return res;
  }
  const remainder = bytesTotal % bytesEachPart;
  const howMany =
    Math.floor(bytesTotal / bytesEachPart) + (remainder === 0 ? 0 : 1);
  for (let i = 0; i < howMany; ++i) {
    res.push({
      partNum: i + 1,
      start: bytesEachPart * i,
      end: Math.min(bytesEachPart * (i + 1), bytesTotal),
    });
  }
  return res;
};

/**
 * https://stackoverflow.com/questions/332422
 * @param obj anything
 * @returns string of the name of the object
 */
export const getTypeName = (obj: any) => {
  return Object.prototype.toString.call(obj).slice(8, -1);
};

/**
 * Startting from 1
 * @param x
 * @returns
 */
export const atWhichLevel = (x: string | undefined) => {
  if (
    x === undefined ||
    x === "" ||
    x === "." ||
    x === ".." ||
    x.startsWith("/")
  ) {
    throw Error(`do not know which level for ${x}`);
  }
  let y = x;
  if (x.endsWith("/")) {
    y = x.slice(0, -1);
  }
  return y.split("/").length;
};

export const checkHasSpecialCharForDir = (x: string) => {
  return /[?/\\]/.test(x);
};

export const unixTimeToStr = (x: number | undefined | null) => {
  if (x === undefined || x === null || Number.isNaN(x)) {
    return undefined;
  }
  return window.moment(x).format() as string;
};

/**
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value#examples
 * @returns
 */
const getCircularReplacer = () => {
  const seen = new WeakSet();
  return (key: any, value: any) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }
    return value;
  };
};

/**
 * Convert "any" value to string.
 * @param x
 * @returns
 */
export const toText = (x: any) => {
  if (x === undefined || x === null) {
    return `${x}`;
  }
  if (typeof x === "string") {
    return x;
  }
  if (
    x instanceof String ||
    x instanceof Date ||
    typeof x === "number" ||
    typeof x === "bigint" ||
    typeof x === "boolean"
  ) {
    return `${x}`;
  }

  if (
    x instanceof Error ||
    (x &&
      x.stack &&
      x.message &&
      typeof x.stack === "string" &&
      typeof x.message === "string")
  ) {
    return `ERROR! MESSAGE: ${x.message}, STACK: ${x.stack}`;
  }

  try {
    const y = JSON.stringify(x, getCircularReplacer(), 2);
    if (y !== undefined) {
      return y;
    }
    throw new Error("not jsonable");
  } catch {
    return `${x}`;
  }
};

/**
 * On Android the stat has bugs for folders. So we need a fixed version.
 * @param vault
 * @param path
 */
export const statFix = async (vault: Vault, path: string) => {
  const s = await vault.adapter.stat(path);
  if (s === undefined || s === null) {
    return s;
  }
  if (s.ctime === undefined || s.ctime === null || Number.isNaN(s.ctime)) {
    s.ctime = undefined as any; // force assignment
  }
  if (s.mtime === undefined || s.mtime === null || Number.isNaN(s.mtime)) {
    s.mtime = undefined as any; // force assignment
  }
  if (
    (s.size === undefined || s.size === null || Number.isNaN(s.size)) &&
    s.type === "folder"
  ) {
    s.size = 0;
  }
  return s;
};

export const isSpecialFolderNameToSkip = (
  x: string,
  more: string[] | undefined
) => {
  let specialFolders = [
    ".git",
    ".github",
    ".gitlab",
    ".svn",
    "node_modules",
    ".DS_Store",
    "__MACOSX ",
    "Icon\r", // https://superuser.com/questions/298785/icon-file-on-os-x-desktop
    "desktop.ini",
    "Desktop.ini",
    "thumbs.db",
    "Thumbs.db",
  ].concat(more !== undefined ? more : []);
  for (const iterator of specialFolders) {
    if (
      x === iterator ||
      x === `${iterator}/` ||
      x.endsWith(`/${iterator}`) ||
      x.endsWith(`/${iterator}/`)
    ) {
      return true;
    }
  }
  return false;
};

/**
 *
 * @param x versionX
 * @param y versionY
 * @returns 1(x>y), 0(x==y), -1(x<y)
 */
export const compareVersion = (x: string | null, y: string | null) => {
  if (x === undefined || x === null) {
    return -1;
  }
  if (y === undefined || y === null) {
    return 1;
  }
  if (x === y) {
    return 0;
  }
  const [x1, x2, x3] = x.split(".").map((k) => Number(k));
  const [y1, y2, y3] = y.split(".").map((k) => Number(k));
  if (
    x1 > y1 ||
    (x1 === y1 && x2 > y2) ||
    (x1 === y1 && x2 === y2 && x3 > y3)
  ) {
    return 1;
  }
  return -1;
};

/**
 * https://stackoverflow.com/questions/19929641/how-to-append-an-html-string-to-a-documentfragment
 * To introduce some advanced html fragments.
 * @param string
 * @returns
 */
export const stringToFragment = (string: string) => {
  const wrapper = document.createElement("template");
  wrapper.innerHTML = string;
  return wrapper.content;
};

/**
 * https://forum.obsidian.md/t/css-to-show-status-bar-on-mobile-devices/77185
 * @param op
 */
export const changeMobileStatusBar = (op: "enable" | "disable") => {
  const bar = document.querySelector(
    ".is-mobile .app-container .status-bar"
  ) as HTMLElement;
  if (op === "enable") {
    bar.style.setProperty("display", "flex");
    const navBar = document.getElementsByClassName(
      "mobile-navbar"
    )[0] as HTMLElement;
    // thanks to community's solution
    const height = window.getComputedStyle(navBar).getPropertyValue("height");
    bar.style.setProperty("margin-bottom", height);
  } else {
    bar.style.removeProperty("display");
    bar.style.removeProperty("margin-bottom");
  }
};

/**
 * https://github.com/remotely-save/remotely-save/issues/567
 * https://www.dropboxforum.com/t5/Dropbox-API-Support-Feedback/Case-Sensitivity-in-API-2/td-p/191279
 * @param entities
 */
export const fixEntityListCasesInplace = (entities: { keyRaw: string }[]) => {
  entities.sort((a, b) => a.keyRaw.length - b.keyRaw.length);
  // console.log(JSON.stringify(entities,null,2));

  const caseMapping: Record<string, string> = { "": "" };
  for (const e of entities) {
    // console.log(`looking for: ${JSON.stringify(e, null, 2)}`);

    let parentFolder = getParentFolder(e.keyRaw);
    if (parentFolder === "/") {
      parentFolder = "";
    }
    const parentFolderLower = parentFolder.toLocaleLowerCase();
    const segs = e.keyRaw.split("/");
    if (e.keyRaw.endsWith("/")) {
      // folder
      if (caseMapping.hasOwnProperty(parentFolderLower)) {
        const newKeyRaw = `${caseMapping[parentFolderLower]}${segs
          .slice(-2)
          .join("/")}`;
        caseMapping[newKeyRaw.toLocaleLowerCase()] = newKeyRaw;
        e.keyRaw = newKeyRaw;
        // console.log(JSON.stringify(caseMapping,null,2));
        continue;
      } else {
        throw Error(`${parentFolder} doesn't have cases record??`);
      }
    } else {
      // file
      if (caseMapping.hasOwnProperty(parentFolderLower)) {
        const newKeyRaw = `${caseMapping[parentFolderLower]}${segs
          .slice(-1)
          .join("/")}`;
        e.keyRaw = newKeyRaw;
        continue;
      } else {
        throw Error(`${parentFolder} doesn't have cases record??`);
      }
    }
  }

  return entities;
};

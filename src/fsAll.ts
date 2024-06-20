import type { Entity } from "./baseTypes";

export abstract class FakeFs {
  abstract kind: string;
  abstract walk(): Promise<Entity[]>;
  abstract walkPartial(): Promise<Entity[]>;
  abstract stat(key: string): Promise<Entity>;
  abstract mkdir(key: string, mtime?: number, ctime?: number): Promise<Entity>;
  abstract writeFile(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number
  ): Promise<Entity>;
  abstract readFile(key: string): Promise<ArrayBuffer>;
  abstract rename(key1: string, key2: string): Promise<void>;
  abstract rm(key: string): Promise<void>;
  abstract checkConnect(callbackFunc?: any): Promise<boolean>;
  abstract getUserDisplayName(): Promise<string>;
  abstract revokeAuth(): Promise<any>;
  abstract allowEmptyFile(): boolean;
}

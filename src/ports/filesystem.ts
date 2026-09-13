export interface FileSystem {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  list(path: string): Promise<readonly string[]>;
  createExclusive(path: string, content: string): Promise<void>;
  writeText(path: string, content: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  copyTree(from: string, to: string): Promise<void>;
}

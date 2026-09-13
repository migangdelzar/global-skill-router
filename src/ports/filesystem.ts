export interface FileSystem {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  list(path: string): Promise<readonly string[]>;
  createExclusive(path: string, content: string): Promise<boolean>;
  /** Remove exactly one file path; never recursively removes a directory. */
  removeFile(path: string): Promise<boolean>;
  /** Remove a directory only when it is empty. */
  removeEmptyDirectory(path: string): Promise<boolean>;
  writeText(path: string, content: string): Promise<void>;
  writeBytes(path: string, content: Uint8Array): Promise<void>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  copyTree(from: string, to: string): Promise<void>;
}

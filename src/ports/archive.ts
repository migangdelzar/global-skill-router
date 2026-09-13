export interface ArchiveExtractor {
  extract(archive: Uint8Array, destination: string): Promise<void>;
}

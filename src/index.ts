export type { Clock } from './ports/clock.js';
export type { FileSystem } from './ports/filesystem.js';
export type { GitHubClient, GitHubRelease } from './ports/github.js';
export type { LockLease, SourceLock } from './ports/lock.js';
export type { MetadataCache, MetadataRecord } from './domain/cache.js';
export { metadataPathForRepo } from './domain/cache.js';
export {
  MetadataCacheService,
  MetadataRefreshError,
} from './services/metadata-cache.js';
export { InMemorySourceLock } from './services/source-lock.js';
export {
  CatalogValidationError,
  parseCatalog,
} from './domain/catalog.js';
export type {
  ActivationMode,
  SkillEntry,
} from './domain/catalog.js';
export { route } from './services/skill-router.js';
export type {
  RouteRequest,
  RouteResult,
  RouteTooling,
} from './services/skill-router.js';

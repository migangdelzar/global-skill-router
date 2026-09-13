export type ManagedToolId = 'tgrep' | 'rtk';

export interface ToolStatus {
  id: ManagedToolId;
  command: string;
  installed: boolean;
  requiredFor: readonly string[];
}

export interface ToolLocator {
  has(command: string): Promise<boolean>;
}

const DEFINITIONS: ReadonlyArray<{ id: ManagedToolId; command: string; requiredFor: readonly string[] }> = [
  { id: 'tgrep', command: 'tgrep', requiredFor: ['repository-search'] },
  { id: 'rtk', command: 'rtk', requiredFor: ['noisy-cli-output'] },
];

export class ToolingRegistry {
  constructor(private readonly locator: ToolLocator) {}

  async status(): Promise<readonly ToolStatus[]> {
    return Promise.all(DEFINITIONS.map(async (definition) => ({
      ...definition,
      installed: await this.locator.has(definition.command),
    })));
  }
}

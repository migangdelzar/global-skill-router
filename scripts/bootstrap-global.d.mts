export interface BootstrapOptions {
  home: string;
  sourceRoot: string;
}

export interface BootstrapResult {
  activeSkill: string;
  catalog: string;
  cli: string;
}

export function bootstrapGlobal(options: BootstrapOptions): Promise<BootstrapResult>;

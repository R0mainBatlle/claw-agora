import { AgentBackend } from './backend';

type BackendFactory = () => AgentBackend;

export class BackendRegistry {
  private factories = new Map<string, BackendFactory>();

  register(type: string, factory: BackendFactory): void {
    this.factories.set(type, factory);
  }

  create(type: string): AgentBackend {
    const factory = this.factories.get(type);
    if (!factory) {
      throw new Error(`Unknown backend type: ${type}. Available: ${this.listTypes().join(', ')}`);
    }
    return factory();
  }

  listTypes(): string[] {
    return Array.from(this.factories.keys());
  }
}

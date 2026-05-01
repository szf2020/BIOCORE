// ============================================================
// Multi-reactor management (up to 4 PLC instances per PC)
// ============================================================

export interface ReactorConfig {
  id: string;
  name: string;
  plcConfig: Record<string, unknown>;
  status: 'online' | 'offline' | 'error' | 'initializing';
}

export class MultiReactorManager {
  private reactors: Map<string, ReactorConfig> = new Map();

  private static readonly MAX_REACTORS = 4;

  addReactor(id: string, name: string, plcConfig: Record<string, unknown>): void {
    if (this.reactors.size >= MultiReactorManager.MAX_REACTORS) {
      throw new Error(`Cannot add reactor: maximum of ${MultiReactorManager.MAX_REACTORS} reactors per PC`);
    }
    if (this.reactors.has(id)) {
      throw new Error(`Reactor with id "${id}" already exists`);
    }
    this.reactors.set(id, {
      id,
      name,
      plcConfig: { ...plcConfig },
      status: 'initializing',
    });
  }

  removeReactor(id: string): void {
    if (!this.reactors.has(id)) {
      throw new Error(`Reactor with id "${id}" not found`);
    }
    this.reactors.delete(id);
  }

  listReactors(): { id: string; name: string; status: string }[] {
    return Array.from(this.reactors.values()).map(r => ({
      id: r.id,
      name: r.name,
      status: r.status,
    }));
  }

  getReactor(id: string): ReactorConfig {
    const reactor = this.reactors.get(id);
    if (!reactor) {
      throw new Error(`Reactor with id "${id}" not found`);
    }
    return { ...reactor, plcConfig: { ...reactor.plcConfig } };
  }

  setStatus(id: string, status: ReactorConfig['status']): void {
    const reactor = this.reactors.get(id);
    if (!reactor) {
      throw new Error(`Reactor with id "${id}" not found`);
    }
    this.reactors.set(id, { ...reactor, status });
  }

  getReactorCount(): number {
    return this.reactors.size;
  }
}

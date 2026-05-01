"use strict";
// ============================================================
// Multi-reactor management (up to 4 PLC instances per PC)
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiReactorManager = void 0;
class MultiReactorManager {
    reactors = new Map();
    static MAX_REACTORS = 4;
    addReactor(id, name, plcConfig) {
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
    removeReactor(id) {
        if (!this.reactors.has(id)) {
            throw new Error(`Reactor with id "${id}" not found`);
        }
        this.reactors.delete(id);
    }
    listReactors() {
        return Array.from(this.reactors.values()).map(r => ({
            id: r.id,
            name: r.name,
            status: r.status,
        }));
    }
    getReactor(id) {
        const reactor = this.reactors.get(id);
        if (!reactor) {
            throw new Error(`Reactor with id "${id}" not found`);
        }
        return { ...reactor, plcConfig: { ...reactor.plcConfig } };
    }
    setStatus(id, status) {
        const reactor = this.reactors.get(id);
        if (!reactor) {
            throw new Error(`Reactor with id "${id}" not found`);
        }
        this.reactors.set(id, { ...reactor, status });
    }
    getReactorCount() {
        return this.reactors.size;
    }
}
exports.MultiReactorManager = MultiReactorManager;
//# sourceMappingURL=multi-reactor.js.map
// SP-FX-48.7: Barrel for batch-5 controls (FUXA parity).
// Side-effect import registers widget metas into gaugeRegistry.
// SP-FX-48.16: htmlVideo + htmlScheduler removed (user request); only panel remains.

import { gaugeRegistry } from '../../gauge-registry';
import { panelMeta } from './panel';

gaugeRegistry.register(panelMeta);

export { panelMeta };

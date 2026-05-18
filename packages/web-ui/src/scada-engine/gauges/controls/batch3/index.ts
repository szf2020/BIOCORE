// SP-FX-9: Barrel for batch-3 controls.
// Importing this file registers all 5 batch-3 widget metas into gaugeRegistry.
// SP-FX-7 RuntimeCanvas can import this barrel at startup alongside batch1 and batch2.

import { gaugeRegistry } from '../../gauge-registry';
import { htmlBagMeta } from './html-bag';
import { htmlGraphMeta } from './html-graph';
import { tankMeta } from './tank';
import { motorMeta } from './motor';
import { htmlImageMeta } from './html-image';

gaugeRegistry.register(htmlBagMeta);
gaugeRegistry.register(htmlGraphMeta);
gaugeRegistry.register(tankMeta);
gaugeRegistry.register(motorMeta);
gaugeRegistry.register(htmlImageMeta);

export { htmlBagMeta, htmlGraphMeta, tankMeta, motorMeta, htmlImageMeta };

// SP-FX-6: Barrel for batch-1 controls.
// Importing this file registers all 5 widget metas into gaugeRegistry as a side-effect.
// SP-FX-7 RuntimeCanvas imports this once at startup.

import { gaugeRegistry } from '../gauge-registry';
import { valueMeta } from './value';
import { htmlButtonMeta } from './html-button';
import { htmlInputMeta } from './html-input';
import { htmlChartMeta } from './html-chart';
import { htmlTableMeta } from './html-table';

gaugeRegistry.register(valueMeta);
gaugeRegistry.register(htmlButtonMeta);
gaugeRegistry.register(htmlInputMeta);
gaugeRegistry.register(htmlChartMeta);
gaugeRegistry.register(htmlTableMeta);

export { valueMeta, htmlButtonMeta, htmlInputMeta, htmlChartMeta, htmlTableMeta };

// SP-FX-11: unify all 4 batches — side-effect imports trigger registration
import './batch2/index';
import './batch3/index';
import './batch4/index';

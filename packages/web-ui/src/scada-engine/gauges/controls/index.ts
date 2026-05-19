// SP-FX-6: Barrel for batch-1 controls.
// Importing this file registers all widget metas into gaugeRegistry as a side-effect.
// SP-FX-7 RuntimeCanvas imports this once at startup.
// SP-FX-48.16: htmlChart + htmlTable removed (user request).

import { gaugeRegistry } from '../gauge-registry';
import { valueMeta } from './value';
import { htmlButtonMeta } from './html-button';
import { htmlInputMeta } from './html-input';

gaugeRegistry.register(valueMeta);
gaugeRegistry.register(htmlButtonMeta);
gaugeRegistry.register(htmlInputMeta);

export { valueMeta, htmlButtonMeta, htmlInputMeta };

// SP-FX-11: unify all 4 batches — side-effect imports trigger registration
import './batch2/index';
import './batch3/index';
import './batch4/index';
// SP-FX-48.7: batch5 (FUXA parity — panel/video/scheduler)
import './batch5/index';

// SP-FX-10: Barrel for batch-4 controls (final batch, completing 20-widget library).
// Importing this file registers all 5 batch-4 widget metas into gaugeRegistry.
// Import alongside batch1/batch2/batch3 barrels at runtime startup.

import { gaugeRegistry } from '../../gauge-registry';
import { htmlIframeMeta } from './html-iframe';
import { compressorMeta } from './compressor';
import { valveMeta } from './valve';
import { pumpMeta } from './pump';
import { htmlSelectMeta } from './html-select';

gaugeRegistry.register(htmlIframeMeta);
gaugeRegistry.register(compressorMeta);
gaugeRegistry.register(valveMeta);
gaugeRegistry.register(pumpMeta);
gaugeRegistry.register(htmlSelectMeta);

export { htmlIframeMeta, compressorMeta, valveMeta, pumpMeta, htmlSelectMeta };

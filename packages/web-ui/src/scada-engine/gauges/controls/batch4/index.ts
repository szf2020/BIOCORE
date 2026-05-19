// SP-FX-10: Barrel for batch-4 controls.
// Importing this file registers batch-4 widget metas into gaugeRegistry.
// SP-FX-48.16: htmlIframe removed (user request).

import { gaugeRegistry } from '../../gauge-registry';
import { compressorMeta } from './compressor';
import { valveMeta } from './valve';
import { pumpMeta } from './pump';
import { htmlSelectMeta } from './html-select';

gaugeRegistry.register(compressorMeta);
gaugeRegistry.register(valveMeta);
gaugeRegistry.register(pumpMeta);
gaugeRegistry.register(htmlSelectMeta);

export { compressorMeta, valveMeta, pumpMeta, htmlSelectMeta };

/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */
import { readFile } from 'node:fs/promises';
import { InlineCriticalCssProcessor } from '../utils/inline-critical-css';
export class CommonEngineInlineCriticalCssProcessor {
    resourceCache = new Map();
    async process(html, outputPath) {
        const critters = new InlineCriticalCssProcessor(async (path) => {
            let resourceContent = this.resourceCache.get(path);
            if (resourceContent === undefined) {
                resourceContent = await readFile(path, 'utf-8');
                this.resourceCache.set(path, resourceContent);
            }
            return resourceContent;
        }, outputPath);
        return critters.process(html);
    }
}

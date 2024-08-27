import { ɵSERVER_CONTEXT as _SERVER_CONTEXT, renderApplication, renderModule } from '@angular/platform-server';
import * as fs from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { URL } from 'node:url';
import { ɵInlineCriticalCssProcessor as _InlineCriticalCssProcessor } from '@angular/ssr';
import { readFile } from 'node:fs/promises';

class CommonEngineInlineCriticalCssProcessor {
    resourceCache = new Map();
    async process(html, outputPath) {
        const critters = new _InlineCriticalCssProcessor(async (path) => {
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

const PERFORMANCE_MARK_PREFIX = '🅰️';
function printPerformanceLogs() {
    let maxWordLength = 0;
    const benchmarks = [];
    for (const { name, duration } of performance.getEntriesByType('measure')) {
        if (!name.startsWith(PERFORMANCE_MARK_PREFIX)) {
            continue;
        }
        // `🅰️:Retrieve SSG Page` -> `Retrieve SSG Page:`
        const step = name.slice(PERFORMANCE_MARK_PREFIX.length + 1) + ':';
        if (step.length > maxWordLength) {
            maxWordLength = step.length;
        }
        benchmarks.push([step, `${duration.toFixed(1)}ms`]);
        performance.clearMeasures(name);
    }
    /* eslint-disable no-console */
    console.log('********** Performance results **********');
    for (const [step, value] of benchmarks) {
        const spaces = maxWordLength - step.length + 5;
        console.log(step + ' '.repeat(spaces) + value);
    }
    console.log('*****************************************');
    /* eslint-enable no-console */
}
async function runMethodAndMeasurePerf(label, asyncMethod) {
    const labelName = `${PERFORMANCE_MARK_PREFIX}:${label}`;
    const startLabel = `start:${labelName}`;
    const endLabel = `end:${labelName}`;
    try {
        performance.mark(startLabel);
        return await asyncMethod();
    }
    finally {
        performance.mark(endLabel);
        performance.measure(labelName, startLabel, endLabel);
        performance.clearMarks(startLabel);
        performance.clearMarks(endLabel);
    }
}
function noopRunMethodAndMeasurePerf(label, asyncMethod) {
    return asyncMethod();
}

const SSG_MARKER_REGEXP = /ng-server-context=["']\w*\|?ssg\|?\w*["']/;
/**
 * A common engine to use to server render an application.
 */
class CommonEngine {
    options;
    templateCache = new Map();
    inlineCriticalCssProcessor = new CommonEngineInlineCriticalCssProcessor();
    pageIsSSG = new Map();
    constructor(options) {
        this.options = options;
    }
    /**
     * Render an HTML document for a specific URL with specified
     * render options
     */
    async render(opts) {
        const enablePerformanceProfiler = this.options?.enablePerformanceProfiler;
        const runMethod = enablePerformanceProfiler
            ? runMethodAndMeasurePerf
            : noopRunMethodAndMeasurePerf;
        let html = await runMethod('Retrieve SSG Page', () => this.retrieveSSGPage(opts));
        if (html === undefined) {
            html = await runMethod('Render Page', () => this.renderApplication(opts));
            if (opts.inlineCriticalCss !== false) {
                const content = await runMethod('Inline Critical CSS', () => 
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                this.inlineCriticalCss(html, opts));
                html = content;
            }
        }
        if (enablePerformanceProfiler) {
            printPerformanceLogs();
        }
        return html;
    }
    inlineCriticalCss(html, opts) {
        const outputPath = opts.publicPath ?? (opts.documentFilePath ? dirname(opts.documentFilePath) : '');
        return this.inlineCriticalCssProcessor.process(html, outputPath);
    }
    async retrieveSSGPage(opts) {
        const { publicPath, documentFilePath, url } = opts;
        if (!publicPath || !documentFilePath || url === undefined) {
            return undefined;
        }
        const { pathname } = new URL(url, 'resolve://');
        // Do not use `resolve` here as otherwise it can lead to path traversal vulnerability.
        // See: https://portswigger.net/web-security/file-path-traversal
        const pagePath = join(publicPath, pathname, 'index.html');
        if (this.pageIsSSG.get(pagePath)) {
            // Serve pre-rendered page.
            return fs.promises.readFile(pagePath, 'utf-8');
        }
        if (!pagePath.startsWith(normalize(publicPath))) {
            // Potential path traversal detected.
            return undefined;
        }
        if (pagePath === resolve(documentFilePath) || !(await exists(pagePath))) {
            // View matches with prerender path or file does not exist.
            this.pageIsSSG.set(pagePath, false);
            return undefined;
        }
        // Static file exists.
        const content = await fs.promises.readFile(pagePath, 'utf-8');
        const isSSG = SSG_MARKER_REGEXP.test(content);
        this.pageIsSSG.set(pagePath, isSSG);
        return isSSG ? content : undefined;
    }
    async renderApplication(opts) {
        const moduleOrFactory = this.options?.bootstrap ?? opts.bootstrap;
        if (!moduleOrFactory) {
            throw new Error('A module or bootstrap option must be provided.');
        }
        const extraProviders = [
            { provide: _SERVER_CONTEXT, useValue: 'ssr' },
            ...(opts.providers ?? []),
            ...(this.options?.providers ?? []),
        ];
        let document = opts.document;
        if (!document && opts.documentFilePath) {
            document = await this.getDocument(opts.documentFilePath);
        }
        const commonRenderingOptions = {
            url: opts.url,
            document,
        };
        return isBootstrapFn(moduleOrFactory)
            ? renderApplication(moduleOrFactory, {
                platformProviders: extraProviders,
                ...commonRenderingOptions,
            })
            : renderModule(moduleOrFactory, { extraProviders, ...commonRenderingOptions });
    }
    /** Retrieve the document from the cache or the filesystem */
    async getDocument(filePath) {
        let doc = this.templateCache.get(filePath);
        if (!doc) {
            doc = await fs.promises.readFile(filePath, 'utf-8');
            this.templateCache.set(filePath, doc);
        }
        return doc;
    }
}
async function exists(path) {
    try {
        await fs.promises.access(path, fs.constants.F_OK);
        return true;
    }
    catch {
        return false;
    }
}
function isBootstrapFn(value) {
    // We can differentiate between a module and a bootstrap function by reading compiler-generated `ɵmod` static property:
    return typeof value === 'function' && !('ɵmod' in value);
}

export { CommonEngine };
//# sourceMappingURL=node.mjs.map

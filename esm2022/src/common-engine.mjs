/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { renderApplication, renderModule, ɵSERVER_CONTEXT } from '@angular/platform-server';
import * as fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { URL } from 'node:url';
import { InlineCriticalCssProcessor } from './inline-css-processor';
import { noopRunMethodAndMeasurePerf, printPerformanceLogs, runMethodAndMeasurePerf, } from './peformance-profiler';
const SSG_MARKER_REGEXP = /ng-server-context=["']\w*\|?ssg\|?\w*["']/;
/**
 * A common engine to use to server render an application.
 */
export class CommonEngine {
    options;
    templateCache = new Map();
    inlineCriticalCssProcessor;
    pageIsSSG = new Map();
    constructor(options) {
        this.options = options;
        this.inlineCriticalCssProcessor = new InlineCriticalCssProcessor({
            minify: false,
        });
    }
    /**
     * Render an HTML document for a specific URL with specified
     * render options
     */
    async render(opts) {
        const enablePeformanceProfiler = this.options?.enablePeformanceProfiler;
        const runMethod = enablePeformanceProfiler
            ? runMethodAndMeasurePerf
            : noopRunMethodAndMeasurePerf;
        let html = await runMethod('Retrieve SSG Page', () => this.retrieveSSGPage(opts));
        if (html === undefined) {
            html = await runMethod('Render Page', () => this.renderApplication(opts));
            if (opts.inlineCriticalCss !== false) {
                const { content, errors, warnings } = await runMethod('Inline Critical CSS', () => 
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                this.inlineCriticalCss(html, opts));
                html = content;
                // eslint-disable-next-line no-console
                warnings?.forEach((m) => console.warn(m));
                // eslint-disable-next-line no-console
                errors?.forEach((m) => console.error(m));
            }
        }
        if (enablePeformanceProfiler) {
            printPerformanceLogs();
        }
        return html;
    }
    inlineCriticalCss(html, opts) {
        return this.inlineCriticalCssProcessor.process(html, {
            outputPath: opts.publicPath ?? (opts.documentFilePath ? dirname(opts.documentFilePath) : ''),
        });
    }
    async retrieveSSGPage(opts) {
        const { publicPath, documentFilePath, url } = opts;
        if (!publicPath || !documentFilePath || url === undefined) {
            return undefined;
        }
        const pathname = canParseUrl(url) ? new URL(url).pathname : url;
        // Remove leading forward slash.
        const pagePath = resolve(publicPath, pathname.substring(1), 'index.html');
        if (pagePath !== resolve(documentFilePath)) {
            // View path doesn't match with prerender path.
            const pageIsSSG = this.pageIsSSG.get(pagePath);
            if (pageIsSSG === undefined) {
                if (await exists(pagePath)) {
                    const content = await fs.promises.readFile(pagePath, 'utf-8');
                    const isSSG = SSG_MARKER_REGEXP.test(content);
                    this.pageIsSSG.set(pagePath, isSSG);
                    if (isSSG) {
                        return content;
                    }
                }
                else {
                    this.pageIsSSG.set(pagePath, false);
                }
            }
            else if (pageIsSSG) {
                // Serve pre-rendered page.
                return fs.promises.readFile(pagePath, 'utf-8');
            }
        }
        return undefined;
    }
    async renderApplication(opts) {
        const moduleOrFactory = this.options?.bootstrap ?? opts.bootstrap;
        if (!moduleOrFactory) {
            throw new Error('A module or bootstrap option must be provided.');
        }
        const extraProviders = [
            { provide: ɵSERVER_CONTEXT, useValue: 'ssr' },
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
// The below can be removed in favor of URL.canParse() when Node.js 18 is dropped
function canParseUrl(url) {
    try {
        return !!new URL(url);
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbW9uLWVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2FuZ3VsYXIvc3NyL3NyYy9jb21tb24tZW5naW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUdILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDNUYsT0FBTyxLQUFLLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFDOUIsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFDN0MsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUMvQixPQUFPLEVBQUUsMEJBQTBCLEVBQTJCLE1BQU0sd0JBQXdCLENBQUM7QUFDN0YsT0FBTyxFQUNMLDJCQUEyQixFQUMzQixvQkFBb0IsRUFDcEIsdUJBQXVCLEdBQ3hCLE1BQU0sdUJBQXVCLENBQUM7QUFFL0IsTUFBTSxpQkFBaUIsR0FBRywyQ0FBMkMsQ0FBQztBQStCdEU7O0dBRUc7QUFFSCxNQUFNLE9BQU8sWUFBWTtJQUtIO0lBSkgsYUFBYSxHQUFHLElBQUksR0FBRyxFQUFrQixDQUFDO0lBQzFDLDBCQUEwQixDQUE2QjtJQUN2RCxTQUFTLEdBQUcsSUFBSSxHQUFHLEVBQW1CLENBQUM7SUFFeEQsWUFBb0IsT0FBNkI7UUFBN0IsWUFBTyxHQUFQLE9BQU8sQ0FBc0I7UUFDL0MsSUFBSSxDQUFDLDBCQUEwQixHQUFHLElBQUksMEJBQTBCLENBQUM7WUFDL0QsTUFBTSxFQUFFLEtBQUs7U0FDZCxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUErQjtRQUMxQyxNQUFNLHdCQUF3QixHQUFHLElBQUksQ0FBQyxPQUFPLEVBQUUsd0JBQXdCLENBQUM7UUFFeEUsTUFBTSxTQUFTLEdBQUcs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QUFpRjtBQUNqRixTQUFTLFdBQVcsQ0FBQyxHQUFXO0lBQzlCLElBQUk7UUFDRixPQUFPLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztLQUN2QjtJQUFDLE1BQU07UUFDTixPQUFPLEtBQUssQ0FBQztLQUNkO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgeyBBcHBsaWNhdGlvblJlZiwgU3RhdGljUHJvdmlkZXIsIFR5cGUgfSBmcm9tICdAYW5ndWxhci9jb3JlJztcbmltcG9ydCB7IHJlbmRlckFwcGxpY2F0aW9uLCByZW5kZXJNb2R1bGUsIMm1U0VSVkVSX0NPTlRFWFQgfSBmcm9tICdAYW5ndWxhci9wbGF0Zm9ybS1zZXJ2ZXInO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnbm9kZTpmcyc7XG5pbXBvcnQgeyBkaXJuYW1lLCByZXNvbHZlIH0gZnJvbSAnbm9kZTpwYXRoJztcbmltcG9ydCB7IFVSTCB9IGZyb20gJ25vZGU6dXJsJztcbmltcG9ydCB7IElubGluZUNyaXRpY2FsQ3NzUHJvY2Vzc29yLCBJbmxpbmVDcml0aWNhbENzc1Jlc3VsdCB9IGZyb20gJy4vaW5saW5lLWNzcy1wcm9jZXNzb3InO1xuaW1wb3J0IHtcbiAgbm9vcFJ1bk1ldGhvZEFuZE1lYXN1cmVQZXJmLFxuICBwcmludFBlcmZvcm1hbmNlTG9ncyxcbiAgcnVuTWV0aG9kQW5kTWVhc3VyZVBlcmYsXG59IGZyb20gJy4vcGVmb3JtYW5jZS1wcm9maWxlcic7XG5cbmNvbnN0IFNTR19NQVJLRVJfUkVHRVhQID0gL25nLXNlcnZlci1jb250ZXh0PVtcIiddXFx3KlxcfD9zc2dcXHw/XFx3KltcIiddLztcblxuZXhwb3J0IGludGVyZmFjZSBDb21tb25FbmdpbmVPcHRpb25zIHtcbiAgLyoqIEEgbWV0aG9kIHRoYXQgd2hlbiBpbnZva2VkIHJldHVybnMgYSBwcm9taXNlIHRoYXQgcmV0dXJucyBhbiBgQXBwbGljYXRpb25SZWZgIGluc3RhbmNlIG9uY2UgcmVzb2x2ZWQgb3IgYW4gTmdNb2R1bGUuICovXG4gIGJvb3RzdHJhcD86IFR5cGU8e30+IHwgKCgpID0+IFByb21pc2U8QXBwbGljYXRpb25SZWY+KTtcbiAgLyoqIEEgc2V0IG9mIHBsYXRmb3JtIGxldmVsIHByb3ZpZGVycyBmb3IgYWxsIHJlcXVlc3RzLiAqL1xuICBwcm92aWRlcnM/OiBTdGF0aWNQcm92aWRlcltdO1xuICAvKiogRW5hYmxlIHJlcXVlc3QgcGVyZm9ybWFuY2UgcHJvZmlsaW5nIGRhdGEgY29sbGVjdGlvbiBhbmQgcHJpbnRpbmcgdGhlIHJlc3VsdHMgaW4gdGhlIHNlcnZlciBjb25zb2xlLiAqL1xuICBlbmFibGVQZWZvcm1hbmNlUHJvZmlsZXI/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENvbW1vbkVuZ2luZVJlbmRlck9wdGlvbnMge1xuICAvKiogQSBtZXRob2QgdGhhdCB3aGVuIGludm9rZWQgcmV0dXJucyBhIHByb21pc2UgdGhhdCByZXR1cm5zIGFuIGBBcHBsaWNhdGlvblJlZmAgaW5zdGFuY2Ugb25jZSByZXNvbHZlZCBvciBhbiBOZ01vZHVsZS4gKi9cbiAgYm9vdHN0cmFwPzogVHlwZTx7fT4gfCAoKCkgPT4gUHJvbWlzZTxBcHBsaWNhdGlvblJlZj4pO1xuICAvKiogQSBzZXQgb2YgcGxhdGZvcm0gbGV2ZWwgcHJvdmlkZXJzIGZvciB0aGUgY3VycmVudCByZXF1ZXN0LiAqL1xuICBwcm92aWRlcnM/OiBTdGF0aWNQcm92aWRlcltdO1xuICB1cmw/OiBzdHJpbmc7XG4gIGRvY3VtZW50Pzogc3RyaW5nO1xuICBkb2N1bWVudEZpbGVQYXRoPzogc3RyaW5nO1xuICAvKipcbiAgICogUmVkdWNlIHJlbmRlciBibG9ja2luZyByZXF1ZXN0cyBieSBpbmxpbmluZyBjcml0aWNhbCBDU1MuXG4gICAqIERlZmF1bHRzIHRvIHRydWUuXG4gICAqL1xuICBpbmxpbmVDcml0aWNhbENzcz86IGJvb2xlYW47XG4gIC8qKlxuICAgKiBCYXNlIHBhdGggbG9jYXRpb24gb2YgaW5kZXggZmlsZS5cbiAgICogRGVmYXVsdHMgdG8gdGhlICdkb2N1bWVudEZpbGVQYXRoJyBkaXJuYW1lIHdoZW4gbm90IHByb3ZpZGVkLlxuICAgKi9cbiAgcHVibGljUGF0aD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBBIGNvbW1vbiBlbmdpbmUgdG8gdXNlIHRvIHNlcnZlciByZW5kZXIgYW4gYXBwbGljYXRpb24uXG4gKi9cblxuZXhwb3J0IGNsYXNzIENvbW1vbkVuZ2luZSB7XG4gIHByaXZhdGUgcmVhZG9ubHkgdGVtcGxhdGVDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gIHByaXZhdGUgcmVhZG9ubHkgaW5saW5lQ3JpdGljYWxDc3NQcm9jZXNzb3I6IElubGluZUNyaXRpY2FsQ3NzUHJvY2Vzc29yO1xuICBwcml2YXRlIHJlYWRvbmx5IHBhZ2VJc1NTRyA9IG5ldyBNYXA8c3RyaW5nLCBib29sZWFuPigpO1xuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgb3B0aW9ucz86IENvbW1vbkVuZ2luZU9wdGlvbnMpIHtcbiAgICB0aGlzLmlubGluZUNyaXRpY2FsQ3NzUHJvY2Vzc29yID0gbmV3IElubGluZUNyaXRpY2FsQ3NzUHJvY2Vzc29yKHtcbiAgICAgIG1pbmlmeTogZmFsc2UsXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogUmVuZGVyIGFuIEhUTUwgZG9jdW1lbnQgZm9yIGEgc3BlY2lmaWMgVVJMIHdpdGggc3BlY2lmaWVkXG4gICAqIHJlbmRlciBvcHRpb25zXG4gICAqL1xuICBhc3luYyByZW5kZXIob3B0czogQ29tbW9uRW5naW5lUmVuZGVyT3B0aW9ucyk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgY29uc3QgZW5hYmxlUGVmb3JtYW5jZVByb2ZpbGVyID0gdGhpcy5vcHRpb25zPy5lbmFibGVQZWZvcm1hbmNlUHJvZmlsZXI7XG5cbiAgICBjb25zdCBydW5NZXRob2QgPSBlbmFibGVQZWZvcm1hbmNlUHJvZmlsZXJcbiAgICAgID8gcnVuTWV0aG9kQW5kTWVhc3VyZVBlcmZcbiAgICAgIDogbm9vcFJ1bk1ldGhvZEFuZE1lYXN1cmVQZXJmO1xuXG4gICAgbGV0IGh0bWwgPSBhd2FpdCBydW5NZXRob2QoJ1JldHJpZXZlIFNTRyBQYWdlJywgKCkgPT4gdGhpcy5yZXRyaWV2ZVNTR1BhZ2Uob3B0cykpO1xuXG4gICAgaWYgKGh0bWwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgaHRtbCA9IGF3YWl0IHJ1bk1ldGhvZCgnUmVuZGVyIFBhZ2UnLCAoKSA9PiB0aGlzLnJlbmRlckFwcGxpY2F0aW9uKG9wdHMpKTtcblxuICAgICAgaWYgKG9wdHMuaW5saW5lQ3JpdGljYWxDc3MgIT09IGZhbHNlKSB7XG4gICAgICAgIGNvbnN0IHsgY29udGVudCwgZXJyb3JzLCB3YXJuaW5ncyB9ID0gYXdhaXQgcnVuTWV0aG9kKCdJbmxpbmUgQ3JpdGljYWwgQ1NTJywgKCkgPT5cbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLW5vbi1udWxsLWFzc2VydGlvblxuICAgICAgICAgIHRoaXMuaW5saW5lQ3JpdGljYWxDc3MoaHRtbCEsIG9wdHMpLFxuICAgICAgICApO1xuXG4gICAgICAgIGh0bWwgPSBjb250ZW50O1xuXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG4gICAgICAgIHdhcm5pbmdzPy5mb3JFYWNoKChtKSA9PiBjb25zb2xlLndhcm4obSkpO1xuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuICAgICAgICBlcnJvcnM/LmZvckVhY2goKG0pID0+IGNvbnNvbGUuZXJyb3IobSkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChlbmFibGVQZWZvcm1hbmNlUHJvZmlsZXIpIHtcbiAgICAgIHByaW50UGVyZm9ybWFuY2VMb2dzKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGh0bWw7XG4gIH1cblxuICBwcml2YXRlIGlubGluZUNyaXRpY2FsQ3NzKFxuICAgIGh0bWw6IHN0cmluZyxcbiAgICBvcHRzOiBDb21tb25FbmdpbmVSZW5kZXJPcHRpb25zLFxuICApOiBQcm9taXNlPElubGluZUNyaXRpY2FsQ3NzUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuaW5saW5lQ3JpdGljYWxDc3NQcm9jZXNzb3IucHJvY2VzcyhodG1sLCB7XG4gICAgICBvdXRwdXRQYXRoOiBvcHRzLnB1YmxpY1BhdGggPz8gKG9wdHMuZG9jdW1lbnRGaWxlUGF0aCA/IGRpcm5hbWUob3B0cy5kb2N1bWVudEZpbGVQYXRoKSA6ICcnKSxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmV0cmlldmVTU0dQYWdlKG9wdHM6IENvbW1vbkVuZ2luZVJlbmRlck9wdGlvbnMpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuICAgIGNvbnN0IHsgcHVibGljUGF0aCwgZG9jdW1lbnRGaWxlUGF0aCwgdXJsIH0gPSBvcHRzO1xuICAgIGlmICghcHVibGljUGF0aCB8fCAhZG9jdW1lbnRGaWxlUGF0aCB8fCB1cmwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjb25zdCBwYXRobmFtZSA9IGNhblBhcnNlVXJsKHVybCkgPyBuZXcgVVJMKHVybCkucGF0aG5hbWUgOiB1cmw7XG4gICAgLy8gUmVtb3ZlIGxlYWRpbmcgZm9yd2FyZCBzbGFzaC5cbiAgICBjb25zdCBwYWdlUGF0aCA9IHJlc29sdmUocHVibGljUGF0aCwgcGF0aG5hbWUuc3Vic3RyaW5nKDEpLCAnaW5kZXguaHRtbCcpO1xuXG4gICAgaWYgKHBhZ2VQYXRoICE9PSByZXNvbHZlKGRvY3VtZW50RmlsZVBhdGgpKSB7XG4gICAgICAvLyBWaWV3IHBhdGggZG9lc24ndCBtYXRjaCB3aXRoIHByZXJlbmRlciBwYXRoLlxuICAgICAgY29uc3QgcGFnZUlzU1NHID0gdGhpcy5wYWdlSXNTU0cuZ2V0KHBhZ2VQYXRoKTtcbiAgICAgIGlmIChwYWdlSXNTU0cgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBpZiAoYXdhaXQgZXhpc3RzKHBhZ2VQYXRoKSkge1xuICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmcy5wcm9taXNlcy5yZWFkRmlsZShwYWdlUGF0aCwgJ3V0Zi04Jyk7XG4gICAgICAgICAgY29uc3QgaXNTU0cgPSBTU0dfTUFSS0VSX1JFR0VYUC50ZXN0KGNvbnRlbnQpO1xuICAgICAgICAgIHRoaXMucGFnZUlzU1NHLnNldChwYWdlUGF0aCwgaXNTU0cpO1xuXG4gICAgICAgICAgaWYgKGlzU1NHKSB7XG4gICAgICAgICAgICByZXR1cm4gY29udGVudDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5wYWdlSXNTU0cuc2V0KHBhZ2VQYXRoLCBmYWxzZSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAocGFnZUlzU1NHKSB7XG4gICAgICAgIC8vIFNlcnZlIHByZS1yZW5kZXJlZCBwYWdlLlxuICAgICAgICByZXR1cm4gZnMucHJvbWlzZXMucmVhZEZpbGUocGFnZVBhdGgsICd1dGYtOCcpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlbmRlckFwcGxpY2F0aW9uKG9wdHM6IENvbW1vbkVuZ2luZVJlbmRlck9wdGlvbnMpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnN0IG1vZHVsZU9yRmFjdG9yeSA9IHRoaXMub3B0aW9ucz8uYm9vdHN0cmFwID8/IG9wdHMuYm9vdHN0cmFwO1xuICAgIGlmICghbW9kdWxlT3JGYWN0b3J5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0EgbW9kdWxlIG9yIGJvb3RzdHJhcCBvcHRpb24gbXVzdCBiZSBwcm92aWRlZC4nKTtcbiAgICB9XG5cbiAgICBjb25zdCBleHRyYVByb3ZpZGVyczogU3RhdGljUHJvdmlkZXJbXSA9IFtcbiAgICAgIHsgcHJvdmlkZTogybVTRVJWRVJfQ09OVEVYVCwgdXNlVmFsdWU6ICdzc3InIH0sXG4gICAgICAuLi4ob3B0cy5wcm92aWRlcnMgPz8gW10pLFxuICAgICAgLi4uKHRoaXMub3B0aW9ucz8ucHJvdmlkZXJzID8/IFtdKSxcbiAgICBdO1xuXG4gICAgbGV0IGRvY3VtZW50ID0gb3B0cy5kb2N1bWVudDtcbiAgICBpZiAoIWRvY3VtZW50ICYmIG9wdHMuZG9jdW1lbnRGaWxlUGF0aCkge1xuICAgICAgZG9jdW1lbnQgPSBhd2FpdCB0aGlzLmdldERvY3VtZW50KG9wdHMuZG9jdW1lbnRGaWxlUGF0aCk7XG4gICAgfVxuXG4gICAgY29uc3QgY29tbW9uUmVuZGVyaW5nT3B0aW9ucyA9IHtcbiAgICAgIHVybDogb3B0cy51cmwsXG4gICAgICBkb2N1bWVudCxcbiAgICB9O1xuXG4gICAgcmV0dXJuIGlzQm9vdHN0cmFwRm4obW9kdWxlT3JGYWN0b3J5KVxuICAgICAgPyByZW5kZXJBcHBsaWNhdGlvbihtb2R1bGVPckZhY3RvcnksIHtcbiAgICAgICAgICBwbGF0Zm9ybVByb3ZpZGVyczogZXh0cmFQcm92aWRlcnMsXG4gICAgICAgICAgLi4uY29tbW9uUmVuZGVyaW5nT3B0aW9ucyxcbiAgICAgICAgfSlcbiAgICAgIDogcmVuZGVyTW9kdWxlKG1vZHVsZU9yRmFjdG9yeSwgeyBleHRyYVByb3ZpZGVycywgLi4uY29tbW9uUmVuZGVyaW5nT3B0aW9ucyB9KTtcbiAgfVxuXG4gIC8qKiBSZXRyaWV2ZSB0aGUgZG9jdW1lbnQgZnJvbSB0aGUgY2FjaGUgb3IgdGhlIGZpbGVzeXN0ZW0gKi9cbiAgcHJpdmF0ZSBhc3luYyBnZXREb2N1bWVudChmaWxlUGF0aDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBsZXQgZG9jID0gdGhpcy50ZW1wbGF0ZUNhY2hlLmdldChmaWxlUGF0aCk7XG5cbiAgICBpZiAoIWRvYykge1xuICAgICAgZG9jID0gYXdhaXQgZnMucHJvbWlzZXMucmVhZEZpbGUoZmlsZVBhdGgsICd1dGYtOCcpO1xuICAgICAgdGhpcy50ZW1wbGF0ZUNhY2hlLnNldChmaWxlUGF0aCwgZG9jKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZG9jO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGV4aXN0cyhwYXRoOiBmcy5QYXRoTGlrZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICB0cnkge1xuICAgIGF3YWl0IGZzLnByb21pc2VzLmFjY2VzcyhwYXRoLCBmcy5jb25zdGFudHMuRl9PSyk7XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbmZ1bmN0aW9uIGlzQm9vdHN0cmFwRm4odmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyAoKSA9PiBQcm9taXNlPEFwcGxpY2F0aW9uUmVmPiB7XG4gIC8vIFdlIGNhbiBkaWZmZXJlbnRpYXRlIGJldHdlZW4gYSBtb2R1bGUgYW5kIGEgYm9vdHN0cmFwIGZ1bmN0aW9uIGJ5IHJlYWRpbmcgY29tcGlsZXItZ2VuZXJhdGVkIGDJtW1vZGAgc3RhdGljIHByb3BlcnR5OlxuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nICYmICEoJ8m1bW9kJyBpbiB2YWx1ZSk7XG59XG5cbi8vIFRoZSBiZWxvdyBjYW4gYmUgcmVtb3ZlZCBpbiBmYXZvciBvZiBVUkwuY2FuUGFyc2UoKSB3aGVuIE5vZGUuanMgMTggaXMgZHJvcHBlZFxuZnVuY3Rpb24gY2FuUGFyc2VVcmwodXJsOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gISFuZXcgVVJMKHVybCk7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuIl19
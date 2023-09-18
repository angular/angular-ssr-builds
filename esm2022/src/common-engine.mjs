/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { INITIAL_CONFIG, renderApplication, renderModule, ɵSERVER_CONTEXT, } from '@angular/platform-server';
import * as fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { URL } from 'node:url';
import { InlineCriticalCssProcessor } from './inline-css-processor';
const SSG_MARKER_REGEXP = /ng-server-context=["']\w*\|?ssg\|?\w*["']/;
/**
 * A common rendering engine utility. This abstracts the logic
 * for handling the platformServer compiler, the module cache, and
 * the document loader
 */
export class CommonEngine {
    bootstrap;
    providers;
    templateCache = new Map();
    inlineCriticalCssProcessor;
    pageIsSSG = new Map();
    constructor(bootstrap, providers = []) {
        this.bootstrap = bootstrap;
        this.providers = providers;
        this.inlineCriticalCssProcessor = new InlineCriticalCssProcessor({
            minify: false,
        });
    }
    /**
     * Render an HTML document for a specific URL with specified
     * render options
     */
    async render(opts) {
        const { inlineCriticalCss = true, url } = opts;
        if (opts.publicPath && opts.documentFilePath && url !== undefined) {
            const pathname = canParseUrl(url) ? new URL(url).pathname : url;
            // Remove leading forward slash.
            const pagePath = resolve(opts.publicPath, pathname.substring(1), 'index.html');
            if (pagePath !== resolve(opts.documentFilePath)) {
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
        }
        // if opts.document dosen't exist then opts.documentFilePath must
        const extraProviders = [
            { provide: ɵSERVER_CONTEXT, useValue: 'ssr' },
            ...(opts.providers ?? []),
            ...this.providers,
        ];
        let document = opts.document;
        if (!document && opts.documentFilePath) {
            document = await this.getDocument(opts.documentFilePath);
        }
        if (document) {
            extraProviders.push({
                provide: INITIAL_CONFIG,
                useValue: {
                    document,
                    url: opts.url,
                },
            });
        }
        const moduleOrFactory = this.bootstrap || opts.bootstrap;
        if (!moduleOrFactory) {
            throw new Error('A module or bootstrap option must be provided.');
        }
        const html = await (isBootstrapFn(moduleOrFactory)
            ? renderApplication(moduleOrFactory, { platformProviders: extraProviders })
            : renderModule(moduleOrFactory, { extraProviders }));
        if (!inlineCriticalCss) {
            return html;
        }
        const { content, errors, warnings } = await this.inlineCriticalCssProcessor.process(html, {
            outputPath: opts.publicPath ?? (opts.documentFilePath ? dirname(opts.documentFilePath) : ''),
        });
        // eslint-disable-next-line no-console
        warnings?.forEach((m) => console.warn(m));
        // eslint-disable-next-line no-console
        errors?.forEach((m) => console.error(m));
        return content;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbW9uLWVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2FuZ3VsYXIvc3NyL3NyYy9jb21tb24tZW5naW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUdILE9BQU8sRUFDTCxjQUFjLEVBQ2QsaUJBQWlCLEVBQ2pCLFlBQVksRUFDWixlQUFlLEdBQ2hCLE1BQU0sMEJBQTBCLENBQUM7QUFDbEMsT0FBTyxLQUFLLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFDOUIsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFDN0MsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUMvQixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUVwRSxNQUFNLGlCQUFpQixHQUFHLDJDQUEyQyxDQUFDO0FBb0J0RTs7OztHQUlHO0FBQ0gsTUFBTSxPQUFPLFlBQVk7SUFNYjtJQUNBO0lBTk8sYUFBYSxHQUFHLElBQUksR0FBRyxFQUFrQixDQUFDO0lBQzFDLDBCQUEwQixDQUE2QjtJQUN2RCxTQUFTLEdBQUcsSUFBSSxHQUFHLEVBQW1CLENBQUM7SUFFeEQsWUFDVSxTQUFzRCxFQUN0RCxZQUE4QixFQUFFO1FBRGhDLGNBQVMsR0FBVCxTQUFTLENBQTZDO1FBQ3RELGNBQVMsR0FBVCxTQUFTLENBQXVCO1FBRXhDLElBQUksQ0FBQywwQkFBMEIsR0FBRyxJQUFJLDBCQUEwQixDQUFDO1lBQy9ELE1BQU0sRUFBRSxLQUFLO1NBQ2QsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBK0I7UUFDMUMsTUFBTSxFQUFFLGlCQUFpQixHQUFHLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFFL0MsSUFBSSxJQUFJLENBQUMsVUFB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QUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVsRCxPQUFPLElBQUksQ0FBQztLQUNiO0lBQUMsTUFBTTtRQUNOLE9BQU8sS0FBSyxDQUFDO0tBQ2Q7QUFDSCxDQUFDO0FBRUQsU0FBUyxhQUFhLENBQUMsS0FBYztJQUNuQyx1SEFBdUg7SUFDdkgsT0FBTyxPQUFPLEtBQUssS0FBSyxVQUFVLElBQUksQ0FBQyxDQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMsQ0FBQztBQUMzRCxDQUFDO0FBRUQsaUZBQWlGO0FBQ2pGLFNBQVMsV0FBVyxDQUFDLEdBQVc7SUFDOUIsSUFBSTtRQUNGLE9BQU8sQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0tBQ3ZCO0lBQUMsTUFBTTtRQUNOLE9BQU8sS0FBSyxDQUFDO0tBQ2Q7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCB7IEFwcGxpY2F0aW9uUmVmLCBTdGF0aWNQcm92aWRlciwgVHlwZSB9IGZyb20gJ0Bhbmd1bGFyL2NvcmUnO1xuaW1wb3J0IHtcbiAgSU5JVElBTF9DT05GSUcsXG4gIHJlbmRlckFwcGxpY2F0aW9uLFxuICByZW5kZXJNb2R1bGUsXG4gIMm1U0VSVkVSX0NPTlRFWFQsXG59IGZyb20gJ0Bhbmd1bGFyL3BsYXRmb3JtLXNlcnZlcic7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdub2RlOmZzJztcbmltcG9ydCB7IGRpcm5hbWUsIHJlc29sdmUgfSBmcm9tICdub2RlOnBhdGgnO1xuaW1wb3J0IHsgVVJMIH0gZnJvbSAnbm9kZTp1cmwnO1xuaW1wb3J0IHsgSW5saW5lQ3JpdGljYWxDc3NQcm9jZXNzb3IgfSBmcm9tICcuL2lubGluZS1jc3MtcHJvY2Vzc29yJztcblxuY29uc3QgU1NHX01BUktFUl9SRUdFWFAgPSAvbmctc2VydmVyLWNvbnRleHQ9W1wiJ11cXHcqXFx8P3NzZ1xcfD9cXHcqW1wiJ10vO1xuXG5leHBvcnQgaW50ZXJmYWNlIENvbW1vbkVuZ2luZVJlbmRlck9wdGlvbnMge1xuICBib290c3RyYXA/OiBUeXBlPHt9PiB8ICgoKSA9PiBQcm9taXNlPEFwcGxpY2F0aW9uUmVmPik7XG4gIHByb3ZpZGVycz86IFN0YXRpY1Byb3ZpZGVyW107XG4gIHVybD86IHN0cmluZztcbiAgZG9jdW1lbnQ/OiBzdHJpbmc7XG4gIGRvY3VtZW50RmlsZVBhdGg/OiBzdHJpbmc7XG4gIC8qKlxuICAgKiBSZWR1Y2UgcmVuZGVyIGJsb2NraW5nIHJlcXVlc3RzIGJ5IGlubGluaW5nIGNyaXRpY2FsIENTUy5cbiAgICogRGVmYXVsdHMgdG8gdHJ1ZS5cbiAgICovXG4gIGlubGluZUNyaXRpY2FsQ3NzPzogYm9vbGVhbjtcbiAgLyoqXG4gICAqIEJhc2UgcGF0aCBsb2NhdGlvbiBvZiBpbmRleCBmaWxlLlxuICAgKiBEZWZhdWx0cyB0byB0aGUgJ2RvY3VtZW50RmlsZVBhdGgnIGRpcm5hbWUgd2hlbiBub3QgcHJvdmlkZWQuXG4gICAqL1xuICBwdWJsaWNQYXRoPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIEEgY29tbW9uIHJlbmRlcmluZyBlbmdpbmUgdXRpbGl0eS4gVGhpcyBhYnN0cmFjdHMgdGhlIGxvZ2ljXG4gKiBmb3IgaGFuZGxpbmcgdGhlIHBsYXRmb3JtU2VydmVyIGNvbXBpbGVyLCB0aGUgbW9kdWxlIGNhY2hlLCBhbmRcbiAqIHRoZSBkb2N1bWVudCBsb2FkZXJcbiAqL1xuZXhwb3J0IGNsYXNzIENvbW1vbkVuZ2luZSB7XG4gIHByaXZhdGUgcmVhZG9ubHkgdGVtcGxhdGVDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gIHByaXZhdGUgcmVhZG9ubHkgaW5saW5lQ3JpdGljYWxDc3NQcm9jZXNzb3I6IElubGluZUNyaXRpY2FsQ3NzUHJvY2Vzc29yO1xuICBwcml2YXRlIHJlYWRvbmx5IHBhZ2VJc1NTRyA9IG5ldyBNYXA8c3RyaW5nLCBib29sZWFuPigpO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgYm9vdHN0cmFwPzogVHlwZTx7fT4gfCAoKCkgPT4gUHJvbWlzZTxBcHBsaWNhdGlvblJlZj4pLFxuICAgIHByaXZhdGUgcHJvdmlkZXJzOiBTdGF0aWNQcm92aWRlcltdID0gW10sXG4gICkge1xuICAgIHRoaXMuaW5saW5lQ3JpdGljYWxDc3NQcm9jZXNzb3IgPSBuZXcgSW5saW5lQ3JpdGljYWxDc3NQcm9jZXNzb3Ioe1xuICAgICAgbWluaWZ5OiBmYWxzZSxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW5kZXIgYW4gSFRNTCBkb2N1bWVudCBmb3IgYSBzcGVjaWZpYyBVUkwgd2l0aCBzcGVjaWZpZWRcbiAgICogcmVuZGVyIG9wdGlvbnNcbiAgICovXG4gIGFzeW5jIHJlbmRlcihvcHRzOiBDb21tb25FbmdpbmVSZW5kZXJPcHRpb25zKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBjb25zdCB7IGlubGluZUNyaXRpY2FsQ3NzID0gdHJ1ZSwgdXJsIH0gPSBvcHRzO1xuXG4gICAgaWYgKG9wdHMucHVibGljUGF0aCAmJiBvcHRzLmRvY3VtZW50RmlsZVBhdGggJiYgdXJsICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IHBhdGhuYW1lID0gY2FuUGFyc2VVcmwodXJsKSA/IG5ldyBVUkwodXJsKS5wYXRobmFtZSA6IHVybDtcbiAgICAgIC8vIFJlbW92ZSBsZWFkaW5nIGZvcndhcmQgc2xhc2guXG4gICAgICBjb25zdCBwYWdlUGF0aCA9IHJlc29sdmUob3B0cy5wdWJsaWNQYXRoLCBwYXRobmFtZS5zdWJzdHJpbmcoMSksICdpbmRleC5odG1sJyk7XG5cbiAgICAgIGlmIChwYWdlUGF0aCAhPT0gcmVzb2x2ZShvcHRzLmRvY3VtZW50RmlsZVBhdGgpKSB7XG4gICAgICAgIC8vIFZpZXcgcGF0aCBkb2Vzbid0IG1hdGNoIHdpdGggcHJlcmVuZGVyIHBhdGguXG4gICAgICAgIGNvbnN0IHBhZ2VJc1NTRyA9IHRoaXMucGFnZUlzU1NHLmdldChwYWdlUGF0aCk7XG4gICAgICAgIGlmIChwYWdlSXNTU0cgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGlmIChhd2FpdCBleGlzdHMocGFnZVBhdGgpKSB7XG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgZnMucHJvbWlzZXMucmVhZEZpbGUocGFnZVBhdGgsICd1dGYtOCcpO1xuICAgICAgICAgICAgY29uc3QgaXNTU0cgPSBTU0dfTUFSS0VSX1JFR0VYUC50ZXN0KGNvbnRlbnQpO1xuICAgICAgICAgICAgdGhpcy5wYWdlSXNTU0cuc2V0KHBhZ2VQYXRoLCBpc1NTRyk7XG5cbiAgICAgICAgICAgIGlmIChpc1NTRykge1xuICAgICAgICAgICAgICByZXR1cm4gY29udGVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5wYWdlSXNTU0cuc2V0KHBhZ2VQYXRoLCBmYWxzZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHBhZ2VJc1NTRykge1xuICAgICAgICAgIC8vIFNlcnZlIHByZS1yZW5kZXJlZCBwYWdlLlxuICAgICAgICAgIHJldHVybiBmcy5wcm9taXNlcy5yZWFkRmlsZShwYWdlUGF0aCwgJ3V0Zi04Jyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBpZiBvcHRzLmRvY3VtZW50IGRvc2VuJ3QgZXhpc3QgdGhlbiBvcHRzLmRvY3VtZW50RmlsZVBhdGggbXVzdFxuICAgIGNvbnN0IGV4dHJhUHJvdmlkZXJzOiBTdGF0aWNQcm92aWRlcltdID0gW1xuICAgICAgeyBwcm92aWRlOiDJtVNFUlZFUl9DT05URVhULCB1c2VWYWx1ZTogJ3NzcicgfSxcbiAgICAgIC4uLihvcHRzLnByb3ZpZGVycyA/PyBbXSksXG4gICAgICAuLi50aGlzLnByb3ZpZGVycyxcbiAgICBdO1xuXG4gICAgbGV0IGRvY3VtZW50ID0gb3B0cy5kb2N1bWVudDtcbiAgICBpZiAoIWRvY3VtZW50ICYmIG9wdHMuZG9jdW1lbnRGaWxlUGF0aCkge1xuICAgICAgZG9jdW1lbnQgPSBhd2FpdCB0aGlzLmdldERvY3VtZW50KG9wdHMuZG9jdW1lbnRGaWxlUGF0aCk7XG4gICAgfVxuXG4gICAgaWYgKGRvY3VtZW50KSB7XG4gICAgICBleHRyYVByb3ZpZGVycy5wdXNoKHtcbiAgICAgICAgcHJvdmlkZTogSU5JVElBTF9DT05GSUcsXG4gICAgICAgIHVzZVZhbHVlOiB7XG4gICAgICAgICAgZG9jdW1lbnQsXG4gICAgICAgICAgdXJsOiBvcHRzLnVybCxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IG1vZHVsZU9yRmFjdG9yeSA9IHRoaXMuYm9vdHN0cmFwIHx8IG9wdHMuYm9vdHN0cmFwO1xuICAgIGlmICghbW9kdWxlT3JGYWN0b3J5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0EgbW9kdWxlIG9yIGJvb3RzdHJhcCBvcHRpb24gbXVzdCBiZSBwcm92aWRlZC4nKTtcbiAgICB9XG5cbiAgICBjb25zdCBodG1sID0gYXdhaXQgKGlzQm9vdHN0cmFwRm4obW9kdWxlT3JGYWN0b3J5KVxuICAgICAgPyByZW5kZXJBcHBsaWNhdGlvbihtb2R1bGVPckZhY3RvcnksIHsgcGxhdGZvcm1Qcm92aWRlcnM6IGV4dHJhUHJvdmlkZXJzIH0pXG4gICAgICA6IHJlbmRlck1vZHVsZShtb2R1bGVPckZhY3RvcnksIHsgZXh0cmFQcm92aWRlcnMgfSkpO1xuXG4gICAgaWYgKCFpbmxpbmVDcml0aWNhbENzcykge1xuICAgICAgcmV0dXJuIGh0bWw7XG4gICAgfVxuXG4gICAgY29uc3QgeyBjb250ZW50LCBlcnJvcnMsIHdhcm5pbmdzIH0gPSBhd2FpdCB0aGlzLmlubGluZUNyaXRpY2FsQ3NzUHJvY2Vzc29yLnByb2Nlc3MoaHRtbCwge1xuICAgICAgb3V0cHV0UGF0aDogb3B0cy5wdWJsaWNQYXRoID8/IChvcHRzLmRvY3VtZW50RmlsZVBhdGggPyBkaXJuYW1lKG9wdHMuZG9jdW1lbnRGaWxlUGF0aCkgOiAnJyksXG4gICAgfSk7XG5cbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuICAgIHdhcm5pbmdzPy5mb3JFYWNoKChtKSA9PiBjb25zb2xlLndhcm4obSkpO1xuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG4gICAgZXJyb3JzPy5mb3JFYWNoKChtKSA9PiBjb25zb2xlLmVycm9yKG0pKTtcblxuICAgIHJldHVybiBjb250ZW50O1xuICB9XG5cbiAgLyoqIFJldHJpZXZlIHRoZSBkb2N1bWVudCBmcm9tIHRoZSBjYWNoZSBvciB0aGUgZmlsZXN5c3RlbSAqL1xuICBwcml2YXRlIGFzeW5jIGdldERvY3VtZW50KGZpbGVQYXRoOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGxldCBkb2MgPSB0aGlzLnRlbXBsYXRlQ2FjaGUuZ2V0KGZpbGVQYXRoKTtcblxuICAgIGlmICghZG9jKSB7XG4gICAgICBkb2MgPSBhd2FpdCBmcy5wcm9taXNlcy5yZWFkRmlsZShmaWxlUGF0aCwgJ3V0Zi04Jyk7XG4gICAgICB0aGlzLnRlbXBsYXRlQ2FjaGUuc2V0KGZpbGVQYXRoLCBkb2MpO1xuICAgIH1cblxuICAgIHJldHVybiBkb2M7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZXhpc3RzKHBhdGg6IGZzLlBhdGhMaWtlKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIHRyeSB7XG4gICAgYXdhaXQgZnMucHJvbWlzZXMuYWNjZXNzKHBhdGgsIGZzLmNvbnN0YW50cy5GX09LKTtcblxuICAgIHJldHVybiB0cnVlO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuZnVuY3Rpb24gaXNCb290c3RyYXBGbih2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzICgpID0+IFByb21pc2U8QXBwbGljYXRpb25SZWY+IHtcbiAgLy8gV2UgY2FuIGRpZmZlcmVudGlhdGUgYmV0d2VlbiBhIG1vZHVsZSBhbmQgYSBib290c3RyYXAgZnVuY3Rpb24gYnkgcmVhZGluZyBjb21waWxlci1nZW5lcmF0ZWQgYMm1bW9kYCBzdGF0aWMgcHJvcGVydHk6XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicgJiYgISgnybVtb2QnIGluIHZhbHVlKTtcbn1cblxuLy8gVGhlIGJlbG93IGNhbiBiZSByZW1vdmVkIGluIGZhdm9yIG9mIFVSTC5jYW5QYXJzZSgpIHdoZW4gTm9kZS5qcyAxOCBpcyBkcm9wcGVkXG5mdW5jdGlvbiBjYW5QYXJzZVVybCh1cmw6IHN0cmluZyk6IGJvb2xlYW4ge1xuICB0cnkge1xuICAgIHJldHVybiAhIW5ldyBVUkwodXJsKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG4iXX0=
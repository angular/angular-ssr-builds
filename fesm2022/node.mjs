import { ɵSERVER_CONTEXT as _SERVER_CONTEXT, renderApplication, renderModule } from '@angular/platform-server';
import * as fs from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { URL as URL$1 } from 'node:url';
import { ɵInlineCriticalCssProcessor as _InlineCriticalCssProcessor, AngularAppEngine } from '@angular/ssr';
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
        const { pathname } = new URL$1(url, 'resolve://');
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

/**
 * Converts a Node.js `IncomingMessage` into a Web Standard `Request`.
 *
 * @param nodeRequest - The Node.js `IncomingMessage` object to convert.
 * @returns A Web Standard `Request` object.
 * @developerPreview
 */
function createWebRequestFromNodeRequest(nodeRequest) {
    const { headers, method = 'GET' } = nodeRequest;
    const withBody = method !== 'GET' && method !== 'HEAD';
    return new Request(createRequestUrl(nodeRequest), {
        method,
        headers: createRequestHeaders(headers),
        body: withBody ? nodeRequest : undefined,
        duplex: withBody ? 'half' : undefined,
    });
}
/**
 * Creates a `Headers` object from Node.js `IncomingHttpHeaders`.
 *
 * @param nodeHeaders - The Node.js `IncomingHttpHeaders` object to convert.
 * @returns A `Headers` object containing the converted headers.
 */
function createRequestHeaders(nodeHeaders) {
    const headers = new Headers();
    for (const [name, value] of Object.entries(nodeHeaders)) {
        if (typeof value === 'string') {
            headers.append(name, value);
        }
        else if (Array.isArray(value)) {
            for (const item of value) {
                headers.append(name, item);
            }
        }
    }
    return headers;
}
/**
 * Creates a `URL` object from a Node.js `IncomingMessage`, taking into account the protocol, host, and port.
 *
 * @param nodeRequest - The Node.js `IncomingMessage` object to extract URL information from.
 * @returns A `URL` object representing the request URL.
 */
function createRequestUrl(nodeRequest) {
    const { headers, socket, url = '' } = nodeRequest;
    const protocol = headers['x-forwarded-proto'] ?? ('encrypted' in socket && socket.encrypted ? 'https' : 'http');
    const hostname = headers['x-forwarded-host'] ?? headers.host ?? headers[':authority'];
    const port = headers['x-forwarded-port'] ?? socket.localPort;
    if (Array.isArray(hostname)) {
        throw new Error('host value cannot be an array.');
    }
    let hostnameWithPort = hostname;
    if (port && !hostname?.includes(':')) {
        hostnameWithPort += `:${port}`;
    }
    return new URL(url, `${protocol}://${hostnameWithPort}`);
}

/**
 * Angular server application engine.
 * Manages Angular server applications (including localized ones), handles rendering requests,
 * and optionally transforms index HTML before rendering.
 *
 * @note This class should be instantiated once and used as a singleton across the server-side
 * application to ensure consistent handling of rendering requests and resource management.
 *
 * @developerPreview
 */
class AngularNodeAppEngine {
    angularAppEngine = new AngularAppEngine();
    /**
     * Renders an HTTP response based on the incoming request using the Angular server application.
     *
     * The method processes the incoming request, determines the appropriate route, and prepares the
     * rendering context to generate a response. If the request URL corresponds to a static file (excluding `/index.html`),
     * the method returns `null`.
     *
     * Example: A request to `https://www.example.com/page/index.html` will render the Angular route
     * associated with `https://www.example.com/page`.
     *
     * @param request - The incoming HTTP request object to be rendered.
     * @param requestContext - Optional additional context for the request, such as metadata or custom settings.
     * @returns A promise that resolves to a `Response` object, or `null` if the request URL is for a static file
     * (e.g., `./logo.png`) rather than an application route.
     */
    render(request, requestContext) {
        return this.angularAppEngine.render(createWebRequestFromNodeRequest(request), requestContext);
    }
    /**
     * Retrieves HTTP headers for a request associated with statically generated (SSG) pages,
     * based on the URL pathname.
     *
     * @param request - The incoming request object.
     * @returns A `Map` containing the HTTP headers as key-value pairs.
     * @note This function should be used exclusively for retrieving headers of SSG pages.
     * @example
     * ```typescript
     * const angularAppEngine = new AngularNodeAppEngine();
     *
     * app.use(express.static('dist/browser', {
     *   setHeaders: (res, path) => {
     *     // Retrieve headers for the current request
     *     const headers = angularAppEngine.getPrerenderHeaders(res.req);
     *
     *     // Apply the retrieved headers to the response
     *     for (const { key, value } of headers) {
     *       res.setHeader(key, value);
     *     }
     *   }
       }));
    * ```
    */
    getPrerenderHeaders(request) {
        return this.angularAppEngine.getPrerenderHeaders(createWebRequestFromNodeRequest(request));
    }
}

/**
 * Streams a web-standard `Response` into a Node.js `ServerResponse`.
 *
 * @param source - The web-standard `Response` object to stream from.
 * @param destination - The Node.js `ServerResponse` object to stream into.
 * @returns A promise that resolves once the streaming operation is complete.
 * @developerPreview
 */
async function writeResponseToNodeResponse(source, destination) {
    const { status, headers, body } = source;
    destination.statusCode = status;
    let cookieHeaderSet = false;
    for (const [name, value] of headers.entries()) {
        if (name === 'set-cookie') {
            if (cookieHeaderSet) {
                continue;
            }
            // Sets the 'set-cookie' header only once to ensure it is correctly applied.
            // Concatenating 'set-cookie' values can lead to incorrect behavior, so we use a single value from `headers.getSetCookie()`.
            destination.setHeader(name, headers.getSetCookie());
            cookieHeaderSet = true;
        }
        else {
            destination.setHeader(name, value);
        }
    }
    if (!body) {
        destination.end();
        return;
    }
    try {
        const reader = body.getReader();
        destination.on('close', () => {
            reader.cancel().catch((error) => {
                // eslint-disable-next-line no-console
                console.error(`An error occurred while writing the response body for: ${destination.req.url}.`, error);
            });
        });
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                destination.end();
                break;
            }
            destination.write(value);
        }
    }
    catch {
        destination.end('Internal server error.');
    }
}

export { AngularNodeAppEngine, CommonEngine, createWebRequestFromNodeRequest, writeResponseToNodeResponse };
//# sourceMappingURL=node.mjs.map

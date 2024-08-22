import { ɵSERVER_CONTEXT as _SERVER_CONTEXT, renderApplication, renderModule, INITIAL_CONFIG, ɵINTERNAL_SERVER_PLATFORM_PROVIDERS as _INTERNAL_SERVER_PLATFORM_PROVIDERS } from '@angular/platform-server';
import * as fs from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { URL as URL$1 } from 'node:url';
import Critters from 'critters';
import { readFile } from 'node:fs/promises';
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { ɵConsole as _Console, ɵresetCompiledComponents as _resetCompiledComponents, createPlatformFactory, platformCore, ApplicationRef, ɵwhenStable as _whenStable, Compiler, InjectionToken } from '@angular/core';
import { ɵloadChildren as _loadChildren, Router } from '@angular/router';

/**
 * Pattern used to extract the media query set by Critters in an `onload` handler.
 */
const MEDIA_SET_HANDLER_PATTERN = /^this\.media=["'](.*)["'];?$/;
/**
 * Name of the attribute used to save the Critters media query so it can be re-assigned on load.
 */
const CSP_MEDIA_ATTR = 'ngCspMedia';
/**
 * Script text used to change the media value of the link tags.
 *
 * NOTE:
 * We do not use `document.querySelectorAll('link').forEach((s) => s.addEventListener('load', ...)`
 * because this does not always fire on Chome.
 * See: https://github.com/angular/angular-cli/issues/26932 and https://crbug.com/1521256
 */
const LINK_LOAD_SCRIPT_CONTENT = [
    '(() => {',
    `  const CSP_MEDIA_ATTR = '${CSP_MEDIA_ATTR}';`,
    '  const documentElement = document.documentElement;',
    '  const listener = (e) => {',
    '    const target = e.target;',
    `    if (!target || target.tagName !== 'LINK' || !target.hasAttribute(CSP_MEDIA_ATTR)) {`,
    '     return;',
    '    }',
    '    target.media = target.getAttribute(CSP_MEDIA_ATTR);',
    '    target.removeAttribute(CSP_MEDIA_ATTR);',
    // Remove onload listener when there are no longer styles that need to be loaded.
    '    if (!document.head.querySelector(`link[${CSP_MEDIA_ATTR}]`)) {',
    `      documentElement.removeEventListener('load', listener);`,
    '    }',
    '  };',
    //  We use an event with capturing (the true parameter) because load events don't bubble.
    `  documentElement.addEventListener('load', listener, true);`,
    '})();',
].join('\n');
class CrittersExtended extends Critters {
    optionsExtended;
    resourceCache;
    warnings = [];
    errors = [];
    initialEmbedLinkedStylesheet;
    addedCspScriptsDocuments = new WeakSet();
    documentNonces = new WeakMap();
    constructor(optionsExtended, resourceCache) {
        super({
            logger: {
                warn: (s) => this.warnings.push(s),
                error: (s) => this.errors.push(s),
                info: () => { },
            },
            logLevel: 'warn',
            path: optionsExtended.outputPath,
            publicPath: optionsExtended.deployUrl,
            compress: !!optionsExtended.minify,
            pruneSource: false,
            reduceInlineStyles: false,
            mergeStylesheets: false,
            // Note: if `preload` changes to anything other than `media`, the logic in
            // `embedLinkedStylesheetOverride` will have to be updated.
            preload: 'media',
            noscriptFallback: true,
            inlineFonts: true,
        });
        this.optionsExtended = optionsExtended;
        this.resourceCache = resourceCache;
        // We can't use inheritance to override `embedLinkedStylesheet`, because it's not declared in
        // the `Critters` .d.ts which means that we can't call the `super` implementation. TS doesn't
        // allow for `super` to be cast to a different type.
        this.initialEmbedLinkedStylesheet = this.embedLinkedStylesheet;
        this.embedLinkedStylesheet = this.embedLinkedStylesheetOverride;
    }
    async readFile(path) {
        let resourceContent = this.resourceCache.get(path);
        if (resourceContent === undefined) {
            resourceContent = await readFile(path, 'utf-8');
            this.resourceCache.set(path, resourceContent);
        }
        return resourceContent;
    }
    /**
     * Override of the Critters `embedLinkedStylesheet` method
     * that makes it work with Angular's CSP APIs.
     */
    embedLinkedStylesheetOverride = async (link, document) => {
        if (link.getAttribute('media') === 'print' && link.next?.name === 'noscript') {
            // Workaround for https://github.com/GoogleChromeLabs/critters/issues/64
            // NB: this is only needed for the webpack based builders.
            const media = link.getAttribute('onload')?.match(MEDIA_SET_HANDLER_PATTERN);
            if (media) {
                link.removeAttribute('onload');
                link.setAttribute('media', media[1]);
                link?.next?.remove();
            }
        }
        const returnValue = await this.initialEmbedLinkedStylesheet(link, document);
        const cspNonce = this.findCspNonce(document);
        if (cspNonce) {
            const crittersMedia = link.getAttribute('onload')?.match(MEDIA_SET_HANDLER_PATTERN);
            if (crittersMedia) {
                // If there's a Critters-generated `onload` handler and the file has an Angular CSP nonce,
                // we have to remove the handler, because it's incompatible with CSP. We save the value
                // in a different attribute and we generate a script tag with the nonce that uses
                // `addEventListener` to apply the media query instead.
                link.removeAttribute('onload');
                link.setAttribute(CSP_MEDIA_ATTR, crittersMedia[1]);
                this.conditionallyInsertCspLoadingScript(document, cspNonce, link);
            }
            // Ideally we would hook in at the time Critters inserts the `style` tags, but there isn't
            // a way of doing that at the moment so we fall back to doing it any time a `link` tag is
            // inserted. We mitigate it by only iterating the direct children of the `<head>` which
            // should be pretty shallow.
            document.head.children.forEach((child) => {
                if (child.tagName === 'style' && !child.hasAttribute('nonce')) {
                    child.setAttribute('nonce', cspNonce);
                }
            });
        }
        return returnValue;
    };
    /**
     * Finds the CSP nonce for a specific document.
     */
    findCspNonce(document) {
        if (this.documentNonces.has(document)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return this.documentNonces.get(document);
        }
        // HTML attribute are case-insensitive, but the parser used by Critters is case-sensitive.
        const nonceElement = document.querySelector('[ngCspNonce], [ngcspnonce]');
        const cspNonce = nonceElement?.getAttribute('ngCspNonce') || nonceElement?.getAttribute('ngcspnonce') || null;
        this.documentNonces.set(document, cspNonce);
        return cspNonce;
    }
    /**
     * Inserts the `script` tag that swaps the critical CSS at runtime,
     * if one hasn't been inserted into the document already.
     */
    conditionallyInsertCspLoadingScript(document, nonce, link) {
        if (this.addedCspScriptsDocuments.has(document)) {
            return;
        }
        if (document.head.textContent.includes(LINK_LOAD_SCRIPT_CONTENT)) {
            // Script was already added during the build.
            this.addedCspScriptsDocuments.add(document);
            return;
        }
        const script = document.createElement('script');
        script.setAttribute('nonce', nonce);
        script.textContent = LINK_LOAD_SCRIPT_CONTENT;
        // Prepend the script to the head since it needs to
        // run as early as possible, before the `link` tags.
        document.head.insertBefore(script, link);
        this.addedCspScriptsDocuments.add(document);
    }
}
class InlineCriticalCssProcessor {
    options;
    resourceCache = new Map();
    constructor(options) {
        this.options = options;
    }
    async process(html, options) {
        const critters = new CrittersExtended({ ...this.options, ...options }, this.resourceCache);
        const content = await critters.process(html);
        return {
            content,
            errors: critters.errors.length ? critters.errors : undefined,
            warnings: critters.warnings.length ? critters.warnings : undefined,
        };
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
        const enablePerformanceProfiler = this.options?.enablePerformanceProfiler;
        const runMethod = enablePerformanceProfiler
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
        if (enablePerformanceProfiler) {
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
 * Custom implementation of the Angular Console service that filters out specific log messages.
 *
 * This class extends the internal Angular `ɵConsole` class to provide customized logging behavior.
 * It overrides the `log` method to suppress logs that match certain predefined messages.
 */
class Console extends _Console {
    /**
     * A set of log messages that should be ignored and not printed to the console.
     */
    ignoredLogs = new Set(['Angular is running in development mode.']);
    /**
     * Logs a message to the console if it is not in the set of ignored messages.
     *
     * @param message - The message to log to the console.
     *
     * This method overrides the `log` method of the `ɵConsole` class. It checks if the
     * message is in the `ignoredLogs` set. If it is not, it delegates the logging to
     * the parent class's `log` method. Otherwise, the message is suppressed.
     */
    log(message) {
        if (!this.ignoredLogs.has(message)) {
            super.log(message);
        }
    }
}

/**
 * Removes the trailing slash from a URL if it exists.
 *
 * @param url - The URL string from which to remove the trailing slash.
 * @returns The URL string without a trailing slash.
 *
 * @example
 * ```js
 * stripTrailingSlash('path/'); // 'path'
 * stripTrailingSlash('/path');  // '/path'
 * ```
 */
function stripTrailingSlash(url) {
    // Check if the last character of the URL is a slash
    return url[url.length - 1] === '/' ? url.slice(0, -1) : url;
}
/**
 * Joins URL parts into a single URL string.
 *
 * This function takes multiple URL segments, normalizes them by removing leading
 * and trailing slashes where appropriate, and then joins them into a single URL.
 *
 * @param parts - The parts of the URL to join. Each part can be a string with or without slashes.
 * @returns The joined URL string, with normalized slashes.
 *
 * @example
 * ```js
 * joinUrlParts('path/', '/to/resource'); // '/path/to/resource'
 * joinUrlParts('/path/', 'to/resource'); // '/path/to/resource'
 * ```
 */
function joinUrlParts(...parts) {
    // Initialize an array with an empty string to always add a leading slash
    const normalizeParts = [''];
    for (const part of parts) {
        if (part === '') {
            // Skip any empty parts
            continue;
        }
        let normalizedPart = part;
        if (part[0] === '/') {
            normalizedPart = normalizedPart.slice(1);
        }
        if (part[part.length - 1] === '/') {
            normalizedPart = normalizedPart.slice(0, -1);
        }
        if (normalizedPart !== '') {
            normalizeParts.push(normalizedPart);
        }
    }
    return normalizeParts.join('/');
}
/**
 * Strips `/index.html` from the end of a URL's path, if present.
 *
 * This function is used to convert URLs pointing to an `index.html` file into their directory
 * equivalents. For example, it transforms a URL like `http://www.example.com/page/index.html`
 * into `http://www.example.com/page`.
 *
 * @param url - The URL object to process.
 * @returns A new URL object with `/index.html` removed from the path, if it was present.
 *
 * @example
 * ```typescript
 * const originalUrl = new URL('http://www.example.com/page/index.html');
 * const cleanedUrl = stripIndexHtmlFromURL(originalUrl);
 * console.log(cleanedUrl.href); // Output: 'http://www.example.com/page'
 * ```
 */
function stripIndexHtmlFromURL(url) {
    if (url.pathname.endsWith('/index.html')) {
        const modifiedURL = new URL(url);
        // Remove '/index.html' from the pathname
        modifiedURL.pathname = modifiedURL.pathname.slice(0, /** '/index.html'.length */ -11);
        return modifiedURL;
    }
    return url;
}

/**
 * Renders an Angular application or module to an HTML string.
 *
 * This function determines whether the provided `bootstrap` value is an Angular module
 * or a bootstrap function and calls the appropriate rendering method (`renderModule` or
 * `renderApplication`) based on that determination.
 *
 * @param html - The HTML string to be used as the initial document content.
 * @param bootstrap - Either an Angular module type or a function that returns a promise
 *                    resolving to an `ApplicationRef`.
 * @param url - The URL of the application. This is used for server-side rendering to
 *              correctly handle route-based rendering.
 * @param platformProviders - An array of platform providers to be used during the
 *                             rendering process.
 * @returns A promise that resolves to a string containing the rendered HTML.
 */
function renderAngular(html, bootstrap, url, platformProviders) {
    // A request to `http://www.example.com/page/index.html` will render the Angular route corresponding to `http://www.example.com/page`.
    const urlToRender = stripIndexHtmlFromURL(url).toString();
    return isNgModule(bootstrap)
        ? renderModule(bootstrap, {
            url: urlToRender,
            document: html,
            extraProviders: platformProviders,
        })
        : renderApplication(bootstrap, {
            url: urlToRender,
            document: html,
            platformProviders,
        });
}
/**
 * Type guard to determine if a given value is an Angular module.
 * Angular modules are identified by the presence of the `ɵmod` static property.
 * This function helps distinguish between Angular modules and bootstrap functions.
 *
 * @param value - The value to be checked.
 * @returns True if the value is an Angular module (i.e., it has the `ɵmod` property), false otherwise.
 */
function isNgModule(value) {
    return 'ɵmod' in value;
}

/**
 * Recursively traverses the Angular router configuration to retrieve routes.
 *
 * Iterates through the router configuration, yielding each route along with its potential
 * redirection or error status. Handles nested routes and lazy-loaded child routes.
 *
 * @param options - An object containing the parameters for traversing routes.
 * @returns An async iterator yielding `RouteResult` objects.
 */
async function* traverseRoutesConfig(options) {
    const { routes, compiler, parentInjector, parentRoute } = options;
    for (const route of routes) {
        const { path = '', redirectTo, loadChildren, children } = route;
        const currentRoutePath = joinUrlParts(parentRoute, path);
        yield {
            route: currentRoutePath,
            redirectTo: typeof redirectTo === 'string'
                ? resolveRedirectTo(currentRoutePath, redirectTo)
                : undefined,
        };
        if (children?.length) {
            // Recursively process child routes.
            yield* traverseRoutesConfig({
                routes: children,
                compiler,
                parentInjector,
                parentRoute: currentRoutePath,
            });
        }
        if (loadChildren) {
            // Load and process lazy-loaded child routes.
            const loadedChildRoutes = await _loadChildren(route, compiler, parentInjector).toPromise();
            if (loadedChildRoutes) {
                const { routes: childRoutes, injector = parentInjector } = loadedChildRoutes;
                yield* traverseRoutesConfig({
                    routes: childRoutes,
                    compiler,
                    parentInjector: injector,
                    parentRoute: currentRoutePath,
                });
            }
        }
    }
}
/**
 * Resolves the `redirectTo` property for a given route.
 *
 * This function processes the `redirectTo` property to ensure that it correctly
 * resolves relative to the current route path. If `redirectTo` is an absolute path,
 * it is returned as is. If it is a relative path, it is resolved based on the current route path.
 *
 * @param routePath - The current route path.
 * @param redirectTo - The target path for redirection.
 * @returns The resolved redirect path as a string.
 */
function resolveRedirectTo(routePath, redirectTo) {
    if (redirectTo[0] === '/') {
        // If the redirectTo path is absolute, return it as is.
        return redirectTo;
    }
    // Resolve relative redirectTo based on the current route path.
    const segments = routePath.split('/');
    segments.pop(); // Remove the last segment to make it relative.
    return joinUrlParts(...segments, redirectTo);
}
/**
 * Retrieves routes from the given Angular application.
 *
 * This function initializes an Angular platform, bootstraps the application or module,
 * and retrieves routes from the Angular router configuration. It handles both module-based
 * and function-based bootstrapping. It yields the resulting routes as `RouteResult` objects.
 *
 * @param bootstrap - A function that returns a promise resolving to an `ApplicationRef` or an Angular module to bootstrap.
 * @param document - The initial HTML document used for server-side rendering.
 * This document is necessary to render the application on the server.
 * @param url - The URL for server-side rendering. The URL is used to configure `ServerPlatformLocation`. This configuration is crucial
 * for ensuring that API requests for relative paths succeed, which is essential for accurate route extraction.
 * See:
 *  - https://github.com/angular/angular/blob/d608b857c689d17a7ffa33bbb510301014d24a17/packages/platform-server/src/location.ts#L51
 *  - https://github.com/angular/angular/blob/6882cc7d9eed26d3caeedca027452367ba25f2b9/packages/platform-server/src/http.ts#L44
 * @returns A promise that resolves to an object of type `AngularRouterConfigResult`.
 */
async function getRoutesFromAngularRouterConfig(bootstrap, document, url) {
    if (typeof ngDevMode === 'undefined' || ngDevMode) {
        // Need to clean up GENERATED_COMP_IDS map in `@angular/core`.
        // Otherwise an incorrect component ID generation collision detected warning will be displayed in development.
        // See: https://github.com/angular/angular-cli/issues/25924
        _resetCompiledComponents();
    }
    const { protocol, host } = url;
    // Create and initialize the Angular platform for server-side rendering.
    const platformRef = createPlatformFactory(platformCore, 'server', [
        {
            provide: INITIAL_CONFIG,
            useValue: { document, url: `${protocol}//${host}/` },
        },
        {
            provide: _Console,
            useFactory: () => new Console(),
        },
        ..._INTERNAL_SERVER_PLATFORM_PROVIDERS,
    ])();
    try {
        let applicationRef;
        if (isNgModule(bootstrap)) {
            const moduleRef = await platformRef.bootstrapModule(bootstrap);
            applicationRef = moduleRef.injector.get(ApplicationRef);
        }
        else {
            applicationRef = await bootstrap();
        }
        // Wait until the application is stable.
        await _whenStable(applicationRef);
        const injector = applicationRef.injector;
        const router = injector.get(Router);
        const routesResults = [];
        if (router.config.length) {
            const compiler = injector.get(Compiler);
            // Retrieve all routes from the Angular router configuration.
            const traverseRoutes = traverseRoutesConfig({
                routes: router.config,
                compiler,
                parentInjector: injector,
                parentRoute: '',
            });
            for await (const result of traverseRoutes) {
                routesResults.push(result);
            }
        }
        else {
            routesResults.push({ route: '' });
        }
        const baseHref = injector.get(APP_BASE_HREF, null, { optional: true }) ??
            injector.get(PlatformLocation).getBaseHrefFromDOM();
        return {
            baseHref,
            routes: routesResults,
        };
    }
    finally {
        platformRef.destroy();
    }
}

/**
 * Manages server-side assets.
 */
class ServerAssets {
    manifest;
    /**
     * Creates an instance of ServerAsset.
     *
     * @param manifest - The manifest containing the server assets.
     */
    constructor(manifest) {
        this.manifest = manifest;
    }
    /**
     * Retrieves the content of a server-side asset using its path.
     *
     * @param path - The path to the server asset.
     * @returns A promise that resolves to the asset content as a string.
     * @throws Error If the asset path is not found in the manifest, an error is thrown.
     */
    async getServerAsset(path) {
        const asset = this.manifest.assets.get(path);
        if (!asset) {
            throw new Error(`Server asset '${path}' does not exist.`);
        }
        return asset();
    }
    /**
     * Retrieves and caches the content of 'index.server.html'.
     *
     * @returns A promise that resolves to the content of 'index.server.html'.
     * @throws Error If there is an issue retrieving the asset.
     */
    getIndexServerHtml() {
        return this.getServerAsset('index.server.html');
    }
}

/**
 * Manages a collection of hooks and provides methods to register and execute them.
 * Hooks are functions that can be invoked with specific arguments to allow modifications or enhancements.
 */
class Hooks {
    /**
     * A map of hook names to arrays of hook functions.
     * Each hook name can have multiple associated functions, which are executed in sequence.
     */
    store = new Map();
    /**
     * Executes all hooks associated with the specified name, passing the given argument to each hook function.
     * The hooks are invoked sequentially, and the argument may be modified by each hook.
     *
     * @template Hook - The type of the hook name. It should be one of the keys of `HooksMapping`.
     * @param name - The name of the hook whose functions will be executed.
     * @param context - The input value to be passed to each hook function. The value is mutated by each hook function.
     * @returns A promise that resolves once all hook functions have been executed.
     *
     * @example
     * ```typescript
     * const hooks = new Hooks();
     * hooks.on('html:transform:pre', async (ctx) => {
     *   ctx.html = ctx.html.replace(/foo/g, 'bar');
     *   return ctx.html;
     * });
     * const result = await hooks.run('html:transform:pre', { html: '<div>foo</div>' });
     * console.log(result); // '<div>bar</div>'
     * ```
     * @internal
     */
    async run(name, context) {
        const hooks = this.store.get(name);
        switch (name) {
            case 'html:transform:pre': {
                if (!hooks) {
                    return context.html;
                }
                const ctx = { ...context };
                for (const hook of hooks) {
                    ctx.html = await hook(ctx);
                }
                return ctx.html;
            }
            default:
                throw new Error(`Running hook "${name}" is not supported.`);
        }
    }
    /**
     * Registers a new hook function under the specified hook name.
     * This function should be a function that takes an argument of type `T` and returns a `string` or `Promise<string>`.
     *
     * @template Hook - The type of the hook name. It should be one of the keys of `HooksMapping`.
     * @param name - The name of the hook under which the function will be registered.
     * @param handler - A function to be executed when the hook is triggered. The handler will be called with an argument
     *                  that may be modified by the hook functions.
     *
     * @remarks
     * - If there are existing handlers registered under the given hook name, the new handler will be added to the list.
     * - If no handlers are registered under the given hook name, a new list will be created with the handler as its first element.
     *
     * @example
     * ```typescript
     * hooks.on('html:transform:pre', async (ctx) => {
     *   return ctx.html.replace(/foo/g, 'bar');
     * });
     * ```
     */
    on(name, handler) {
        const hooks = this.store.get(name);
        if (hooks) {
            hooks.push(handler);
        }
        else {
            this.store.set(name, [handler]);
        }
    }
    /**
     * Checks if there are any hooks registered under the specified name.
     *
     * @param name - The name of the hook to check.
     * @returns `true` if there are hooks registered under the specified name, otherwise `false`.
     */
    has(name) {
        return !!this.store.get(name)?.length;
    }
}

/**
 * The Angular app manifest object.
 * This is used internally to store the current Angular app manifest.
 */
let angularAppManifest;
/**
 * Sets the Angular app manifest.
 *
 * @param manifest - The manifest object to set for the Angular application.
 */
function setAngularAppManifest(manifest) {
    angularAppManifest = manifest;
}
/**
 * Gets the Angular app manifest.
 *
 * @returns The Angular app manifest.
 * @throws Will throw an error if the Angular app manifest is not set.
 */
function getAngularAppManifest() {
    if (!angularAppManifest) {
        throw new Error('Angular app manifest is not set. ' +
            `Please ensure you are using the '@angular/build:application' builder to build your server application.`);
    }
    return angularAppManifest;
}
/**
 * The Angular app engine manifest object.
 * This is used internally to store the current Angular app engine manifest.
 */
let angularAppEngineManifest;
/**
 * Sets the Angular app engine manifest.
 *
 * @param manifest - The engine manifest object to set.
 */
function setAngularAppEngineManifest(manifest) {
    angularAppEngineManifest = manifest;
}
/**
 * Gets the Angular app engine manifest.
 *
 * @returns The Angular app engine manifest.
 * @throws Will throw an error if the Angular app engine manifest is not set.
 */
function getAngularAppEngineManifest() {
    if (!angularAppEngineManifest) {
        throw new Error('Angular app engine manifest is not set. ' +
            `Please ensure you are using the '@angular/build:application' builder to build your server application.`);
    }
    return angularAppEngineManifest;
}

/**
 * A route tree implementation that supports efficient route matching, including support for wildcard routes.
 * This structure is useful for organizing and retrieving routes in a hierarchical manner,
 * enabling complex routing scenarios with nested paths.
 */
class RouteTree {
    /**
     * The root node of the route tree.
     * All routes are stored and accessed relative to this root node.
     */
    root = this.createEmptyRouteTreeNode('');
    /**
     * A counter that tracks the order of route insertion.
     * This ensures that routes are matched in the order they were defined,
     * with earlier routes taking precedence.
     */
    insertionIndexCounter = 0;
    /**
     * Inserts a new route into the route tree.
     * The route is broken down into segments, and each segment is added to the tree.
     * Parameterized segments (e.g., :id) are normalized to wildcards (*) for matching purposes.
     *
     * @param route - The route path to insert into the tree.
     * @param metadata - Metadata associated with the route, excluding the route path itself.
     */
    insert(route, metadata) {
        let node = this.root;
        const normalizedRoute = stripTrailingSlash(route);
        const segments = normalizedRoute.split('/');
        for (const segment of segments) {
            // Replace parameterized segments (e.g., :id) with a wildcard (*) for matching
            const normalizedSegment = segment[0] === ':' ? '*' : segment;
            let childNode = node.children.get(normalizedSegment);
            if (!childNode) {
                childNode = this.createEmptyRouteTreeNode(normalizedSegment);
                node.children.set(normalizedSegment, childNode);
            }
            node = childNode;
        }
        // At the leaf node, store the full route and its associated metadata
        node.metadata = {
            ...metadata,
            route: normalizedRoute,
        };
        node.insertionIndex = this.insertionIndexCounter++;
    }
    /**
     * Matches a given route against the route tree and returns the best matching route's metadata.
     * The best match is determined by the lowest insertion index, meaning the earliest defined route
     * takes precedence.
     *
     * @param route - The route path to match against the route tree.
     * @returns The metadata of the best matching route or `undefined` if no match is found.
     */
    match(route) {
        const segments = stripTrailingSlash(route).split('/');
        return this.traverseBySegments(segments)?.metadata;
    }
    /**
     * Converts the route tree into a serialized format representation.
     * This method converts the route tree into an array of metadata objects that describe the structure of the tree.
     * The array represents the routes in a nested manner where each entry includes the route and its associated metadata.
     *
     * @returns An array of `RouteTreeNodeMetadata` objects representing the route tree structure.
     *          Each object includes the `route` and associated metadata of a route.
     */
    toObject() {
        return Array.from(this.traverse());
    }
    /**
     * Constructs a `RouteTree` from an object representation.
     * This method is used to recreate a `RouteTree` instance from an array of metadata objects.
     * The array should be in the format produced by `toObject`, allowing for the reconstruction of the route tree
     * with the same routes and metadata.
     *
     * @param value - An array of `RouteTreeNodeMetadata` objects that represent the serialized format of the route tree.
     *                Each object should include a `route` and its associated metadata.
     * @returns A new `RouteTree` instance constructed from the provided metadata objects.
     */
    static fromObject(value) {
        const tree = new RouteTree();
        for (const { route, ...metadata } of value) {
            tree.insert(route, metadata);
        }
        return tree;
    }
    /**
     * A generator function that recursively traverses the route tree and yields the metadata of each node.
     * This allows for easy and efficient iteration over all nodes in the tree.
     *
     * @param node - The current node to start the traversal from. Defaults to the root node of the tree.
     */
    *traverse(node = this.root) {
        if (node.metadata) {
            yield node.metadata;
        }
        for (const childNode of node.children.values()) {
            yield* this.traverse(childNode);
        }
    }
    /**
     * Recursively traverses the route tree from a given node, attempting to match the remaining route segments.
     * If the node is a leaf node (no more segments to match) and contains metadata, the node is yielded.
     *
     * This function prioritizes exact segment matches first, followed by wildcard matches (`*`),
     * and finally deep wildcard matches (`**`) that consume all segments.
     *
     * @param remainingSegments - The remaining segments of the route path to match.
     * @param node - The current node in the route tree to start traversal from.
     *
     * @returns The node that best matches the remaining segments or `undefined` if no match is found.
     */
    traverseBySegments(remainingSegments, node = this.root) {
        const { metadata, children } = node;
        // If there are no remaining segments and the node has metadata, return this node
        if (!remainingSegments?.length) {
            if (metadata) {
                return node;
            }
            return;
        }
        // If the node has no children, end the traversal
        if (!children.size) {
            return;
        }
        const [segment, ...restSegments] = remainingSegments;
        let currentBestMatchNode;
        // 1. Exact segment match
        const exactMatchNode = node.children.get(segment);
        currentBestMatchNode = this.getHigherPriorityNode(currentBestMatchNode, this.traverseBySegments(restSegments, exactMatchNode));
        // 2. Wildcard segment match (`*`)
        const wildcardNode = node.children.get('*');
        currentBestMatchNode = this.getHigherPriorityNode(currentBestMatchNode, this.traverseBySegments(restSegments, wildcardNode));
        // 3. Deep wildcard segment match (`**`)
        const deepWildcardNode = node.children.get('**');
        currentBestMatchNode = this.getHigherPriorityNode(currentBestMatchNode, deepWildcardNode);
        return currentBestMatchNode;
    }
    /**
     * Compares two nodes and returns the node with higher priority based on insertion index.
     * A node with a lower insertion index is prioritized as it was defined earlier.
     *
     * @param currentBestMatchNode - The current best match node.
     * @param candidateNode - The node being evaluated for higher priority based on insertion index.
     * @returns The node with higher priority (i.e., lower insertion index). If one of the nodes is `undefined`, the other node is returned.
     */
    getHigherPriorityNode(currentBestMatchNode, candidateNode) {
        if (!candidateNode) {
            return currentBestMatchNode;
        }
        if (!currentBestMatchNode) {
            return candidateNode;
        }
        return candidateNode.insertionIndex < currentBestMatchNode.insertionIndex
            ? candidateNode
            : currentBestMatchNode;
    }
    /**
     * Creates an empty route tree node with the specified segment.
     * This helper function is used during the tree construction.
     *
     * @param segment - The route segment that this node represents.
     * @returns A new, empty route tree node.
     */
    createEmptyRouteTreeNode(segment) {
        return {
            segment,
            insertionIndex: -1,
            children: new Map(),
        };
    }
}

/**
 * Manages the application's server routing logic by building and maintaining a route tree.
 *
 * This class is responsible for constructing the route tree from the Angular application
 * configuration and using it to match incoming requests to the appropriate routes.
 */
class ServerRouter {
    routeTree;
    /**
     * Creates an instance of the `ServerRouter`.
     *
     * @param routeTree - An instance of `RouteTree` that holds the routing information.
     * The `RouteTree` is used to match request URLs to the appropriate route metadata.
     */
    constructor(routeTree) {
        this.routeTree = routeTree;
    }
    /**
     * Static property to track the ongoing build promise.
     */
    static #extractionPromise;
    /**
     * Creates or retrieves a `ServerRouter` instance based on the provided manifest and URL.
     *
     * If the manifest contains pre-built routes, a new `ServerRouter` is immediately created.
     * Otherwise, it builds the router by extracting routes from the Angular configuration
     * asynchronously. This method ensures that concurrent builds are prevented by re-using
     * the same promise.
     *
     * @param manifest - An instance of `AngularAppManifest` that contains the route information.
     * @param url - The URL for server-side rendering. The URL is needed to configure `ServerPlatformLocation`.
     * This is necessary to ensure that API requests for relative paths succeed, which is crucial for correct route extraction.
     * [Reference](https://github.com/angular/angular/blob/d608b857c689d17a7ffa33bbb510301014d24a17/packages/platform-server/src/location.ts#L51)
     * @returns A promise resolving to a `ServerRouter` instance.
     */
    static from(manifest, url) {
        if (manifest.routes) {
            const routeTree = RouteTree.fromObject(manifest.routes);
            return Promise.resolve(new ServerRouter(routeTree));
        }
        // Create and store a new promise for the build process.
        // This prevents concurrent builds by re-using the same promise.
        ServerRouter.#extractionPromise ??= (async () => {
            try {
                const routeTree = new RouteTree();
                const document = await new ServerAssets(manifest).getIndexServerHtml();
                const { baseHref, routes } = await getRoutesFromAngularRouterConfig(manifest.bootstrap(), document, url);
                for (let { route, redirectTo } of routes) {
                    route = joinUrlParts(baseHref, route);
                    redirectTo = redirectTo === undefined ? undefined : joinUrlParts(baseHref, redirectTo);
                    routeTree.insert(route, { redirectTo });
                }
                return new ServerRouter(routeTree);
            }
            finally {
                ServerRouter.#extractionPromise = undefined;
            }
        })();
        return ServerRouter.#extractionPromise;
    }
    /**
     * Matches a request URL against the route tree to retrieve route metadata.
     *
     * This method strips 'index.html' from the URL if it is present and then attempts
     * to find a match in the route tree. If a match is found, it returns the associated
     * route metadata; otherwise, it returns `undefined`.
     *
     * @param url - The URL to be matched against the route tree.
     * @returns The metadata for the matched route or `undefined` if no match is found.
     */
    match(url) {
        // Strip 'index.html' from URL if present.
        // A request to `http://www.example.com/page/index.html` will render the Angular route corresponding to `http://www.example.com/page`.
        const { pathname } = stripIndexHtmlFromURL(url);
        return this.routeTree.match(decodeURIComponent(pathname));
    }
}

/**
 * Injection token for the current request.
 */
const REQUEST = new InjectionToken('REQUEST');
/**
 * Injection token for the response initialization options.
 */
const RESPONSE_INIT = new InjectionToken('RESPONSE_INIT');
/**
 * Injection token for additional request context.
 */
const REQUEST_CONTEXT = new InjectionToken('REQUEST_CONTEXT');

/**
 * Enum representing the different contexts in which server rendering can occur.
 */
var ServerRenderContext;
(function (ServerRenderContext) {
    ServerRenderContext["SSR"] = "ssr";
    ServerRenderContext["SSG"] = "ssg";
    ServerRenderContext["AppShell"] = "app-shell";
})(ServerRenderContext || (ServerRenderContext = {}));
/**
 * Represents a locale-specific Angular server application managed by the server application engine.
 *
 * The `AngularServerApp` class handles server-side rendering and asset management for a specific locale.
 */
class AngularServerApp {
    /**
     * Hooks for extending or modifying the behavior of the server application.
     * This instance can be used to attach custom functionality to various events in the server application lifecycle.
     */
    hooks = new Hooks();
    /**
     * The manifest associated with this server application.
     */
    manifest = getAngularAppManifest();
    /**
     * An instance of ServerAsset that handles server-side asset.
     */
    assets = new ServerAssets(this.manifest);
    /**
     * The router instance used for route matching and handling.
     */
    router;
    /**
     * Renders a response for the given HTTP request using the server application.
     *
     * This method processes the request and returns a response based on the specified rendering context.
     *
     * @param request - The incoming HTTP request to be rendered.
     * @param requestContext - Optional additional context for rendering, such as request metadata.
     * @param serverContext - The rendering context.
     *
     * @returns A promise that resolves to the HTTP response object resulting from the rendering, or null if no match is found.
     */
    render(request, requestContext, serverContext = ServerRenderContext.SSR) {
        return Promise.race([
            this.createAbortPromise(request),
            this.handleRendering(request, requestContext, serverContext),
        ]);
    }
    /**
     * Creates a promise that rejects when the request is aborted.
     *
     * @param request - The HTTP request to monitor for abortion.
     * @returns A promise that never resolves but rejects with an `AbortError` if the request is aborted.
     */
    createAbortPromise(request) {
        return new Promise((_, reject) => {
            request.signal.addEventListener('abort', () => {
                const abortError = new Error(`Request for: ${request.url} was aborted.\n${request.signal.reason}`);
                abortError.name = 'AbortError';
                reject(abortError);
            }, { once: true });
        });
    }
    /**
     * Handles the server-side rendering process for the given HTTP request.
     * This method matches the request URL to a route and performs rendering if a matching route is found.
     *
     * @param request - The incoming HTTP request to be processed.
     * @param requestContext - Optional additional context for rendering, such as request metadata.
     * @param serverContext - The rendering context. Defaults to server-side rendering (SSR).
     *
     * @returns A promise that resolves to the rendered response, or null if no matching route is found.
     */
    async handleRendering(request, requestContext, serverContext = ServerRenderContext.SSR) {
        const url = new URL(request.url);
        this.router ??= await ServerRouter.from(this.manifest, url);
        const matchedRoute = this.router.match(url);
        if (!matchedRoute) {
            // Not a known Angular route.
            return null;
        }
        const { redirectTo } = matchedRoute;
        if (redirectTo !== undefined) {
            // 302 Found is used by default for redirections
            // See: https://developer.mozilla.org/en-US/docs/Web/API/Response/redirect_static#status
            return Response.redirect(new URL(redirectTo, url), 302);
        }
        const platformProviders = [
            {
                provide: _SERVER_CONTEXT,
                useValue: serverContext,
            },
            {
                // An Angular Console Provider that does not print a set of predefined logs.
                provide: _Console,
                // Using `useClass` would necessitate decorating `Console` with `@Injectable`,
                // which would require switching from `ts_library` to `ng_module`. This change
                // would also necessitate various patches of `@angular/bazel` to support ESM.
                useFactory: () => new Console(),
            },
        ];
        const isSsrMode = serverContext === ServerRenderContext.SSR;
        const responseInit = {};
        if (isSsrMode) {
            platformProviders.push({
                provide: REQUEST,
                useValue: request,
            }, {
                provide: REQUEST_CONTEXT,
                useValue: requestContext,
            }, {
                provide: RESPONSE_INIT,
                useValue: responseInit,
            });
        }
        if (typeof ngDevMode === 'undefined' || ngDevMode) {
            // Need to clean up GENERATED_COMP_IDS map in `@angular/core`.
            // Otherwise an incorrect component ID generation collision detected warning will be displayed in development.
            // See: https://github.com/angular/angular-cli/issues/25924
            _resetCompiledComponents();
        }
        const { manifest, hooks, assets } = this;
        let html = await assets.getIndexServerHtml();
        // Skip extra microtask if there are no pre hooks.
        if (hooks.has('html:transform:pre')) {
            html = await hooks.run('html:transform:pre', { html });
        }
        return new Response(await renderAngular(html, manifest.bootstrap(), new URL(request.url), platformProviders), responseInit);
    }
}
let angularServerApp;
/**
 * Retrieves or creates an instance of `AngularServerApp`.
 * - If an instance of `AngularServerApp` already exists, it will return the existing one.
 * - If no instance exists, it will create a new one with the provided options.
 * @returns The existing or newly created instance of `AngularServerApp`.
 */
function getOrCreateAngularServerApp() {
    return (angularServerApp ??= new AngularServerApp());
}
/**
 * Destroys the existing `AngularServerApp` instance, releasing associated resources and resetting the
 * reference to `undefined`.
 *
 * This function is primarily used to enable the recreation of the `AngularServerApp` instance,
 * typically when server configuration or application state needs to be refreshed.
 */
function destroyAngularServerApp() {
    angularServerApp = undefined;
}

export { CommonEngine, ServerRenderContext as ɵServerRenderContext, destroyAngularServerApp as ɵdestroyAngularServerApp, getOrCreateAngularServerApp as ɵgetOrCreateAngularServerApp, getRoutesFromAngularRouterConfig as ɵgetRoutesFromAngularRouterConfig, setAngularAppEngineManifest as ɵsetAngularAppEngineManifest, setAngularAppManifest as ɵsetAngularAppManifest };
//# sourceMappingURL=ssr.mjs.map

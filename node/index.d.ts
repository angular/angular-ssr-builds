import { ApplicationRef } from '@angular/core';
import type { IncomingMessage } from 'node:http';
import type { ServerResponse } from 'node:http';
import { StaticProvider } from '@angular/core';
import { Type } from '@angular/core';

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
export declare class AngularNodeAppEngine {
    private readonly angularAppEngine;
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
    render(request: IncomingMessage, requestContext?: unknown): Promise<Response | null>;
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
     *     for (const [key, value] of headers) {
     *       res.setHeader(key, value);
     *     }
     *   }
     }));
     * ```
     */
    getPrerenderHeaders(request: IncomingMessage): ReadonlyMap<string, string>;
}

/**
 * A common engine to use to server render an application.
 */
export declare class CommonEngine {
    private options?;
    private readonly templateCache;
    private readonly inlineCriticalCssProcessor;
    private readonly pageIsSSG;
    constructor(options?: CommonEngineOptions | undefined);
    /**
     * Render an HTML document for a specific URL with specified
     * render options
     */
    render(opts: CommonEngineRenderOptions): Promise<string>;
    private inlineCriticalCss;
    private retrieveSSGPage;
    private renderApplication;
    /** Retrieve the document from the cache or the filesystem */
    private getDocument;
}

export declare interface CommonEngineOptions {
    /** A method that when invoked returns a promise that returns an `ApplicationRef` instance once resolved or an NgModule. */
    bootstrap?: Type<{}> | (() => Promise<ApplicationRef>);
    /** A set of platform level providers for all requests. */
    providers?: StaticProvider[];
    /** Enable request performance profiling data collection and printing the results in the server console. */
    enablePerformanceProfiler?: boolean;
}

export declare interface CommonEngineRenderOptions {
    /** A method that when invoked returns a promise that returns an `ApplicationRef` instance once resolved or an NgModule. */
    bootstrap?: Type<{}> | (() => Promise<ApplicationRef>);
    /** A set of platform level providers for the current request. */
    providers?: StaticProvider[];
    url?: string;
    document?: string;
    documentFilePath?: string;
    /**
     * Reduce render blocking requests by inlining critical CSS.
     * Defaults to true.
     */
    inlineCriticalCss?: boolean;
    /**
     * Base path location of index file.
     * Defaults to the 'documentFilePath' dirname when not provided.
     */
    publicPath?: string;
}

/**
 * Converts a Node.js `IncomingMessage` into a Web Standard `Request`.
 *
 * @param nodeRequest - The Node.js `IncomingMessage` object to convert.
 * @returns A Web Standard `Request` object.
 * @developerPreview
 */
export declare function createWebRequestFromNodeRequest(nodeRequest: IncomingMessage): Request;


/**
 * Determines whether the provided URL represents the main entry point module.
 *
 * This function checks if the provided URL corresponds to the main ESM module being executed directly.
 * It's useful for conditionally executing code that should only run when a module is the entry point,
 * such as starting a server or initializing an application.
 *
 * It performs two key checks:
 * 1. Verifies if the URL starts with 'file:', ensuring it is a local file.
 * 2. Compares the URL's resolved file path with the first command-line argument (`process.argv[1]`),
 *    which points to the file being executed.
 *
 * @param url The URL of the module to check. This should typically be `import.meta.url`.
 * @returns `true` if the provided URL represents the main entry point, otherwise `false`.
 * @developerPreview
 */
export declare function isMainModule(url: string): boolean;

/**
 * Streams a web-standard `Response` into a Node.js `ServerResponse`.
 *
 * @param source - The web-standard `Response` object to stream from.
 * @param destination - The Node.js `ServerResponse` object to stream into.
 * @returns A promise that resolves once the streaming operation is complete.
 * @developerPreview
 */
export declare function writeResponseToNodeResponse(source: Response, destination: ServerResponse): Promise<void>;

export { }

import { ApplicationRef } from '@angular/core';
import { StaticProvider } from '@angular/core';
import { Type } from '@angular/core';

/**
 * Represents the bootstrap mechanism for an Angular application.
 *
 * This type can either be:
 * - A reference to an Angular component or module (`Type<unknown>`) that serves as the root of the application.
 * - A function that returns a `Promise<ApplicationRef>`, which resolves with the root application reference.
 */
declare type AngularBootstrap = Type<unknown> | (() => Promise<ApplicationRef>);

/**
 * Result of extracting routes from an Angular application.
 */
declare interface AngularRouterConfigResult {
    /**
     * The base URL for the application.
     * This is the base href that is used for resolving relative paths within the application.
     */
    baseHref: string;
    /**
     * An array of `RouteResult` objects representing the application's routes.
     *
     * Each `RouteResult` contains details about a specific route, such as its path and any
     * associated redirection targets. This array is asynchronously generated and
     * provides information on how routes are structured and resolved.
     *
     * Example:
     * ```typescript
     * const result: AngularRouterConfigResult = {
     *   baseHref: '/app/',
     *   routes: [
     *     { route: '/home', redirectTo: '/welcome' },
     *     { route: '/about' },
     *   ],
     * };
     * ```
     */
    routes: RouteResult[];
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
 * Represents the result of processing a route.
 */
declare interface RouteResult {
    /**
     * The resolved path of the route.
     *
     * This string represents the complete URL path for the route after it has been
     * resolved, including any parent routes or path segments that have been joined.
     */
    route: string;
    /**
     * The target path for route redirection, if applicable.
     *
     * If this route has a `redirectTo` property in the configuration, this field will
     * contain the full resolved URL path that the route should redirect to.
     */
    redirectTo?: string;
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
export declare function ɵgetRoutesFromAngularRouterConfig(bootstrap: AngularBootstrap, document: string, url: URL): Promise<AngularRouterConfigResult>;

export { }

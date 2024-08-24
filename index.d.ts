import { ApplicationRef } from '@angular/core';
import { StaticProvider } from '@angular/core';
import { Type } from '@angular/core';

/**
 * Manifest for the Angular server application engine, defining entry points.
 */
declare interface AngularAppEngineManifest {
    /**
     * A map of entry points for the server application.
     * Each entry in the map consists of:
     * - `key`: The base href for the entry point.
     * - `value`: A function that returns a promise resolving to an object of type `EntryPointExports`.
     */
    readonly entryPoints: Readonly<Map<string, () => Promise<EntryPointExports>>>;
    /**
     * The base path for the server application.
     * This is used to determine the root path of the application.
     */
    readonly basePath: string;
}

/**
 * Manifest for a specific Angular server application, defining assets and bootstrap logic.
 */
declare interface AngularAppManifest {
    /**
     * A map of assets required by the server application.
     * Each entry in the map consists of:
     * - `key`: The path of the asset.
     * - `value`: A function returning a promise that resolves to the file contents of the asset.
     */
    readonly assets: Readonly<Map<string, () => Promise<string>>>;
    /**
     * The bootstrap mechanism for the server application.
     * A function that returns a reference to an NgModule or a function returning a promise that resolves to an ApplicationRef.
     */
    readonly bootstrap: () => AngularBootstrap;
    /**
     * Indicates whether critical CSS should be inlined into the HTML.
     * If set to `true`, critical CSS will be inlined for faster page rendering.
     */
    readonly inlineCriticalCss?: boolean;
    /**
     * The route tree representation for the routing configuration of the application.
     * This represents the routing information of the application, mapping route paths to their corresponding metadata.
     * It is used for route matching and navigation within the server application.
     */
    readonly routes?: SerializableRouteTreeNode;
}

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
 * Represents a locale-specific Angular server application managed by the server application engine.
 *
 * The `AngularServerApp` class handles server-side rendering and asset management for a specific locale.
 */
declare class AngularServerApp {
    /**
     * Hooks for extending or modifying the behavior of the server application.
     * This instance can be used to attach custom functionality to various events in the server application lifecycle.
     */
    hooks: Hooks;
    /**
     * The manifest associated with this server application.
     */
    private readonly manifest;
    /**
     * An instance of ServerAsset that handles server-side asset.
     */
    private readonly assets;
    /**
     * The router instance used for route matching and handling.
     */
    private router;
    /**
     * The `inlineCriticalCssProcessor` is responsible for handling critical CSS inlining.
     */
    private inlineCriticalCssProcessor;
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
    render(request: Request, requestContext?: unknown, serverContext?: ɵServerRenderContext): Promise<Response | null>;
    /**
     * Creates a promise that rejects when the request is aborted.
     *
     * @param request - The HTTP request to monitor for abortion.
     * @returns A promise that never resolves but rejects with an `AbortError` if the request is aborted.
     */
    private createAbortPromise;
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
    private handleRendering;
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
 * Represents the exports of an Angular server application entry point.
 */
declare interface EntryPointExports {
    /**
     * A reference to the function that creates an Angular server application instance.
     */
    ɵgetOrCreateAngularServerApp: typeof ɵgetOrCreateAngularServerApp;
    /**
     * A reference to the function that destroys the `AngularServerApp` instance.
     */
    ɵdestroyAngularServerApp: typeof ɵdestroyAngularServerApp;
}

/**
 * Defines the names of available hooks for registering and triggering custom logic within the application.
 */
declare type HookName = keyof HooksMapping;

/**
 * Manages a collection of hooks and provides methods to register and execute them.
 * Hooks are functions that can be invoked with specific arguments to allow modifications or enhancements.
 */
declare class Hooks {
    /**
     * A map of hook names to arrays of hook functions.
     * Each hook name can have multiple associated functions, which are executed in sequence.
     */
    private readonly store;
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
    on<Hook extends HookName>(name: Hook, handler: HooksMapping[Hook]): void;
    /**
     * Checks if there are any hooks registered under the specified name.
     *
     * @param name - The name of the hook to check.
     * @returns `true` if there are hooks registered under the specified name, otherwise `false`.
     */
    has(name: HookName): boolean;
}

/**
 * Mapping of hook names to their corresponding handler types.
 */
declare interface HooksMapping {
    'html:transform:pre': HtmlTransformHandler;
}


/**
 * Handler function type for HTML transformation hooks.
 * It takes an object containing the HTML content to be modified.
 *
 * @param ctx - The context object containing the HTML content.
 * @returns The modified HTML content or a promise that resolves to the modified HTML content.
 */
declare type HtmlTransformHandler = (ctx: {
    html: string;
}) => string | Promise<string>;

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
 * Describes metadata associated with a node in the route tree.
 * This metadata includes information such as the route path and optional redirect instructions.
 */
declare interface RouteTreeNodeMetadata {
    /**
     * Optional redirect path associated with this node.
     * This defines where to redirect if this route is matched.
     */
    redirectTo?: string;
    /**
     * The route path for this node.
     *
     * A "route" is a URL path or pattern that is used to navigate to different parts of a web application.
     * It is made up of one or more segments separated by slashes `/`. For instance, in the URL `/products/details/42`,
     * the full route is `/products/details/42`, with segments `products`, `details`, and `42`.
     *
     * Routes define how URLs map to views or components in an application. Each route segment contributes to
     * the overall path that determines which view or component is displayed.
     *
     * - **Static Routes**: These routes have fixed segments. For example, `/about` or `/contact`.
     * - **Parameterized Routes**: These include dynamic segments that act as placeholders, such as `/users/:id`,
     *   where `:id` could be any user ID.
     *
     * In the context of `RouteTreeNodeMetadata`, the `route` property represents the complete path that this node
     * in the route tree corresponds to. This path is used to determine how a specific URL in the browser maps to the
     * structure and content of the application.
     */
    route: string;
}


/**
 * Represents the serialized format of a route tree as an array of node metadata objects.
 * Each entry in the array corresponds to a specific node's metadata within the route tree.
 */
declare type SerializableRouteTreeNode = ReadonlyArray<RouteTreeNodeMetadata>;

/**
 * Destroys the existing `AngularServerApp` instance, releasing associated resources and resetting the
 * reference to `undefined`.
 *
 * This function is primarily used to enable the recreation of the `AngularServerApp` instance,
 * typically when server configuration or application state needs to be refreshed.
 */
export declare function ɵdestroyAngularServerApp(): void;

/**
 * Retrieves or creates an instance of `AngularServerApp`.
 * - If an instance of `AngularServerApp` already exists, it will return the existing one.
 * - If no instance exists, it will create a new one with the provided options.
 * @returns The existing or newly created instance of `AngularServerApp`.
 */
export declare function ɵgetOrCreateAngularServerApp(): AngularServerApp;

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

/**
 * Enum representing the different contexts in which server rendering can occur.
 */
export declare enum ɵServerRenderContext {
    SSR = "ssr",
    SSG = "ssg",
    AppShell = "app-shell"
}

/**
 * Sets the Angular app engine manifest.
 *
 * @param manifest - The engine manifest object to set.
 */
export declare function ɵsetAngularAppEngineManifest(manifest: AngularAppEngineManifest): void;

/**
 * Sets the Angular app manifest.
 *
 * @param manifest - The manifest object to set for the Angular application.
 */
export declare function ɵsetAngularAppManifest(manifest: AngularAppManifest): void;

export { }

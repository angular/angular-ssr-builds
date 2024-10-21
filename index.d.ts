import type { ApplicationRef } from '@angular/core';
import { default as default_2 } from 'critters';
import { EnvironmentProviders } from '@angular/core';
import type { Type } from '@angular/core';

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
export declare class AngularAppEngine {
    /**
     * Hooks for extending or modifying the behavior of the server application.
     * These hooks are used by the Angular CLI when running the development server and
     * provide extensibility points for the application lifecycle.
     *
     * @private
     */
    static ɵhooks: Hooks;
    /**
     * The manifest for the server application.
     */
    private readonly manifest;
    /**
     * A cache that holds entry points, keyed by their potential locale string.
     */
    private readonly entryPointsCache;
    /**
     * Renders a response for the given HTTP request using the server application.
     *
     * This method processes the request, determines the appropriate route and rendering context,
     * and returns an HTTP response.
     *
     * If the request URL appears to be for a file (excluding `/index.html`), the method returns `null`.
     * A request to `https://www.example.com/page/index.html` will render the Angular route
     * corresponding to `https://www.example.com/page`.
     *
     * @param request - The incoming HTTP request object to be rendered.
     * @param requestContext - Optional additional context for the request, such as metadata.
     * @returns A promise that resolves to a Response object, or `null` if the request URL represents a file (e.g., `./logo.png`)
     * rather than an application route.
     */
    render(request: Request, requestContext?: unknown): Promise<Response | null>;
    /**
     * Retrieves HTTP headers for a request associated with statically generated (SSG) pages,
     * based on the URL pathname.
     *
     * @param request - The incoming request object.
     * @returns A `Map` containing the HTTP headers as key-value pairs.
     * @note This function should be used exclusively for retrieving headers of SSG pages.
     */
    getPrerenderHeaders(request: Request): ReadonlyMap<string, string>;
    /**
     * Retrieves the exports for a specific entry point, caching the result.
     *
     * @param potentialLocale - The locale string used to find the corresponding entry point.
     * @returns A promise that resolves to the entry point exports or `undefined` if not found.
     */
    private getEntryPointExports;
    /**
     * Retrieves the entry point for a given URL by determining the locale and mapping it to
     * the appropriate application bundle.
     *
     * This method determines the appropriate entry point and locale for rendering the application by examining the URL.
     * If there is only one entry point available, it is returned regardless of the URL.
     * Otherwise, the method extracts a potential locale identifier from the URL and looks up the corresponding entry point.
     *
     * @param url - The URL of the request.
     * @returns A promise that resolves to the entry point exports or `undefined` if not found.
     */
    private getEntryPointExportsForUrl;
}

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
    readonly entryPoints: ReadonlyMap<string, () => Promise<EntryPointExports>>;
    /**
     * The base path for the server application.
     * This is used to determine the root path of the application.
     */
    readonly basePath: string;
    /**
     * A map that associates static paths with their corresponding HTTP headers.
     * Each entry in the map consists of:
     * - `key`: The static path as a string.
     * - `value`: An array of tuples, where each tuple contains:
     *   - `headerName`: The name of the HTTP header.
     *   - `headerValue`: The value of the HTTP header.
     */
    readonly staticPathsHeaders: ReadonlyMap<string, readonly [headerName: string, headerValue: string][]>;
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
    readonly assets: ReadonlyMap<string, () => Promise<string>>;
    /**
     * The bootstrap mechanism for the server application.
     * A function that returns a promise that resolves to an `NgModule` or a function
     * returning a promise that resolves to an `ApplicationRef`.
     */
    readonly bootstrap: () => Promise<AngularBootstrap>;
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
    /**
     * An optional string representing the locale or language code to be used for
     * the application, aiding with localization and rendering content specific to the locale.
     */
    readonly locale?: string;
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
     * An array of `RouteTreeNodeMetadata` objects representing the application's routes.
     *
     * Each `RouteTreeNodeMetadata` contains details about a specific route, such as its path and any
     * associated redirection targets. This array is asynchronously generated and
     * provides information on how routes are structured and resolved.
     */
    routes: RouteTreeNodeMetadata[];
    /**
     * Optional configuration for server routes.
     *
     * This property allows you to specify an array of server routes for configuration.
     * If not provided, the default configuration or behavior will be used.
     */
    serverRoutesConfig?: ServerRoute[] | null;
    /**
     * A list of errors encountered during the route extraction process.
     */
    errors: string[];
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
     * The bootstrap mechanism for the server application.
     */
    private boostrap;
    /**
     * Cache for storing critical CSS for pages.
     * Stores a maximum of MAX_INLINE_CSS_CACHE_ENTRIES entries.
     *
     * Uses an LRU (Least Recently Used) eviction policy, meaning that when the cache is full,
     * the least recently accessed page's critical CSS will be removed to make space for new entries.
     */
    private readonly criticalCssLRUCache;
    /**
     * Renders a response for the given HTTP request using the server application.
     *
     * This method processes the request and returns a response based on the specified rendering context.
     *
     * @param request - The incoming HTTP request to be rendered.
     * @param requestContext - Optional additional context for rendering, such as request metadata.
     *
     * @returns A promise that resolves to the HTTP response object resulting from the rendering, or null if no match is found.
     */
    render(request: Request, requestContext?: unknown): Promise<Response | null>;
    /**
     * Renders a page based on the provided URL via server-side rendering and returns the corresponding HTTP response.
     * The rendering process can be interrupted by an abort signal, where the first resolved promise (either from the abort
     * or the render process) will dictate the outcome.
     *
     * @param url - The full URL to be processed and rendered by the server.
     * @param signal - (Optional) An `AbortSignal` object that allows for the cancellation of the rendering process.
     * @returns A promise that resolves to the generated HTTP response object, or `null` if no matching route is found.
     */
    renderStatic(url: URL, signal?: AbortSignal): Promise<Response | null>;
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
     * @param isSsrMode - A boolean indicating whether the rendering is performed in server-side rendering (SSR) mode.
     * @param requestContext - Optional additional context for rendering, such as request metadata.
     *
     * @returns A promise that resolves to the rendered response, or null if no matching route is found.
     */
    private handleRendering;
}

/**
 * Annotates a request handler function with metadata, marking it as a special
 * handler.
 *
 * @param handler - The request handler function to be annotated.
 * @returns The same handler function passed in, with metadata attached.
 *
 * @example
 * Example usage in a Hono application:
 * ```ts
 * const app = new Hono();
 * export default createRequestHandler(app.fetch);
 * ```
 *
 * @example
 * Example usage in a H3 application:
 * ```ts
 * const app = createApp();
 * const handler = toWebHandler(app);
 * export default createRequestHandler(handler);
 * ```
 * @developerPreview
 */
export declare function createRequestHandler(handler: RequestHandlerFunction): RequestHandlerFunction;

declare interface CrittersBase {
    embedLinkedStylesheet(link: PartialHTMLElement, document: PartialDocument): Promise<unknown>;
}

declare class CrittersBase extends default_2 {
}

/**
 * Represents the exports of an Angular server application entry point.
 */
declare interface EntryPointExports {
    /**
     * A reference to the function that creates an Angular server application instance.
     *
     * @note The return type is `unknown` to prevent circular dependency issues.
     */
    ɵgetOrCreateAngularServerApp: () => unknown;
    /**
     * A reference to the function that destroys the `AngularServerApp` instance.
     */
    ɵdestroyAngularServerApp: () => void;
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
 * Defines a handler function type for transforming HTML content.
 * This function receives an object with the HTML to be processed.
 *
 * @param ctx - An object containing the URL and HTML content to be transformed.
 * @returns The transformed HTML as a string or a promise that resolves to the transformed HTML.
 */
declare type HtmlTransformHandler = (ctx: {
    url: URL;
    html: string;
}) => string | Promise<string>;

/** Partial representation of an HTML `Document`. */
declare interface PartialDocument {
    head: PartialHTMLElement;
    createElement(tagName: string): PartialHTMLElement;
    querySelector(selector: string): PartialHTMLElement | null;
}

/** Partial representation of an `HTMLElement`. */
declare interface PartialHTMLElement {
    getAttribute(name: string): string | null;
    setAttribute(name: string, value: string): void;
    hasAttribute(name: string): boolean;
    removeAttribute(name: string): void;
    appendChild(child: PartialHTMLElement): void;
    insertBefore(newNode: PartialHTMLElement, referenceNode?: PartialHTMLElement): void;
    remove(): void;
    name: string;
    textContent: string;
    tagName: string | null;
    children: PartialHTMLElement[];
    next: PartialHTMLElement | null;
    prev: PartialHTMLElement | null;
}

/**
 * Defines the fallback strategies for Static Site Generation (SSG) routes when a pre-rendered path is not available.
 * This is particularly relevant for routes with parameterized URLs where some paths might not be pre-rendered at build time.
 *
 * @developerPreview
 */
export declare enum PrerenderFallback {
    /**
     * Fallback to Server-Side Rendering (SSR) if the pre-rendered path is not available.
     * This strategy dynamically generates the page on the server at request time.
     */
    Server = 0,
    /**
     * Fallback to Client-Side Rendering (CSR) if the pre-rendered path is not available.
     * This strategy allows the page to be rendered on the client side.
     */
    Client = 1,
    /**
     * No fallback; if the path is not pre-rendered, the server will not handle the request.
     * This means the application will not provide any response for paths that are not pre-rendered.
     */
    None = 2
}

/**
 * Configures the necessary providers for server routes configuration.
 *
 * @param routes - An array of server routes to be provided.
 * @returns An `EnvironmentProviders` object that contains the server routes configuration.
 * @developerPreview
 */
export declare function provideServerRoutesConfig(routes: ServerRoute[]): EnvironmentProviders;

/**
 * Different rendering modes for server routes.
 * @developerPreview
 */
export declare enum RenderMode {
    /** AppShell rendering mode, typically used for pre-rendered shells of the application. */
    AppShell = 0,
    /** Server-Side Rendering (SSR) mode, where content is rendered on the server for each request. */
    Server = 1,
    /** Client-Side Rendering (CSR) mode, where content is rendered on the client side in the browser. */
    Client = 2,
    /** Static Site Generation (SSG) mode, where content is pre-rendered at build time and served as static files. */
    Prerender = 3
}


/**
 * Function for handling HTTP requests in a web environment.
 *
 * @param request - The incoming HTTP request object.
 * @returns A Promise resolving to a `Response` object, `null`, or directly a `Response`,
 * supporting both synchronous and asynchronous handling.
 */
declare type RequestHandlerFunction = (request: Request) => Promise<Response | null> | null | Response;

/**
 * A route tree implementation that supports efficient route matching, including support for wildcard routes.
 * This structure is useful for organizing and retrieving routes in a hierarchical manner,
 * enabling complex routing scenarios with nested paths.
 *
 * @typeParam AdditionalMetadata - Type of additional metadata that can be associated with route nodes.
 */
declare class RouteTree<AdditionalMetadata extends Record<string, unknown> = {}> {
    /**
     * The root node of the route tree.
     * All routes are stored and accessed relative to this root node.
     */
    private readonly root;
    /**
     * A counter that tracks the order of route insertion.
     * This ensures that routes are matched in the order they were defined,
     * with earlier routes taking precedence.
     */
    private insertionIndexCounter;
    /**
     * Inserts a new route into the route tree.
     * The route is broken down into segments, and each segment is added to the tree.
     * Parameterized segments (e.g., :id) are normalized to wildcards (*) for matching purposes.
     *
     * @param route - The route path to insert into the tree.
     * @param metadata - Metadata associated with the route, excluding the route path itself.
     */
    insert(route: string, metadata: RouteTreeNodeMetadataWithoutRoute & AdditionalMetadata): void;
    /**
     * Matches a given route against the route tree and returns the best matching route's metadata.
     * The best match is determined by the lowest insertion index, meaning the earliest defined route
     * takes precedence.
     *
     * @param route - The route path to match against the route tree.
     * @returns The metadata of the best matching route or `undefined` if no match is found.
     */
    match(route: string): (RouteTreeNodeMetadata & AdditionalMetadata) | undefined;
    /**
     * Converts the route tree into a serialized format representation.
     * This method converts the route tree into an array of metadata objects that describe the structure of the tree.
     * The array represents the routes in a nested manner where each entry includes the route and its associated metadata.
     *
     * @returns An array of `RouteTreeNodeMetadata` objects representing the route tree structure.
     *          Each object includes the `route` and associated metadata of a route.
     */
    toObject(): SerializableRouteTreeNode;
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
    static fromObject(value: SerializableRouteTreeNode): RouteTree;
    /**
     * A generator function that recursively traverses the route tree and yields the metadata of each node.
     * This allows for easy and efficient iteration over all nodes in the tree.
     *
     * @param node - The current node to start the traversal from. Defaults to the root node of the tree.
     */
    traverse(node?: RouteTreeNode<AdditionalMetadata>): Generator<RouteTreeNodeMetadata & AdditionalMetadata>;
    /**
     * Extracts the path segments from a given route string.
     *
     * @param route - The route string from which to extract segments.
     * @returns An array of path segments.
     */
    private getPathSegments;
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
    private traverseBySegments;
    /**
     * Compares two nodes and returns the node with higher priority based on insertion index.
     * A node with a lower insertion index is prioritized as it was defined earlier.
     *
     * @param currentBestMatchNode - The current best match node.
     * @param candidateNode - The node being evaluated for higher priority based on insertion index.
     * @returns The node with higher priority (i.e., lower insertion index). If one of the nodes is `undefined`, the other node is returned.
     */
    private getHigherPriorityNode;
    /**
     * Creates an empty route tree node with the specified segment.
     * This helper function is used during the tree construction.
     *
     * @param segment - The route segment that this node represents.
     * @returns A new, empty route tree node.
     */
    private createEmptyRouteTreeNode;
}

/**
 * Represents a node within the route tree structure.
 * Each node corresponds to a route segment and may have associated metadata and child nodes.
 * The `AdditionalMetadata` type parameter allows for extending the node metadata with custom data.
 */
declare interface RouteTreeNode<AdditionalMetadata extends Record<string, unknown>> {
    /**
     * The segment value associated with this node.
     * A segment is a single part of a route path, typically delimited by slashes (`/`).
     * For example, in the route `/users/:id/profile`, the segments are `users`, `:id`, and `profile`.
     * Segments can also be wildcards (`*`), which match any segment in that position of the route.
     */
    segment: string;
    /**
     * The index indicating the order in which the route was inserted into the tree.
     * This index helps determine the priority of routes during matching, with lower indexes
     * indicating earlier inserted routes.
     */
    insertionIndex: number;
    /**
     * A map of child nodes, keyed by their corresponding route segment or wildcard.
     */
    children: Map<string, RouteTreeNode<AdditionalMetadata>>;
    /**
     * Optional metadata associated with this node, providing additional information such as redirects.
     */
    metadata?: RouteTreeNodeMetadata & AdditionalMetadata;
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
    /**
     * Optional status code to return for this route.
     */
    status?: number;
    /**
     * Optional additional headers to include in the response for this route.
     */
    headers?: Record<string, string>;
    /**
     * Specifies the rendering mode used for this route.
     * If not provided, the default rendering mode for the application will be used.
     */
    renderMode?: RenderMode;
}

/**
 * Represents metadata for a route tree node, excluding the 'route' path segment.
 */
declare type RouteTreeNodeMetadataWithoutRoute = Omit<RouteTreeNodeMetadata, 'route'>;

/**
 * Represents the serialized format of a route tree as an array of node metadata objects.
 * Each entry in the array corresponds to a specific node's metadata within the route tree.
 */
declare type SerializableRouteTreeNode = ReadonlyArray<RouteTreeNodeMetadata>;

/**
 * Server route configuration.
 * @developerPreview
 */
export declare type ServerRoute = ServerRouteAppShell | ServerRouteClient | ServerRoutePrerender | ServerRoutePrerenderWithParams | ServerRouteServer;

/**
 * A server route that uses AppShell rendering mode.
 */
declare interface ServerRouteAppShell extends Omit<ServerRouteCommon, 'headers' | 'status'> {
    /** Specifies that the route uses AppShell rendering mode. */
    renderMode: RenderMode.AppShell;
}

/**
 * A server route that uses Client-Side Rendering (CSR) mode.
 */
declare interface ServerRouteClient extends ServerRouteCommon {
    /** Specifies that the route uses Client-Side Rendering (CSR) mode. */
    renderMode: RenderMode.Client;
}

/**
 * Common interface for server routes, providing shared properties.
 */
declare interface ServerRouteCommon {
    /** The path associated with this route. */
    path: string;
    /** Optional additional headers to include in the response for this route. */
    headers?: Record<string, string>;
    /** Optional status code to return for this route. */
    status?: number;
}

/**
 * A server route that uses Static Site Generation (SSG) mode.
 */
declare interface ServerRoutePrerender extends Omit<ServerRouteCommon, 'status'> {
    /** Specifies that the route uses Static Site Generation (SSG) mode. */
    renderMode: RenderMode.Prerender;
    /** Fallback cannot be specified unless `getPrerenderParams` is used. */
    fallback?: never;
}

/**
 * A server route configuration that uses Static Site Generation (SSG) mode, including support for routes with parameters.
 */
declare interface ServerRoutePrerenderWithParams extends Omit<ServerRoutePrerender, 'fallback'> {
    /**
     * Optional strategy to use if the SSG path is not pre-rendered.
     * This is especially relevant for routes with parameterized URLs, where some paths may not be pre-rendered at build time.
     *
     * This property determines how to handle requests for paths that are not pre-rendered:
     * - `PrerenderFallback.Server`: Use Server-Side Rendering (SSR) to dynamically generate the page at request time.
     * - `PrerenderFallback.Client`: Use Client-Side Rendering (CSR) to fetch and render the page on the client side.
     * - `PrerenderFallback.None`: No fallback; if the path is not pre-rendered, the server will not handle the request.
     *
     * @default `PrerenderFallback.Server` if not provided.
     */
    fallback?: PrerenderFallback;
    /**
     * A function that returns a Promise resolving to an array of objects, each representing a route path with URL parameters.
     * This function runs in the injector context, allowing access to Angular services and dependencies.
     *
     * @returns A Promise resolving to an array where each element is an object with string keys (representing URL parameter names)
     * and string values (representing the corresponding values for those parameters in the route path).
     *
     * @example
     * ```typescript
     * export const serverRouteConfig: ServerRoutes[] = [
     *   {
     *     path: '/product/:id',
     *     renderMode: RenderMode.Prerender,
     *     async getPrerenderParams() {
     *       const productService = inject(ProductService);
     *       const ids = await productService.getIds(); // Assuming this returns ['1', '2', '3']
     *
     *       return ids.map(id => ({ id })); // Generates paths like: [{ id: '1' }, { id: '2' }, { id: '3' }]
     *     },
     *   },
     * ];
     * ```
     */
    getPrerenderParams: () => Promise<Record<string, string>[]>;
}

/**
 * A server route that uses Server-Side Rendering (SSR) mode.
 */
declare interface ServerRouteServer extends ServerRouteCommon {
    /** Specifies that the route uses Server-Side Rendering (SSR) mode. */
    renderMode: RenderMode.Server;
}

/**
 * Destroys the existing `AngularServerApp` instance, releasing associated resources and resetting the
 * reference to `undefined`.
 *
 * This function is primarily used to enable the recreation of the `AngularServerApp` instance,
 * typically when server configuration or application state needs to be refreshed.
 */
export declare function ɵdestroyAngularServerApp(): void;

/**
 * Asynchronously extracts routes from the Angular application configuration
 * and creates a `RouteTree` to manage server-side routing.
 *
 * @param url - The URL for server-side rendering. The URL is used to configure `ServerPlatformLocation`. This configuration is crucial
 * for ensuring that API requests for relative paths succeed, which is essential for accurate route extraction.
 * See:
 *  - https://github.com/angular/angular/blob/d608b857c689d17a7ffa33bbb510301014d24a17/packages/platform-server/src/location.ts#L51
 *  - https://github.com/angular/angular/blob/6882cc7d9eed26d3caeedca027452367ba25f2b9/packages/platform-server/src/http.ts#L44
 * @param manifest - An optional `AngularAppManifest` that contains the application's routing and configuration details.
 * If not provided, the default manifest is retrieved using `getAngularAppManifest()`.
 * @param invokeGetPrerenderParams - A boolean flag indicating whether to invoke `getPrerenderParams` for parameterized SSG routes
 * to handle prerendering paths. Defaults to `false`.
 * @param includePrerenderFallbackRoutes - A flag indicating whether to include fallback routes in the result. Defaults to `true`.
 *
 * @returns A promise that resolves to an object containing:
 *  - `routeTree`: A populated `RouteTree` containing all extracted routes from the Angular application.
 *  - `errors`: An array of strings representing any errors encountered during the route extraction process.
 */
export declare function ɵextractRoutesAndCreateRouteTree(url: URL, manifest?: AngularAppManifest, invokeGetPrerenderParams?: boolean, includePrerenderFallbackRoutes?: boolean): Promise<{
    routeTree: RouteTree;
    errors: string[];
}>;

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
 * and function-based bootstrapping. It yields the resulting routes as `RouteTreeNodeMetadata` objects or errors.
 *
 * @param bootstrap - A function that returns a promise resolving to an `ApplicationRef` or an Angular module to bootstrap.
 * @param document - The initial HTML document used for server-side rendering.
 * This document is necessary to render the application on the server.
 * @param url - The URL for server-side rendering. The URL is used to configure `ServerPlatformLocation`. This configuration is crucial
 * for ensuring that API requests for relative paths succeed, which is essential for accurate route extraction.
 * @param invokeGetPrerenderParams - A boolean flag indicating whether to invoke `getPrerenderParams` for parameterized SSG routes
 * to handle prerendering paths. Defaults to `false`.
 * @param includePrerenderFallbackRoutes - A flag indicating whether to include fallback routes in the result. Defaults to `true`.
 *
 * @returns A promise that resolves to an object of type `AngularRouterConfigResult` or errors.
 */
export declare function ɵgetRoutesFromAngularRouterConfig(bootstrap: AngularBootstrap, document: string, url: URL, invokeGetPrerenderParams?: boolean, includePrerenderFallbackRoutes?: boolean): Promise<AngularRouterConfigResult>;

export declare class ɵInlineCriticalCssProcessor extends CrittersBase {
    readFile: (path: string) => Promise<string>;
    readonly outputPath?: string | undefined;
    private addedCspScriptsDocuments;
    private documentNonces;
    constructor(readFile: (path: string) => Promise<string>, outputPath?: string | undefined);
    /**
     * Override of the Critters `embedLinkedStylesheet` method
     * that makes it work with Angular's CSP APIs.
     */
    embedLinkedStylesheet(link: PartialHTMLElement, document: PartialDocument): Promise<unknown>;
    /**
     * Finds the CSP nonce for a specific document.
     */
    private findCspNonce;
    /**
     * Inserts the `script` tag that swaps the critical CSS at runtime,
     * if one hasn't been inserted into the document already.
     */
    private conditionallyInsertCspLoadingScript;
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

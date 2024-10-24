import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { ɵConsole as _Console, InjectionToken, makeEnvironmentProviders, runInInjectionContext, createPlatformFactory, platformCore, ApplicationRef, ɵwhenStable as _whenStable, Compiler, LOCALE_ID, ɵresetCompiledComponents as _resetCompiledComponents } from '@angular/core';
import { ɵSERVER_CONTEXT as _SERVER_CONTEXT, renderModule, renderApplication, INITIAL_CONFIG, ɵINTERNAL_SERVER_PLATFORM_PROVIDERS as _INTERNAL_SERVER_PLATFORM_PROVIDERS } from '@angular/platform-server';
import { ɵloadChildren as _loadChildren, Router } from '@angular/router';
import { REQUEST, REQUEST_CONTEXT, RESPONSE_INIT } from '@angular/ssr/tokens';
import Critters from '../third_party/critters/index.js';

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
 * Removes the trailing slash from a URL if it exists.
 *
 * @param url - The URL string from which to remove the trailing slash.
 * @returns The URL string without a trailing slash.
 *
 * @example
 * ```js
 * stripTrailingSlash('path/'); // 'path'
 * stripTrailingSlash('/path');  // '/path'
 * stripTrailingSlash('/'); // '/'
 * stripTrailingSlash(''); // ''
 * ```
 */
function stripTrailingSlash(url) {
    // Check if the last character of the URL is a slash
    return url.length > 1 && url[url.length - 1] === '/' ? url.slice(0, -1) : url;
}
/**
 * Removes the leading slash from a URL if it exists.
 *
 * @param url - The URL string from which to remove the leading slash.
 * @returns The URL string without a leading slash.
 *
 * @example
 * ```js
 * stripLeadingSlash('/path'); // 'path'
 * stripLeadingSlash('/path/');  // 'path/'
 * stripLeadingSlash('/'); // '/'
 * stripLeadingSlash(''); // ''
 * ```
 */
function stripLeadingSlash(url) {
    // Check if the first character of the URL is a slash
    return url.length > 1 && url[0] === '/' ? url.slice(1) : url;
}
/**
 * Adds a leading slash to a URL if it does not already have one.
 *
 * @param url - The URL string to which the leading slash will be added.
 * @returns The URL string with a leading slash.
 *
 * @example
 * ```js
 * addLeadingSlash('path'); // '/path'
 * addLeadingSlash('/path'); // '/path'
 * ```
 */
function addLeadingSlash(url) {
    // Check if the URL already starts with a slash
    return url[0] === '/' ? url : `/${url}`;
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
 * joinUrlParts('', ''); // '/'
 * ```
 */
function joinUrlParts(...parts) {
    const normalizeParts = [];
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
    return addLeadingSlash(normalizeParts.join('/'));
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
 * @param serverContext - A string representing the server context, used to provide additional
 *                        context or metadata during server-side rendering.
 * @returns A promise that resolves to a string containing the rendered HTML.
 */
function renderAngular(html, bootstrap, url, platformProviders, serverContext) {
    const providers = [
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
        ...platformProviders,
    ];
    // A request to `http://www.example.com/page/index.html` will render the Angular route corresponding to `http://www.example.com/page`.
    const urlToRender = stripIndexHtmlFromURL(url).toString();
    return isNgModule(bootstrap)
        ? renderModule(bootstrap, {
            url: urlToRender,
            document: html,
            extraProviders: providers,
        })
        : renderApplication(bootstrap, {
            url: urlToRender,
            document: html,
            platformProviders: providers,
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
 * Different rendering modes for server routes.
 * @developerPreview
 */
var RenderMode;
(function (RenderMode) {
    /** AppShell rendering mode, typically used for pre-rendered shells of the application. */
    RenderMode[RenderMode["AppShell"] = 0] = "AppShell";
    /** Server-Side Rendering (SSR) mode, where content is rendered on the server for each request. */
    RenderMode[RenderMode["Server"] = 1] = "Server";
    /** Client-Side Rendering (CSR) mode, where content is rendered on the client side in the browser. */
    RenderMode[RenderMode["Client"] = 2] = "Client";
    /** Static Site Generation (SSG) mode, where content is pre-rendered at build time and served as static files. */
    RenderMode[RenderMode["Prerender"] = 3] = "Prerender";
})(RenderMode || (RenderMode = {}));
/**
 * Defines the fallback strategies for Static Site Generation (SSG) routes when a pre-rendered path is not available.
 * This is particularly relevant for routes with parameterized URLs where some paths might not be pre-rendered at build time.
 *
 * @developerPreview
 */
var PrerenderFallback;
(function (PrerenderFallback) {
    /**
     * Fallback to Server-Side Rendering (SSR) if the pre-rendered path is not available.
     * This strategy dynamically generates the page on the server at request time.
     */
    PrerenderFallback[PrerenderFallback["Server"] = 0] = "Server";
    /**
     * Fallback to Client-Side Rendering (CSR) if the pre-rendered path is not available.
     * This strategy allows the page to be rendered on the client side.
     */
    PrerenderFallback[PrerenderFallback["Client"] = 1] = "Client";
    /**
     * No fallback; if the path is not pre-rendered, the server will not handle the request.
     * This means the application will not provide any response for paths that are not pre-rendered.
     */
    PrerenderFallback[PrerenderFallback["None"] = 2] = "None";
})(PrerenderFallback || (PrerenderFallback = {}));
/**
 * Token for providing the server routes configuration.
 * @internal
 */
const SERVER_ROUTES_CONFIG = new InjectionToken('SERVER_ROUTES_CONFIG');
/**
 * Configures the necessary providers for server routes configuration.
 *
 * @param routes - An array of server routes to be provided.
 * @returns An `EnvironmentProviders` object that contains the server routes configuration.
 * @developerPreview
 */
function provideServerRoutesConfig(routes) {
    return makeEnvironmentProviders([
        {
            provide: SERVER_ROUTES_CONFIG,
            useValue: routes,
        },
    ]);
}

/**
 * A route tree implementation that supports efficient route matching, including support for wildcard routes.
 * This structure is useful for organizing and retrieving routes in a hierarchical manner,
 * enabling complex routing scenarios with nested paths.
 *
 * @typeParam AdditionalMetadata - Type of additional metadata that can be associated with route nodes.
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
        const segments = this.getPathSegments(route);
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
            route: segments.join('/'),
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
        const segments = this.getPathSegments(route);
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
     * Extracts the path segments from a given route string.
     *
     * @param route - The route string from which to extract segments.
     * @returns An array of path segments.
     */
    getPathSegments(route) {
        return stripTrailingSlash(route).split('/');
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
 * Regular expression to match segments preceded by a colon in a string.
 */
const URL_PARAMETER_REGEXP = /(?<!\\):([^/]+)/g;
/**
 * An set of HTTP status codes that are considered valid for redirect responses.
 */
const VALID_REDIRECT_RESPONSE_CODES = new Set([301, 302, 303, 307, 308]);
/**
 * Traverses an array of route configurations to generate route tree node metadata.
 *
 * This function processes each route and its children, handling redirects, SSG (Static Site Generation) settings,
 * and lazy-loaded routes. It yields route metadata for each route and its potential variants.
 *
 * @param options - The configuration options for traversing routes.
 * @returns An async iterable iterator yielding either route tree node metadata or an error object with an error message.
 */
async function* traverseRoutesConfig(options) {
    const { routes, compiler, parentInjector, parentRoute, serverConfigRouteTree, invokeGetPrerenderParams, includePrerenderFallbackRoutes, } = options;
    for (const route of routes) {
        try {
            const { path = '', redirectTo, loadChildren, children } = route;
            const currentRoutePath = joinUrlParts(parentRoute, path);
            // Get route metadata from the server config route tree, if available
            let matchedMetaData;
            if (serverConfigRouteTree) {
                matchedMetaData = serverConfigRouteTree.match(currentRoutePath);
                if (!matchedMetaData) {
                    yield {
                        error: `The '${stripLeadingSlash(currentRoutePath)}' route does not match any route defined in the server routing configuration. ` +
                            'Please ensure this route is added to the server routing configuration.',
                    };
                    continue;
                }
                matchedMetaData.presentInClientRouter = true;
            }
            const metadata = {
                ...matchedMetaData,
                route: currentRoutePath,
            };
            delete metadata.presentInClientRouter;
            // Handle redirects
            if (typeof redirectTo === 'string') {
                const redirectToResolved = resolveRedirectTo(currentRoutePath, redirectTo);
                if (metadata.status && !VALID_REDIRECT_RESPONSE_CODES.has(metadata.status)) {
                    yield {
                        error: `The '${metadata.status}' status code is not a valid redirect response code. ` +
                            `Please use one of the following redirect response codes: ${[...VALID_REDIRECT_RESPONSE_CODES.values()].join(', ')}.`,
                    };
                    continue;
                }
                yield { ...metadata, redirectTo: redirectToResolved };
            }
            else if (metadata.renderMode === RenderMode.Prerender) {
                // Handle SSG routes
                yield* handleSSGRoute(metadata, parentInjector, invokeGetPrerenderParams, includePrerenderFallbackRoutes);
            }
            else {
                yield metadata;
            }
            // Recursively process child routes
            if (children?.length) {
                yield* traverseRoutesConfig({
                    ...options,
                    routes: children,
                    parentRoute: currentRoutePath,
                });
            }
            // Load and process lazy-loaded child routes
            if (loadChildren) {
                const loadedChildRoutes = await _loadChildren(route, compiler, parentInjector).toPromise();
                if (loadedChildRoutes) {
                    const { routes: childRoutes, injector = parentInjector } = loadedChildRoutes;
                    yield* traverseRoutesConfig({
                        ...options,
                        routes: childRoutes,
                        parentInjector: injector,
                        parentRoute: currentRoutePath,
                    });
                }
            }
        }
        catch (error) {
            yield {
                error: `Error processing route '${stripLeadingSlash(route.path ?? '')}': ${error.message}`,
            };
        }
    }
}
/**
 * Handles SSG (Static Site Generation) routes by invoking `getPrerenderParams` and yielding
 * all parameterized paths, returning any errors encountered.
 *
 * @param metadata - The metadata associated with the route tree node.
 * @param parentInjector - The dependency injection container for the parent route.
 * @param invokeGetPrerenderParams - A flag indicating whether to invoke the `getPrerenderParams` function.
 * @param includePrerenderFallbackRoutes - A flag indicating whether to include fallback routes in the result.
 * @returns An async iterable iterator that yields route tree node metadata for each SSG path or errors.
 */
async function* handleSSGRoute(metadata, parentInjector, invokeGetPrerenderParams, includePrerenderFallbackRoutes) {
    if (metadata.renderMode !== RenderMode.Prerender) {
        throw new Error(`'handleSSGRoute' was called for a route which rendering mode is not prerender.`);
    }
    const { route: currentRoutePath, fallback, ...meta } = metadata;
    const getPrerenderParams = 'getPrerenderParams' in meta ? meta.getPrerenderParams : undefined;
    if ('getPrerenderParams' in meta) {
        delete meta['getPrerenderParams'];
    }
    if (!URL_PARAMETER_REGEXP.test(currentRoutePath)) {
        // Route has no parameters
        yield {
            ...meta,
            route: currentRoutePath,
        };
        return;
    }
    if (invokeGetPrerenderParams) {
        if (!getPrerenderParams) {
            yield {
                error: `The '${stripLeadingSlash(currentRoutePath)}' route uses prerendering and includes parameters, but 'getPrerenderParams' ` +
                    `is missing. Please define 'getPrerenderParams' function for this route in your server routing configuration ` +
                    `or specify a different 'renderMode'.`,
            };
            return;
        }
        const parameters = await runInInjectionContext(parentInjector, () => getPrerenderParams());
        try {
            for (const params of parameters) {
                const routeWithResolvedParams = currentRoutePath.replace(URL_PARAMETER_REGEXP, (match) => {
                    const parameterName = match.slice(1);
                    const value = params[parameterName];
                    if (typeof value !== 'string') {
                        throw new Error(`The 'getPrerenderParams' function defined for the '${stripLeadingSlash(currentRoutePath)}' route ` +
                            `returned a non-string value for parameter '${parameterName}'. ` +
                            `Please make sure the 'getPrerenderParams' function returns values for all parameters ` +
                            'specified in this route.');
                    }
                    return value;
                });
                yield { ...meta, route: routeWithResolvedParams };
            }
        }
        catch (error) {
            yield { error: `${error.message}` };
            return;
        }
    }
    // Handle fallback render modes
    if (includePrerenderFallbackRoutes &&
        (fallback !== PrerenderFallback.None || !invokeGetPrerenderParams)) {
        yield {
            ...meta,
            route: currentRoutePath,
            renderMode: fallback === PrerenderFallback.Client ? RenderMode.Client : RenderMode.Server,
        };
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
 * Builds a server configuration route tree from the given server routes configuration.
 *
 * @param serverRoutesConfig - The array of server routes to be used for configuration.

 * @returns An object containing:
 * - `serverConfigRouteTree`: A populated `RouteTree` instance, which organizes the server routes
 *   along with their additional metadata.
 * - `errors`: An array of strings that list any errors encountered during the route tree construction
 *   process, such as invalid paths.
 */
function buildServerConfigRouteTree(serverRoutesConfig) {
    const serverConfigRouteTree = new RouteTree();
    const errors = [];
    for (const { path, ...metadata } of serverRoutesConfig) {
        if (path[0] === '/') {
            errors.push(`Invalid '${path}' route configuration: the path cannot start with a slash.`);
            continue;
        }
        serverConfigRouteTree.insert(path, metadata);
    }
    return { serverConfigRouteTree, errors };
}
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
async function getRoutesFromAngularRouterConfig(bootstrap, document, url, invokeGetPrerenderParams = false, includePrerenderFallbackRoutes = true) {
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
        const errors = [];
        const baseHref = injector.get(APP_BASE_HREF, null, { optional: true }) ??
            injector.get(PlatformLocation).getBaseHrefFromDOM();
        if (router.config.length) {
            const compiler = injector.get(Compiler);
            const serverRoutesConfig = injector.get(SERVER_ROUTES_CONFIG, null, { optional: true });
            let serverConfigRouteTree;
            if (serverRoutesConfig) {
                const result = buildServerConfigRouteTree(serverRoutesConfig);
                serverConfigRouteTree = result.serverConfigRouteTree;
                errors.push(...result.errors);
            }
            if (errors.length) {
                return {
                    baseHref,
                    routes: routesResults,
                    errors,
                };
            }
            // Retrieve all routes from the Angular router configuration.
            const traverseRoutes = traverseRoutesConfig({
                routes: router.config,
                compiler,
                parentInjector: injector,
                parentRoute: '',
                serverConfigRouteTree,
                invokeGetPrerenderParams,
                includePrerenderFallbackRoutes,
            });
            let seenAppShellRoute;
            for await (const result of traverseRoutes) {
                if ('error' in result) {
                    errors.push(result.error);
                }
                else {
                    if (result.renderMode === RenderMode.AppShell) {
                        if (seenAppShellRoute !== undefined) {
                            errors.push(`Error: Both '${seenAppShellRoute}' and '${stripLeadingSlash(result.route)}' routes have ` +
                                `their 'renderMode' set to 'AppShell'. AppShell renderMode should only be assigned to one route. ` +
                                `Please review your route configurations to ensure that only one route is set to 'RenderMode.AppShell'.`);
                        }
                        seenAppShellRoute = stripLeadingSlash(result.route);
                    }
                    routesResults.push(result);
                }
            }
            if (serverConfigRouteTree) {
                for (const { route, presentInClientRouter } of serverConfigRouteTree.traverse()) {
                    if (presentInClientRouter || route === '**') {
                        // Skip if matched or it's the catch-all route.
                        continue;
                    }
                    errors.push(`The '${route}' server route does not match any routes defined in the Angular ` +
                        `routing configuration (typically provided as a part of the 'provideRouter' call). ` +
                        'Please make sure that the mentioned server route is present in the Angular routing configuration.');
                }
            }
        }
        else {
            routesResults.push({ route: '', renderMode: RenderMode.Prerender });
        }
        return {
            baseHref,
            routes: routesResults,
            errors,
        };
    }
    finally {
        platformRef.destroy();
    }
}
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
async function extractRoutesAndCreateRouteTree(url, manifest = getAngularAppManifest(), invokeGetPrerenderParams = false, includePrerenderFallbackRoutes = true) {
    const routeTree = new RouteTree();
    const document = await new ServerAssets(manifest).getIndexServerHtml();
    const bootstrap = await manifest.bootstrap();
    const { baseHref, routes, errors } = await getRoutesFromAngularRouterConfig(bootstrap, document, url, invokeGetPrerenderParams, includePrerenderFallbackRoutes);
    for (const { route, ...metadata } of routes) {
        if (metadata.redirectTo !== undefined) {
            metadata.redirectTo = joinUrlParts(baseHref, metadata.redirectTo);
        }
        const fullRoute = joinUrlParts(baseHref, route);
        routeTree.insert(fullRoute, metadata);
    }
    return {
        routeTree,
        errors,
    };
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
        ServerRouter.#extractionPromise ??= extractRoutesAndCreateRouteTree(url, manifest)
            .then(({ routeTree, errors }) => {
            if (errors.length > 0) {
                throw new Error('Error(s) occurred while extracting routes:\n' +
                    errors.map((error) => `- ${error}`).join('\n'));
            }
            return new ServerRouter(routeTree);
        })
            .finally(() => {
            ServerRouter.#extractionPromise = undefined;
        });
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
 * Generates a SHA-256 hash of the provided string.
 *
 * @param data - The input string to be hashed.
 * @returns A promise that resolves to the SHA-256 hash of the input,
 * represented as a hexadecimal string.
 */
async function sha256(data) {
    const encodedData = new TextEncoder().encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encodedData);
    const hashParts = [];
    for (const h of new Uint8Array(hashBuffer)) {
        hashParts.push(h.toString(16).padStart(2, '0'));
    }
    return hashParts.join('');
}

/**
 * Pattern used to extract the media query set by Critters in an `onload` handler.
 */
const MEDIA_SET_HANDLER_PATTERN = /^this\.media=["'](.*)["'];?$/;
/**
 * Name of the attribute used to save the Critters media query so it can be re-assigned on load.
 */
const CSP_MEDIA_ATTR = 'ngCspMedia';
/**
 * Script that dynamically updates the `media` attribute of `<link>` tags based on a custom attribute (`CSP_MEDIA_ATTR`).
 *
 * NOTE:
 * We do not use `document.querySelectorAll('link').forEach((s) => s.addEventListener('load', ...)`
 * because load events are not always triggered reliably on Chrome.
 * See: https://github.com/angular/angular-cli/issues/26932 and https://crbug.com/1521256
 *
 * The script:
 * - Ensures the event target is a `<link>` tag with the `CSP_MEDIA_ATTR` attribute.
 * - Updates the `media` attribute with the value of `CSP_MEDIA_ATTR` and then removes the attribute.
 * - Removes the event listener when all relevant `<link>` tags have been processed.
 * - Uses event capturing (the `true` parameter) since load events do not bubble up the DOM.
 */
const LINK_LOAD_SCRIPT_CONTENT = `
(() => {
  const CSP_MEDIA_ATTR = '${CSP_MEDIA_ATTR}';
  const documentElement = document.documentElement;

  // Listener for load events on link tags.
  const listener = (e) => {
    const target = e.target;
    if (
      !target ||
      target.tagName !== 'LINK' ||
      !target.hasAttribute(CSP_MEDIA_ATTR)
    ) {
      return;
    }

    target.media = target.getAttribute(CSP_MEDIA_ATTR);
    target.removeAttribute(CSP_MEDIA_ATTR);

    if (!document.head.querySelector(\`link[\${CSP_MEDIA_ATTR}]\`)) {
      documentElement.removeEventListener('load', listener);
    }
  };

  documentElement.addEventListener('load', listener, true);
})();
`.trim();
class CrittersBase extends Critters {
}
/* eslint-enable @typescript-eslint/no-unsafe-declaration-merging */
class InlineCriticalCssProcessor extends CrittersBase {
    readFile;
    outputPath;
    addedCspScriptsDocuments = new WeakSet();
    documentNonces = new WeakMap();
    constructor(readFile, outputPath) {
        super({
            logger: {
                // eslint-disable-next-line no-console
                warn: (s) => console.warn(s),
                // eslint-disable-next-line no-console
                error: (s) => console.error(s),
                info: () => { },
            },
            logLevel: 'warn',
            path: outputPath,
            publicPath: undefined,
            compress: false,
            pruneSource: false,
            reduceInlineStyles: false,
            mergeStylesheets: false,
            // Note: if `preload` changes to anything other than `media`, the logic in
            // `embedLinkedStylesheet` will have to be updated.
            preload: 'media',
            noscriptFallback: true,
            inlineFonts: true,
        });
        this.readFile = readFile;
        this.outputPath = outputPath;
    }
    /**
     * Override of the Critters `embedLinkedStylesheet` method
     * that makes it work with Angular's CSP APIs.
     */
    async embedLinkedStylesheet(link, document) {
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
        const returnValue = await super.embedLinkedStylesheet(link, document);
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
    }
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

/**
 * A Least Recently Used (LRU) cache implementation.
 *
 * This cache stores a fixed number of key-value pairs, and when the cache exceeds its capacity,
 * the least recently accessed items are evicted.
 *
 * @template Key - The type of the cache keys.
 * @template Value - The type of the cache values.
 */
class LRUCache {
    /**
     * The maximum number of items the cache can hold.
     */
    capacity;
    /**
     * Internal storage for the cache, mapping keys to their associated nodes in the linked list.
     */
    cache = new Map();
    /**
     * Head of the doubly linked list, representing the most recently used item.
     */
    head;
    /**
     * Tail of the doubly linked list, representing the least recently used item.
     */
    tail;
    /**
     * Creates a new LRUCache instance.
     * @param capacity The maximum number of items the cache can hold.
     */
    constructor(capacity) {
        this.capacity = capacity;
    }
    /**
     * Gets the value associated with the given key.
     * @param key The key to retrieve the value for.
     * @returns The value associated with the key, or undefined if the key is not found.
     */
    get(key) {
        const node = this.cache.get(key);
        if (node) {
            this.moveToHead(node);
            return node.value;
        }
        return undefined;
    }
    /**
     * Puts a key-value pair into the cache.
     * If the key already exists, the value is updated.
     * If the cache is full, the least recently used item is evicted.
     * @param key The key to insert or update.
     * @param value The value to associate with the key.
     */
    put(key, value) {
        const cachedNode = this.cache.get(key);
        if (cachedNode) {
            // Update existing node
            cachedNode.value = value;
            this.moveToHead(cachedNode);
            return;
        }
        // Create a new node
        const newNode = { key, value, prev: undefined, next: undefined };
        this.cache.set(key, newNode);
        this.addToHead(newNode);
        if (this.cache.size > this.capacity) {
            // Evict the LRU item
            const tail = this.removeTail();
            if (tail) {
                this.cache.delete(tail.key);
            }
        }
    }
    /**
     * Adds a node to the head of the linked list.
     * @param node The node to add.
     */
    addToHead(node) {
        node.next = this.head;
        node.prev = undefined;
        if (this.head) {
            this.head.prev = node;
        }
        this.head = node;
        if (!this.tail) {
            this.tail = node;
        }
    }
    /**
     * Removes a node from the linked list.
     * @param node The node to remove.
     */
    removeNode(node) {
        if (node.prev) {
            node.prev.next = node.next;
        }
        else {
            this.head = node.next;
        }
        if (node.next) {
            node.next.prev = node.prev;
        }
        else {
            this.tail = node.prev;
        }
    }
    /**
     * Moves a node to the head of the linked list.
     * @param node The node to move.
     */
    moveToHead(node) {
        this.removeNode(node);
        this.addToHead(node);
    }
    /**
     * Removes the tail node from the linked list.
     * @returns The removed tail node, or undefined if the list is empty.
     */
    removeTail() {
        const node = this.tail;
        if (node) {
            this.removeNode(node);
        }
        return node;
    }
}

/**
 * Maximum number of critical CSS entries the cache can store.
 * This value determines the capacity of the LRU (Least Recently Used) cache, which stores critical CSS for pages.
 */
const MAX_INLINE_CSS_CACHE_ENTRIES = 50;
/**
 * A mapping of `RenderMode` enum values to corresponding string representations.
 *
 * This record is used to map each `RenderMode` to a specific string value that represents
 * the server context. The string values are used internally to differentiate
 * between various rendering strategies when processing routes.
 *
 * - `RenderMode.Prerender` maps to `'ssg'` (Static Site Generation).
 * - `RenderMode.Server` maps to `'ssr'` (Server-Side Rendering).
 * - `RenderMode.AppShell` maps to `'app-shell'` (pre-rendered application shell).
 * - `RenderMode.Client` maps to an empty string `''` (Client-Side Rendering, no server context needed).
 */
const SERVER_CONTEXT_VALUE = {
    [RenderMode.Prerender]: 'ssg',
    [RenderMode.Server]: 'ssr',
    [RenderMode.AppShell]: 'app-shell',
    [RenderMode.Client]: '',
};
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
     * The `inlineCriticalCssProcessor` is responsible for handling critical CSS inlining.
     */
    inlineCriticalCssProcessor;
    /**
     * The bootstrap mechanism for the server application.
     */
    boostrap;
    /**
     * Cache for storing critical CSS for pages.
     * Stores a maximum of MAX_INLINE_CSS_CACHE_ENTRIES entries.
     *
     * Uses an LRU (Least Recently Used) eviction policy, meaning that when the cache is full,
     * the least recently accessed page's critical CSS will be removed to make space for new entries.
     */
    criticalCssLRUCache = new LRUCache(MAX_INLINE_CSS_CACHE_ENTRIES);
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
    render(request, requestContext) {
        return Promise.race([
            this.createAbortPromise(request),
            this.handleRendering(request, /** isSsrMode */ true, requestContext),
        ]);
    }
    /**
     * Renders a page based on the provided URL via server-side rendering and returns the corresponding HTTP response.
     * The rendering process can be interrupted by an abort signal, where the first resolved promise (either from the abort
     * or the render process) will dictate the outcome.
     *
     * @param url - The full URL to be processed and rendered by the server.
     * @param signal - (Optional) An `AbortSignal` object that allows for the cancellation of the rendering process.
     * @returns A promise that resolves to the generated HTTP response object, or `null` if no matching route is found.
     */
    renderStatic(url, signal) {
        const request = new Request(url, { signal });
        return Promise.race([
            this.createAbortPromise(request),
            this.handleRendering(request, /** isSsrMode */ false),
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
     * @param isSsrMode - A boolean indicating whether the rendering is performed in server-side rendering (SSR) mode.
     * @param requestContext - Optional additional context for rendering, such as request metadata.
     *
     * @returns A promise that resolves to the rendered response, or null if no matching route is found.
     */
    async handleRendering(request, isSsrMode, requestContext) {
        const url = new URL(request.url);
        this.router ??= await ServerRouter.from(this.manifest, url);
        const matchedRoute = this.router.match(url);
        if (!matchedRoute) {
            // Not a known Angular route.
            return null;
        }
        const { redirectTo, status } = matchedRoute;
        if (redirectTo !== undefined) {
            // Note: The status code is validated during route extraction.
            // 302 Found is used by default for redirections
            // See: https://developer.mozilla.org/en-US/docs/Web/API/Response/redirect_static#status
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return Response.redirect(new URL(redirectTo, url), status ?? 302);
        }
        const { renderMode = isSsrMode ? RenderMode.Server : RenderMode.Prerender, headers } = matchedRoute;
        const platformProviders = [];
        let responseInit;
        if (isSsrMode) {
            // Initialize the response with status and headers if available.
            responseInit = {
                status,
                headers: new Headers({
                    'Content-Type': 'text/html;charset=UTF-8',
                    ...headers,
                }),
            };
            if (renderMode === RenderMode.Server) {
                // Configure platform providers for request and response only for SSR.
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
            else if (renderMode === RenderMode.Client) {
                // Serve the client-side rendered version if the route is configured for CSR.
                return new Response(await this.assets.getServerAsset('index.csr.html'), responseInit);
            }
        }
        const { manifest: { bootstrap, inlineCriticalCss, locale }, hooks, assets, } = this;
        if (locale !== undefined) {
            platformProviders.push({
                provide: LOCALE_ID,
                useValue: locale,
            });
        }
        let html = await assets.getIndexServerHtml();
        // Skip extra microtask if there are no pre hooks.
        if (hooks.has('html:transform:pre')) {
            html = await hooks.run('html:transform:pre', { html, url });
        }
        this.boostrap ??= await bootstrap();
        html = await renderAngular(html, this.boostrap, url, platformProviders, SERVER_CONTEXT_VALUE[renderMode]);
        if (inlineCriticalCss) {
            // Optionally inline critical CSS.
            this.inlineCriticalCssProcessor ??= new InlineCriticalCssProcessor((path) => {
                const fileName = path.split('/').pop() ?? path;
                return this.assets.getServerAsset(fileName);
            });
            // TODO(alanagius): remove once Node.js version 18 is no longer supported.
            if (isSsrMode && typeof crypto === 'undefined') {
                // eslint-disable-next-line no-console
                console.error(`The global 'crypto' module is unavailable. ` +
                    `If you are running on Node.js, please ensure you are using version 20 or later, ` +
                    `which includes built-in support for the Web Crypto module.`);
            }
            if (isSsrMode && typeof crypto !== 'undefined') {
                // Only cache if we are running in SSR Mode.
                const cacheKey = await sha256(html);
                let htmlWithCriticalCss = this.criticalCssLRUCache.get(cacheKey);
                if (htmlWithCriticalCss === undefined) {
                    htmlWithCriticalCss = await this.inlineCriticalCssProcessor.process(html);
                    this.criticalCssLRUCache.put(cacheKey, htmlWithCriticalCss);
                }
                html = htmlWithCriticalCss;
            }
            else {
                html = await this.inlineCriticalCssProcessor.process(html);
            }
        }
        return new Response(html, responseInit);
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
    if (typeof ngDevMode === 'undefined' || ngDevMode) {
        // Need to clean up GENERATED_COMP_IDS map in `@angular/core`.
        // Otherwise an incorrect component ID generation collision detected warning will be displayed in development.
        // See: https://github.com/angular/angular-cli/issues/25924
        _resetCompiledComponents();
    }
    angularServerApp = undefined;
}

// ɵgetRoutesFromAngularRouterConfig is only used by the Webpack based server builder.

/**
 * Extracts a potential locale ID from a given URL based on the specified base path.
 *
 * This function parses the URL to locate a potential locale identifier that immediately
 * follows the base path segment in the URL's pathname. If the URL does not contain a valid
 * locale ID, an empty string is returned.
 *
 * @param url - The full URL from which to extract the locale ID.
 * @param basePath - The base path used as the reference point for extracting the locale ID.
 * @returns The extracted locale ID if present, or an empty string if no valid locale ID is found.
 *
 * @example
 * ```js
 * const url = new URL('https://example.com/base/en/page');
 * const basePath = '/base';
 * const localeId = getPotentialLocaleIdFromUrl(url, basePath);
 * console.log(localeId); // Output: 'en'
 * ```
 */
function getPotentialLocaleIdFromUrl(url, basePath) {
    const { pathname } = url;
    // Move forward of the base path section.
    let start = basePath.length;
    if (pathname[start] === '/') {
        start++;
    }
    // Find the next forward slash.
    let end = pathname.indexOf('/', start);
    if (end === -1) {
        end = pathname.length;
    }
    // Extract the potential locale id.
    return pathname.slice(start, end);
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
class AngularAppEngine {
    /**
     * Hooks for extending or modifying the behavior of the server application.
     * These hooks are used by the Angular CLI when running the development server and
     * provide extensibility points for the application lifecycle.
     *
     * @private
     */
    static ɵhooks = /* #__PURE__*/ new Hooks();
    /**
     * Provides access to the hooks for extending or modifying the server application's behavior.
     * This allows attaching custom functionality to various server application lifecycle events.
     *
     * @internal
     */
    get hooks() {
        return AngularAppEngine.ɵhooks;
    }
    /**
     * The manifest for the server application.
     */
    manifest = getAngularAppEngineManifest();
    /**
     * A cache that holds entry points, keyed by their potential locale string.
     */
    entryPointsCache = new Map();
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
    async render(request, requestContext) {
        // Skip if the request looks like a file but not `/index.html`.
        const url = new URL(request.url);
        const entryPoint = await this.getEntryPointExportsForUrl(url);
        if (!entryPoint) {
            return null;
        }
        const { ɵgetOrCreateAngularServerApp: getOrCreateAngularServerApp } = entryPoint;
        // Note: Using `instanceof` is not feasible here because `AngularServerApp` will
        // be located in separate bundles, making `instanceof` checks unreliable.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        const serverApp = getOrCreateAngularServerApp();
        serverApp.hooks = this.hooks;
        return serverApp.render(request, requestContext);
    }
    /**
     * Retrieves HTTP headers for a request associated with statically generated (SSG) pages,
     * based on the URL pathname.
     *
     * @param request - The incoming request object.
     * @returns A `Map` containing the HTTP headers as key-value pairs.
     * @note This function should be used exclusively for retrieving headers of SSG pages.
     */
    getPrerenderHeaders(request) {
        if (this.manifest.staticPathsHeaders.size === 0) {
            return new Map();
        }
        const { pathname } = stripIndexHtmlFromURL(new URL(request.url));
        const headers = this.manifest.staticPathsHeaders.get(stripTrailingSlash(pathname));
        return new Map(headers);
    }
    /**
     * Retrieves the exports for a specific entry point, caching the result.
     *
     * @param potentialLocale - The locale string used to find the corresponding entry point.
     * @returns A promise that resolves to the entry point exports or `undefined` if not found.
     */
    getEntryPointExports(potentialLocale) {
        const cachedEntryPoint = this.entryPointsCache.get(potentialLocale);
        if (cachedEntryPoint) {
            return cachedEntryPoint;
        }
        const { entryPoints } = this.manifest;
        const entryPoint = entryPoints.get(potentialLocale);
        if (!entryPoint) {
            return undefined;
        }
        const entryPointExports = entryPoint();
        this.entryPointsCache.set(potentialLocale, entryPointExports);
        return entryPointExports;
    }
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
    getEntryPointExportsForUrl(url) {
        const { entryPoints, basePath } = this.manifest;
        if (entryPoints.size === 1) {
            return this.getEntryPointExports('');
        }
        const potentialLocale = getPotentialLocaleIdFromUrl(url, basePath);
        return this.getEntryPointExports(potentialLocale);
    }
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
function createRequestHandler(handler) {
    handler['__ng_request_handler__'] = true;
    return handler;
}

export { AngularAppEngine, RenderMode, createRequestHandler, provideServerRoutesConfig, InlineCriticalCssProcessor as ɵInlineCriticalCssProcessor, destroyAngularServerApp as ɵdestroyAngularServerApp, extractRoutesAndCreateRouteTree as ɵextractRoutesAndCreateRouteTree, getOrCreateAngularServerApp as ɵgetOrCreateAngularServerApp, getRoutesFromAngularRouterConfig as ɵgetRoutesFromAngularRouterConfig, setAngularAppEngineManifest as ɵsetAngularAppEngineManifest, setAngularAppManifest as ɵsetAngularAppManifest };
//# sourceMappingURL=ssr.mjs.map

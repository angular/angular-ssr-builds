/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */
import { ServerAssets } from './assets';
import { Hooks } from './hooks';
import { getAngularAppManifest } from './manifest';
import { ServerRenderContext, render } from './render';
import { ServerRouter } from './routes/router';
/**
 * Represents a locale-specific Angular server application managed by the server application engine.
 *
 * The `AngularServerApp` class handles server-side rendering and asset management for a specific locale.
 */
export class AngularServerApp {
    options;
    /**
     * The manifest associated with this server application.
     * @internal
     */
    manifest = getAngularAppManifest();
    /**
     * Hooks for extending or modifying the behavior of the server application.
     * This instance can be used to attach custom functionality to various events in the server application lifecycle.
     * @internal
     */
    hooks;
    /**
     * Specifies if the server application is operating in development mode.
     * This property controls the activation of features intended for production, such as caching mechanisms.
     * @internal
     */
    isDevMode;
    /**
     * An instance of ServerAsset that handles server-side asset.
     * @internal
     */
    assets = new ServerAssets(this.manifest);
    /**
     * The router instance used for route matching and handling.
     */
    router;
    /**
     * Creates a new `AngularServerApp` instance with the provided configuration options.
     *
     * @param options - The configuration options for the server application.
     * - `isDevMode`: Flag indicating if the application is in development mode.
     * - `hooks`: Optional hooks for customizing application behavior.
     */
    constructor(options) {
        this.options = options;
        this.isDevMode = options.isDevMode ?? false;
        this.hooks = options.hooks ?? new Hooks();
    }
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
    async render(request, requestContext, serverContext = ServerRenderContext.SSR) {
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
        return render(this, request, serverContext, requestContext);
    }
}

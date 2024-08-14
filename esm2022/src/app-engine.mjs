/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */
import { Hooks } from './hooks';
import { getPotentialLocaleIdFromUrl } from './i18n';
import { getAngularAppEngineManifest } from './manifest';
/**
 * Angular server application engine.
 * Manages Angular server applications (including localized ones), handles rendering requests,
 * and optionally transforms index HTML before rendering.
 */
export class AngularAppEngine {
    /**
     * Hooks for extending or modifying the behavior of the server application.
     * @internal This property is accessed by the Angular CLI when running the dev-server.
     */
    static hooks = new Hooks();
    /**
     * Hooks for extending or modifying the behavior of the server application.
     * This instance can be used to attach custom functionality to various events in the server application lifecycle.
     * @internal
     */
    get hooks() {
        return AngularAppEngine.hooks;
    }
    /**
     * Specifies if the application is operating in development mode.
     * This property controls the activation of features intended for production, such as caching mechanisms.
     * @internal
     */
    static isDevMode = false;
    /**
     * The manifest for the server application.
     */
    manifest = getAngularAppEngineManifest();
    /**
     * Map of locale strings to corresponding `AngularServerApp` instances.
     * Each instance represents an Angular server application.
     */
    appsCache = new Map();
    /**
     * Renders an HTTP request using the appropriate Angular server application and returns a response.
     *
     * This method determines the entry point for the Angular server application based on the request URL,
     * and caches the server application instances for reuse. If the application is in development mode,
     * the cache is bypassed and a new instance is created for each request.
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
        const entryPoint = this.getEntryPointFromUrl(url);
        if (!entryPoint) {
            return null;
        }
        const [locale, loadModule] = entryPoint;
        let serverApp = this.appsCache.get(locale);
        if (!serverApp) {
            const { AngularServerApp } = await loadModule();
            serverApp = new AngularServerApp({
                isDevMode: AngularAppEngine.isDevMode,
                hooks: this.hooks,
            });
            if (!AngularAppEngine.isDevMode) {
                this.appsCache.set(locale, serverApp);
            }
        }
        return serverApp.render(request, requestContext);
    }
    /**
     * Retrieves the entry point path and locale for the Angular server application based on the provided URL.
     *
     * This method determines the appropriate entry point and locale for rendering the application by examining the URL.
     * If there is only one entry point available, it is returned regardless of the URL.
     * Otherwise, the method extracts a potential locale identifier from the URL and looks up the corresponding entry point.
     *
     * @param url - The URL used to derive the locale and determine the entry point.
     * @returns An array containing:
     * - The first element is the locale extracted from the URL.
     * - The second element is a function that returns a promise resolving to an object with the `AngularServerApp` type.
     *
     * Returns `null` if no matching entry point is found for the extracted locale.
     */
    getEntryPointFromUrl(url) {
        // Find bundle for locale
        const { entryPoints, basePath } = this.manifest;
        if (entryPoints.size === 1) {
            return entryPoints.entries().next().value;
        }
        const potentialLocale = getPotentialLocaleIdFromUrl(url, basePath);
        const entryPoint = entryPoints.get(potentialLocale);
        return entryPoint ? [potentialLocale, entryPoint] : null;
    }
}

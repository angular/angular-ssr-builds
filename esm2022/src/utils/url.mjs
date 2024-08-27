/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */
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
export function stripTrailingSlash(url) {
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
export function joinUrlParts(...parts) {
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
export function stripIndexHtmlFromURL(url) {
    if (url.pathname.endsWith('/index.html')) {
        const modifiedURL = new URL(url);
        // Remove '/index.html' from the pathname
        modifiedURL.pathname = modifiedURL.pathname.slice(0, /** '/index.html'.length */ -11);
        return modifiedURL;
    }
    return url;
}
//# sourceMappingURL=url.js.map
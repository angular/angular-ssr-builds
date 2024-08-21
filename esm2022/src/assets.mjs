/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */
/**
 * Manages server-side assets.
 */
export class ServerAssets {
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

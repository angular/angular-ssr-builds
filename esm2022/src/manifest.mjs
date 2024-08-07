/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */
/**
 * Angular app manifest object.
 */
let angularAppManifest;
/**
 * Sets the Angular app manifest.
 *
 * @param manifest - The manifest object to set.
 */
export function setAngularAppManifest(manifest) {
    angularAppManifest = manifest;
}
/**
 * Gets the Angular app manifest.
 *
 * @returns The Angular app manifest.
 * @throws Will throw an error if the Angular app manifest is not set.
 */
export function getAngularAppManifest() {
    if (!angularAppManifest) {
        throw new Error('Angular app manifest is not set.' +
            `Please ensure you are using the '@angular/build:application' builder to build your server application.`);
    }
    return angularAppManifest;
}
/**
 * Angular app engine manifest object.
 */
let angularAppEngineManifest;
/**
 * Sets the Angular app engine manifest.
 *
 * @param manifest - The engine manifest object to set.
 */
export function setAngularAppEngineManifest(manifest) {
    angularAppEngineManifest = manifest;
}
/**
 * Gets the Angular app engine manifest.
 *
 * @returns The Angular app engine manifest.
 * @throws Will throw an error if the Angular app engine manifest is not set.
 */
export function getAngularAppEngineManifest() {
    if (!angularAppEngineManifest) {
        throw new Error('Angular app engine manifest is not set.' +
            `Please ensure you are using the '@angular/build:application' builder to build your server application.`);
    }
    return angularAppEngineManifest;
}

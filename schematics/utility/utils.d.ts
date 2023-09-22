/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { workspaces } from '@angular-devkit/core';
import { Tree } from '@angular-devkit/schematics';
export declare function getProject(host: Tree, projectName: string): Promise<workspaces.ProjectDefinition>;
export declare function getOutputPath(host: Tree, projectName: string, target: 'server' | 'build'): Promise<string>;

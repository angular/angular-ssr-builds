/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { dirname, join, normalize, strings } from '@angular-devkit/core';
import { SchematicsException, apply, applyTemplates, chain, externalSchematic, mergeWith, move, noop, url, } from '@angular-devkit/schematics';
import { DependencyType, addDependency, updateWorkspace } from '@schematics/angular/utility';
import { JSONFile } from '@schematics/angular/utility/json-file';
import { isStandaloneApp } from '@schematics/angular/utility/ng-ast-utils';
import { targetBuildNotFoundError } from '@schematics/angular/utility/project-targets';
import { getMainFilePath } from '@schematics/angular/utility/standalone/util';
import { getWorkspace } from '@schematics/angular/utility/workspace';
import { Builders } from '@schematics/angular/utility/workspace-models';
import * as ts from 'typescript';
import { latestVersions } from '../utility/latest-versions';
import { addInitialNavigation, findImport, getImportOfIdentifier, getOutputPath, getProject, } from '../utility/utils';
const SERVE_SSR_TARGET_NAME = 'serve-ssr';
const PRERENDER_TARGET_NAME = 'prerender';
function addScriptsRule(options) {
    return async (host) => {
        const pkgPath = '/package.json';
        const buffer = host.read(pkgPath);
        if (buffer === null) {
            throw new SchematicsException('Could not find package.json');
        }
        const serverDist = await getOutputPath(host, options.project, 'server');
        const pkg = JSON.parse(buffer.toString());
        pkg.scripts = {
            ...pkg.scripts,
            'dev:ssr': `ng run ${options.project}:${SERVE_SSR_TARGET_NAME}`,
            'serve:ssr': `node ${serverDist}/main.js`,
            'build:ssr': `ng build && ng run ${options.project}:server`,
            'prerender': `ng run ${options.project}:${PRERENDER_TARGET_NAME}`,
        };
        host.overwrite(pkgPath, JSON.stringify(pkg, null, 2));
    };
}
function updateApplicationBuilderTsConfigRule(options) {
    return async (host) => {
        const project = await getProject(host, options.project);
        const buildTarget = project.targets.get('build');
        if (!buildTarget || !buildTarget.options) {
            return;
        }
        const tsConfigPath = buildTarget.options.tsConfig;
        if (!tsConfigPath || typeof tsConfigPath !== 'string') {
            // No tsconfig path
            return;
        }
        const tsConfig = new JSONFile(host, tsConfigPath);
        const filesAstNode = tsConfig.get(['files']);
        const serverFilePath = 'server.ts';
        if (Array.isArray(filesAstNode) && !filesAstNode.some(({ text }) => text === serverFilePath)) {
            tsConfig.modify(['files'], [...filesAstNode, serverFilePath]);
        }
    };
}
function updateApplicationBuilderWorkspaceConfigRule(projectRoot, options) {
    return () => {
        return updateWorkspace((workspace) => {
            const buildTarget = workspace.projects.get(options.project)?.targets.get('build');
            if (!buildTarget) {
                return;
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const prodConfig = buildTarget.configurations?.production;
            if (!prodConfig) {
                throw new SchematicsException(`A "production" configuration is not defined for the "build" builder.`);
            }
            prodConfig.prerender = true;
            prodConfig.ssr = join(normalize(projectRoot), 'server.ts');
        });
    };
}
function updateWebpackBuilderWorkspaceConfigRule(options) {
    return () => {
        return updateWorkspace((workspace) => {
            const projectName = options.project;
            const project = workspace.projects.get(projectName);
            if (!project) {
                return;
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const serverTarget = project.targets.get('server');
            (serverTarget.options ??= {}).main = join(normalize(project.root), 'server.ts');
            const serveSSRTarget = project.targets.get(SERVE_SSR_TARGET_NAME);
            if (serveSSRTarget) {
                return;
            }
            project.targets.add({
                name: SERVE_SSR_TARGET_NAME,
                builder: '@angular-devkit/build-angular:ssr-dev-server',
                defaultConfiguration: 'development',
                options: {},
                configurations: {
                    development: {
                        browserTarget: `${projectName}:build:development`,
                        serverTarget: `${projectName}:server:development`,
                    },
                    production: {
                        browserTarget: `${projectName}:build:production`,
                        serverTarget: `${projectName}:server:production`,
                    },
                },
            });
            const prerenderTarget = project.targets.get(PRERENDER_TARGET_NAME);
            if (prerenderTarget) {
                return;
            }
            project.targets.add({
                name: PRERENDER_TARGET_NAME,
                builder: '@angular-devkit/build-angular:prerender',
                defaultConfiguration: 'production',
                options: {
                    routes: ['/'],
                },
                configurations: {
                    production: {
                        browserTarget: `${projectName}:build:production`,
                        serverTarget: `${projectName}:server:production`,
                    },
                    development: {
                        browserTarget: `${projectName}:build:development`,
                        serverTarget: `${projectName}:server:development`,
                    },
                },
            });
        });
    };
}
function updateWebpackBuilderServerTsConfigRule(options) {
    return async (host) => {
        const project = await getProject(host, options.project);
        const serverTarget = project.targets.get('server');
        if (!serverTarget || !serverTarget.options) {
            return;
        }
        const tsConfigPath = serverTarget.options.tsConfig;
        if (!tsConfigPath || typeof tsConfigPath !== 'string') {
            // No tsconfig path
            return;
        }
        const tsConfig = new JSONFile(host, tsConfigPath);
        const filesAstNode = tsConfig.get(['files']);
        const serverFilePath = 'server.ts';
        if (Array.isArray(filesAstNode) && !filesAstNode.some(({ text }) => text === serverFilePath)) {
            tsConfig.modify(['files'], [...filesAstNode, serverFilePath]);
        }
    };
}
function routingInitialNavigationRule(options) {
    return async (host) => {
        const project = await getProject(host, options.project);
        const serverTarget = project.targets.get('server');
        if (!serverTarget || !serverTarget.options) {
            return;
        }
        const tsConfigPath = serverTarget.options.tsConfig;
        if (!tsConfigPath || typeof tsConfigPath !== 'string' || !host.exists(tsConfigPath)) {
            // No tsconfig path
            return;
        }
        const parseConfigHost = {
            useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
            readDirectory: ts.sys.readDirectory,
            fileExists: function (fileName) {
                return host.exists(fileName);
            },
            readFile: function (fileName) {
                return host.readText(fileName);
            },
        };
        const { config } = ts.readConfigFile(tsConfigPath, parseConfigHost.readFile);
        const parsed = ts.parseJsonConfigFileContent(config, parseConfigHost, dirname(normalize(tsConfigPath)));
        const tsHost = ts.createCompilerHost(parsed.options, true);
        // Strip BOM as otherwise TSC methods (Ex: getWidth) will return an offset,
        // which breaks the CLI UpdateRecorder.
        // See: https://github.com/angular/angular/pull/30719
        tsHost.readFile = function (fileName) {
            return host.readText(fileName).replace(/^\uFEFF/, '');
        };
        tsHost.directoryExists = function (directoryName) {
            // When the path is file getDir will throw.
            try {
                const dir = host.getDir(directoryName);
                return !!(dir.subdirs.length || dir.subfiles.length);
            }
            catch {
                return false;
            }
        };
        tsHost.fileExists = function (fileName) {
            return host.exists(fileName);
        };
        tsHost.realpath = function (path) {
            return path;
        };
        tsHost.getCurrentDirectory = function () {
            return host.root.path;
        };
        const program = ts.createProgram(parsed.fileNames, parsed.options, tsHost);
        const typeChecker = program.getTypeChecker();
        const sourceFiles = program
            .getSourceFiles()
            .filter((f) => !f.isDeclarationFile && !program.isSourceFileFromExternalLibrary(f));
        const printer = ts.createPrinter();
        const routerModule = 'RouterModule';
        const routerSource = '@angular/router';
        sourceFiles.forEach((sourceFile) => {
            const routerImport = findImport(sourceFile, routerSource, routerModule);
            if (!routerImport) {
                return;
            }
            ts.forEachChild(sourceFile, function visitNode(node) {
                if (ts.isCallExpression(node) &&
                    ts.isPropertyAccessExpression(node.expression) &&
                    ts.isIdentifier(node.expression.expression) &&
                    node.expression.name.text === 'forRoot') {
                    const imp = getImportOfIdentifier(typeChecker, node.expression.expression);
                    if (imp && imp.name === routerModule && imp.importModule === routerSource) {
                        const print = printer.printNode(ts.EmitHint.Unspecified, addInitialNavigation(node), sourceFile);
                        const recorder = host.beginUpdate(sourceFile.fileName);
                        recorder.remove(node.getStart(), node.getWidth());
                        recorder.insertRight(node.getStart(), print);
                        host.commitUpdate(recorder);
                        return;
                    }
                }
                ts.forEachChild(node, visitNode);
            });
        });
    };
}
function addDependencies() {
    return chain([
        addDependency('express', latestVersions['express'], {
            type: DependencyType.Default,
        }),
        addDependency('@types/express', latestVersions['@types/express'], {
            type: DependencyType.Dev,
        }),
    ]);
}
function addServerFile(options, isStandalone) {
    return async (host) => {
        const project = await getProject(host, options.project);
        const browserDistDirectory = await getOutputPath(host, options.project, 'build');
        return mergeWith(apply(url(`./files/${project?.targets?.get('build')?.builder === Builders.Application
            ? 'application-builder'
            : 'server-builder'}`), [
            applyTemplates({
                ...strings,
                ...options,
                browserDistDirectory,
                isStandalone,
            }),
            move(project.root),
        ]));
    };
}
export default function (options) {
    return async (host) => {
        const browserEntryPoint = await getMainFilePath(host, options.project);
        const isStandalone = isStandaloneApp(host, browserEntryPoint);
        const workspace = await getWorkspace(host);
        const clientProject = workspace.projects.get(options.project);
        if (!clientProject) {
            throw targetBuildNotFoundError();
        }
        const isUsingApplicationBuilder = clientProject.targets.get('build')?.builder === Builders.Application;
        return chain([
            externalSchematic('@schematics/angular', 'server', {
                ...options,
                skipInstall: true,
            }),
            ...(isUsingApplicationBuilder
                ? [
                    updateApplicationBuilderWorkspaceConfigRule(clientProject.root, options),
                    updateApplicationBuilderTsConfigRule(options),
                ]
                : [
                    addScriptsRule(options),
                    updateWebpackBuilderServerTsConfigRule(options),
                    updateWebpackBuilderWorkspaceConfigRule(options),
                ]),
            isStandalone ? noop() : routingInitialNavigationRule(options),
            addServerFile(options, isStandalone),
            addDependencies(),
        ]);
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9hbmd1bGFyL3Nzci9zY2hlbWF0aWNzL25nLWFkZC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0dBTUc7QUFFSCxPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDekUsT0FBTyxFQUVMLG1CQUFtQixFQUVuQixLQUFLLEVBQ0wsY0FBYyxFQUNkLEtBQUssRUFDTCxpQkFBaUIsRUFDakIsU0FBUyxFQUNULElBQUksRUFDSixJQUFJLEVBQ0osR0FBRyxHQUNKLE1BQU0sNEJBQTRCLENBQUM7QUFFcEMsT0FBTyxFQUFFLGNBQWMsRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDN0YsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN2RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDOUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUN4RSxPQUFPLEtBQUssRUFBRSxNQUFNLFlBQVksQ0FBQztBQUVqQyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDNUQsT0FBTyxFQUNMLG9CQUFvQixFQUNwQixVQUFVLEVBQ1YscUJBQXFCLEVBQ3JCLGFBQWEsRUFDYixVQUFVLEdBQ1gsTUFBTSxrQkFBa0IsQ0FBQztBQUkxQixNQUFNLHFCQUFxQixHQUFHLFdBQVcsQ0FBQztBQUMx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YUFBYSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUM7b0JBQ3hFLG9DQUFvQyxDQUFDLE9BQU8sQ0FBQztpQkFDOUM7Z0JBQ0gsQ0FBQyxDQUFDO29CQUNFLGNBQWMsQ0FBQyxPQUFPLENBQUM7b0JBQ3ZCLHNDQUFzQyxDQUFDLE9BQU8sQ0FBQztvQkFDL0MsdUNBQXVDLENBQUMsT0FBTyxDQUFDO2lCQUNqRCxDQUFDO1lBQ04sWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsNEJBQTRCLENBQUMsT0FBTyxDQUFDO1lBQzdELGFBQWEsQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDO1lBQ3BDLGVBQWUsRUFBRTtTQUNsQixDQUFDLENBQUM7SUFDTCxDQUFDLENBQUM7QUFDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCB7IGRpcm5hbWUsIGpvaW4sIG5vcm1hbGl6ZSwgc3RyaW5ncyB9IGZyb20gJ0Bhbmd1bGFyLWRldmtpdC9jb3JlJztcbmltcG9ydCB7XG4gIFJ1bGUsXG4gIFNjaGVtYXRpY3NFeGNlcHRpb24sXG4gIFRyZWUsXG4gIGFwcGx5LFxuICBhcHBseVRlbXBsYXRlcyxcbiAgY2hhaW4sXG4gIGV4dGVybmFsU2NoZW1hdGljLFxuICBtZXJnZVdpdGgsXG4gIG1vdmUsXG4gIG5vb3AsXG4gIHVybCxcbn0gZnJvbSAnQGFuZ3VsYXItZGV2a2l0L3NjaGVtYXRpY3MnO1xuaW1wb3J0IHsgU2NoZW1hIGFzIFNlcnZlck9wdGlvbnMgfSBmcm9tICdAc2NoZW1hdGljcy9hbmd1bGFyL3NlcnZlci9zY2hlbWEnO1xuaW1wb3J0IHsgRGVwZW5kZW5jeVR5cGUsIGFkZERlcGVuZGVuY3ksIHVwZGF0ZVdvcmtzcGFjZSB9IGZyb20gJ0BzY2hlbWF0aWNzL2FuZ3VsYXIvdXRpbGl0eSc7XG5pbXBvcnQgeyBKU09ORmlsZSB9IGZyb20gJ0BzY2hlbWF0aWNzL2FuZ3VsYXIvdXRpbGl0eS9qc29uLWZpbGUnO1xuaW1wb3J0IHsgaXNTdGFuZGFsb25lQXBwIH0gZnJvbSAnQHNjaGVtYXRpY3MvYW5ndWxhci91dGlsaXR5L25nLWFzdC11dGlscyc7XG5pbXBvcnQgeyB0YXJnZXRCdWlsZE5vdEZvdW5kRXJyb3IgfSBmcm9tICdAc2NoZW1hdGljcy9hbmd1bGFyL3V0aWxpdHkvcHJvamVjdC10YXJnZXRzJztcbmltcG9ydCB7IGdldE1haW5GaWxlUGF0aCB9IGZyb20gJ0BzY2hlbWF0aWNzL2FuZ3VsYXIvdXRpbGl0eS9zdGFuZGFsb25lL3V0aWwnO1xuaW1wb3J0IHsgZ2V0V29ya3NwYWNlIH0gZnJvbSAnQHNjaGVtYXRpY3MvYW5ndWxhci91dGlsaXR5L3dvcmtzcGFjZSc7XG5pbXBvcnQgeyBCdWlsZGVycyB9IGZyb20gJ0BzY2hlbWF0aWNzL2FuZ3VsYXIvdXRpbGl0eS93b3Jrc3BhY2UtbW9kZWxzJztcbmltcG9ydCAqIGFzIHRzIGZyb20gJ3R5cGVzY3JpcHQnO1xuXG5pbXBvcnQgeyBsYXRlc3RWZXJzaW9ucyB9IGZyb20gJy4uL3V0aWxpdHkvbGF0ZXN0LXZlcnNpb25zJztcbmltcG9ydCB7XG4gIGFkZEluaXRpYWxOYXZpZ2F0aW9uLFxuICBmaW5kSW1wb3J0LFxuICBnZXRJbXBvcnRPZklkZW50aWZpZXIsXG4gIGdldE91dHB1dFBhdGgsXG4gIGdldFByb2plY3QsXG59IGZyb20gJy4uL3V0aWxpdHkvdXRpbHMnO1xuXG5pbXBvcnQgeyBTY2hlbWEgYXMgQWRkU2VydmVyT3B0aW9ucyB9IGZyb20gJy4vc2NoZW1hJztcblxuY29uc3QgU0VSVkVfU1NSX1RBUkdFVF9OQU1FID0gJ3NlcnZlLXNzcic7XG5jb25zdCBQUkVSRU5ERVJfVEFSR0VUX05BTUUgPSAncHJlcmVuZGVyJztcblxuZnVuY3Rpb24gYWRkU2NyaXB0c1J1bGUob3B0aW9uczogQWRkU2VydmVyT3B0aW9ucyk6IFJ1bGUge1xuICByZXR1cm4gYXN5bmMgKGhvc3QpID0+IHtcbiAgICBjb25zdCBwa2dQYXRoID0gJy9wYWNrYWdlLmpzb24nO1xuICAgIGNvbnN0IGJ1ZmZlciA9IGhvc3QucmVhZChwa2dQYXRoKTtcbiAgICBpZiAoYnVmZmVyID09PSBudWxsKSB7XG4gICAgICB0aHJvdyBuZXcgU2NoZW1hdGljc0V4Y2VwdGlvbignQ291bGQgbm90IGZpbmQgcGFja2FnZS5qc29uJyk7XG4gICAgfVxuXG4gICAgY29uc3Qgc2VydmVyRGlzdCA9IGF3YWl0IGdldE91dHB1dFBhdGgoaG9zdCwgb3B0aW9ucy5wcm9qZWN0LCAnc2VydmVyJyk7XG4gICAgY29uc3QgcGtnID0gSlNPTi5wYXJzZShidWZmZXIudG9TdHJpbmcoKSkgYXMgeyBzY3JpcHRzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB9O1xuICAgIHBrZy5zY3JpcHRzID0ge1xuICAgICAgLi4ucGtnLnNjcmlwdHMsXG4gICAgICAnZGV2OnNzcic6IGBuZyBydW4gJHtvcHRpb25zLnByb2plY3R9OiR7U0VSVkVfU1NSX1RBUkdFVF9OQU1FfWAsXG4gICAgICAnc2VydmU6c3NyJzogYG5vZGUgJHtzZXJ2ZXJEaXN0fS9tYWluLmpzYCxcbiAgICAgICdidWlsZDpzc3InOiBgbmcgYnVpbGQgJiYgbmcgcnVuICR7b3B0aW9ucy5wcm9qZWN0fTpzZXJ2ZXJgLFxuICAgICAgJ3ByZXJlbmRlcic6IGBuZyBydW4gJHtvcHRpb25zLnByb2plY3R9OiR7UFJFUkVOREVSX1RBUkdFVF9OQU1FfWAsXG4gICAgfTtcblxuICAgIGhvc3Qub3ZlcndyaXRlKHBrZ1BhdGgsIEpTT04uc3RyaW5naWZ5KHBrZywgbnVsbCwgMikpO1xuICB9O1xufVxuXG5mdW5jdGlvbiB1cGRhdGVBcHBsaWNhdGlvbkJ1aWxkZXJUc0NvbmZpZ1J1bGUob3B0aW9uczogQWRkU2VydmVyT3B0aW9ucyk6IFJ1bGUge1xuICByZXR1cm4gYXN5bmMgKGhvc3QpID0+IHtcbiAgICBjb25zdCBwcm9qZWN0ID0gYXdhaXQgZ2V0UHJvamVjdChob3N0LCBvcHRpb25zLnByb2plY3QpO1xuICAgIGNvbnN0IGJ1aWxkVGFyZ2V0ID0gcHJvamVjdC50YXJnZXRzLmdldCgnYnVpbGQnKTtcbiAgICBpZiAoIWJ1aWxkVGFyZ2V0IHx8ICFidWlsZFRhcmdldC5vcHRpb25zKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgdHNDb25maWdQYXRoID0gYnVpbGRUYXJnZXQub3B0aW9ucy50c0NvbmZpZztcbiAgICBpZiAoIXRzQ29uZmlnUGF0aCB8fCB0eXBlb2YgdHNDb25maWdQYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgLy8gTm8gdHNjb25maWcgcGF0aFxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHRzQ29uZmlnID0gbmV3IEpTT05GaWxlKGhvc3QsIHRzQ29uZmlnUGF0aCk7XG4gICAgY29uc3QgZmlsZXNBc3ROb2RlID0gdHNDb25maWcuZ2V0KFsnZmlsZXMnXSk7XG4gICAgY29uc3Qgc2VydmVyRmlsZVBhdGggPSAnc2VydmVyLnRzJztcbiAgICBpZiAoQXJyYXkuaXNBcnJheShmaWxlc0FzdE5vZGUpICYmICFmaWxlc0FzdE5vZGUuc29tZSgoeyB0ZXh0IH0pID0+IHRleHQgPT09IHNlcnZlckZpbGVQYXRoKSkge1xuICAgICAgdHNDb25maWcubW9kaWZ5KFsnZmlsZXMnXSwgWy4uLmZpbGVzQXN0Tm9kZSwgc2VydmVyRmlsZVBhdGhdKTtcbiAgICB9XG4gIH07XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUFwcGxpY2F0aW9uQnVpbGRlcldvcmtzcGFjZUNvbmZpZ1J1bGUoXG4gIHByb2plY3RSb290OiBzdHJpbmcsXG4gIG9wdGlvbnM6IEFkZFNlcnZlck9wdGlvbnMsXG4pOiBSdWxlIHtcbiAgcmV0dXJuICgpID0+IHtcbiAgICByZXR1cm4gdXBkYXRlV29ya3NwYWNlKCh3b3Jrc3BhY2UpID0+IHtcbiAgICAgIGNvbnN0IGJ1aWxkVGFyZ2V0ID0gd29ya3NwYWNlLnByb2plY3RzLmdldChvcHRpb25zLnByb2plY3QpPy50YXJnZXRzLmdldCgnYnVpbGQnKTtcbiAgICAgIGlmICghYnVpbGRUYXJnZXQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgY29uc3QgcHJvZENvbmZpZyA9IGJ1aWxkVGFyZ2V0LmNvbmZpZ3VyYXRpb25zPy5wcm9kdWN0aW9uIGFzIFJlY29yZDxzdHJpbmcsIGFueT47XG4gICAgICBpZiAoIXByb2RDb25maWcpIHtcbiAgICAgICAgdGhyb3cgbmV3IFNjaGVtYXRpY3NFeGNlcHRpb24oXG4gICAgICAgICAgYEEgXCJwcm9kdWN0aW9uXCIgY29uZmlndXJhdGlvbiBpcyBub3QgZGVmaW5lZCBmb3IgdGhlIFwiYnVpbGRcIiBidWlsZGVyLmAsXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIHByb2RDb25maWcucHJlcmVuZGVyID0gdHJ1ZTtcbiAgICAgIHByb2RDb25maWcuc3NyID0gam9pbihub3JtYWxpemUocHJvamVjdFJvb3QpLCAnc2VydmVyLnRzJyk7XG4gICAgfSk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVdlYnBhY2tCdWlsZGVyV29ya3NwYWNlQ29uZmlnUnVsZShvcHRpb25zOiBBZGRTZXJ2ZXJPcHRpb25zKTogUnVsZSB7XG4gIHJldHVybiAoKSA9PiB7XG4gICAgcmV0dXJuIHVwZGF0ZVdvcmtzcGFjZSgod29ya3NwYWNlKSA9PiB7XG4gICAgICBjb25zdCBwcm9qZWN0TmFtZSA9IG9wdGlvbnMucHJvamVjdDtcbiAgICAgIGNvbnN0IHByb2plY3QgPSB3b3Jrc3BhY2UucHJvamVjdHMuZ2V0KHByb2plY3ROYW1lKTtcbiAgICAgIGlmICghcHJvamVjdCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tbm9uLW51bGwtYXNzZXJ0aW9uXG4gICAgICBjb25zdCBzZXJ2ZXJUYXJnZXQgPSBwcm9qZWN0LnRhcmdldHMuZ2V0KCdzZXJ2ZXInKSE7XG4gICAgICAoc2VydmVyVGFyZ2V0Lm9wdGlvbnMgPz89IHt9KS5tYWluID0gam9pbihub3JtYWxpemUocHJvamVjdC5yb290KSwgJ3NlcnZlci50cycpO1xuXG4gICAgICBjb25zdCBzZXJ2ZVNTUlRhcmdldCA9IHByb2plY3QudGFyZ2V0cy5nZXQoU0VSVkVfU1NSX1RBUkdFVF9OQU1FKTtcbiAgICAgIGlmIChzZXJ2ZVNTUlRhcmdldCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHByb2plY3QudGFyZ2V0cy5hZGQoe1xuICAgICAgICBuYW1lOiBTRVJWRV9TU1JfVEFSR0VUX05BTUUsXG4gICAgICAgIGJ1aWxkZXI6ICdAYW5ndWxhci1kZXZraXQvYnVpbGQtYW5ndWxhcjpzc3ItZGV2LXNlcnZlcicsXG4gICAgICAgIGRlZmF1bHRDb25maWd1cmF0aW9uOiAnZGV2ZWxvcG1lbnQnLFxuICAgICAgICBvcHRpb25zOiB7fSxcbiAgICAgICAgY29uZmlndXJhdGlvbnM6IHtcbiAgICAgICAgICBkZXZlbG9wbWVudDoge1xuICAgICAgICAgICAgYnJvd3NlclRhcmdldDogYCR7cHJvamVjdE5hbWV9OmJ1aWxkOmRldmVsb3BtZW50YCxcbiAgICAgICAgICAgIHNlcnZlclRhcmdldDogYCR7cHJvamVjdE5hbWV9OnNlcnZlcjpkZXZlbG9wbWVudGAsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBwcm9kdWN0aW9uOiB7XG4gICAgICAgICAgICBicm93c2VyVGFyZ2V0OiBgJHtwcm9qZWN0TmFtZX06YnVpbGQ6cHJvZHVjdGlvbmAsXG4gICAgICAgICAgICBzZXJ2ZXJUYXJnZXQ6IGAke3Byb2plY3ROYW1lfTpzZXJ2ZXI6cHJvZHVjdGlvbmAsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBwcmVyZW5kZXJUYXJnZXQgPSBwcm9qZWN0LnRhcmdldHMuZ2V0KFBSRVJFTkRFUl9UQVJHRVRfTkFNRSk7XG4gICAgICBpZiAocHJlcmVuZGVyVGFyZ2V0KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgcHJvamVjdC50YXJnZXRzLmFkZCh7XG4gICAgICAgIG5hbWU6IFBSRVJFTkRFUl9UQVJHRVRfTkFNRSxcbiAgICAgICAgYnVpbGRlcjogJ0Bhbmd1bGFyLWRldmtpdC9idWlsZC1hbmd1bGFyOnByZXJlbmRlcicsXG4gICAgICAgIGRlZmF1bHRDb25maWd1cmF0aW9uOiAncHJvZHVjdGlvbicsXG4gICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICByb3V0ZXM6IFsnLyddLFxuICAgICAgICB9LFxuICAgICAgICBjb25maWd1cmF0aW9uczoge1xuICAgICAgICAgIHByb2R1Y3Rpb246IHtcbiAgICAgICAgICAgIGJyb3dzZXJUYXJnZXQ6IGAke3Byb2plY3ROYW1lfTpidWlsZDpwcm9kdWN0aW9uYCxcbiAgICAgICAgICAgIHNlcnZlclRhcmdldDogYCR7cHJvamVjdE5hbWV9OnNlcnZlcjpwcm9kdWN0aW9uYCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGRldmVsb3BtZW50OiB7XG4gICAgICAgICAgICBicm93c2VyVGFyZ2V0OiBgJHtwcm9qZWN0TmFtZX06YnVpbGQ6ZGV2ZWxvcG1lbnRgLFxuICAgICAgICAgICAgc2VydmVyVGFyZ2V0OiBgJHtwcm9qZWN0TmFtZX06c2VydmVyOmRldmVsb3BtZW50YCxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVdlYnBhY2tCdWlsZGVyU2VydmVyVHNDb25maWdSdWxlKG9wdGlvbnM6IEFkZFNlcnZlck9wdGlvbnMpOiBSdWxlIHtcbiAgcmV0dXJuIGFzeW5jIChob3N0KSA9PiB7XG4gICAgY29uc3QgcHJvamVjdCA9IGF3YWl0IGdldFByb2plY3QoaG9zdCwgb3B0aW9ucy5wcm9qZWN0KTtcbiAgICBjb25zdCBzZXJ2ZXJUYXJnZXQgPSBwcm9qZWN0LnRhcmdldHMuZ2V0KCdzZXJ2ZXInKTtcbiAgICBpZiAoIXNlcnZlclRhcmdldCB8fCAhc2VydmVyVGFyZ2V0Lm9wdGlvbnMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB0c0NvbmZpZ1BhdGggPSBzZXJ2ZXJUYXJnZXQub3B0aW9ucy50c0NvbmZpZztcbiAgICBpZiAoIXRzQ29uZmlnUGF0aCB8fCB0eXBlb2YgdHNDb25maWdQYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgLy8gTm8gdHNjb25maWcgcGF0aFxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHRzQ29uZmlnID0gbmV3IEpTT05GaWxlKGhvc3QsIHRzQ29uZmlnUGF0aCk7XG4gICAgY29uc3QgZmlsZXNBc3ROb2RlID0gdHNDb25maWcuZ2V0KFsnZmlsZXMnXSk7XG4gICAgY29uc3Qgc2VydmVyRmlsZVBhdGggPSAnc2VydmVyLnRzJztcbiAgICBpZiAoQXJyYXkuaXNBcnJheShmaWxlc0FzdE5vZGUpICYmICFmaWxlc0FzdE5vZGUuc29tZSgoeyB0ZXh0IH0pID0+IHRleHQgPT09IHNlcnZlckZpbGVQYXRoKSkge1xuICAgICAgdHNDb25maWcubW9kaWZ5KFsnZmlsZXMnXSwgWy4uLmZpbGVzQXN0Tm9kZSwgc2VydmVyRmlsZVBhdGhdKTtcbiAgICB9XG4gIH07XG59XG5cbmZ1bmN0aW9uIHJvdXRpbmdJbml0aWFsTmF2aWdhdGlvblJ1bGUob3B0aW9uczogU2VydmVyT3B0aW9ucyk6IFJ1bGUge1xuICByZXR1cm4gYXN5bmMgKGhvc3QpID0+IHtcbiAgICBjb25zdCBwcm9qZWN0ID0gYXdhaXQgZ2V0UHJvamVjdChob3N0LCBvcHRpb25zLnByb2plY3QpO1xuICAgIGNvbnN0IHNlcnZlclRhcmdldCA9IHByb2plY3QudGFyZ2V0cy5nZXQoJ3NlcnZlcicpO1xuICAgIGlmICghc2VydmVyVGFyZ2V0IHx8ICFzZXJ2ZXJUYXJnZXQub3B0aW9ucykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHRzQ29uZmlnUGF0aCA9IHNlcnZlclRhcmdldC5vcHRpb25zLnRzQ29uZmlnO1xuICAgIGlmICghdHNDb25maWdQYXRoIHx8IHR5cGVvZiB0c0NvbmZpZ1BhdGggIT09ICdzdHJpbmcnIHx8ICFob3N0LmV4aXN0cyh0c0NvbmZpZ1BhdGgpKSB7XG4gICAgICAvLyBObyB0c2NvbmZpZyBwYXRoXG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgcGFyc2VDb25maWdIb3N0OiB0cy5QYXJzZUNvbmZpZ0hvc3QgPSB7XG4gICAgICB1c2VDYXNlU2Vuc2l0aXZlRmlsZU5hbWVzOiB0cy5zeXMudXNlQ2FzZVNlbnNpdGl2ZUZpbGVOYW1lcyxcbiAgICAgIHJlYWREaXJlY3Rvcnk6IHRzLnN5cy5yZWFkRGlyZWN0b3J5LFxuICAgICAgZmlsZUV4aXN0czogZnVuY3Rpb24gKGZpbGVOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIGhvc3QuZXhpc3RzKGZpbGVOYW1lKTtcbiAgICAgIH0sXG4gICAgICByZWFkRmlsZTogZnVuY3Rpb24gKGZpbGVOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gaG9zdC5yZWFkVGV4dChmaWxlTmFtZSk7XG4gICAgICB9LFxuICAgIH07XG4gICAgY29uc3QgeyBjb25maWcgfSA9IHRzLnJlYWRDb25maWdGaWxlKHRzQ29uZmlnUGF0aCwgcGFyc2VDb25maWdIb3N0LnJlYWRGaWxlKTtcbiAgICBjb25zdCBwYXJzZWQgPSB0cy5wYXJzZUpzb25Db25maWdGaWxlQ29udGVudChcbiAgICAgIGNvbmZpZyxcbiAgICAgIHBhcnNlQ29uZmlnSG9zdCxcbiAgICAgIGRpcm5hbWUobm9ybWFsaXplKHRzQ29uZmlnUGF0aCkpLFxuICAgICk7XG4gICAgY29uc3QgdHNIb3N0ID0gdHMuY3JlYXRlQ29tcGlsZXJIb3N0KHBhcnNlZC5vcHRpb25zLCB0cnVlKTtcbiAgICAvLyBTdHJpcCBCT00gYXMgb3RoZXJ3aXNlIFRTQyBtZXRob2RzIChFeDogZ2V0V2lkdGgpIHdpbGwgcmV0dXJuIGFuIG9mZnNldCxcbiAgICAvLyB3aGljaCBicmVha3MgdGhlIENMSSBVcGRhdGVSZWNvcmRlci5cbiAgICAvLyBTZWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9hbmd1bGFyL2FuZ3VsYXIvcHVsbC8zMDcxOVxuICAgIHRzSG9zdC5yZWFkRmlsZSA9IGZ1bmN0aW9uIChmaWxlTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgIHJldHVybiBob3N0LnJlYWRUZXh0KGZpbGVOYW1lKS5yZXBsYWNlKC9eXFx1RkVGRi8sICcnKTtcbiAgICB9O1xuICAgIHRzSG9zdC5kaXJlY3RvcnlFeGlzdHMgPSBmdW5jdGlvbiAoZGlyZWN0b3J5TmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAvLyBXaGVuIHRoZSBwYXRoIGlzIGZpbGUgZ2V0RGlyIHdpbGwgdGhyb3cuXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBkaXIgPSBob3N0LmdldERpcihkaXJlY3RvcnlOYW1lKTtcblxuICAgICAgICByZXR1cm4gISEoZGlyLnN1YmRpcnMubGVuZ3RoIHx8IGRpci5zdWJmaWxlcy5sZW5ndGgpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHRzSG9zdC5maWxlRXhpc3RzID0gZnVuY3Rpb24gKGZpbGVOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgIHJldHVybiBob3N0LmV4aXN0cyhmaWxlTmFtZSk7XG4gICAgfTtcbiAgICB0c0hvc3QucmVhbHBhdGggPSBmdW5jdGlvbiAocGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgIHJldHVybiBwYXRoO1xuICAgIH07XG4gICAgdHNIb3N0LmdldEN1cnJlbnREaXJlY3RvcnkgPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gaG9zdC5yb290LnBhdGg7XG4gICAgfTtcblxuICAgIGNvbnN0IHByb2dyYW0gPSB0cy5jcmVhdGVQcm9ncmFtKHBhcnNlZC5maWxlTmFtZXMsIHBhcnNlZC5vcHRpb25zLCB0c0hvc3QpO1xuICAgIGNvbnN0IHR5cGVDaGVja2VyID0gcHJvZ3JhbS5nZXRUeXBlQ2hlY2tlcigpO1xuICAgIGNvbnN0IHNvdXJjZUZpbGVzID0gcHJvZ3JhbVxuICAgICAgLmdldFNvdXJjZUZpbGVzKClcbiAgICAgIC5maWx0ZXIoKGYpID0+ICFmLmlzRGVjbGFyYXRpb25GaWxlICYmICFwcm9ncmFtLmlzU291cmNlRmlsZUZyb21FeHRlcm5hbExpYnJhcnkoZikpO1xuICAgIGNvbnN0IHByaW50ZXIgPSB0cy5jcmVhdGVQcmludGVyKCk7XG4gICAgY29uc3Qgcm91dGVyTW9kdWxlID0gJ1JvdXRlck1vZHVsZSc7XG4gICAgY29uc3Qgcm91dGVyU291cmNlID0gJ0Bhbmd1bGFyL3JvdXRlcic7XG5cbiAgICBzb3VyY2VGaWxlcy5mb3JFYWNoKChzb3VyY2VGaWxlKSA9PiB7XG4gICAgICBjb25zdCByb3V0ZXJJbXBvcnQgPSBmaW5kSW1wb3J0KHNvdXJjZUZpbGUsIHJvdXRlclNvdXJjZSwgcm91dGVyTW9kdWxlKTtcbiAgICAgIGlmICghcm91dGVySW1wb3J0KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgdHMuZm9yRWFjaENoaWxkKHNvdXJjZUZpbGUsIGZ1bmN0aW9uIHZpc2l0Tm9kZShub2RlOiB0cy5Ob2RlKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0cy5pc0NhbGxFeHByZXNzaW9uKG5vZGUpICYmXG4gICAgICAgICAgdHMuaXNQcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24obm9kZS5leHByZXNzaW9uKSAmJlxuICAgICAgICAgIHRzLmlzSWRlbnRpZmllcihub2RlLmV4cHJlc3Npb24uZXhwcmVzc2lvbikgJiZcbiAgICAgICAgICBub2RlLmV4cHJlc3Npb24ubmFtZS50ZXh0ID09PSAnZm9yUm9vdCdcbiAgICAgICAgKSB7XG4gICAgICAgICAgY29uc3QgaW1wID0gZ2V0SW1wb3J0T2ZJZGVudGlmaWVyKHR5cGVDaGVja2VyLCBub2RlLmV4cHJlc3Npb24uZXhwcmVzc2lvbik7XG5cbiAgICAgICAgICBpZiAoaW1wICYmIGltcC5uYW1lID09PSByb3V0ZXJNb2R1bGUgJiYgaW1wLmltcG9ydE1vZHVsZSA9PT0gcm91dGVyU291cmNlKSB7XG4gICAgICAgICAgICBjb25zdCBwcmludCA9IHByaW50ZXIucHJpbnROb2RlKFxuICAgICAgICAgICAgICB0cy5FbWl0SGludC5VbnNwZWNpZmllZCxcbiAgICAgICAgICAgICAgYWRkSW5pdGlhbE5hdmlnYXRpb24obm9kZSksXG4gICAgICAgICAgICAgIHNvdXJjZUZpbGUsXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICBjb25zdCByZWNvcmRlciA9IGhvc3QuYmVnaW5VcGRhdGUoc291cmNlRmlsZS5maWxlTmFtZSk7XG4gICAgICAgICAgICByZWNvcmRlci5yZW1vdmUobm9kZS5nZXRTdGFydCgpLCBub2RlLmdldFdpZHRoKCkpO1xuICAgICAgICAgICAgcmVjb3JkZXIuaW5zZXJ0UmlnaHQobm9kZS5nZXRTdGFydCgpLCBwcmludCk7XG4gICAgICAgICAgICBob3N0LmNvbW1pdFVwZGF0ZShyZWNvcmRlcik7XG5cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0cy5mb3JFYWNoQ2hpbGQobm9kZSwgdmlzaXROb2RlKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9O1xufVxuXG5mdW5jdGlvbiBhZGREZXBlbmRlbmNpZXMoKTogUnVsZSB7XG4gIHJldHVybiBjaGFpbihbXG4gICAgYWRkRGVwZW5kZW5jeSgnZXhwcmVzcycsIGxhdGVzdFZlcnNpb25zWydleHByZXNzJ10sIHtcbiAgICAgIHR5cGU6IERlcGVuZGVuY3lUeXBlLkRlZmF1bHQsXG4gICAgfSksXG4gICAgYWRkRGVwZW5kZW5jeSgnQHR5cGVzL2V4cHJlc3MnLCBsYXRlc3RWZXJzaW9uc1snQHR5cGVzL2V4cHJlc3MnXSwge1xuICAgICAgdHlwZTogRGVwZW5kZW5jeVR5cGUuRGV2LFxuICAgIH0pLFxuICBdKTtcbn1cblxuZnVuY3Rpb24gYWRkU2VydmVyRmlsZShvcHRpb25zOiBTZXJ2ZXJPcHRpb25zLCBpc1N0YW5kYWxvbmU6IGJvb2xlYW4pOiBSdWxlIHtcbiAgcmV0dXJuIGFzeW5jIChob3N0KSA9PiB7XG4gICAgY29uc3QgcHJvamVjdCA9IGF3YWl0IGdldFByb2plY3QoaG9zdCwgb3B0aW9ucy5wcm9qZWN0KTtcbiAgICBjb25zdCBicm93c2VyRGlzdERpcmVjdG9yeSA9IGF3YWl0IGdldE91dHB1dFBhdGgoaG9zdCwgb3B0aW9ucy5wcm9qZWN0LCAnYnVpbGQnKTtcblxuICAgIHJldHVybiBtZXJnZVdpdGgoXG4gICAgICBhcHBseShcbiAgICAgICAgdXJsKFxuICAgICAgICAgIGAuL2ZpbGVzLyR7XG4gICAgICAgICAgICBwcm9qZWN0Py50YXJnZXRzPy5nZXQoJ2J1aWxkJyk/LmJ1aWxkZXIgPT09IEJ1aWxkZXJzLkFwcGxpY2F0aW9uXG4gICAgICAgICAgICAgID8gJ2FwcGxpY2F0aW9uLWJ1aWxkZXInXG4gICAgICAgICAgICAgIDogJ3NlcnZlci1idWlsZGVyJ1xuICAgICAgICAgIH1gLFxuICAgICAgICApLFxuICAgICAgICBbXG4gICAgICAgICAgYXBwbHlUZW1wbGF0ZXMoe1xuICAgICAgICAgICAgLi4uc3RyaW5ncyxcbiAgICAgICAgICAgIC4uLm9wdGlvbnMsXG4gICAgICAgICAgICBicm93c2VyRGlzdERpcmVjdG9yeSxcbiAgICAgICAgICAgIGlzU3RhbmRhbG9uZSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBtb3ZlKHByb2plY3Qucm9vdCksXG4gICAgICAgIF0sXG4gICAgICApLFxuICAgICk7XG4gIH07XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIChvcHRpb25zOiBBZGRTZXJ2ZXJPcHRpb25zKTogUnVsZSB7XG4gIHJldHVybiBhc3luYyAoaG9zdCkgPT4ge1xuICAgIGNvbnN0IGJyb3dzZXJFbnRyeVBvaW50ID0gYXdhaXQgZ2V0TWFpbkZpbGVQYXRoKGhvc3QsIG9wdGlvbnMucHJvamVjdCk7XG4gICAgY29uc3QgaXNTdGFuZGFsb25lID0gaXNTdGFuZGFsb25lQXBwKGhvc3QsIGJyb3dzZXJFbnRyeVBvaW50KTtcblxuICAgIGNvbnN0IHdvcmtzcGFjZSA9IGF3YWl0IGdldFdvcmtzcGFjZShob3N0KTtcbiAgICBjb25zdCBjbGllbnRQcm9qZWN0ID0gd29ya3NwYWNlLnByb2plY3RzLmdldChvcHRpb25zLnByb2plY3QpO1xuICAgIGlmICghY2xpZW50UHJvamVjdCkge1xuICAgICAgdGhyb3cgdGFyZ2V0QnVpbGROb3RGb3VuZEVycm9yKCk7XG4gICAgfVxuICAgIGNvbnN0IGlzVXNpbmdBcHBsaWNhdGlvbkJ1aWxkZXIgPVxuICAgICAgY2xpZW50UHJvamVjdC50YXJnZXRzLmdldCgnYnVpbGQnKT8uYnVpbGRlciA9PT0gQnVpbGRlcnMuQXBwbGljYXRpb247XG5cbiAgICByZXR1cm4gY2hhaW4oW1xuICAgICAgZXh0ZXJuYWxTY2hlbWF0aWMoJ0BzY2hlbWF0aWNzL2FuZ3VsYXInLCAnc2VydmVyJywge1xuICAgICAgICAuLi5vcHRpb25zLFxuICAgICAgICBza2lwSW5zdGFsbDogdHJ1ZSxcbiAgICAgIH0pLFxuICAgICAgLi4uKGlzVXNpbmdBcHBsaWNhdGlvbkJ1aWxkZXJcbiAgICAgICAgPyBbXG4gICAgICAgICAgICB1cGRhdGVBcHBsaWNhdGlvbkJ1aWxkZXJXb3Jrc3BhY2VDb25maWdSdWxlKGNsaWVudFByb2plY3Qucm9vdCwgb3B0aW9ucyksXG4gICAgICAgICAgICB1cGRhdGVBcHBsaWNhdGlvbkJ1aWxkZXJUc0NvbmZpZ1J1bGUob3B0aW9ucyksXG4gICAgICAgICAgXVxuICAgICAgICA6IFtcbiAgICAgICAgICAgIGFkZFNjcmlwdHNSdWxlKG9wdGlvbnMpLFxuICAgICAgICAgICAgdXBkYXRlV2VicGFja0J1aWxkZXJTZXJ2ZXJUc0NvbmZpZ1J1bGUob3B0aW9ucyksXG4gICAgICAgICAgICB1cGRhdGVXZWJwYWNrQnVpbGRlcldvcmtzcGFjZUNvbmZpZ1J1bGUob3B0aW9ucyksXG4gICAgICAgICAgXSksXG4gICAgICBpc1N0YW5kYWxvbmUgPyBub29wKCkgOiByb3V0aW5nSW5pdGlhbE5hdmlnYXRpb25SdWxlKG9wdGlvbnMpLFxuICAgICAgYWRkU2VydmVyRmlsZShvcHRpb25zLCBpc1N0YW5kYWxvbmUpLFxuICAgICAgYWRkRGVwZW5kZW5jaWVzKCksXG4gICAgXSk7XG4gIH07XG59XG4iXX0=
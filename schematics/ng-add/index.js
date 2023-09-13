"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@angular-devkit/core");
const schematics_1 = require("@angular-devkit/schematics");
const utility_1 = require("@schematics/angular/utility");
const json_file_1 = require("@schematics/angular/utility/json-file");
const ng_ast_utils_1 = require("@schematics/angular/utility/ng-ast-utils");
const project_targets_1 = require("@schematics/angular/utility/project-targets");
const util_1 = require("@schematics/angular/utility/standalone/util");
const workspace_1 = require("@schematics/angular/utility/workspace");
const workspace_models_1 = require("@schematics/angular/utility/workspace-models");
const ts = __importStar(require("typescript"));
const latest_versions_1 = require("../utility/latest-versions");
const utils_1 = require("../utility/utils");
const SERVE_SSR_TARGET_NAME = 'serve-ssr';
const PRERENDER_TARGET_NAME = 'prerender';
function addScriptsRule(options) {
    return async (host) => {
        const pkgPath = '/package.json';
        const buffer = host.read(pkgPath);
        if (buffer === null) {
            throw new schematics_1.SchematicsException('Could not find package.json');
        }
        const serverDist = await (0, utils_1.getOutputPath)(host, options.project, 'server');
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
        const project = await (0, utils_1.getProject)(host, options.project);
        const buildTarget = project.targets.get('build');
        if (!buildTarget || !buildTarget.options) {
            return;
        }
        const tsConfigPath = buildTarget.options.tsConfig;
        if (!tsConfigPath || typeof tsConfigPath !== 'string') {
            // No tsconfig path
            return;
        }
        const tsConfig = new json_file_1.JSONFile(host, tsConfigPath);
        const filesAstNode = tsConfig.get(['files']);
        const serverFilePath = 'server.ts';
        if (Array.isArray(filesAstNode) && !filesAstNode.some(({ text }) => text === serverFilePath)) {
            tsConfig.modify(['files'], [...filesAstNode, serverFilePath]);
        }
    };
}
function updateApplicationBuilderWorkspaceConfigRule(projectRoot, options) {
    return () => {
        return (0, utility_1.updateWorkspace)((workspace) => {
            const buildTarget = workspace.projects.get(options.project)?.targets.get('build');
            if (!buildTarget) {
                return;
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const prodConfig = buildTarget.configurations?.production;
            if (!prodConfig) {
                throw new schematics_1.SchematicsException(`A "production" configuration is not defined for the "build" builder.`);
            }
            prodConfig.prerender = true;
            (prodConfig.ssr ??= {}).entry = (0, core_1.join)((0, core_1.normalize)(projectRoot), 'server.ts');
        });
    };
}
function updateWebpackBuilderWorkspaceConfigRule(options) {
    return () => {
        return (0, utility_1.updateWorkspace)((workspace) => {
            const projectName = options.project;
            const project = workspace.projects.get(projectName);
            if (!project) {
                return;
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const serverTarget = project.targets.get('server');
            (serverTarget.options ??= {}).main = (0, core_1.join)((0, core_1.normalize)(project.root), 'server.ts');
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
        const project = await (0, utils_1.getProject)(host, options.project);
        const serverTarget = project.targets.get('server');
        if (!serverTarget || !serverTarget.options) {
            return;
        }
        const tsConfigPath = serverTarget.options.tsConfig;
        if (!tsConfigPath || typeof tsConfigPath !== 'string') {
            // No tsconfig path
            return;
        }
        const tsConfig = new json_file_1.JSONFile(host, tsConfigPath);
        const filesAstNode = tsConfig.get(['files']);
        const serverFilePath = 'server.ts';
        if (Array.isArray(filesAstNode) && !filesAstNode.some(({ text }) => text === serverFilePath)) {
            tsConfig.modify(['files'], [...filesAstNode, serverFilePath]);
        }
    };
}
function routingInitialNavigationRule(options) {
    return async (host) => {
        const project = await (0, utils_1.getProject)(host, options.project);
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
        const parsed = ts.parseJsonConfigFileContent(config, parseConfigHost, (0, core_1.dirname)((0, core_1.normalize)(tsConfigPath)));
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
            const routerImport = (0, utils_1.findImport)(sourceFile, routerSource, routerModule);
            if (!routerImport) {
                return;
            }
            ts.forEachChild(sourceFile, function visitNode(node) {
                if (ts.isCallExpression(node) &&
                    ts.isPropertyAccessExpression(node.expression) &&
                    ts.isIdentifier(node.expression.expression) &&
                    node.expression.name.text === 'forRoot') {
                    const imp = (0, utils_1.getImportOfIdentifier)(typeChecker, node.expression.expression);
                    if (imp && imp.name === routerModule && imp.importModule === routerSource) {
                        const print = printer.printNode(ts.EmitHint.Unspecified, (0, utils_1.addInitialNavigation)(node), sourceFile);
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
    return (0, schematics_1.chain)([
        (0, utility_1.addDependency)('express', latest_versions_1.latestVersions['express'], {
            type: utility_1.DependencyType.Default,
        }),
        (0, utility_1.addDependency)('@types/express', latest_versions_1.latestVersions['@types/express'], {
            type: utility_1.DependencyType.Dev,
        }),
    ]);
}
function addServerFile(options, isStandalone) {
    return async (host) => {
        const project = await (0, utils_1.getProject)(host, options.project);
        const browserDistDirectory = await (0, utils_1.getOutputPath)(host, options.project, 'build');
        return (0, schematics_1.mergeWith)((0, schematics_1.apply)((0, schematics_1.url)(`./files/${project?.targets?.get('build')?.builder === workspace_models_1.Builders.Application
            ? 'application-builder'
            : 'server-builder'}`), [
            (0, schematics_1.applyTemplates)({
                ...core_1.strings,
                ...options,
                browserDistDirectory,
                isStandalone,
            }),
            (0, schematics_1.move)(project.root),
        ]));
    };
}
function default_1(options) {
    return async (host) => {
        const browserEntryPoint = await (0, util_1.getMainFilePath)(host, options.project);
        const isStandalone = (0, ng_ast_utils_1.isStandaloneApp)(host, browserEntryPoint);
        const workspace = await (0, workspace_1.getWorkspace)(host);
        const clientProject = workspace.projects.get(options.project);
        if (!clientProject) {
            throw (0, project_targets_1.targetBuildNotFoundError)();
        }
        const isUsingApplicationBuilder = clientProject.targets.get('build')?.builder === workspace_models_1.Builders.Application;
        return (0, schematics_1.chain)([
            (0, schematics_1.externalSchematic)('@schematics/angular', 'server', {
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
            isStandalone ? (0, schematics_1.noop)() : routingInitialNavigationRule(options),
            addServerFile(options, isStandalone),
            addDependencies(),
        ]);
    };
}
exports.default = default_1;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9hbmd1bGFyL3Nzci9zY2hlbWF0aWNzL25nLWFkZC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsK0NBQXlFO0FBQ3pFLDJEQVlvQztBQUVwQyx5REFBNkY7QUFDN0YscUVBQWlFO0FBQ2pFLDJFQUEyRTtBQUMzRSxpRkFBdUY7QUFDdkYsc0VBQThFO0FBQzlFLHFFQUFxRTtBQUNyRSxtRkFBd0U7QUFDeEUsK0NBQWlDO0FBRWpDLGdFQUE0RDtBQUM1RCw0Q0FNMEI7QUFJMUIsTUFBTSxxQkFBcUIsR0FBRyxXQUFXLENBQUM7QUFDMUMsTUFBTSxxQkFBcUIsR0FBRyxXQUFXLENBQUM7QUFFMUMsU0FBUyxjQUFjLENBQUMsT0FBeUI7SUFDL0MsT0FBTyxLQUFLLEVBQUUsSUFBSSxFQUFFLEVBQUU7UUFDcEIsTUFBTSxPQUFPLEdBQUcsZUFBZSxDQUFDO1FBQ2hDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDbEMsSUFBSSxNQUFNLEtBQUssSUFBSSxFQUFFO1lBQ25CLE1BQU0sSUFBSSxnQ0FBbUIsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1NBQzlEO1FBRUQsTUFBTSxVQUFVLEdBQUcsTUFBTSxJQUFBLHFCQUFhLEVBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDeEUsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQXlDLENBQUM7UUFDbEYsR0FBRyxDQUFDLE9BQU8sR0FBRztZQUNaLEdBQUcsR0FBRyxDQUFDLE9BQU87WUFDZCxTQUFTLEVBQUUsVUFBVSxPQUFPLENBQUMsT0FBTyxJQUFJLHFC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U0FDbEIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQWpDRCw0QkFpQ0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0IHsgZGlybmFtZSwgam9pbiwgbm9ybWFsaXplLCBzdHJpbmdzIH0gZnJvbSAnQGFuZ3VsYXItZGV2a2l0L2NvcmUnO1xuaW1wb3J0IHtcbiAgUnVsZSxcbiAgU2NoZW1hdGljc0V4Y2VwdGlvbixcbiAgVHJlZSxcbiAgYXBwbHksXG4gIGFwcGx5VGVtcGxhdGVzLFxuICBjaGFpbixcbiAgZXh0ZXJuYWxTY2hlbWF0aWMsXG4gIG1lcmdlV2l0aCxcbiAgbW92ZSxcbiAgbm9vcCxcbiAgdXJsLFxufSBmcm9tICdAYW5ndWxhci1kZXZraXQvc2NoZW1hdGljcyc7XG5pbXBvcnQgeyBTY2hlbWEgYXMgU2VydmVyT3B0aW9ucyB9IGZyb20gJ0BzY2hlbWF0aWNzL2FuZ3VsYXIvc2VydmVyL3NjaGVtYSc7XG5pbXBvcnQgeyBEZXBlbmRlbmN5VHlwZSwgYWRkRGVwZW5kZW5jeSwgdXBkYXRlV29ya3NwYWNlIH0gZnJvbSAnQHNjaGVtYXRpY3MvYW5ndWxhci91dGlsaXR5JztcbmltcG9ydCB7IEpTT05GaWxlIH0gZnJvbSAnQHNjaGVtYXRpY3MvYW5ndWxhci91dGlsaXR5L2pzb24tZmlsZSc7XG5pbXBvcnQgeyBpc1N0YW5kYWxvbmVBcHAgfSBmcm9tICdAc2NoZW1hdGljcy9hbmd1bGFyL3V0aWxpdHkvbmctYXN0LXV0aWxzJztcbmltcG9ydCB7IHRhcmdldEJ1aWxkTm90Rm91bmRFcnJvciB9IGZyb20gJ0BzY2hlbWF0aWNzL2FuZ3VsYXIvdXRpbGl0eS9wcm9qZWN0LXRhcmdldHMnO1xuaW1wb3J0IHsgZ2V0TWFpbkZpbGVQYXRoIH0gZnJvbSAnQHNjaGVtYXRpY3MvYW5ndWxhci91dGlsaXR5L3N0YW5kYWxvbmUvdXRpbCc7XG5pbXBvcnQgeyBnZXRXb3Jrc3BhY2UgfSBmcm9tICdAc2NoZW1hdGljcy9hbmd1bGFyL3V0aWxpdHkvd29ya3NwYWNlJztcbmltcG9ydCB7IEJ1aWxkZXJzIH0gZnJvbSAnQHNjaGVtYXRpY3MvYW5ndWxhci91dGlsaXR5L3dvcmtzcGFjZS1tb2RlbHMnO1xuaW1wb3J0ICogYXMgdHMgZnJvbSAndHlwZXNjcmlwdCc7XG5cbmltcG9ydCB7IGxhdGVzdFZlcnNpb25zIH0gZnJvbSAnLi4vdXRpbGl0eS9sYXRlc3QtdmVyc2lvbnMnO1xuaW1wb3J0IHtcbiAgYWRkSW5pdGlhbE5hdmlnYXRpb24sXG4gIGZpbmRJbXBvcnQsXG4gIGdldEltcG9ydE9mSWRlbnRpZmllcixcbiAgZ2V0T3V0cHV0UGF0aCxcbiAgZ2V0UHJvamVjdCxcbn0gZnJvbSAnLi4vdXRpbGl0eS91dGlscyc7XG5cbmltcG9ydCB7IFNjaGVtYSBhcyBBZGRTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi9zY2hlbWEnO1xuXG5jb25zdCBTRVJWRV9TU1JfVEFSR0VUX05BTUUgPSAnc2VydmUtc3NyJztcbmNvbnN0IFBSRVJFTkRFUl9UQVJHRVRfTkFNRSA9ICdwcmVyZW5kZXInO1xuXG5mdW5jdGlvbiBhZGRTY3JpcHRzUnVsZShvcHRpb25zOiBBZGRTZXJ2ZXJPcHRpb25zKTogUnVsZSB7XG4gIHJldHVybiBhc3luYyAoaG9zdCkgPT4ge1xuICAgIGNvbnN0IHBrZ1BhdGggPSAnL3BhY2thZ2UuanNvbic7XG4gICAgY29uc3QgYnVmZmVyID0gaG9zdC5yZWFkKHBrZ1BhdGgpO1xuICAgIGlmIChidWZmZXIgPT09IG51bGwpIHtcbiAgICAgIHRocm93IG5ldyBTY2hlbWF0aWNzRXhjZXB0aW9uKCdDb3VsZCBub3QgZmluZCBwYWNrYWdlLmpzb24nKTtcbiAgICB9XG5cbiAgICBjb25zdCBzZXJ2ZXJEaXN0ID0gYXdhaXQgZ2V0T3V0cHV0UGF0aChob3N0LCBvcHRpb25zLnByb2plY3QsICdzZXJ2ZXInKTtcbiAgICBjb25zdCBwa2cgPSBKU09OLnBhcnNlKGJ1ZmZlci50b1N0cmluZygpKSBhcyB7IHNjcmlwdHM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IH07XG4gICAgcGtnLnNjcmlwdHMgPSB7XG4gICAgICAuLi5wa2cuc2NyaXB0cyxcbiAgICAgICdkZXY6c3NyJzogYG5nIHJ1biAke29wdGlvbnMucHJvamVjdH06JHtTRVJWRV9TU1JfVEFSR0VUX05BTUV9YCxcbiAgICAgICdzZXJ2ZTpzc3InOiBgbm9kZSAke3NlcnZlckRpc3R9L21haW4uanNgLFxuICAgICAgJ2J1aWxkOnNzcic6IGBuZyBidWlsZCAmJiBuZyBydW4gJHtvcHRpb25zLnByb2plY3R9OnNlcnZlcmAsXG4gICAgICAncHJlcmVuZGVyJzogYG5nIHJ1biAke29wdGlvbnMucHJvamVjdH06JHtQUkVSRU5ERVJfVEFSR0VUX05BTUV9YCxcbiAgICB9O1xuXG4gICAgaG9zdC5vdmVyd3JpdGUocGtnUGF0aCwgSlNPTi5zdHJpbmdpZnkocGtnLCBudWxsLCAyKSk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUFwcGxpY2F0aW9uQnVpbGRlclRzQ29uZmlnUnVsZShvcHRpb25zOiBBZGRTZXJ2ZXJPcHRpb25zKTogUnVsZSB7XG4gIHJldHVybiBhc3luYyAoaG9zdCkgPT4ge1xuICAgIGNvbnN0IHByb2plY3QgPSBhd2FpdCBnZXRQcm9qZWN0KGhvc3QsIG9wdGlvbnMucHJvamVjdCk7XG4gICAgY29uc3QgYnVpbGRUYXJnZXQgPSBwcm9qZWN0LnRhcmdldHMuZ2V0KCdidWlsZCcpO1xuICAgIGlmICghYnVpbGRUYXJnZXQgfHwgIWJ1aWxkVGFyZ2V0Lm9wdGlvbnMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB0c0NvbmZpZ1BhdGggPSBidWlsZFRhcmdldC5vcHRpb25zLnRzQ29uZmlnO1xuICAgIGlmICghdHNDb25maWdQYXRoIHx8IHR5cGVvZiB0c0NvbmZpZ1BhdGggIT09ICdzdHJpbmcnKSB7XG4gICAgICAvLyBObyB0c2NvbmZpZyBwYXRoXG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgdHNDb25maWcgPSBuZXcgSlNPTkZpbGUoaG9zdCwgdHNDb25maWdQYXRoKTtcbiAgICBjb25zdCBmaWxlc0FzdE5vZGUgPSB0c0NvbmZpZy5nZXQoWydmaWxlcyddKTtcbiAgICBjb25zdCBzZXJ2ZXJGaWxlUGF0aCA9ICdzZXJ2ZXIudHMnO1xuICAgIGlmIChBcnJheS5pc0FycmF5KGZpbGVzQXN0Tm9kZSkgJiYgIWZpbGVzQXN0Tm9kZS5zb21lKCh7IHRleHQgfSkgPT4gdGV4dCA9PT0gc2VydmVyRmlsZVBhdGgpKSB7XG4gICAgICB0c0NvbmZpZy5tb2RpZnkoWydmaWxlcyddLCBbLi4uZmlsZXNBc3ROb2RlLCBzZXJ2ZXJGaWxlUGF0aF0pO1xuICAgIH1cbiAgfTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlQXBwbGljYXRpb25CdWlsZGVyV29ya3NwYWNlQ29uZmlnUnVsZShcbiAgcHJvamVjdFJvb3Q6IHN0cmluZyxcbiAgb3B0aW9uczogQWRkU2VydmVyT3B0aW9ucyxcbik6IFJ1bGUge1xuICByZXR1cm4gKCkgPT4ge1xuICAgIHJldHVybiB1cGRhdGVXb3Jrc3BhY2UoKHdvcmtzcGFjZSkgPT4ge1xuICAgICAgY29uc3QgYnVpbGRUYXJnZXQgPSB3b3Jrc3BhY2UucHJvamVjdHMuZ2V0KG9wdGlvbnMucHJvamVjdCk/LnRhcmdldHMuZ2V0KCdidWlsZCcpO1xuICAgICAgaWYgKCFidWlsZFRhcmdldCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICBjb25zdCBwcm9kQ29uZmlnID0gYnVpbGRUYXJnZXQuY29uZmlndXJhdGlvbnM/LnByb2R1Y3Rpb24gYXMgUmVjb3JkPHN0cmluZywgYW55PjtcbiAgICAgIGlmICghcHJvZENvbmZpZykge1xuICAgICAgICB0aHJvdyBuZXcgU2NoZW1hdGljc0V4Y2VwdGlvbihcbiAgICAgICAgICBgQSBcInByb2R1Y3Rpb25cIiBjb25maWd1cmF0aW9uIGlzIG5vdCBkZWZpbmVkIGZvciB0aGUgXCJidWlsZFwiIGJ1aWxkZXIuYCxcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgcHJvZENvbmZpZy5wcmVyZW5kZXIgPSB0cnVlO1xuICAgICAgKHByb2RDb25maWcuc3NyID8/PSB7fSkuZW50cnkgPSBqb2luKG5vcm1hbGl6ZShwcm9qZWN0Um9vdCksICdzZXJ2ZXIudHMnKTtcbiAgICB9KTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlV2VicGFja0J1aWxkZXJXb3Jrc3BhY2VDb25maWdSdWxlKG9wdGlvbnM6IEFkZFNlcnZlck9wdGlvbnMpOiBSdWxlIHtcbiAgcmV0dXJuICgpID0+IHtcbiAgICByZXR1cm4gdXBkYXRlV29ya3NwYWNlKCh3b3Jrc3BhY2UpID0+IHtcbiAgICAgIGNvbnN0IHByb2plY3ROYW1lID0gb3B0aW9ucy5wcm9qZWN0O1xuICAgICAgY29uc3QgcHJvamVjdCA9IHdvcmtzcGFjZS5wcm9qZWN0cy5nZXQocHJvamVjdE5hbWUpO1xuICAgICAgaWYgKCFwcm9qZWN0KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1ub24tbnVsbC1hc3NlcnRpb25cbiAgICAgIGNvbnN0IHNlcnZlclRhcmdldCA9IHByb2plY3QudGFyZ2V0cy5nZXQoJ3NlcnZlcicpITtcbiAgICAgIChzZXJ2ZXJUYXJnZXQub3B0aW9ucyA/Pz0ge30pLm1haW4gPSBqb2luKG5vcm1hbGl6ZShwcm9qZWN0LnJvb3QpLCAnc2VydmVyLnRzJyk7XG5cbiAgICAgIGNvbnN0IHNlcnZlU1NSVGFyZ2V0ID0gcHJvamVjdC50YXJnZXRzLmdldChTRVJWRV9TU1JfVEFSR0VUX05BTUUpO1xuICAgICAgaWYgKHNlcnZlU1NSVGFyZ2V0KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgcHJvamVjdC50YXJnZXRzLmFkZCh7XG4gICAgICAgIG5hbWU6IFNFUlZFX1NTUl9UQVJHRVRfTkFNRSxcbiAgICAgICAgYnVpbGRlcjogJ0Bhbmd1bGFyLWRldmtpdC9idWlsZC1hbmd1bGFyOnNzci1kZXYtc2VydmVyJyxcbiAgICAgICAgZGVmYXVsdENvbmZpZ3VyYXRpb246ICdkZXZlbG9wbWVudCcsXG4gICAgICAgIG9wdGlvbnM6IHt9LFxuICAgICAgICBjb25maWd1cmF0aW9uczoge1xuICAgICAgICAgIGRldmVsb3BtZW50OiB7XG4gICAgICAgICAgICBicm93c2VyVGFyZ2V0OiBgJHtwcm9qZWN0TmFtZX06YnVpbGQ6ZGV2ZWxvcG1lbnRgLFxuICAgICAgICAgICAgc2VydmVyVGFyZ2V0OiBgJHtwcm9qZWN0TmFtZX06c2VydmVyOmRldmVsb3BtZW50YCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHByb2R1Y3Rpb246IHtcbiAgICAgICAgICAgIGJyb3dzZXJUYXJnZXQ6IGAke3Byb2plY3ROYW1lfTpidWlsZDpwcm9kdWN0aW9uYCxcbiAgICAgICAgICAgIHNlcnZlclRhcmdldDogYCR7cHJvamVjdE5hbWV9OnNlcnZlcjpwcm9kdWN0aW9uYCxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHByZXJlbmRlclRhcmdldCA9IHByb2plY3QudGFyZ2V0cy5nZXQoUFJFUkVOREVSX1RBUkdFVF9OQU1FKTtcbiAgICAgIGlmIChwcmVyZW5kZXJUYXJnZXQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBwcm9qZWN0LnRhcmdldHMuYWRkKHtcbiAgICAgICAgbmFtZTogUFJFUkVOREVSX1RBUkdFVF9OQU1FLFxuICAgICAgICBidWlsZGVyOiAnQGFuZ3VsYXItZGV2a2l0L2J1aWxkLWFuZ3VsYXI6cHJlcmVuZGVyJyxcbiAgICAgICAgZGVmYXVsdENvbmZpZ3VyYXRpb246ICdwcm9kdWN0aW9uJyxcbiAgICAgICAgb3B0aW9uczoge1xuICAgICAgICAgIHJvdXRlczogWycvJ10sXG4gICAgICAgIH0sXG4gICAgICAgIGNvbmZpZ3VyYXRpb25zOiB7XG4gICAgICAgICAgcHJvZHVjdGlvbjoge1xuICAgICAgICAgICAgYnJvd3NlclRhcmdldDogYCR7cHJvamVjdE5hbWV9OmJ1aWxkOnByb2R1Y3Rpb25gLFxuICAgICAgICAgICAgc2VydmVyVGFyZ2V0OiBgJHtwcm9qZWN0TmFtZX06c2VydmVyOnByb2R1Y3Rpb25gLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgZGV2ZWxvcG1lbnQ6IHtcbiAgICAgICAgICAgIGJyb3dzZXJUYXJnZXQ6IGAke3Byb2plY3ROYW1lfTpidWlsZDpkZXZlbG9wbWVudGAsXG4gICAgICAgICAgICBzZXJ2ZXJUYXJnZXQ6IGAke3Byb2plY3ROYW1lfTpzZXJ2ZXI6ZGV2ZWxvcG1lbnRgLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlV2VicGFja0J1aWxkZXJTZXJ2ZXJUc0NvbmZpZ1J1bGUob3B0aW9uczogQWRkU2VydmVyT3B0aW9ucyk6IFJ1bGUge1xuICByZXR1cm4gYXN5bmMgKGhvc3QpID0+IHtcbiAgICBjb25zdCBwcm9qZWN0ID0gYXdhaXQgZ2V0UHJvamVjdChob3N0LCBvcHRpb25zLnByb2plY3QpO1xuICAgIGNvbnN0IHNlcnZlclRhcmdldCA9IHByb2plY3QudGFyZ2V0cy5nZXQoJ3NlcnZlcicpO1xuICAgIGlmICghc2VydmVyVGFyZ2V0IHx8ICFzZXJ2ZXJUYXJnZXQub3B0aW9ucykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHRzQ29uZmlnUGF0aCA9IHNlcnZlclRhcmdldC5vcHRpb25zLnRzQ29uZmlnO1xuICAgIGlmICghdHNDb25maWdQYXRoIHx8IHR5cGVvZiB0c0NvbmZpZ1BhdGggIT09ICdzdHJpbmcnKSB7XG4gICAgICAvLyBObyB0c2NvbmZpZyBwYXRoXG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgdHNDb25maWcgPSBuZXcgSlNPTkZpbGUoaG9zdCwgdHNDb25maWdQYXRoKTtcbiAgICBjb25zdCBmaWxlc0FzdE5vZGUgPSB0c0NvbmZpZy5nZXQoWydmaWxlcyddKTtcbiAgICBjb25zdCBzZXJ2ZXJGaWxlUGF0aCA9ICdzZXJ2ZXIudHMnO1xuICAgIGlmIChBcnJheS5pc0FycmF5KGZpbGVzQXN0Tm9kZSkgJiYgIWZpbGVzQXN0Tm9kZS5zb21lKCh7IHRleHQgfSkgPT4gdGV4dCA9PT0gc2VydmVyRmlsZVBhdGgpKSB7XG4gICAgICB0c0NvbmZpZy5tb2RpZnkoWydmaWxlcyddLCBbLi4uZmlsZXNBc3ROb2RlLCBzZXJ2ZXJGaWxlUGF0aF0pO1xuICAgIH1cbiAgfTtcbn1cblxuZnVuY3Rpb24gcm91dGluZ0luaXRpYWxOYXZpZ2F0aW9uUnVsZShvcHRpb25zOiBTZXJ2ZXJPcHRpb25zKTogUnVsZSB7XG4gIHJldHVybiBhc3luYyAoaG9zdCkgPT4ge1xuICAgIGNvbnN0IHByb2plY3QgPSBhd2FpdCBnZXRQcm9qZWN0KGhvc3QsIG9wdGlvbnMucHJvamVjdCk7XG4gICAgY29uc3Qgc2VydmVyVGFyZ2V0ID0gcHJvamVjdC50YXJnZXRzLmdldCgnc2VydmVyJyk7XG4gICAgaWYgKCFzZXJ2ZXJUYXJnZXQgfHwgIXNlcnZlclRhcmdldC5vcHRpb25zKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgdHNDb25maWdQYXRoID0gc2VydmVyVGFyZ2V0Lm9wdGlvbnMudHNDb25maWc7XG4gICAgaWYgKCF0c0NvbmZpZ1BhdGggfHwgdHlwZW9mIHRzQ29uZmlnUGF0aCAhPT0gJ3N0cmluZycgfHwgIWhvc3QuZXhpc3RzKHRzQ29uZmlnUGF0aCkpIHtcbiAgICAgIC8vIE5vIHRzY29uZmlnIHBhdGhcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBwYXJzZUNvbmZpZ0hvc3Q6IHRzLlBhcnNlQ29uZmlnSG9zdCA9IHtcbiAgICAgIHVzZUNhc2VTZW5zaXRpdmVGaWxlTmFtZXM6IHRzLnN5cy51c2VDYXNlU2Vuc2l0aXZlRmlsZU5hbWVzLFxuICAgICAgcmVhZERpcmVjdG9yeTogdHMuc3lzLnJlYWREaXJlY3RvcnksXG4gICAgICBmaWxlRXhpc3RzOiBmdW5jdGlvbiAoZmlsZU5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gaG9zdC5leGlzdHMoZmlsZU5hbWUpO1xuICAgICAgfSxcbiAgICAgIHJlYWRGaWxlOiBmdW5jdGlvbiAoZmlsZU5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiBob3N0LnJlYWRUZXh0KGZpbGVOYW1lKTtcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCB7IGNvbmZpZyB9ID0gdHMucmVhZENvbmZpZ0ZpbGUodHNDb25maWdQYXRoLCBwYXJzZUNvbmZpZ0hvc3QucmVhZEZpbGUpO1xuICAgIGNvbnN0IHBhcnNlZCA9IHRzLnBhcnNlSnNvbkNvbmZpZ0ZpbGVDb250ZW50KFxuICAgICAgY29uZmlnLFxuICAgICAgcGFyc2VDb25maWdIb3N0LFxuICAgICAgZGlybmFtZShub3JtYWxpemUodHNDb25maWdQYXRoKSksXG4gICAgKTtcbiAgICBjb25zdCB0c0hvc3QgPSB0cy5jcmVhdGVDb21waWxlckhvc3QocGFyc2VkLm9wdGlvbnMsIHRydWUpO1xuICAgIC8vIFN0cmlwIEJPTSBhcyBvdGhlcndpc2UgVFNDIG1ldGhvZHMgKEV4OiBnZXRXaWR0aCkgd2lsbCByZXR1cm4gYW4gb2Zmc2V0LFxuICAgIC8vIHdoaWNoIGJyZWFrcyB0aGUgQ0xJIFVwZGF0ZVJlY29yZGVyLlxuICAgIC8vIFNlZTogaHR0cHM6Ly9naXRodWIuY29tL2FuZ3VsYXIvYW5ndWxhci9wdWxsLzMwNzE5XG4gICAgdHNIb3N0LnJlYWRGaWxlID0gZnVuY3Rpb24gKGZpbGVOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgcmV0dXJuIGhvc3QucmVhZFRleHQoZmlsZU5hbWUpLnJlcGxhY2UoL15cXHVGRUZGLywgJycpO1xuICAgIH07XG4gICAgdHNIb3N0LmRpcmVjdG9yeUV4aXN0cyA9IGZ1bmN0aW9uIChkaXJlY3RvcnlOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgIC8vIFdoZW4gdGhlIHBhdGggaXMgZmlsZSBnZXREaXIgd2lsbCB0aHJvdy5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGRpciA9IGhvc3QuZ2V0RGlyKGRpcmVjdG9yeU5hbWUpO1xuXG4gICAgICAgIHJldHVybiAhIShkaXIuc3ViZGlycy5sZW5ndGggfHwgZGlyLnN1YmZpbGVzLmxlbmd0aCk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH07XG4gICAgdHNIb3N0LmZpbGVFeGlzdHMgPSBmdW5jdGlvbiAoZmlsZU5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgcmV0dXJuIGhvc3QuZXhpc3RzKGZpbGVOYW1lKTtcbiAgICB9O1xuICAgIHRzSG9zdC5yZWFscGF0aCA9IGZ1bmN0aW9uIChwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgcmV0dXJuIHBhdGg7XG4gICAgfTtcbiAgICB0c0hvc3QuZ2V0Q3VycmVudERpcmVjdG9yeSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBob3N0LnJvb3QucGF0aDtcbiAgICB9O1xuXG4gICAgY29uc3QgcHJvZ3JhbSA9IHRzLmNyZWF0ZVByb2dyYW0ocGFyc2VkLmZpbGVOYW1lcywgcGFyc2VkLm9wdGlvbnMsIHRzSG9zdCk7XG4gICAgY29uc3QgdHlwZUNoZWNrZXIgPSBwcm9ncmFtLmdldFR5cGVDaGVja2VyKCk7XG4gICAgY29uc3Qgc291cmNlRmlsZXMgPSBwcm9ncmFtXG4gICAgICAuZ2V0U291cmNlRmlsZXMoKVxuICAgICAgLmZpbHRlcigoZikgPT4gIWYuaXNEZWNsYXJhdGlvbkZpbGUgJiYgIXByb2dyYW0uaXNTb3VyY2VGaWxlRnJvbUV4dGVybmFsTGlicmFyeShmKSk7XG4gICAgY29uc3QgcHJpbnRlciA9IHRzLmNyZWF0ZVByaW50ZXIoKTtcbiAgICBjb25zdCByb3V0ZXJNb2R1bGUgPSAnUm91dGVyTW9kdWxlJztcbiAgICBjb25zdCByb3V0ZXJTb3VyY2UgPSAnQGFuZ3VsYXIvcm91dGVyJztcblxuICAgIHNvdXJjZUZpbGVzLmZvckVhY2goKHNvdXJjZUZpbGUpID0+IHtcbiAgICAgIGNvbnN0IHJvdXRlckltcG9ydCA9IGZpbmRJbXBvcnQoc291cmNlRmlsZSwgcm91dGVyU291cmNlLCByb3V0ZXJNb2R1bGUpO1xuICAgICAgaWYgKCFyb3V0ZXJJbXBvcnQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICB0cy5mb3JFYWNoQ2hpbGQoc291cmNlRmlsZSwgZnVuY3Rpb24gdmlzaXROb2RlKG5vZGU6IHRzLk5vZGUpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRzLmlzQ2FsbEV4cHJlc3Npb24obm9kZSkgJiZcbiAgICAgICAgICB0cy5pc1Byb3BlcnR5QWNjZXNzRXhwcmVzc2lvbihub2RlLmV4cHJlc3Npb24pICYmXG4gICAgICAgICAgdHMuaXNJZGVudGlmaWVyKG5vZGUuZXhwcmVzc2lvbi5leHByZXNzaW9uKSAmJlxuICAgICAgICAgIG5vZGUuZXhwcmVzc2lvbi5uYW1lLnRleHQgPT09ICdmb3JSb290J1xuICAgICAgICApIHtcbiAgICAgICAgICBjb25zdCBpbXAgPSBnZXRJbXBvcnRPZklkZW50aWZpZXIodHlwZUNoZWNrZXIsIG5vZGUuZXhwcmVzc2lvbi5leHByZXNzaW9uKTtcblxuICAgICAgICAgIGlmIChpbXAgJiYgaW1wLm5hbWUgPT09IHJvdXRlck1vZHVsZSAmJiBpbXAuaW1wb3J0TW9kdWxlID09PSByb3V0ZXJTb3VyY2UpIHtcbiAgICAgICAgICAgIGNvbnN0IHByaW50ID0gcHJpbnRlci5wcmludE5vZGUoXG4gICAgICAgICAgICAgIHRzLkVtaXRIaW50LlVuc3BlY2lmaWVkLFxuICAgICAgICAgICAgICBhZGRJbml0aWFsTmF2aWdhdGlvbihub2RlKSxcbiAgICAgICAgICAgICAgc291cmNlRmlsZSxcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIGNvbnN0IHJlY29yZGVyID0gaG9zdC5iZWdpblVwZGF0ZShzb3VyY2VGaWxlLmZpbGVOYW1lKTtcbiAgICAgICAgICAgIHJlY29yZGVyLnJlbW92ZShub2RlLmdldFN0YXJ0KCksIG5vZGUuZ2V0V2lkdGgoKSk7XG4gICAgICAgICAgICByZWNvcmRlci5pbnNlcnRSaWdodChub2RlLmdldFN0YXJ0KCksIHByaW50KTtcbiAgICAgICAgICAgIGhvc3QuY29tbWl0VXBkYXRlKHJlY29yZGVyKTtcblxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRzLmZvckVhY2hDaGlsZChub2RlLCB2aXNpdE5vZGUpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIGFkZERlcGVuZGVuY2llcygpOiBSdWxlIHtcbiAgcmV0dXJuIGNoYWluKFtcbiAgICBhZGREZXBlbmRlbmN5KCdleHByZXNzJywgbGF0ZXN0VmVyc2lvbnNbJ2V4cHJlc3MnXSwge1xuICAgICAgdHlwZTogRGVwZW5kZW5jeVR5cGUuRGVmYXVsdCxcbiAgICB9KSxcbiAgICBhZGREZXBlbmRlbmN5KCdAdHlwZXMvZXhwcmVzcycsIGxhdGVzdFZlcnNpb25zWydAdHlwZXMvZXhwcmVzcyddLCB7XG4gICAgICB0eXBlOiBEZXBlbmRlbmN5VHlwZS5EZXYsXG4gICAgfSksXG4gIF0pO1xufVxuXG5mdW5jdGlvbiBhZGRTZXJ2ZXJGaWxlKG9wdGlvbnM6IFNlcnZlck9wdGlvbnMsIGlzU3RhbmRhbG9uZTogYm9vbGVhbik6IFJ1bGUge1xuICByZXR1cm4gYXN5bmMgKGhvc3QpID0+IHtcbiAgICBjb25zdCBwcm9qZWN0ID0gYXdhaXQgZ2V0UHJvamVjdChob3N0LCBvcHRpb25zLnByb2plY3QpO1xuICAgIGNvbnN0IGJyb3dzZXJEaXN0RGlyZWN0b3J5ID0gYXdhaXQgZ2V0T3V0cHV0UGF0aChob3N0LCBvcHRpb25zLnByb2plY3QsICdidWlsZCcpO1xuXG4gICAgcmV0dXJuIG1lcmdlV2l0aChcbiAgICAgIGFwcGx5KFxuICAgICAgICB1cmwoXG4gICAgICAgICAgYC4vZmlsZXMvJHtcbiAgICAgICAgICAgIHByb2plY3Q/LnRhcmdldHM/LmdldCgnYnVpbGQnKT8uYnVpbGRlciA9PT0gQnVpbGRlcnMuQXBwbGljYXRpb25cbiAgICAgICAgICAgICAgPyAnYXBwbGljYXRpb24tYnVpbGRlcidcbiAgICAgICAgICAgICAgOiAnc2VydmVyLWJ1aWxkZXInXG4gICAgICAgICAgfWAsXG4gICAgICAgICksXG4gICAgICAgIFtcbiAgICAgICAgICBhcHBseVRlbXBsYXRlcyh7XG4gICAgICAgICAgICAuLi5zdHJpbmdzLFxuICAgICAgICAgICAgLi4ub3B0aW9ucyxcbiAgICAgICAgICAgIGJyb3dzZXJEaXN0RGlyZWN0b3J5LFxuICAgICAgICAgICAgaXNTdGFuZGFsb25lLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIG1vdmUocHJvamVjdC5yb290KSxcbiAgICAgICAgXSxcbiAgICAgICksXG4gICAgKTtcbiAgfTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gKG9wdGlvbnM6IEFkZFNlcnZlck9wdGlvbnMpOiBSdWxlIHtcbiAgcmV0dXJuIGFzeW5jIChob3N0KSA9PiB7XG4gICAgY29uc3QgYnJvd3NlckVudHJ5UG9pbnQgPSBhd2FpdCBnZXRNYWluRmlsZVBhdGgoaG9zdCwgb3B0aW9ucy5wcm9qZWN0KTtcbiAgICBjb25zdCBpc1N0YW5kYWxvbmUgPSBpc1N0YW5kYWxvbmVBcHAoaG9zdCwgYnJvd3NlckVudHJ5UG9pbnQpO1xuXG4gICAgY29uc3Qgd29ya3NwYWNlID0gYXdhaXQgZ2V0V29ya3NwYWNlKGhvc3QpO1xuICAgIGNvbnN0IGNsaWVudFByb2plY3QgPSB3b3Jrc3BhY2UucHJvamVjdHMuZ2V0KG9wdGlvbnMucHJvamVjdCk7XG4gICAgaWYgKCFjbGllbnRQcm9qZWN0KSB7XG4gICAgICB0aHJvdyB0YXJnZXRCdWlsZE5vdEZvdW5kRXJyb3IoKTtcbiAgICB9XG4gICAgY29uc3QgaXNVc2luZ0FwcGxpY2F0aW9uQnVpbGRlciA9XG4gICAgICBjbGllbnRQcm9qZWN0LnRhcmdldHMuZ2V0KCdidWlsZCcpPy5idWlsZGVyID09PSBCdWlsZGVycy5BcHBsaWNhdGlvbjtcblxuICAgIHJldHVybiBjaGFpbihbXG4gICAgICBleHRlcm5hbFNjaGVtYXRpYygnQHNjaGVtYXRpY3MvYW5ndWxhcicsICdzZXJ2ZXInLCB7XG4gICAgICAgIC4uLm9wdGlvbnMsXG4gICAgICAgIHNraXBJbnN0YWxsOiB0cnVlLFxuICAgICAgfSksXG4gICAgICAuLi4oaXNVc2luZ0FwcGxpY2F0aW9uQnVpbGRlclxuICAgICAgICA/IFtcbiAgICAgICAgICAgIHVwZGF0ZUFwcGxpY2F0aW9uQnVpbGRlcldvcmtzcGFjZUNvbmZpZ1J1bGUoY2xpZW50UHJvamVjdC5yb290LCBvcHRpb25zKSxcbiAgICAgICAgICAgIHVwZGF0ZUFwcGxpY2F0aW9uQnVpbGRlclRzQ29uZmlnUnVsZShvcHRpb25zKSxcbiAgICAgICAgICBdXG4gICAgICAgIDogW1xuICAgICAgICAgICAgYWRkU2NyaXB0c1J1bGUob3B0aW9ucyksXG4gICAgICAgICAgICB1cGRhdGVXZWJwYWNrQnVpbGRlclNlcnZlclRzQ29uZmlnUnVsZShvcHRpb25zKSxcbiAgICAgICAgICAgIHVwZGF0ZVdlYnBhY2tCdWlsZGVyV29ya3NwYWNlQ29uZmlnUnVsZShvcHRpb25zKSxcbiAgICAgICAgICBdKSxcbiAgICAgIGlzU3RhbmRhbG9uZSA/IG5vb3AoKSA6IHJvdXRpbmdJbml0aWFsTmF2aWdhdGlvblJ1bGUob3B0aW9ucyksXG4gICAgICBhZGRTZXJ2ZXJGaWxlKG9wdGlvbnMsIGlzU3RhbmRhbG9uZSksXG4gICAgICBhZGREZXBlbmRlbmNpZXMoKSxcbiAgICBdKTtcbiAgfTtcbn1cbiJdfQ==
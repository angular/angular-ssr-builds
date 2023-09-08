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
function updateWorkspaceConfigRule(options) {
    return () => {
        return (0, utility_1.updateWorkspace)((workspace) => {
            const projectName = options.project;
            const project = workspace.projects.get(projectName);
            if (!project) {
                return;
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const serverTarget = project.targets.get('server');
            (serverTarget.options ?? (serverTarget.options = {})).main = (0, core_1.join)((0, core_1.normalize)(project.root), 'server.ts');
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
function updateServerTsConfigRule(options) {
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
    return (_host) => {
        return (0, schematics_1.chain)([
            (0, utility_1.addDependency)('express', latest_versions_1.latestVersions['express'], {
                type: utility_1.DependencyType.Default,
            }),
            (0, utility_1.addDependency)('@types/express', latest_versions_1.latestVersions['@types/express'], {
                type: utility_1.DependencyType.Dev,
            }),
        ]);
    };
}
function addServerFile(options, isStandalone) {
    return async (host) => {
        const project = await (0, utils_1.getProject)(host, options.project);
        const browserDistDirectory = await (0, utils_1.getOutputPath)(host, options.project, 'build');
        return (0, schematics_1.mergeWith)((0, schematics_1.apply)((0, schematics_1.url)('./files'), [
            (0, schematics_1.applyTemplates)({
                ...core_1.strings,
                ...options,
                stripTsExtension: utils_1.stripTsExtension,
                browserDistDirectory,
                isStandalone,
            }),
            (0, schematics_1.move)(project.root),
        ]));
    };
}
function default_1(options) {
    return async (host) => {
        const project = await (0, utils_1.getProject)(host, options.project);
        const universalOptions = {
            ...options,
            skipInstall: true,
        };
        const clientBuildTarget = project.targets.get('build');
        if (!clientBuildTarget) {
            throw (0, project_targets_1.targetBuildNotFoundError)();
        }
        const clientBuildOptions = (clientBuildTarget.options ||
            {});
        const isStandalone = (0, ng_ast_utils_1.isStandaloneApp)(host, clientBuildOptions.main);
        return (0, schematics_1.chain)([
            project.targets.has('server')
                ? (0, schematics_1.noop)()
                : (0, schematics_1.externalSchematic)('@schematics/angular', 'universal', universalOptions),
            addScriptsRule(options),
            updateServerTsConfigRule(options),
            updateWorkspaceConfigRule(options),
            isStandalone ? (0, schematics_1.noop)() : routingInitialNavigationRule(options),
            addServerFile(options, isStandalone),
            addDependencies(),
        ]);
    };
}
exports.default = default_1;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9hbmd1bGFyL3Nzci9zY2hlbWF0aWNzL25nLWFkZC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsK0NBQXlFO0FBQ3pFLDJEQVlvQztBQUVwQyx5REFBNkY7QUFDN0YscUVBQWlFO0FBQ2pFLDJFQUEyRTtBQUMzRSxpRkFBdUY7QUFFdkYsK0NBQWlDO0FBRWpDLGdFQUE0RDtBQUM1RCw0Q0FPMEI7QUFJMUIsTUFBTSxxQkFBcUIsR0FBRyxXQUFXLENBQUM7QUFDMUMsTUFBTSxxQkFBcUIsR0FBRyxXQUFXLENBQUM7QUFFMUMsU0FBUyxjQUFjLENBQUMsT0FBNEI7SUFDbEQsT0FBTyxLQUFLLEVBQUUsSUFBSSxFQUFFLEVBQUU7UUFDcEIsTUFBTSxPQUFPLEdBQUcsZUFBZSxDQUFDO1FBQ2hDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDbEMsSUFBSSxNQUFNLEtBQUssSUFBSSxFQUFFO1lBQ25CLE1BQU0sSUFBSSxnQ0FBbUIsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1NBQzlEO1FBRUQsTUFBTSxVQUFVLEdBQUcsTUFBTSxJQUFBLHFCQUFhLEVBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDeEUsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQXlDLENBQUM7UUFDbEYsR0FBRyxDQUFDLE9BQU8sR0FBRztZQUNaLEdBQUcsR0FBRyxDQUFDLE9BQU87WUFDZCxTQUFTLEVBQUUsVUFBVSxPQUFPLENBQUMsT0FBTyxJQUFJLHFCQUFxQixFQUFFO1lBQy9ELFdBQVcsRUFBRSxRQUFRLFVBQVUsVUFB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QUFjLENBQUMsT0FBTyxDQUFDO1lBQ3ZCLHdCQUF3QixDQUFDLE9BQU8sQ0FBQztZQUNqQyx5QkFBeUIsQ0FBQyxPQUFPLENBQUM7WUFDbEMsWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFBLGlCQUFJLEdBQUUsQ0FBQyxDQUFDLENBQUMsNEJBQTRCLENBQUMsT0FBTyxDQUFDO1lBQzdELGFBQWEsQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDO1lBQ3BDLGVBQWUsRUFBRTtTQUNsQixDQUFDLENBQUM7SUFDTCxDQUFDLENBQUM7QUFDSixDQUFDO0FBN0JELDRCQTZCQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgeyBkaXJuYW1lLCBqb2luLCBub3JtYWxpemUsIHN0cmluZ3MgfSBmcm9tICdAYW5ndWxhci1kZXZraXQvY29yZSc7XG5pbXBvcnQge1xuICBSdWxlLFxuICBTY2hlbWF0aWNzRXhjZXB0aW9uLFxuICBUcmVlLFxuICBhcHBseSxcbiAgYXBwbHlUZW1wbGF0ZXMsXG4gIGNoYWluLFxuICBleHRlcm5hbFNjaGVtYXRpYyxcbiAgbWVyZ2VXaXRoLFxuICBtb3ZlLFxuICBub29wLFxuICB1cmwsXG59IGZyb20gJ0Bhbmd1bGFyLWRldmtpdC9zY2hlbWF0aWNzJztcbmltcG9ydCB7IFNjaGVtYSBhcyBVbml2ZXJzYWxPcHRpb25zIH0gZnJvbSAnQHNjaGVtYXRpY3MvYW5ndWxhci91bml2ZXJzYWwvc2NoZW1hJztcbmltcG9ydCB7IERlcGVuZGVuY3lUeXBlLCBhZGREZXBlbmRlbmN5LCB1cGRhdGVXb3Jrc3BhY2UgfSBmcm9tICdAc2NoZW1hdGljcy9hbmd1bGFyL3V0aWxpdHknO1xuaW1wb3J0IHsgSlNPTkZpbGUgfSBmcm9tICdAc2NoZW1hdGljcy9hbmd1bGFyL3V0aWxpdHkvanNvbi1maWxlJztcbmltcG9ydCB7IGlzU3RhbmRhbG9uZUFwcCB9IGZyb20gJ0BzY2hlbWF0aWNzL2FuZ3VsYXIvdXRpbGl0eS9uZy1hc3QtdXRpbHMnO1xuaW1wb3J0IHsgdGFyZ2V0QnVpbGROb3RGb3VuZEVycm9yIH0gZnJvbSAnQHNjaGVtYXRpY3MvYW5ndWxhci91dGlsaXR5L3Byb2plY3QtdGFyZ2V0cyc7XG5pbXBvcnQgeyBCcm93c2VyQnVpbGRlck9wdGlvbnMgfSBmcm9tICdAc2NoZW1hdGljcy9hbmd1bGFyL3V0aWxpdHkvd29ya3NwYWNlLW1vZGVscyc7XG5pbXBvcnQgKiBhcyB0cyBmcm9tICd0eXBlc2NyaXB0JztcblxuaW1wb3J0IHsgbGF0ZXN0VmVyc2lvbnMgfSBmcm9tICcuLi91dGlsaXR5L2xhdGVzdC12ZXJzaW9ucyc7XG5pbXBvcnQge1xuICBhZGRJbml0aWFsTmF2aWdhdGlvbixcbiAgZmluZEltcG9ydCxcbiAgZ2V0SW1wb3J0T2ZJZGVudGlmaWVyLFxuICBnZXRPdXRwdXRQYXRoLFxuICBnZXRQcm9qZWN0LFxuICBzdHJpcFRzRXh0ZW5zaW9uLFxufSBmcm9tICcuLi91dGlsaXR5L3V0aWxzJztcblxuaW1wb3J0IHsgU2NoZW1hIGFzIEFkZFVuaXZlcnNhbE9wdGlvbnMgfSBmcm9tICcuL3NjaGVtYSc7XG5cbmNvbnN0IFNFUlZFX1NTUl9UQVJHRVRfTkFNRSA9ICdzZXJ2ZS1zc3InO1xuY29uc3QgUFJFUkVOREVSX1RBUkdFVF9OQU1FID0gJ3ByZXJlbmRlcic7XG5cbmZ1bmN0aW9uIGFkZFNjcmlwdHNSdWxlKG9wdGlvbnM6IEFkZFVuaXZlcnNhbE9wdGlvbnMpOiBSdWxlIHtcbiAgcmV0dXJuIGFzeW5jIChob3N0KSA9PiB7XG4gICAgY29uc3QgcGtnUGF0aCA9ICcvcGFja2FnZS5qc29uJztcbiAgICBjb25zdCBidWZmZXIgPSBob3N0LnJlYWQocGtnUGF0aCk7XG4gICAgaWYgKGJ1ZmZlciA9PT0gbnVsbCkge1xuICAgICAgdGhyb3cgbmV3IFNjaGVtYXRpY3NFeGNlcHRpb24oJ0NvdWxkIG5vdCBmaW5kIHBhY2thZ2UuanNvbicpO1xuICAgIH1cblxuICAgIGNvbnN0IHNlcnZlckRpc3QgPSBhd2FpdCBnZXRPdXRwdXRQYXRoKGhvc3QsIG9wdGlvbnMucHJvamVjdCwgJ3NlcnZlcicpO1xuICAgIGNvbnN0IHBrZyA9IEpTT04ucGFyc2UoYnVmZmVyLnRvU3RyaW5nKCkpIGFzIHsgc2NyaXB0cz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfTtcbiAgICBwa2cuc2NyaXB0cyA9IHtcbiAgICAgIC4uLnBrZy5zY3JpcHRzLFxuICAgICAgJ2Rldjpzc3InOiBgbmcgcnVuICR7b3B0aW9ucy5wcm9qZWN0fToke1NFUlZFX1NTUl9UQVJHRVRfTkFNRX1gLFxuICAgICAgJ3NlcnZlOnNzcic6IGBub2RlICR7c2VydmVyRGlzdH0vbWFpbi5qc2AsXG4gICAgICAnYnVpbGQ6c3NyJzogYG5nIGJ1aWxkICYmIG5nIHJ1biAke29wdGlvbnMucHJvamVjdH06c2VydmVyYCxcbiAgICAgICdwcmVyZW5kZXInOiBgbmcgcnVuICR7b3B0aW9ucy5wcm9qZWN0fToke1BSRVJFTkRFUl9UQVJHRVRfTkFNRX1gLFxuICAgIH07XG5cbiAgICBob3N0Lm92ZXJ3cml0ZShwa2dQYXRoLCBKU09OLnN0cmluZ2lmeShwa2csIG51bGwsIDIpKTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlV29ya3NwYWNlQ29uZmlnUnVsZShvcHRpb25zOiBBZGRVbml2ZXJzYWxPcHRpb25zKTogUnVsZSB7XG4gIHJldHVybiAoKSA9PiB7XG4gICAgcmV0dXJuIHVwZGF0ZVdvcmtzcGFjZSgod29ya3NwYWNlKSA9PiB7XG4gICAgICBjb25zdCBwcm9qZWN0TmFtZSA9IG9wdGlvbnMucHJvamVjdDtcbiAgICAgIGNvbnN0IHByb2plY3QgPSB3b3Jrc3BhY2UucHJvamVjdHMuZ2V0KHByb2plY3ROYW1lKTtcbiAgICAgIGlmICghcHJvamVjdCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tbm9uLW51bGwtYXNzZXJ0aW9uXG4gICAgICBjb25zdCBzZXJ2ZXJUYXJnZXQgPSBwcm9qZWN0LnRhcmdldHMuZ2V0KCdzZXJ2ZXInKSE7XG4gICAgICAoc2VydmVyVGFyZ2V0Lm9wdGlvbnMgPz89IHt9KS5tYWluID0gam9pbihub3JtYWxpemUocHJvamVjdC5yb290KSwgJ3NlcnZlci50cycpO1xuXG4gICAgICBjb25zdCBzZXJ2ZVNTUlRhcmdldCA9IHByb2plY3QudGFyZ2V0cy5nZXQoU0VSVkVfU1NSX1RBUkdFVF9OQU1FKTtcbiAgICAgIGlmIChzZXJ2ZVNTUlRhcmdldCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHByb2plY3QudGFyZ2V0cy5hZGQoe1xuICAgICAgICBuYW1lOiBTRVJWRV9TU1JfVEFSR0VUX05BTUUsXG4gICAgICAgIGJ1aWxkZXI6ICdAYW5ndWxhci1kZXZraXQvYnVpbGQtYW5ndWxhcjpzc3ItZGV2LXNlcnZlcicsXG4gICAgICAgIGRlZmF1bHRDb25maWd1cmF0aW9uOiAnZGV2ZWxvcG1lbnQnLFxuICAgICAgICBvcHRpb25zOiB7fSxcbiAgICAgICAgY29uZmlndXJhdGlvbnM6IHtcbiAgICAgICAgICBkZXZlbG9wbWVudDoge1xuICAgICAgICAgICAgYnJvd3NlclRhcmdldDogYCR7cHJvamVjdE5hbWV9OmJ1aWxkOmRldmVsb3BtZW50YCxcbiAgICAgICAgICAgIHNlcnZlclRhcmdldDogYCR7cHJvamVjdE5hbWV9OnNlcnZlcjpkZXZlbG9wbWVudGAsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBwcm9kdWN0aW9uOiB7XG4gICAgICAgICAgICBicm93c2VyVGFyZ2V0OiBgJHtwcm9qZWN0TmFtZX06YnVpbGQ6cHJvZHVjdGlvbmAsXG4gICAgICAgICAgICBzZXJ2ZXJUYXJnZXQ6IGAke3Byb2plY3ROYW1lfTpzZXJ2ZXI6cHJvZHVjdGlvbmAsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBwcmVyZW5kZXJUYXJnZXQgPSBwcm9qZWN0LnRhcmdldHMuZ2V0KFBSRVJFTkRFUl9UQVJHRVRfTkFNRSk7XG4gICAgICBpZiAocHJlcmVuZGVyVGFyZ2V0KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgcHJvamVjdC50YXJnZXRzLmFkZCh7XG4gICAgICAgIG5hbWU6IFBSRVJFTkRFUl9UQVJHRVRfTkFNRSxcbiAgICAgICAgYnVpbGRlcjogJ0Bhbmd1bGFyLWRldmtpdC9idWlsZC1hbmd1bGFyOnByZXJlbmRlcicsXG4gICAgICAgIGRlZmF1bHRDb25maWd1cmF0aW9uOiAncHJvZHVjdGlvbicsXG4gICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICByb3V0ZXM6IFsnLyddLFxuICAgICAgICB9LFxuICAgICAgICBjb25maWd1cmF0aW9uczoge1xuICAgICAgICAgIHByb2R1Y3Rpb246IHtcbiAgICAgICAgICAgIGJyb3dzZXJUYXJnZXQ6IGAke3Byb2plY3ROYW1lfTpidWlsZDpwcm9kdWN0aW9uYCxcbiAgICAgICAgICAgIHNlcnZlclRhcmdldDogYCR7cHJvamVjdE5hbWV9OnNlcnZlcjpwcm9kdWN0aW9uYCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGRldmVsb3BtZW50OiB7XG4gICAgICAgICAgICBicm93c2VyVGFyZ2V0OiBgJHtwcm9qZWN0TmFtZX06YnVpbGQ6ZGV2ZWxvcG1lbnRgLFxuICAgICAgICAgICAgc2VydmVyVGFyZ2V0OiBgJHtwcm9qZWN0TmFtZX06c2VydmVyOmRldmVsb3BtZW50YCxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVNlcnZlclRzQ29uZmlnUnVsZShvcHRpb25zOiBBZGRVbml2ZXJzYWxPcHRpb25zKTogUnVsZSB7XG4gIHJldHVybiBhc3luYyAoaG9zdCkgPT4ge1xuICAgIGNvbnN0IHByb2plY3QgPSBhd2FpdCBnZXRQcm9qZWN0KGhvc3QsIG9wdGlvbnMucHJvamVjdCk7XG4gICAgY29uc3Qgc2VydmVyVGFyZ2V0ID0gcHJvamVjdC50YXJnZXRzLmdldCgnc2VydmVyJyk7XG4gICAgaWYgKCFzZXJ2ZXJUYXJnZXQgfHwgIXNlcnZlclRhcmdldC5vcHRpb25zKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgdHNDb25maWdQYXRoID0gc2VydmVyVGFyZ2V0Lm9wdGlvbnMudHNDb25maWc7XG4gICAgaWYgKCF0c0NvbmZpZ1BhdGggfHwgdHlwZW9mIHRzQ29uZmlnUGF0aCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIC8vIE5vIHRzY29uZmlnIHBhdGhcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB0c0NvbmZpZyA9IG5ldyBKU09ORmlsZShob3N0LCB0c0NvbmZpZ1BhdGgpO1xuICAgIGNvbnN0IGZpbGVzQXN0Tm9kZSA9IHRzQ29uZmlnLmdldChbJ2ZpbGVzJ10pO1xuICAgIGNvbnN0IHNlcnZlckZpbGVQYXRoID0gJ3NlcnZlci50cyc7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZmlsZXNBc3ROb2RlKSAmJiAhZmlsZXNBc3ROb2RlLnNvbWUoKHsgdGV4dCB9KSA9PiB0ZXh0ID09PSBzZXJ2ZXJGaWxlUGF0aCkpIHtcbiAgICAgIHRzQ29uZmlnLm1vZGlmeShbJ2ZpbGVzJ10sIFsuLi5maWxlc0FzdE5vZGUsIHNlcnZlckZpbGVQYXRoXSk7XG4gICAgfVxuICB9O1xufVxuXG5mdW5jdGlvbiByb3V0aW5nSW5pdGlhbE5hdmlnYXRpb25SdWxlKG9wdGlvbnM6IFVuaXZlcnNhbE9wdGlvbnMpOiBSdWxlIHtcbiAgcmV0dXJuIGFzeW5jIChob3N0KSA9PiB7XG4gICAgY29uc3QgcHJvamVjdCA9IGF3YWl0IGdldFByb2plY3QoaG9zdCwgb3B0aW9ucy5wcm9qZWN0KTtcbiAgICBjb25zdCBzZXJ2ZXJUYXJnZXQgPSBwcm9qZWN0LnRhcmdldHMuZ2V0KCdzZXJ2ZXInKTtcbiAgICBpZiAoIXNlcnZlclRhcmdldCB8fCAhc2VydmVyVGFyZ2V0Lm9wdGlvbnMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB0c0NvbmZpZ1BhdGggPSBzZXJ2ZXJUYXJnZXQub3B0aW9ucy50c0NvbmZpZztcbiAgICBpZiAoIXRzQ29uZmlnUGF0aCB8fCB0eXBlb2YgdHNDb25maWdQYXRoICE9PSAnc3RyaW5nJyB8fCAhaG9zdC5leGlzdHModHNDb25maWdQYXRoKSkge1xuICAgICAgLy8gTm8gdHNjb25maWcgcGF0aFxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHBhcnNlQ29uZmlnSG9zdDogdHMuUGFyc2VDb25maWdIb3N0ID0ge1xuICAgICAgdXNlQ2FzZVNlbnNpdGl2ZUZpbGVOYW1lczogdHMuc3lzLnVzZUNhc2VTZW5zaXRpdmVGaWxlTmFtZXMsXG4gICAgICByZWFkRGlyZWN0b3J5OiB0cy5zeXMucmVhZERpcmVjdG9yeSxcbiAgICAgIGZpbGVFeGlzdHM6IGZ1bmN0aW9uIChmaWxlTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiBob3N0LmV4aXN0cyhmaWxlTmFtZSk7XG4gICAgICB9LFxuICAgICAgcmVhZEZpbGU6IGZ1bmN0aW9uIChmaWxlTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIGhvc3QucmVhZFRleHQoZmlsZU5hbWUpO1xuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHsgY29uZmlnIH0gPSB0cy5yZWFkQ29uZmlnRmlsZSh0c0NvbmZpZ1BhdGgsIHBhcnNlQ29uZmlnSG9zdC5yZWFkRmlsZSk7XG4gICAgY29uc3QgcGFyc2VkID0gdHMucGFyc2VKc29uQ29uZmlnRmlsZUNvbnRlbnQoXG4gICAgICBjb25maWcsXG4gICAgICBwYXJzZUNvbmZpZ0hvc3QsXG4gICAgICBkaXJuYW1lKG5vcm1hbGl6ZSh0c0NvbmZpZ1BhdGgpKSxcbiAgICApO1xuICAgIGNvbnN0IHRzSG9zdCA9IHRzLmNyZWF0ZUNvbXBpbGVySG9zdChwYXJzZWQub3B0aW9ucywgdHJ1ZSk7XG4gICAgLy8gU3RyaXAgQk9NIGFzIG90aGVyd2lzZSBUU0MgbWV0aG9kcyAoRXg6IGdldFdpZHRoKSB3aWxsIHJldHVybiBhbiBvZmZzZXQsXG4gICAgLy8gd2hpY2ggYnJlYWtzIHRoZSBDTEkgVXBkYXRlUmVjb3JkZXIuXG4gICAgLy8gU2VlOiBodHRwczovL2dpdGh1Yi5jb20vYW5ndWxhci9hbmd1bGFyL3B1bGwvMzA3MTlcbiAgICB0c0hvc3QucmVhZEZpbGUgPSBmdW5jdGlvbiAoZmlsZU5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICByZXR1cm4gaG9zdC5yZWFkVGV4dChmaWxlTmFtZSkucmVwbGFjZSgvXlxcdUZFRkYvLCAnJyk7XG4gICAgfTtcbiAgICB0c0hvc3QuZGlyZWN0b3J5RXhpc3RzID0gZnVuY3Rpb24gKGRpcmVjdG9yeU5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgLy8gV2hlbiB0aGUgcGF0aCBpcyBmaWxlIGdldERpciB3aWxsIHRocm93LlxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZGlyID0gaG9zdC5nZXREaXIoZGlyZWN0b3J5TmFtZSk7XG5cbiAgICAgICAgcmV0dXJuICEhKGRpci5zdWJkaXJzLmxlbmd0aCB8fCBkaXIuc3ViZmlsZXMubGVuZ3RoKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfTtcbiAgICB0c0hvc3QuZmlsZUV4aXN0cyA9IGZ1bmN0aW9uIChmaWxlTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICByZXR1cm4gaG9zdC5leGlzdHMoZmlsZU5hbWUpO1xuICAgIH07XG4gICAgdHNIb3N0LnJlYWxwYXRoID0gZnVuY3Rpb24gKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICByZXR1cm4gcGF0aDtcbiAgICB9O1xuICAgIHRzSG9zdC5nZXRDdXJyZW50RGlyZWN0b3J5ID0gZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIGhvc3Qucm9vdC5wYXRoO1xuICAgIH07XG5cbiAgICBjb25zdCBwcm9ncmFtID0gdHMuY3JlYXRlUHJvZ3JhbShwYXJzZWQuZmlsZU5hbWVzLCBwYXJzZWQub3B0aW9ucywgdHNIb3N0KTtcbiAgICBjb25zdCB0eXBlQ2hlY2tlciA9IHByb2dyYW0uZ2V0VHlwZUNoZWNrZXIoKTtcbiAgICBjb25zdCBzb3VyY2VGaWxlcyA9IHByb2dyYW1cbiAgICAgIC5nZXRTb3VyY2VGaWxlcygpXG4gICAgICAuZmlsdGVyKChmKSA9PiAhZi5pc0RlY2xhcmF0aW9uRmlsZSAmJiAhcHJvZ3JhbS5pc1NvdXJjZUZpbGVGcm9tRXh0ZXJuYWxMaWJyYXJ5KGYpKTtcbiAgICBjb25zdCBwcmludGVyID0gdHMuY3JlYXRlUHJpbnRlcigpO1xuICAgIGNvbnN0IHJvdXRlck1vZHVsZSA9ICdSb3V0ZXJNb2R1bGUnO1xuICAgIGNvbnN0IHJvdXRlclNvdXJjZSA9ICdAYW5ndWxhci9yb3V0ZXInO1xuXG4gICAgc291cmNlRmlsZXMuZm9yRWFjaCgoc291cmNlRmlsZSkgPT4ge1xuICAgICAgY29uc3Qgcm91dGVySW1wb3J0ID0gZmluZEltcG9ydChzb3VyY2VGaWxlLCByb3V0ZXJTb3VyY2UsIHJvdXRlck1vZHVsZSk7XG4gICAgICBpZiAoIXJvdXRlckltcG9ydCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHRzLmZvckVhY2hDaGlsZChzb3VyY2VGaWxlLCBmdW5jdGlvbiB2aXNpdE5vZGUobm9kZTogdHMuTm9kZSkge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHMuaXNDYWxsRXhwcmVzc2lvbihub2RlKSAmJlxuICAgICAgICAgIHRzLmlzUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uKG5vZGUuZXhwcmVzc2lvbikgJiZcbiAgICAgICAgICB0cy5pc0lkZW50aWZpZXIobm9kZS5leHByZXNzaW9uLmV4cHJlc3Npb24pICYmXG4gICAgICAgICAgbm9kZS5leHByZXNzaW9uLm5hbWUudGV4dCA9PT0gJ2ZvclJvb3QnXG4gICAgICAgICkge1xuICAgICAgICAgIGNvbnN0IGltcCA9IGdldEltcG9ydE9mSWRlbnRpZmllcih0eXBlQ2hlY2tlciwgbm9kZS5leHByZXNzaW9uLmV4cHJlc3Npb24pO1xuXG4gICAgICAgICAgaWYgKGltcCAmJiBpbXAubmFtZSA9PT0gcm91dGVyTW9kdWxlICYmIGltcC5pbXBvcnRNb2R1bGUgPT09IHJvdXRlclNvdXJjZSkge1xuICAgICAgICAgICAgY29uc3QgcHJpbnQgPSBwcmludGVyLnByaW50Tm9kZShcbiAgICAgICAgICAgICAgdHMuRW1pdEhpbnQuVW5zcGVjaWZpZWQsXG4gICAgICAgICAgICAgIGFkZEluaXRpYWxOYXZpZ2F0aW9uKG5vZGUpLFxuICAgICAgICAgICAgICBzb3VyY2VGaWxlLFxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgY29uc3QgcmVjb3JkZXIgPSBob3N0LmJlZ2luVXBkYXRlKHNvdXJjZUZpbGUuZmlsZU5hbWUpO1xuICAgICAgICAgICAgcmVjb3JkZXIucmVtb3ZlKG5vZGUuZ2V0U3RhcnQoKSwgbm9kZS5nZXRXaWR0aCgpKTtcbiAgICAgICAgICAgIHJlY29yZGVyLmluc2VydFJpZ2h0KG5vZGUuZ2V0U3RhcnQoKSwgcHJpbnQpO1xuICAgICAgICAgICAgaG9zdC5jb21taXRVcGRhdGUocmVjb3JkZXIpO1xuXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdHMuZm9yRWFjaENoaWxkKG5vZGUsIHZpc2l0Tm9kZSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gYWRkRGVwZW5kZW5jaWVzKCk6IFJ1bGUge1xuICByZXR1cm4gKF9ob3N0OiBUcmVlKSA9PiB7XG4gICAgcmV0dXJuIGNoYWluKFtcbiAgICAgIGFkZERlcGVuZGVuY3koJ2V4cHJlc3MnLCBsYXRlc3RWZXJzaW9uc1snZXhwcmVzcyddLCB7XG4gICAgICAgIHR5cGU6IERlcGVuZGVuY3lUeXBlLkRlZmF1bHQsXG4gICAgICB9KSxcbiAgICAgIGFkZERlcGVuZGVuY3koJ0B0eXBlcy9leHByZXNzJywgbGF0ZXN0VmVyc2lvbnNbJ0B0eXBlcy9leHByZXNzJ10sIHtcbiAgICAgICAgdHlwZTogRGVwZW5kZW5jeVR5cGUuRGV2LFxuICAgICAgfSksXG4gICAgXSk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIGFkZFNlcnZlckZpbGUob3B0aW9uczogVW5pdmVyc2FsT3B0aW9ucywgaXNTdGFuZGFsb25lOiBib29sZWFuKTogUnVsZSB7XG4gIHJldHVybiBhc3luYyAoaG9zdCkgPT4ge1xuICAgIGNvbnN0IHByb2plY3QgPSBhd2FpdCBnZXRQcm9qZWN0KGhvc3QsIG9wdGlvbnMucHJvamVjdCk7XG4gICAgY29uc3QgYnJvd3NlckRpc3REaXJlY3RvcnkgPSBhd2FpdCBnZXRPdXRwdXRQYXRoKGhvc3QsIG9wdGlvbnMucHJvamVjdCwgJ2J1aWxkJyk7XG5cbiAgICByZXR1cm4gbWVyZ2VXaXRoKFxuICAgICAgYXBwbHkodXJsKCcuL2ZpbGVzJyksIFtcbiAgICAgICAgYXBwbHlUZW1wbGF0ZXMoe1xuICAgICAgICAgIC4uLnN0cmluZ3MsXG4gICAgICAgICAgLi4ub3B0aW9ucyxcbiAgICAgICAgICBzdHJpcFRzRXh0ZW5zaW9uLFxuICAgICAgICAgIGJyb3dzZXJEaXN0RGlyZWN0b3J5LFxuICAgICAgICAgIGlzU3RhbmRhbG9uZSxcbiAgICAgICAgfSksXG4gICAgICAgIG1vdmUocHJvamVjdC5yb290KSxcbiAgICAgIF0pLFxuICAgICk7XG4gIH07XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIChvcHRpb25zOiBBZGRVbml2ZXJzYWxPcHRpb25zKTogUnVsZSB7XG4gIHJldHVybiBhc3luYyAoaG9zdCkgPT4ge1xuICAgIGNvbnN0IHByb2plY3QgPSBhd2FpdCBnZXRQcm9qZWN0KGhvc3QsIG9wdGlvbnMucHJvamVjdCk7XG4gICAgY29uc3QgdW5pdmVyc2FsT3B0aW9ucyA9IHtcbiAgICAgIC4uLm9wdGlvbnMsXG4gICAgICBza2lwSW5zdGFsbDogdHJ1ZSxcbiAgICB9O1xuICAgIGNvbnN0IGNsaWVudEJ1aWxkVGFyZ2V0ID0gcHJvamVjdC50YXJnZXRzLmdldCgnYnVpbGQnKTtcbiAgICBpZiAoIWNsaWVudEJ1aWxkVGFyZ2V0KSB7XG4gICAgICB0aHJvdyB0YXJnZXRCdWlsZE5vdEZvdW5kRXJyb3IoKTtcbiAgICB9XG5cbiAgICBjb25zdCBjbGllbnRCdWlsZE9wdGlvbnMgPSAoY2xpZW50QnVpbGRUYXJnZXQub3B0aW9ucyB8fFxuICAgICAge30pIGFzIHVua25vd24gYXMgQnJvd3NlckJ1aWxkZXJPcHRpb25zO1xuXG4gICAgY29uc3QgaXNTdGFuZGFsb25lID0gaXNTdGFuZGFsb25lQXBwKGhvc3QsIGNsaWVudEJ1aWxkT3B0aW9ucy5tYWluKTtcblxuICAgIHJldHVybiBjaGFpbihbXG4gICAgICBwcm9qZWN0LnRhcmdldHMuaGFzKCdzZXJ2ZXInKVxuICAgICAgICA/IG5vb3AoKVxuICAgICAgICA6IGV4dGVybmFsU2NoZW1hdGljKCdAc2NoZW1hdGljcy9hbmd1bGFyJywgJ3VuaXZlcnNhbCcsIHVuaXZlcnNhbE9wdGlvbnMpLFxuICAgICAgYWRkU2NyaXB0c1J1bGUob3B0aW9ucyksXG4gICAgICB1cGRhdGVTZXJ2ZXJUc0NvbmZpZ1J1bGUob3B0aW9ucyksXG4gICAgICB1cGRhdGVXb3Jrc3BhY2VDb25maWdSdWxlKG9wdGlvbnMpLFxuICAgICAgaXNTdGFuZGFsb25lID8gbm9vcCgpIDogcm91dGluZ0luaXRpYWxOYXZpZ2F0aW9uUnVsZShvcHRpb25zKSxcbiAgICAgIGFkZFNlcnZlckZpbGUob3B0aW9ucywgaXNTdGFuZGFsb25lKSxcbiAgICAgIGFkZERlcGVuZGVuY2llcygpLFxuICAgIF0pO1xuICB9O1xufVxuIl19
"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
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
            prodConfig.ssr = (0, core_1.join)((0, core_1.normalize)(projectRoot), 'server.ts');
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
            addServerFile(options, isStandalone),
            addDependencies(),
        ]);
    };
}
exports.default = default_1;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9hbmd1bGFyL3Nzci9zY2hlbWF0aWNzL25nLWFkZC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOztBQUVILCtDQUFnRTtBQUNoRSwyREFXb0M7QUFFcEMseURBQTZGO0FBQzdGLHFFQUFpRTtBQUNqRSwyRUFBMkU7QUFDM0UsaUZBQXVGO0FBQ3ZGLHNFQUE4RTtBQUM5RSxxRUFBcUU7QUFDckUsbUZBQXdFO0FBRXhFLGdFQUE0RDtBQUM1RCw0Q0FBNkQ7QUFJN0QsTUFBTSxxQkFBcUIsR0FBRyxXQUFXLENBQUM7QUFDMUMsTUFBTSxxQkFBcUIsR0FBRyxXQUFXLENBQUM7QUFFMUMsU0FBUyxjQUFjLENBQUMsT0FBeUI7SUFDL0MsT0FBTyxLQUFLLEVBQUUsSUFBSSxFQUFFLEVBQUU7UUFDcEIsTUFBTSxPQUFPLEdBQUcsZUFBZSxDQUFDO1FBQ2hDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDbEMsSUFBSSxNQUFNLEtBQUssSUFBSSxFQUFFO1lBQ25CLE1BQU0sSUFBSSxnQ0FBbUIsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1NBQzlEO1FBRUQsTUFBTSxVQUFVLEdBQUcsTUFBTSxJQUFBLHFCQUFhLEVBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDeEUsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQXlDLENBQUM7UUFDbEYsR0FBRyxDQUFDLE9BQU8sR0FBRztZQUNaLEdBQUcsR0FBRyxDQUFDLE9BQU87WUFDZCxTQUFTLEVBQUUsVUFBVSxPQUFPLENBQUMsT0FBTyxJQUFJLHFCQUFxQixFQUFFO1lBQy9ELFdBQVcsRUFBRSxRQUFRLFVBQVUs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Q0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQztvQkFDeEUsb0NBQW9DLENBQUMsT0FBTyxDQUFDO2lCQUM5QztnQkFDSCxDQUFDLENBQUM7b0JBQ0UsY0FBYyxDQUFDLE9BQU8sQ0FBQztvQkFDdkIsc0NBQXNDLENBQUMsT0FBTyxDQUFDO29CQUMvQyx1Q0FBdUMsQ0FBQyxPQUFPLENBQUM7aUJBQ2pELENBQUM7WUFDTixhQUFhLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQztZQUNwQyxlQUFlLEVBQUU7U0FDbEIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQWhDRCw0QkFnQ0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0IHsgam9pbiwgbm9ybWFsaXplLCBzdHJpbmdzIH0gZnJvbSAnQGFuZ3VsYXItZGV2a2l0L2NvcmUnO1xuaW1wb3J0IHtcbiAgUnVsZSxcbiAgU2NoZW1hdGljc0V4Y2VwdGlvbixcbiAgYXBwbHksXG4gIGFwcGx5VGVtcGxhdGVzLFxuICBjaGFpbixcbiAgZXh0ZXJuYWxTY2hlbWF0aWMsXG4gIG1lcmdlV2l0aCxcbiAgbW92ZSxcbiAgbm9vcCxcbiAgdXJsLFxufSBmcm9tICdAYW5ndWxhci1kZXZraXQvc2NoZW1hdGljcyc7XG5pbXBvcnQgeyBTY2hlbWEgYXMgU2VydmVyT3B0aW9ucyB9IGZyb20gJ0BzY2hlbWF0aWNzL2FuZ3VsYXIvc2VydmVyL3NjaGVtYSc7XG5pbXBvcnQgeyBEZXBlbmRlbmN5VHlwZSwgYWRkRGVwZW5kZW5jeSwgdXBkYXRlV29ya3NwYWNlIH0gZnJvbSAnQHNjaGVtYXRpY3MvYW5ndWxhci91dGlsaXR5JztcbmltcG9ydCB7IEpTT05GaWxlIH0gZnJvbSAnQHNjaGVtYXRpY3MvYW5ndWxhci91dGlsaXR5L2pzb24tZmlsZSc7XG5pbXBvcnQgeyBpc1N0YW5kYWxvbmVBcHAgfSBmcm9tICdAc2NoZW1hdGljcy9hbmd1bGFyL3V0aWxpdHkvbmctYXN0LXV0aWxzJztcbmltcG9ydCB7IHRhcmdldEJ1aWxkTm90Rm91bmRFcnJvciB9IGZyb20gJ0BzY2hlbWF0aWNzL2FuZ3VsYXIvdXRpbGl0eS9wcm9qZWN0LXRhcmdldHMnO1xuaW1wb3J0IHsgZ2V0TWFpbkZpbGVQYXRoIH0gZnJvbSAnQHNjaGVtYXRpY3MvYW5ndWxhci91dGlsaXR5L3N0YW5kYWxvbmUvdXRpbCc7XG5pbXBvcnQgeyBnZXRXb3Jrc3BhY2UgfSBmcm9tICdAc2NoZW1hdGljcy9hbmd1bGFyL3V0aWxpdHkvd29ya3NwYWNlJztcbmltcG9ydCB7IEJ1aWxkZXJzIH0gZnJvbSAnQHNjaGVtYXRpY3MvYW5ndWxhci91dGlsaXR5L3dvcmtzcGFjZS1tb2RlbHMnO1xuXG5pbXBvcnQgeyBsYXRlc3RWZXJzaW9ucyB9IGZyb20gJy4uL3V0aWxpdHkvbGF0ZXN0LXZlcnNpb25zJztcbmltcG9ydCB7IGdldE91dHB1dFBhdGgsIGdldFByb2plY3QgfSBmcm9tICcuLi91dGlsaXR5L3V0aWxzJztcblxuaW1wb3J0IHsgU2NoZW1hIGFzIEFkZFNlcnZlck9wdGlvbnMgfSBmcm9tICcuL3NjaGVtYSc7XG5cbmNvbnN0IFNFUlZFX1NTUl9UQVJHRVRfTkFNRSA9ICdzZXJ2ZS1zc3InO1xuY29uc3QgUFJFUkVOREVSX1RBUkdFVF9OQU1FID0gJ3ByZXJlbmRlcic7XG5cbmZ1bmN0aW9uIGFkZFNjcmlwdHNSdWxlKG9wdGlvbnM6IEFkZFNlcnZlck9wdGlvbnMpOiBSdWxlIHtcbiAgcmV0dXJuIGFzeW5jIChob3N0KSA9PiB7XG4gICAgY29uc3QgcGtnUGF0aCA9ICcvcGFja2FnZS5qc29uJztcbiAgICBjb25zdCBidWZmZXIgPSBob3N0LnJlYWQocGtnUGF0aCk7XG4gICAgaWYgKGJ1ZmZlciA9PT0gbnVsbCkge1xuICAgICAgdGhyb3cgbmV3IFNjaGVtYXRpY3NFeGNlcHRpb24oJ0NvdWxkIG5vdCBmaW5kIHBhY2thZ2UuanNvbicpO1xuICAgIH1cblxuICAgIGNvbnN0IHNlcnZlckRpc3QgPSBhd2FpdCBnZXRPdXRwdXRQYXRoKGhvc3QsIG9wdGlvbnMucHJvamVjdCwgJ3NlcnZlcicpO1xuICAgIGNvbnN0IHBrZyA9IEpTT04ucGFyc2UoYnVmZmVyLnRvU3RyaW5nKCkpIGFzIHsgc2NyaXB0cz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfTtcbiAgICBwa2cuc2NyaXB0cyA9IHtcbiAgICAgIC4uLnBrZy5zY3JpcHRzLFxuICAgICAgJ2Rldjpzc3InOiBgbmcgcnVuICR7b3B0aW9ucy5wcm9qZWN0fToke1NFUlZFX1NTUl9UQVJHRVRfTkFNRX1gLFxuICAgICAgJ3NlcnZlOnNzcic6IGBub2RlICR7c2VydmVyRGlzdH0vbWFpbi5qc2AsXG4gICAgICAnYnVpbGQ6c3NyJzogYG5nIGJ1aWxkICYmIG5nIHJ1biAke29wdGlvbnMucHJvamVjdH06c2VydmVyYCxcbiAgICAgICdwcmVyZW5kZXInOiBgbmcgcnVuICR7b3B0aW9ucy5wcm9qZWN0fToke1BSRVJFTkRFUl9UQVJHRVRfTkFNRX1gLFxuICAgIH07XG5cbiAgICBob3N0Lm92ZXJ3cml0ZShwa2dQYXRoLCBKU09OLnN0cmluZ2lmeShwa2csIG51bGwsIDIpKTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlQXBwbGljYXRpb25CdWlsZGVyVHNDb25maWdSdWxlKG9wdGlvbnM6IEFkZFNlcnZlck9wdGlvbnMpOiBSdWxlIHtcbiAgcmV0dXJuIGFzeW5jIChob3N0KSA9PiB7XG4gICAgY29uc3QgcHJvamVjdCA9IGF3YWl0IGdldFByb2plY3QoaG9zdCwgb3B0aW9ucy5wcm9qZWN0KTtcbiAgICBjb25zdCBidWlsZFRhcmdldCA9IHByb2plY3QudGFyZ2V0cy5nZXQoJ2J1aWxkJyk7XG4gICAgaWYgKCFidWlsZFRhcmdldCB8fCAhYnVpbGRUYXJnZXQub3B0aW9ucykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHRzQ29uZmlnUGF0aCA9IGJ1aWxkVGFyZ2V0Lm9wdGlvbnMudHNDb25maWc7XG4gICAgaWYgKCF0c0NvbmZpZ1BhdGggfHwgdHlwZW9mIHRzQ29uZmlnUGF0aCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIC8vIE5vIHRzY29uZmlnIHBhdGhcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB0c0NvbmZpZyA9IG5ldyBKU09ORmlsZShob3N0LCB0c0NvbmZpZ1BhdGgpO1xuICAgIGNvbnN0IGZpbGVzQXN0Tm9kZSA9IHRzQ29uZmlnLmdldChbJ2ZpbGVzJ10pO1xuICAgIGNvbnN0IHNlcnZlckZpbGVQYXRoID0gJ3NlcnZlci50cyc7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZmlsZXNBc3ROb2RlKSAmJiAhZmlsZXNBc3ROb2RlLnNvbWUoKHsgdGV4dCB9KSA9PiB0ZXh0ID09PSBzZXJ2ZXJGaWxlUGF0aCkpIHtcbiAgICAgIHRzQ29uZmlnLm1vZGlmeShbJ2ZpbGVzJ10sIFsuLi5maWxlc0FzdE5vZGUsIHNlcnZlckZpbGVQYXRoXSk7XG4gICAgfVxuICB9O1xufVxuXG5mdW5jdGlvbiB1cGRhdGVBcHBsaWNhdGlvbkJ1aWxkZXJXb3Jrc3BhY2VDb25maWdSdWxlKFxuICBwcm9qZWN0Um9vdDogc3RyaW5nLFxuICBvcHRpb25zOiBBZGRTZXJ2ZXJPcHRpb25zLFxuKTogUnVsZSB7XG4gIHJldHVybiAoKSA9PiB7XG4gICAgcmV0dXJuIHVwZGF0ZVdvcmtzcGFjZSgod29ya3NwYWNlKSA9PiB7XG4gICAgICBjb25zdCBidWlsZFRhcmdldCA9IHdvcmtzcGFjZS5wcm9qZWN0cy5nZXQob3B0aW9ucy5wcm9qZWN0KT8udGFyZ2V0cy5nZXQoJ2J1aWxkJyk7XG4gICAgICBpZiAoIWJ1aWxkVGFyZ2V0KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgIGNvbnN0IHByb2RDb25maWcgPSBidWlsZFRhcmdldC5jb25maWd1cmF0aW9ucz8ucHJvZHVjdGlvbiBhcyBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xuICAgICAgaWYgKCFwcm9kQ29uZmlnKSB7XG4gICAgICAgIHRocm93IG5ldyBTY2hlbWF0aWNzRXhjZXB0aW9uKFxuICAgICAgICAgIGBBIFwicHJvZHVjdGlvblwiIGNvbmZpZ3VyYXRpb24gaXMgbm90IGRlZmluZWQgZm9yIHRoZSBcImJ1aWxkXCIgYnVpbGRlci5gLFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBwcm9kQ29uZmlnLnByZXJlbmRlciA9IHRydWU7XG4gICAgICBwcm9kQ29uZmlnLnNzciA9IGpvaW4obm9ybWFsaXplKHByb2plY3RSb290KSwgJ3NlcnZlci50cycpO1xuICAgIH0pO1xuICB9O1xufVxuXG5mdW5jdGlvbiB1cGRhdGVXZWJwYWNrQnVpbGRlcldvcmtzcGFjZUNvbmZpZ1J1bGUob3B0aW9uczogQWRkU2VydmVyT3B0aW9ucyk6IFJ1bGUge1xuICByZXR1cm4gKCkgPT4ge1xuICAgIHJldHVybiB1cGRhdGVXb3Jrc3BhY2UoKHdvcmtzcGFjZSkgPT4ge1xuICAgICAgY29uc3QgcHJvamVjdE5hbWUgPSBvcHRpb25zLnByb2plY3Q7XG4gICAgICBjb25zdCBwcm9qZWN0ID0gd29ya3NwYWNlLnByb2plY3RzLmdldChwcm9qZWN0TmFtZSk7XG4gICAgICBpZiAoIXByb2plY3QpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLW5vbi1udWxsLWFzc2VydGlvblxuICAgICAgY29uc3Qgc2VydmVyVGFyZ2V0ID0gcHJvamVjdC50YXJnZXRzLmdldCgnc2VydmVyJykhO1xuICAgICAgKHNlcnZlclRhcmdldC5vcHRpb25zID8/PSB7fSkubWFpbiA9IGpvaW4obm9ybWFsaXplKHByb2plY3Qucm9vdCksICdzZXJ2ZXIudHMnKTtcblxuICAgICAgY29uc3Qgc2VydmVTU1JUYXJnZXQgPSBwcm9qZWN0LnRhcmdldHMuZ2V0KFNFUlZFX1NTUl9UQVJHRVRfTkFNRSk7XG4gICAgICBpZiAoc2VydmVTU1JUYXJnZXQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBwcm9qZWN0LnRhcmdldHMuYWRkKHtcbiAgICAgICAgbmFtZTogU0VSVkVfU1NSX1RBUkdFVF9OQU1FLFxuICAgICAgICBidWlsZGVyOiAnQGFuZ3VsYXItZGV2a2l0L2J1aWxkLWFuZ3VsYXI6c3NyLWRldi1zZXJ2ZXInLFxuICAgICAgICBkZWZhdWx0Q29uZmlndXJhdGlvbjogJ2RldmVsb3BtZW50JyxcbiAgICAgICAgb3B0aW9uczoge30sXG4gICAgICAgIGNvbmZpZ3VyYXRpb25zOiB7XG4gICAgICAgICAgZGV2ZWxvcG1lbnQ6IHtcbiAgICAgICAgICAgIGJyb3dzZXJUYXJnZXQ6IGAke3Byb2plY3ROYW1lfTpidWlsZDpkZXZlbG9wbWVudGAsXG4gICAgICAgICAgICBzZXJ2ZXJUYXJnZXQ6IGAke3Byb2plY3ROYW1lfTpzZXJ2ZXI6ZGV2ZWxvcG1lbnRgLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgcHJvZHVjdGlvbjoge1xuICAgICAgICAgICAgYnJvd3NlclRhcmdldDogYCR7cHJvamVjdE5hbWV9OmJ1aWxkOnByb2R1Y3Rpb25gLFxuICAgICAgICAgICAgc2VydmVyVGFyZ2V0OiBgJHtwcm9qZWN0TmFtZX06c2VydmVyOnByb2R1Y3Rpb25gLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcHJlcmVuZGVyVGFyZ2V0ID0gcHJvamVjdC50YXJnZXRzLmdldChQUkVSRU5ERVJfVEFSR0VUX05BTUUpO1xuICAgICAgaWYgKHByZXJlbmRlclRhcmdldCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHByb2plY3QudGFyZ2V0cy5hZGQoe1xuICAgICAgICBuYW1lOiBQUkVSRU5ERVJfVEFSR0VUX05BTUUsXG4gICAgICAgIGJ1aWxkZXI6ICdAYW5ndWxhci1kZXZraXQvYnVpbGQtYW5ndWxhcjpwcmVyZW5kZXInLFxuICAgICAgICBkZWZhdWx0Q29uZmlndXJhdGlvbjogJ3Byb2R1Y3Rpb24nLFxuICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgcm91dGVzOiBbJy8nXSxcbiAgICAgICAgfSxcbiAgICAgICAgY29uZmlndXJhdGlvbnM6IHtcbiAgICAgICAgICBwcm9kdWN0aW9uOiB7XG4gICAgICAgICAgICBicm93c2VyVGFyZ2V0OiBgJHtwcm9qZWN0TmFtZX06YnVpbGQ6cHJvZHVjdGlvbmAsXG4gICAgICAgICAgICBzZXJ2ZXJUYXJnZXQ6IGAke3Byb2plY3ROYW1lfTpzZXJ2ZXI6cHJvZHVjdGlvbmAsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBkZXZlbG9wbWVudDoge1xuICAgICAgICAgICAgYnJvd3NlclRhcmdldDogYCR7cHJvamVjdE5hbWV9OmJ1aWxkOmRldmVsb3BtZW50YCxcbiAgICAgICAgICAgIHNlcnZlclRhcmdldDogYCR7cHJvamVjdE5hbWV9OnNlcnZlcjpkZXZlbG9wbWVudGAsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9O1xufVxuXG5mdW5jdGlvbiB1cGRhdGVXZWJwYWNrQnVpbGRlclNlcnZlclRzQ29uZmlnUnVsZShvcHRpb25zOiBBZGRTZXJ2ZXJPcHRpb25zKTogUnVsZSB7XG4gIHJldHVybiBhc3luYyAoaG9zdCkgPT4ge1xuICAgIGNvbnN0IHByb2plY3QgPSBhd2FpdCBnZXRQcm9qZWN0KGhvc3QsIG9wdGlvbnMucHJvamVjdCk7XG4gICAgY29uc3Qgc2VydmVyVGFyZ2V0ID0gcHJvamVjdC50YXJnZXRzLmdldCgnc2VydmVyJyk7XG4gICAgaWYgKCFzZXJ2ZXJUYXJnZXQgfHwgIXNlcnZlclRhcmdldC5vcHRpb25zKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgdHNDb25maWdQYXRoID0gc2VydmVyVGFyZ2V0Lm9wdGlvbnMudHNDb25maWc7XG4gICAgaWYgKCF0c0NvbmZpZ1BhdGggfHwgdHlwZW9mIHRzQ29uZmlnUGF0aCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIC8vIE5vIHRzY29uZmlnIHBhdGhcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB0c0NvbmZpZyA9IG5ldyBKU09ORmlsZShob3N0LCB0c0NvbmZpZ1BhdGgpO1xuICAgIGNvbnN0IGZpbGVzQXN0Tm9kZSA9IHRzQ29uZmlnLmdldChbJ2ZpbGVzJ10pO1xuICAgIGNvbnN0IHNlcnZlckZpbGVQYXRoID0gJ3NlcnZlci50cyc7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZmlsZXNBc3ROb2RlKSAmJiAhZmlsZXNBc3ROb2RlLnNvbWUoKHsgdGV4dCB9KSA9PiB0ZXh0ID09PSBzZXJ2ZXJGaWxlUGF0aCkpIHtcbiAgICAgIHRzQ29uZmlnLm1vZGlmeShbJ2ZpbGVzJ10sIFsuLi5maWxlc0FzdE5vZGUsIHNlcnZlckZpbGVQYXRoXSk7XG4gICAgfVxuICB9O1xufVxuXG5mdW5jdGlvbiBhZGREZXBlbmRlbmNpZXMoKTogUnVsZSB7XG4gIHJldHVybiBjaGFpbihbXG4gICAgYWRkRGVwZW5kZW5jeSgnZXhwcmVzcycsIGxhdGVzdFZlcnNpb25zWydleHByZXNzJ10sIHtcbiAgICAgIHR5cGU6IERlcGVuZGVuY3lUeXBlLkRlZmF1bHQsXG4gICAgfSksXG4gICAgYWRkRGVwZW5kZW5jeSgnQHR5cGVzL2V4cHJlc3MnLCBsYXRlc3RWZXJzaW9uc1snQHR5cGVzL2V4cHJlc3MnXSwge1xuICAgICAgdHlwZTogRGVwZW5kZW5jeVR5cGUuRGV2LFxuICAgIH0pLFxuICBdKTtcbn1cblxuZnVuY3Rpb24gYWRkU2VydmVyRmlsZShvcHRpb25zOiBTZXJ2ZXJPcHRpb25zLCBpc1N0YW5kYWxvbmU6IGJvb2xlYW4pOiBSdWxlIHtcbiAgcmV0dXJuIGFzeW5jIChob3N0KSA9PiB7XG4gICAgY29uc3QgcHJvamVjdCA9IGF3YWl0IGdldFByb2plY3QoaG9zdCwgb3B0aW9ucy5wcm9qZWN0KTtcbiAgICBjb25zdCBicm93c2VyRGlzdERpcmVjdG9yeSA9IGF3YWl0IGdldE91dHB1dFBhdGgoaG9zdCwgb3B0aW9ucy5wcm9qZWN0LCAnYnVpbGQnKTtcblxuICAgIHJldHVybiBtZXJnZVdpdGgoXG4gICAgICBhcHBseShcbiAgICAgICAgdXJsKFxuICAgICAgICAgIGAuL2ZpbGVzLyR7XG4gICAgICAgICAgICBwcm9qZWN0Py50YXJnZXRzPy5nZXQoJ2J1aWxkJyk/LmJ1aWxkZXIgPT09IEJ1aWxkZXJzLkFwcGxpY2F0aW9uXG4gICAgICAgICAgICAgID8gJ2FwcGxpY2F0aW9uLWJ1aWxkZXInXG4gICAgICAgICAgICAgIDogJ3NlcnZlci1idWlsZGVyJ1xuICAgICAgICAgIH1gLFxuICAgICAgICApLFxuICAgICAgICBbXG4gICAgICAgICAgYXBwbHlUZW1wbGF0ZXMoe1xuICAgICAgICAgICAgLi4uc3RyaW5ncyxcbiAgICAgICAgICAgIC4uLm9wdGlvbnMsXG4gICAgICAgICAgICBicm93c2VyRGlzdERpcmVjdG9yeSxcbiAgICAgICAgICAgIGlzU3RhbmRhbG9uZSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBtb3ZlKHByb2plY3Qucm9vdCksXG4gICAgICAgIF0sXG4gICAgICApLFxuICAgICk7XG4gIH07XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIChvcHRpb25zOiBBZGRTZXJ2ZXJPcHRpb25zKTogUnVsZSB7XG4gIHJldHVybiBhc3luYyAoaG9zdCkgPT4ge1xuICAgIGNvbnN0IGJyb3dzZXJFbnRyeVBvaW50ID0gYXdhaXQgZ2V0TWFpbkZpbGVQYXRoKGhvc3QsIG9wdGlvbnMucHJvamVjdCk7XG4gICAgY29uc3QgaXNTdGFuZGFsb25lID0gaXNTdGFuZGFsb25lQXBwKGhvc3QsIGJyb3dzZXJFbnRyeVBvaW50KTtcblxuICAgIGNvbnN0IHdvcmtzcGFjZSA9IGF3YWl0IGdldFdvcmtzcGFjZShob3N0KTtcbiAgICBjb25zdCBjbGllbnRQcm9qZWN0ID0gd29ya3NwYWNlLnByb2plY3RzLmdldChvcHRpb25zLnByb2plY3QpO1xuICAgIGlmICghY2xpZW50UHJvamVjdCkge1xuICAgICAgdGhyb3cgdGFyZ2V0QnVpbGROb3RGb3VuZEVycm9yKCk7XG4gICAgfVxuICAgIGNvbnN0IGlzVXNpbmdBcHBsaWNhdGlvbkJ1aWxkZXIgPVxuICAgICAgY2xpZW50UHJvamVjdC50YXJnZXRzLmdldCgnYnVpbGQnKT8uYnVpbGRlciA9PT0gQnVpbGRlcnMuQXBwbGljYXRpb247XG5cbiAgICByZXR1cm4gY2hhaW4oW1xuICAgICAgZXh0ZXJuYWxTY2hlbWF0aWMoJ0BzY2hlbWF0aWNzL2FuZ3VsYXInLCAnc2VydmVyJywge1xuICAgICAgICAuLi5vcHRpb25zLFxuICAgICAgICBza2lwSW5zdGFsbDogdHJ1ZSxcbiAgICAgIH0pLFxuICAgICAgLi4uKGlzVXNpbmdBcHBsaWNhdGlvbkJ1aWxkZXJcbiAgICAgICAgPyBbXG4gICAgICAgICAgICB1cGRhdGVBcHBsaWNhdGlvbkJ1aWxkZXJXb3Jrc3BhY2VDb25maWdSdWxlKGNsaWVudFByb2plY3Qucm9vdCwgb3B0aW9ucyksXG4gICAgICAgICAgICB1cGRhdGVBcHBsaWNhdGlvbkJ1aWxkZXJUc0NvbmZpZ1J1bGUob3B0aW9ucyksXG4gICAgICAgICAgXVxuICAgICAgICA6IFtcbiAgICAgICAgICAgIGFkZFNjcmlwdHNSdWxlKG9wdGlvbnMpLFxuICAgICAgICAgICAgdXBkYXRlV2VicGFja0J1aWxkZXJTZXJ2ZXJUc0NvbmZpZ1J1bGUob3B0aW9ucyksXG4gICAgICAgICAgICB1cGRhdGVXZWJwYWNrQnVpbGRlcldvcmtzcGFjZUNvbmZpZ1J1bGUob3B0aW9ucyksXG4gICAgICAgICAgXSksXG4gICAgICBhZGRTZXJ2ZXJGaWxlKG9wdGlvbnMsIGlzU3RhbmRhbG9uZSksXG4gICAgICBhZGREZXBlbmRlbmNpZXMoKSxcbiAgICBdKTtcbiAgfTtcbn1cbiJdfQ==
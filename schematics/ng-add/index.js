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
    return (0, utility_1.updateWorkspace)((workspace) => {
        const buildTarget = workspace.projects.get(options.project)?.targets.get('build');
        if (!buildTarget) {
            return;
        }
        buildTarget.options = {
            ...buildTarget.options,
            prerender: true,
            ssr: (0, core_1.join)((0, core_1.normalize)(projectRoot), 'server.ts'),
        };
    });
}
function updateWebpackBuilderWorkspaceConfigRule(options) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9hbmd1bGFyL3Nzci9zY2hlbWF0aWNzL25nLWFkZC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOztBQUVILCtDQUFnRTtBQUNoRSwyREFXb0M7QUFFcEMseURBQTZGO0FBQzdGLHFFQUFpRTtBQUNqRSwyRUFBMkU7QUFDM0UsaUZBQXVGO0FBQ3ZGLHNFQUE4RTtBQUM5RSxxRUFBcUU7QUFDckUsbUZBQXdFO0FBRXhFLGdFQUE0RDtBQUM1RCw0Q0FBNkQ7QUFJN0QsTUFBTSxxQkFBcUIsR0FBRyxXQUFXLENBQUM7QUFDMUMsTUFBTSxxQkFBcUIsR0FBRyxXQUFXLENBQUM7QUFFMUMsU0FBUyxjQUFjLENBQUMsT0FBeUI7SUFDL0MsT0FBTyxLQUFLLEVBQUUsSUFBSSxFQUFFLEVBQUU7UUFDcEIsTUFBTSxPQUFPLEdBQUcsZUFBZSxDQUFDO1FBQ2hDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDbEMsSUFBSSxNQUFNLEtBQUssSUFBSSxFQUFFO1lBQ25CLE1BQU0sSUFBSSxnQ0FBbUIsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1NBQzlEO1FBRUQsTUFBTSxVQUFVLEdBQUcsTUFBTSxJQUFBLHFCQUFhLEVBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDeEUsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQXlDLENBQUM7UUFDbEYsR0FBRyxDQUFDLE9BQU8sR0FBRztZQUNaLEdBQUcsR0FBRyxDQUFDLE9BQU87WUFDZCxTQUFTLEVBQUUsVUFBVSxPQUFPLENBQUMsT0FBTyxJQUFJLHFCQUFxQixFQUFFO1lBQy9ELFdBQVcsRUFBRSxRQUFRLFVBQVUs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T0FBTyxFQUFFLFlBQVksQ0FBQztZQUNwQyxlQUFlLEVBQUU7U0FDbEIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQWhDRCw0QkFnQ0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0IHsgam9pbiwgbm9ybWFsaXplLCBzdHJpbmdzIH0gZnJvbSAnQGFuZ3VsYXItZGV2a2l0L2NvcmUnO1xuaW1wb3J0IHtcbiAgUnVsZSxcbiAgU2NoZW1hdGljc0V4Y2VwdGlvbixcbiAgYXBwbHksXG4gIGFwcGx5VGVtcGxhdGVzLFxuICBjaGFpbixcbiAgZXh0ZXJuYWxTY2hlbWF0aWMsXG4gIG1lcmdlV2l0aCxcbiAgbW92ZSxcbiAgbm9vcCxcbiAgdXJsLFxufSBmcm9tICdAYW5ndWxhci1kZXZraXQvc2NoZW1hdGljcyc7XG5pbXBvcnQgeyBTY2hlbWEgYXMgU2VydmVyT3B0aW9ucyB9IGZyb20gJ0BzY2hlbWF0aWNzL2FuZ3VsYXIvc2VydmVyL3NjaGVtYSc7XG5pbXBvcnQgeyBEZXBlbmRlbmN5VHlwZSwgYWRkRGVwZW5kZW5jeSwgdXBkYXRlV29ya3NwYWNlIH0gZnJvbSAnQHNjaGVtYXRpY3MvYW5ndWxhci91dGlsaXR5JztcbmltcG9ydCB7IEpTT05GaWxlIH0gZnJvbSAnQHNjaGVtYXRpY3MvYW5ndWxhci91dGlsaXR5L2pzb24tZmlsZSc7XG5pbXBvcnQgeyBpc1N0YW5kYWxvbmVBcHAgfSBmcm9tICdAc2NoZW1hdGljcy9hbmd1bGFyL3V0aWxpdHkvbmctYXN0LXV0aWxzJztcbmltcG9ydCB7IHRhcmdldEJ1aWxkTm90Rm91bmRFcnJvciB9IGZyb20gJ0BzY2hlbWF0aWNzL2FuZ3VsYXIvdXRpbGl0eS9wcm9qZWN0LXRhcmdldHMnO1xuaW1wb3J0IHsgZ2V0TWFpbkZpbGVQYXRoIH0gZnJvbSAnQHNjaGVtYXRpY3MvYW5ndWxhci91dGlsaXR5L3N0YW5kYWxvbmUvdXRpbCc7XG5pbXBvcnQgeyBnZXRXb3Jrc3BhY2UgfSBmcm9tICdAc2NoZW1hdGljcy9hbmd1bGFyL3V0aWxpdHkvd29ya3NwYWNlJztcbmltcG9ydCB7IEJ1aWxkZXJzIH0gZnJvbSAnQHNjaGVtYXRpY3MvYW5ndWxhci91dGlsaXR5L3dvcmtzcGFjZS1tb2RlbHMnO1xuXG5pbXBvcnQgeyBsYXRlc3RWZXJzaW9ucyB9IGZyb20gJy4uL3V0aWxpdHkvbGF0ZXN0LXZlcnNpb25zJztcbmltcG9ydCB7IGdldE91dHB1dFBhdGgsIGdldFByb2plY3QgfSBmcm9tICcuLi91dGlsaXR5L3V0aWxzJztcblxuaW1wb3J0IHsgU2NoZW1hIGFzIEFkZFNlcnZlck9wdGlvbnMgfSBmcm9tICcuL3NjaGVtYSc7XG5cbmNvbnN0IFNFUlZFX1NTUl9UQVJHRVRfTkFNRSA9ICdzZXJ2ZS1zc3InO1xuY29uc3QgUFJFUkVOREVSX1RBUkdFVF9OQU1FID0gJ3ByZXJlbmRlcic7XG5cbmZ1bmN0aW9uIGFkZFNjcmlwdHNSdWxlKG9wdGlvbnM6IEFkZFNlcnZlck9wdGlvbnMpOiBSdWxlIHtcbiAgcmV0dXJuIGFzeW5jIChob3N0KSA9PiB7XG4gICAgY29uc3QgcGtnUGF0aCA9ICcvcGFja2FnZS5qc29uJztcbiAgICBjb25zdCBidWZmZXIgPSBob3N0LnJlYWQocGtnUGF0aCk7XG4gICAgaWYgKGJ1ZmZlciA9PT0gbnVsbCkge1xuICAgICAgdGhyb3cgbmV3IFNjaGVtYXRpY3NFeGNlcHRpb24oJ0NvdWxkIG5vdCBmaW5kIHBhY2thZ2UuanNvbicpO1xuICAgIH1cblxuICAgIGNvbnN0IHNlcnZlckRpc3QgPSBhd2FpdCBnZXRPdXRwdXRQYXRoKGhvc3QsIG9wdGlvbnMucHJvamVjdCwgJ3NlcnZlcicpO1xuICAgIGNvbnN0IHBrZyA9IEpTT04ucGFyc2UoYnVmZmVyLnRvU3RyaW5nKCkpIGFzIHsgc2NyaXB0cz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfTtcbiAgICBwa2cuc2NyaXB0cyA9IHtcbiAgICAgIC4uLnBrZy5zY3JpcHRzLFxuICAgICAgJ2Rldjpzc3InOiBgbmcgcnVuICR7b3B0aW9ucy5wcm9qZWN0fToke1NFUlZFX1NTUl9UQVJHRVRfTkFNRX1gLFxuICAgICAgJ3NlcnZlOnNzcic6IGBub2RlICR7c2VydmVyRGlzdH0vbWFpbi5qc2AsXG4gICAgICAnYnVpbGQ6c3NyJzogYG5nIGJ1aWxkICYmIG5nIHJ1biAke29wdGlvbnMucHJvamVjdH06c2VydmVyYCxcbiAgICAgICdwcmVyZW5kZXInOiBgbmcgcnVuICR7b3B0aW9ucy5wcm9qZWN0fToke1BSRVJFTkRFUl9UQVJHRVRfTkFNRX1gLFxuICAgIH07XG5cbiAgICBob3N0Lm92ZXJ3cml0ZShwa2dQYXRoLCBKU09OLnN0cmluZ2lmeShwa2csIG51bGwsIDIpKTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlQXBwbGljYXRpb25CdWlsZGVyVHNDb25maWdSdWxlKG9wdGlvbnM6IEFkZFNlcnZlck9wdGlvbnMpOiBSdWxlIHtcbiAgcmV0dXJuIGFzeW5jIChob3N0KSA9PiB7XG4gICAgY29uc3QgcHJvamVjdCA9IGF3YWl0IGdldFByb2plY3QoaG9zdCwgb3B0aW9ucy5wcm9qZWN0KTtcbiAgICBjb25zdCBidWlsZFRhcmdldCA9IHByb2plY3QudGFyZ2V0cy5nZXQoJ2J1aWxkJyk7XG4gICAgaWYgKCFidWlsZFRhcmdldCB8fCAhYnVpbGRUYXJnZXQub3B0aW9ucykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHRzQ29uZmlnUGF0aCA9IGJ1aWxkVGFyZ2V0Lm9wdGlvbnMudHNDb25maWc7XG4gICAgaWYgKCF0c0NvbmZpZ1BhdGggfHwgdHlwZW9mIHRzQ29uZmlnUGF0aCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIC8vIE5vIHRzY29uZmlnIHBhdGhcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB0c0NvbmZpZyA9IG5ldyBKU09ORmlsZShob3N0LCB0c0NvbmZpZ1BhdGgpO1xuICAgIGNvbnN0IGZpbGVzQXN0Tm9kZSA9IHRzQ29uZmlnLmdldChbJ2ZpbGVzJ10pO1xuICAgIGNvbnN0IHNlcnZlckZpbGVQYXRoID0gJ3NlcnZlci50cyc7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZmlsZXNBc3ROb2RlKSAmJiAhZmlsZXNBc3ROb2RlLnNvbWUoKHsgdGV4dCB9KSA9PiB0ZXh0ID09PSBzZXJ2ZXJGaWxlUGF0aCkpIHtcbiAgICAgIHRzQ29uZmlnLm1vZGlmeShbJ2ZpbGVzJ10sIFsuLi5maWxlc0FzdE5vZGUsIHNlcnZlckZpbGVQYXRoXSk7XG4gICAgfVxuICB9O1xufVxuXG5mdW5jdGlvbiB1cGRhdGVBcHBsaWNhdGlvbkJ1aWxkZXJXb3Jrc3BhY2VDb25maWdSdWxlKFxuICBwcm9qZWN0Um9vdDogc3RyaW5nLFxuICBvcHRpb25zOiBBZGRTZXJ2ZXJPcHRpb25zLFxuKTogUnVsZSB7XG4gIHJldHVybiB1cGRhdGVXb3Jrc3BhY2UoKHdvcmtzcGFjZSkgPT4ge1xuICAgIGNvbnN0IGJ1aWxkVGFyZ2V0ID0gd29ya3NwYWNlLnByb2plY3RzLmdldChvcHRpb25zLnByb2plY3QpPy50YXJnZXRzLmdldCgnYnVpbGQnKTtcbiAgICBpZiAoIWJ1aWxkVGFyZ2V0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgYnVpbGRUYXJnZXQub3B0aW9ucyA9IHtcbiAgICAgIC4uLmJ1aWxkVGFyZ2V0Lm9wdGlvbnMsXG4gICAgICBwcmVyZW5kZXI6IHRydWUsXG4gICAgICBzc3I6IGpvaW4obm9ybWFsaXplKHByb2plY3RSb290KSwgJ3NlcnZlci50cycpLFxuICAgIH07XG4gIH0pO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVXZWJwYWNrQnVpbGRlcldvcmtzcGFjZUNvbmZpZ1J1bGUob3B0aW9uczogQWRkU2VydmVyT3B0aW9ucyk6IFJ1bGUge1xuICByZXR1cm4gdXBkYXRlV29ya3NwYWNlKCh3b3Jrc3BhY2UpID0+IHtcbiAgICBjb25zdCBwcm9qZWN0TmFtZSA9IG9wdGlvbnMucHJvamVjdDtcbiAgICBjb25zdCBwcm9qZWN0ID0gd29ya3NwYWNlLnByb2plY3RzLmdldChwcm9qZWN0TmFtZSk7XG4gICAgaWYgKCFwcm9qZWN0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1ub24tbnVsbC1hc3NlcnRpb25cbiAgICBjb25zdCBzZXJ2ZXJUYXJnZXQgPSBwcm9qZWN0LnRhcmdldHMuZ2V0KCdzZXJ2ZXInKSE7XG4gICAgKHNlcnZlclRhcmdldC5vcHRpb25zID8/PSB7fSkubWFpbiA9IGpvaW4obm9ybWFsaXplKHByb2plY3Qucm9vdCksICdzZXJ2ZXIudHMnKTtcblxuICAgIGNvbnN0IHNlcnZlU1NSVGFyZ2V0ID0gcHJvamVjdC50YXJnZXRzLmdldChTRVJWRV9TU1JfVEFSR0VUX05BTUUpO1xuICAgIGlmIChzZXJ2ZVNTUlRhcmdldCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHByb2plY3QudGFyZ2V0cy5hZGQoe1xuICAgICAgbmFtZTogU0VSVkVfU1NSX1RBUkdFVF9OQU1FLFxuICAgICAgYnVpbGRlcjogJ0Bhbmd1bGFyLWRldmtpdC9idWlsZC1hbmd1bGFyOnNzci1kZXYtc2VydmVyJyxcbiAgICAgIGRlZmF1bHRDb25maWd1cmF0aW9uOiAnZGV2ZWxvcG1lbnQnLFxuICAgICAgb3B0aW9uczoge30sXG4gICAgICBjb25maWd1cmF0aW9uczoge1xuICAgICAgICBkZXZlbG9wbWVudDoge1xuICAgICAgICAgIGJyb3dzZXJUYXJnZXQ6IGAke3Byb2plY3ROYW1lfTpidWlsZDpkZXZlbG9wbWVudGAsXG4gICAgICAgICAgc2VydmVyVGFyZ2V0OiBgJHtwcm9qZWN0TmFtZX06c2VydmVyOmRldmVsb3BtZW50YCxcbiAgICAgICAgfSxcbiAgICAgICAgcHJvZHVjdGlvbjoge1xuICAgICAgICAgIGJyb3dzZXJUYXJnZXQ6IGAke3Byb2plY3ROYW1lfTpidWlsZDpwcm9kdWN0aW9uYCxcbiAgICAgICAgICBzZXJ2ZXJUYXJnZXQ6IGAke3Byb2plY3ROYW1lfTpzZXJ2ZXI6cHJvZHVjdGlvbmAsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgcHJlcmVuZGVyVGFyZ2V0ID0gcHJvamVjdC50YXJnZXRzLmdldChQUkVSRU5ERVJfVEFSR0VUX05BTUUpO1xuICAgIGlmIChwcmVyZW5kZXJUYXJnZXQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBwcm9qZWN0LnRhcmdldHMuYWRkKHtcbiAgICAgIG5hbWU6IFBSRVJFTkRFUl9UQVJHRVRfTkFNRSxcbiAgICAgIGJ1aWxkZXI6ICdAYW5ndWxhci1kZXZraXQvYnVpbGQtYW5ndWxhcjpwcmVyZW5kZXInLFxuICAgICAgZGVmYXVsdENvbmZpZ3VyYXRpb246ICdwcm9kdWN0aW9uJyxcbiAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgcm91dGVzOiBbJy8nXSxcbiAgICAgIH0sXG4gICAgICBjb25maWd1cmF0aW9uczoge1xuICAgICAgICBwcm9kdWN0aW9uOiB7XG4gICAgICAgICAgYnJvd3NlclRhcmdldDogYCR7cHJvamVjdE5hbWV9OmJ1aWxkOnByb2R1Y3Rpb25gLFxuICAgICAgICAgIHNlcnZlclRhcmdldDogYCR7cHJvamVjdE5hbWV9OnNlcnZlcjpwcm9kdWN0aW9uYCxcbiAgICAgICAgfSxcbiAgICAgICAgZGV2ZWxvcG1lbnQ6IHtcbiAgICAgICAgICBicm93c2VyVGFyZ2V0OiBgJHtwcm9qZWN0TmFtZX06YnVpbGQ6ZGV2ZWxvcG1lbnRgLFxuICAgICAgICAgIHNlcnZlclRhcmdldDogYCR7cHJvamVjdE5hbWV9OnNlcnZlcjpkZXZlbG9wbWVudGAsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlV2VicGFja0J1aWxkZXJTZXJ2ZXJUc0NvbmZpZ1J1bGUob3B0aW9uczogQWRkU2VydmVyT3B0aW9ucyk6IFJ1bGUge1xuICByZXR1cm4gYXN5bmMgKGhvc3QpID0+IHtcbiAgICBjb25zdCBwcm9qZWN0ID0gYXdhaXQgZ2V0UHJvamVjdChob3N0LCBvcHRpb25zLnByb2plY3QpO1xuICAgIGNvbnN0IHNlcnZlclRhcmdldCA9IHByb2plY3QudGFyZ2V0cy5nZXQoJ3NlcnZlcicpO1xuICAgIGlmICghc2VydmVyVGFyZ2V0IHx8ICFzZXJ2ZXJUYXJnZXQub3B0aW9ucykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHRzQ29uZmlnUGF0aCA9IHNlcnZlclRhcmdldC5vcHRpb25zLnRzQ29uZmlnO1xuICAgIGlmICghdHNDb25maWdQYXRoIHx8IHR5cGVvZiB0c0NvbmZpZ1BhdGggIT09ICdzdHJpbmcnKSB7XG4gICAgICAvLyBObyB0c2NvbmZpZyBwYXRoXG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgdHNDb25maWcgPSBuZXcgSlNPTkZpbGUoaG9zdCwgdHNDb25maWdQYXRoKTtcbiAgICBjb25zdCBmaWxlc0FzdE5vZGUgPSB0c0NvbmZpZy5nZXQoWydmaWxlcyddKTtcbiAgICBjb25zdCBzZXJ2ZXJGaWxlUGF0aCA9ICdzZXJ2ZXIudHMnO1xuICAgIGlmIChBcnJheS5pc0FycmF5KGZpbGVzQXN0Tm9kZSkgJiYgIWZpbGVzQXN0Tm9kZS5zb21lKCh7IHRleHQgfSkgPT4gdGV4dCA9PT0gc2VydmVyRmlsZVBhdGgpKSB7XG4gICAgICB0c0NvbmZpZy5tb2RpZnkoWydmaWxlcyddLCBbLi4uZmlsZXNBc3ROb2RlLCBzZXJ2ZXJGaWxlUGF0aF0pO1xuICAgIH1cbiAgfTtcbn1cblxuZnVuY3Rpb24gYWRkRGVwZW5kZW5jaWVzKCk6IFJ1bGUge1xuICByZXR1cm4gY2hhaW4oW1xuICAgIGFkZERlcGVuZGVuY3koJ2V4cHJlc3MnLCBsYXRlc3RWZXJzaW9uc1snZXhwcmVzcyddLCB7XG4gICAgICB0eXBlOiBEZXBlbmRlbmN5VHlwZS5EZWZhdWx0LFxuICAgIH0pLFxuICAgIGFkZERlcGVuZGVuY3koJ0B0eXBlcy9leHByZXNzJywgbGF0ZXN0VmVyc2lvbnNbJ0B0eXBlcy9leHByZXNzJ10sIHtcbiAgICAgIHR5cGU6IERlcGVuZGVuY3lUeXBlLkRldixcbiAgICB9KSxcbiAgXSk7XG59XG5cbmZ1bmN0aW9uIGFkZFNlcnZlckZpbGUob3B0aW9uczogU2VydmVyT3B0aW9ucywgaXNTdGFuZGFsb25lOiBib29sZWFuKTogUnVsZSB7XG4gIHJldHVybiBhc3luYyAoaG9zdCkgPT4ge1xuICAgIGNvbnN0IHByb2plY3QgPSBhd2FpdCBnZXRQcm9qZWN0KGhvc3QsIG9wdGlvbnMucHJvamVjdCk7XG4gICAgY29uc3QgYnJvd3NlckRpc3REaXJlY3RvcnkgPSBhd2FpdCBnZXRPdXRwdXRQYXRoKGhvc3QsIG9wdGlvbnMucHJvamVjdCwgJ2J1aWxkJyk7XG5cbiAgICByZXR1cm4gbWVyZ2VXaXRoKFxuICAgICAgYXBwbHkoXG4gICAgICAgIHVybChcbiAgICAgICAgICBgLi9maWxlcy8ke1xuICAgICAgICAgICAgcHJvamVjdD8udGFyZ2V0cz8uZ2V0KCdidWlsZCcpPy5idWlsZGVyID09PSBCdWlsZGVycy5BcHBsaWNhdGlvblxuICAgICAgICAgICAgICA/ICdhcHBsaWNhdGlvbi1idWlsZGVyJ1xuICAgICAgICAgICAgICA6ICdzZXJ2ZXItYnVpbGRlcidcbiAgICAgICAgICB9YCxcbiAgICAgICAgKSxcbiAgICAgICAgW1xuICAgICAgICAgIGFwcGx5VGVtcGxhdGVzKHtcbiAgICAgICAgICAgIC4uLnN0cmluZ3MsXG4gICAgICAgICAgICAuLi5vcHRpb25zLFxuICAgICAgICAgICAgYnJvd3NlckRpc3REaXJlY3RvcnksXG4gICAgICAgICAgICBpc1N0YW5kYWxvbmUsXG4gICAgICAgICAgfSksXG4gICAgICAgICAgbW92ZShwcm9qZWN0LnJvb3QpLFxuICAgICAgICBdLFxuICAgICAgKSxcbiAgICApO1xuICB9O1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiAob3B0aW9uczogQWRkU2VydmVyT3B0aW9ucyk6IFJ1bGUge1xuICByZXR1cm4gYXN5bmMgKGhvc3QpID0+IHtcbiAgICBjb25zdCBicm93c2VyRW50cnlQb2ludCA9IGF3YWl0IGdldE1haW5GaWxlUGF0aChob3N0LCBvcHRpb25zLnByb2plY3QpO1xuICAgIGNvbnN0IGlzU3RhbmRhbG9uZSA9IGlzU3RhbmRhbG9uZUFwcChob3N0LCBicm93c2VyRW50cnlQb2ludCk7XG5cbiAgICBjb25zdCB3b3Jrc3BhY2UgPSBhd2FpdCBnZXRXb3Jrc3BhY2UoaG9zdCk7XG4gICAgY29uc3QgY2xpZW50UHJvamVjdCA9IHdvcmtzcGFjZS5wcm9qZWN0cy5nZXQob3B0aW9ucy5wcm9qZWN0KTtcbiAgICBpZiAoIWNsaWVudFByb2plY3QpIHtcbiAgICAgIHRocm93IHRhcmdldEJ1aWxkTm90Rm91bmRFcnJvcigpO1xuICAgIH1cbiAgICBjb25zdCBpc1VzaW5nQXBwbGljYXRpb25CdWlsZGVyID1cbiAgICAgIGNsaWVudFByb2plY3QudGFyZ2V0cy5nZXQoJ2J1aWxkJyk/LmJ1aWxkZXIgPT09IEJ1aWxkZXJzLkFwcGxpY2F0aW9uO1xuXG4gICAgcmV0dXJuIGNoYWluKFtcbiAgICAgIGV4dGVybmFsU2NoZW1hdGljKCdAc2NoZW1hdGljcy9hbmd1bGFyJywgJ3NlcnZlcicsIHtcbiAgICAgICAgLi4ub3B0aW9ucyxcbiAgICAgICAgc2tpcEluc3RhbGw6IHRydWUsXG4gICAgICB9KSxcbiAgICAgIC4uLihpc1VzaW5nQXBwbGljYXRpb25CdWlsZGVyXG4gICAgICAgID8gW1xuICAgICAgICAgICAgdXBkYXRlQXBwbGljYXRpb25CdWlsZGVyV29ya3NwYWNlQ29uZmlnUnVsZShjbGllbnRQcm9qZWN0LnJvb3QsIG9wdGlvbnMpLFxuICAgICAgICAgICAgdXBkYXRlQXBwbGljYXRpb25CdWlsZGVyVHNDb25maWdSdWxlKG9wdGlvbnMpLFxuICAgICAgICAgIF1cbiAgICAgICAgOiBbXG4gICAgICAgICAgICBhZGRTY3JpcHRzUnVsZShvcHRpb25zKSxcbiAgICAgICAgICAgIHVwZGF0ZVdlYnBhY2tCdWlsZGVyU2VydmVyVHNDb25maWdSdWxlKG9wdGlvbnMpLFxuICAgICAgICAgICAgdXBkYXRlV2VicGFja0J1aWxkZXJXb3Jrc3BhY2VDb25maWdSdWxlKG9wdGlvbnMpLFxuICAgICAgICAgIF0pLFxuICAgICAgYWRkU2VydmVyRmlsZShvcHRpb25zLCBpc1N0YW5kYWxvbmUpLFxuICAgICAgYWRkRGVwZW5kZW5jaWVzKCksXG4gICAgXSk7XG4gIH07XG59XG4iXX0=
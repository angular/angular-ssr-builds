/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { join, normalize, strings } from '@angular-devkit/core';
import { SchematicsException, apply, applyTemplates, chain, externalSchematic, mergeWith, move, url, } from '@angular-devkit/schematics';
import { DependencyType, addDependency, updateWorkspace } from '@schematics/angular/utility';
import { JSONFile } from '@schematics/angular/utility/json-file';
import { isStandaloneApp } from '@schematics/angular/utility/ng-ast-utils';
import { targetBuildNotFoundError } from '@schematics/angular/utility/project-targets';
import { getMainFilePath } from '@schematics/angular/utility/standalone/util';
import { getWorkspace } from '@schematics/angular/utility/workspace';
import { Builders } from '@schematics/angular/utility/workspace-models';
import { latestVersions } from '../utility/latest-versions';
import { getOutputPath, getProject } from '../utility/utils';
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
            addServerFile(options, isStandalone),
            addDependencies(),
        ]);
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9hbmd1bGFyL3Nzci9zY2hlbWF0aWNzL25nLWFkZC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0dBTUc7QUFFSCxPQUFPLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUNoRSxPQUFPLEVBRUwsbUJBQW1CLEVBQ25CLEtBQUssRUFDTCxjQUFjLEVBQ2QsS0FBSyxFQUNMLGlCQUFpQixFQUNqQixTQUFTLEVBQ1QsSUFBSSxFQUVKLEdBQUcsR0FDSixNQUFNLDRCQUE0QixDQUFDO0FBRXBDLE9BQU8sRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQzdGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDM0UsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdkYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFeEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQzVELE9BQU8sRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFJN0QsTUFBTSxxQkFBcUIsR0FBRyxXQUFXLENBQUM7QUFDMUMsTUFBTSxxQkFBcUIsR0FBRyxXQUFXLENBQUM7QUFFMUMsU0FBUyxjQUFjLENBQUMsT0FBeUI7SUFDL0MsT0FBTyxLQUFLLEVBQUUsSUFBSSxFQUFFLEVBQUU7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RCxJQUFJLENBQUMsYUFBYSxFQUFFO1lBQ2xCLE1BQU0sd0JBQXdCLEVBQUUsQ0FBQztTQUNsQztRQUNELE1BQU0seUJBQXlCLEdBQzdCLGFBQWEsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLE9BQU8sS0FBSyxRQUFRLENBQUMsV0FBVyxDQUFDO1FBRXZFLE9BQU8sS0FBSyxDQUFDO1lBQ1gsaUJBQWlCLENBQUMscUJBQXFCLEVBQUUsUUFBUSxFQUFFO2dCQUNqRCxHQUFHLE9BQU87Z0JBQ1YsV0FBVyxFQUFFLElBQUk7YUFDbEIsQ0FBQztZQUNGLEdBQUcsQ0FBQyx5QkFBeUI7Z0JBQzNCLENBQUMsQ0FBQztvQkFDRSwyQ0FBMkMsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQztvQkFDeEUsb0NBQW9DLENBQUMsT0FBTyxDQUFDO2lCQUM5QztnQkFDSCxDQUFDLENBQUM7b0JBQ0UsY0FBYyxDQUFDLE9BQU8sQ0FBQztvQkFDdkIsc0NBQXNDLENBQUMsT0FBTyxDQUFDO29CQUMvQyx1Q0FBdUMsQ0FBQyxPQUFPLENBQUM7aUJBQ2pELENBQUM7WUFDTixhQUFhLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQztZQUNwQyxlQUFlLEVBQUU7U0FDbEIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgeyBqb2luLCBub3JtYWxpemUsIHN0cmluZ3MgfSBmcm9tICdAYW5ndWxhci1kZXZraXQvY29yZSc7XG5pbXBvcnQge1xuICBSdWxlLFxuICBTY2hlbWF0aWNzRXhjZXB0aW9uLFxuICBhcHBseSxcbiAgYXBwbHlUZW1wbGF0ZXMsXG4gIGNoYWluLFxuICBleHRlcm5hbFNjaGVtYXRpYyxcbiAgbWVyZ2VXaXRoLFxuICBtb3ZlLFxuICBub29wLFxuICB1cmwsXG59IGZyb20gJ0Bhbmd1bGFyLWRldmtpdC9zY2hlbWF0aWNzJztcbmltcG9ydCB7IFNjaGVtYSBhcyBTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnQHNjaGVtYXRpY3MvYW5ndWxhci9zZXJ2ZXIvc2NoZW1hJztcbmltcG9ydCB7IERlcGVuZGVuY3lUeXBlLCBhZGREZXBlbmRlbmN5LCB1cGRhdGVXb3Jrc3BhY2UgfSBmcm9tICdAc2NoZW1hdGljcy9hbmd1bGFyL3V0aWxpdHknO1xuaW1wb3J0IHsgSlNPTkZpbGUgfSBmcm9tICdAc2NoZW1hdGljcy9hbmd1bGFyL3V0aWxpdHkvanNvbi1maWxlJztcbmltcG9ydCB7IGlzU3RhbmRhbG9uZUFwcCB9IGZyb20gJ0BzY2hlbWF0aWNzL2FuZ3VsYXIvdXRpbGl0eS9uZy1hc3QtdXRpbHMnO1xuaW1wb3J0IHsgdGFyZ2V0QnVpbGROb3RGb3VuZEVycm9yIH0gZnJvbSAnQHNjaGVtYXRpY3MvYW5ndWxhci91dGlsaXR5L3Byb2plY3QtdGFyZ2V0cyc7XG5pbXBvcnQgeyBnZXRNYWluRmlsZVBhdGggfSBmcm9tICdAc2NoZW1hdGljcy9hbmd1bGFyL3V0aWxpdHkvc3RhbmRhbG9uZS91dGlsJztcbmltcG9ydCB7IGdldFdvcmtzcGFjZSB9IGZyb20gJ0BzY2hlbWF0aWNzL2FuZ3VsYXIvdXRpbGl0eS93b3Jrc3BhY2UnO1xuaW1wb3J0IHsgQnVpbGRlcnMgfSBmcm9tICdAc2NoZW1hdGljcy9hbmd1bGFyL3V0aWxpdHkvd29ya3NwYWNlLW1vZGVscyc7XG5cbmltcG9ydCB7IGxhdGVzdFZlcnNpb25zIH0gZnJvbSAnLi4vdXRpbGl0eS9sYXRlc3QtdmVyc2lvbnMnO1xuaW1wb3J0IHsgZ2V0T3V0cHV0UGF0aCwgZ2V0UHJvamVjdCB9IGZyb20gJy4uL3V0aWxpdHkvdXRpbHMnO1xuXG5pbXBvcnQgeyBTY2hlbWEgYXMgQWRkU2VydmVyT3B0aW9ucyB9IGZyb20gJy4vc2NoZW1hJztcblxuY29uc3QgU0VSVkVfU1NSX1RBUkdFVF9OQU1FID0gJ3NlcnZlLXNzcic7XG5jb25zdCBQUkVSRU5ERVJfVEFSR0VUX05BTUUgPSAncHJlcmVuZGVyJztcblxuZnVuY3Rpb24gYWRkU2NyaXB0c1J1bGUob3B0aW9uczogQWRkU2VydmVyT3B0aW9ucyk6IFJ1bGUge1xuICByZXR1cm4gYXN5bmMgKGhvc3QpID0+IHtcbiAgICBjb25zdCBwa2dQYXRoID0gJy9wYWNrYWdlLmpzb24nO1xuICAgIGNvbnN0IGJ1ZmZlciA9IGhvc3QucmVhZChwa2dQYXRoKTtcbiAgICBpZiAoYnVmZmVyID09PSBudWxsKSB7XG4gICAgICB0aHJvdyBuZXcgU2NoZW1hdGljc0V4Y2VwdGlvbignQ291bGQgbm90IGZpbmQgcGFja2FnZS5qc29uJyk7XG4gICAgfVxuXG4gICAgY29uc3Qgc2VydmVyRGlzdCA9IGF3YWl0IGdldE91dHB1dFBhdGgoaG9zdCwgb3B0aW9ucy5wcm9qZWN0LCAnc2VydmVyJyk7XG4gICAgY29uc3QgcGtnID0gSlNPTi5wYXJzZShidWZmZXIudG9TdHJpbmcoKSkgYXMgeyBzY3JpcHRzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB9O1xuICAgIHBrZy5zY3JpcHRzID0ge1xuICAgICAgLi4ucGtnLnNjcmlwdHMsXG4gICAgICAnZGV2OnNzcic6IGBuZyBydW4gJHtvcHRpb25zLnByb2plY3R9OiR7U0VSVkVfU1NSX1RBUkdFVF9OQU1FfWAsXG4gICAgICAnc2VydmU6c3NyJzogYG5vZGUgJHtzZXJ2ZXJEaXN0fS9tYWluLmpzYCxcbiAgICAgICdidWlsZDpzc3InOiBgbmcgYnVpbGQgJiYgbmcgcnVuICR7b3B0aW9ucy5wcm9qZWN0fTpzZXJ2ZXJgLFxuICAgICAgJ3ByZXJlbmRlcic6IGBuZyBydW4gJHtvcHRpb25zLnByb2plY3R9OiR7UFJFUkVOREVSX1RBUkdFVF9OQU1FfWAsXG4gICAgfTtcblxuICAgIGhvc3Qub3ZlcndyaXRlKHBrZ1BhdGgsIEpTT04uc3RyaW5naWZ5KHBrZywgbnVsbCwgMikpO1xuICB9O1xufVxuXG5mdW5jdGlvbiB1cGRhdGVBcHBsaWNhdGlvbkJ1aWxkZXJUc0NvbmZpZ1J1bGUob3B0aW9uczogQWRkU2VydmVyT3B0aW9ucyk6IFJ1bGUge1xuICByZXR1cm4gYXN5bmMgKGhvc3QpID0+IHtcbiAgICBjb25zdCBwcm9qZWN0ID0gYXdhaXQgZ2V0UHJvamVjdChob3N0LCBvcHRpb25zLnByb2plY3QpO1xuICAgIGNvbnN0IGJ1aWxkVGFyZ2V0ID0gcHJvamVjdC50YXJnZXRzLmdldCgnYnVpbGQnKTtcbiAgICBpZiAoIWJ1aWxkVGFyZ2V0IHx8ICFidWlsZFRhcmdldC5vcHRpb25zKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgdHNDb25maWdQYXRoID0gYnVpbGRUYXJnZXQub3B0aW9ucy50c0NvbmZpZztcbiAgICBpZiAoIXRzQ29uZmlnUGF0aCB8fCB0eXBlb2YgdHNDb25maWdQYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgLy8gTm8gdHNjb25maWcgcGF0aFxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHRzQ29uZmlnID0gbmV3IEpTT05GaWxlKGhvc3QsIHRzQ29uZmlnUGF0aCk7XG4gICAgY29uc3QgZmlsZXNBc3ROb2RlID0gdHNDb25maWcuZ2V0KFsnZmlsZXMnXSk7XG4gICAgY29uc3Qgc2VydmVyRmlsZVBhdGggPSAnc2VydmVyLnRzJztcbiAgICBpZiAoQXJyYXkuaXNBcnJheShmaWxlc0FzdE5vZGUpICYmICFmaWxlc0FzdE5vZGUuc29tZSgoeyB0ZXh0IH0pID0+IHRleHQgPT09IHNlcnZlckZpbGVQYXRoKSkge1xuICAgICAgdHNDb25maWcubW9kaWZ5KFsnZmlsZXMnXSwgWy4uLmZpbGVzQXN0Tm9kZSwgc2VydmVyRmlsZVBhdGhdKTtcbiAgICB9XG4gIH07XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUFwcGxpY2F0aW9uQnVpbGRlcldvcmtzcGFjZUNvbmZpZ1J1bGUoXG4gIHByb2plY3RSb290OiBzdHJpbmcsXG4gIG9wdGlvbnM6IEFkZFNlcnZlck9wdGlvbnMsXG4pOiBSdWxlIHtcbiAgcmV0dXJuICgpID0+IHtcbiAgICByZXR1cm4gdXBkYXRlV29ya3NwYWNlKCh3b3Jrc3BhY2UpID0+IHtcbiAgICAgIGNvbnN0IGJ1aWxkVGFyZ2V0ID0gd29ya3NwYWNlLnByb2plY3RzLmdldChvcHRpb25zLnByb2plY3QpPy50YXJnZXRzLmdldCgnYnVpbGQnKTtcbiAgICAgIGlmICghYnVpbGRUYXJnZXQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgY29uc3QgcHJvZENvbmZpZyA9IGJ1aWxkVGFyZ2V0LmNvbmZpZ3VyYXRpb25zPy5wcm9kdWN0aW9uIGFzIFJlY29yZDxzdHJpbmcsIGFueT47XG4gICAgICBpZiAoIXByb2RDb25maWcpIHtcbiAgICAgICAgdGhyb3cgbmV3IFNjaGVtYXRpY3NFeGNlcHRpb24oXG4gICAgICAgICAgYEEgXCJwcm9kdWN0aW9uXCIgY29uZmlndXJhdGlvbiBpcyBub3QgZGVmaW5lZCBmb3IgdGhlIFwiYnVpbGRcIiBidWlsZGVyLmAsXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIHByb2RDb25maWcucHJlcmVuZGVyID0gdHJ1ZTtcbiAgICAgIHByb2RDb25maWcuc3NyID0gam9pbihub3JtYWxpemUocHJvamVjdFJvb3QpLCAnc2VydmVyLnRzJyk7XG4gICAgfSk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVdlYnBhY2tCdWlsZGVyV29ya3NwYWNlQ29uZmlnUnVsZShvcHRpb25zOiBBZGRTZXJ2ZXJPcHRpb25zKTogUnVsZSB7XG4gIHJldHVybiAoKSA9PiB7XG4gICAgcmV0dXJuIHVwZGF0ZVdvcmtzcGFjZSgod29ya3NwYWNlKSA9PiB7XG4gICAgICBjb25zdCBwcm9qZWN0TmFtZSA9IG9wdGlvbnMucHJvamVjdDtcbiAgICAgIGNvbnN0IHByb2plY3QgPSB3b3Jrc3BhY2UucHJvamVjdHMuZ2V0KHByb2plY3ROYW1lKTtcbiAgICAgIGlmICghcHJvamVjdCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tbm9uLW51bGwtYXNzZXJ0aW9uXG4gICAgICBjb25zdCBzZXJ2ZXJUYXJnZXQgPSBwcm9qZWN0LnRhcmdldHMuZ2V0KCdzZXJ2ZXInKSE7XG4gICAgICAoc2VydmVyVGFyZ2V0Lm9wdGlvbnMgPz89IHt9KS5tYWluID0gam9pbihub3JtYWxpemUocHJvamVjdC5yb290KSwgJ3NlcnZlci50cycpO1xuXG4gICAgICBjb25zdCBzZXJ2ZVNTUlRhcmdldCA9IHByb2plY3QudGFyZ2V0cy5nZXQoU0VSVkVfU1NSX1RBUkdFVF9OQU1FKTtcbiAgICAgIGlmIChzZXJ2ZVNTUlRhcmdldCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHByb2plY3QudGFyZ2V0cy5hZGQoe1xuICAgICAgICBuYW1lOiBTRVJWRV9TU1JfVEFSR0VUX05BTUUsXG4gICAgICAgIGJ1aWxkZXI6ICdAYW5ndWxhci1kZXZraXQvYnVpbGQtYW5ndWxhcjpzc3ItZGV2LXNlcnZlcicsXG4gICAgICAgIGRlZmF1bHRDb25maWd1cmF0aW9uOiAnZGV2ZWxvcG1lbnQnLFxuICAgICAgICBvcHRpb25zOiB7fSxcbiAgICAgICAgY29uZmlndXJhdGlvbnM6IHtcbiAgICAgICAgICBkZXZlbG9wbWVudDoge1xuICAgICAgICAgICAgYnJvd3NlclRhcmdldDogYCR7cHJvamVjdE5hbWV9OmJ1aWxkOmRldmVsb3BtZW50YCxcbiAgICAgICAgICAgIHNlcnZlclRhcmdldDogYCR7cHJvamVjdE5hbWV9OnNlcnZlcjpkZXZlbG9wbWVudGAsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBwcm9kdWN0aW9uOiB7XG4gICAgICAgICAgICBicm93c2VyVGFyZ2V0OiBgJHtwcm9qZWN0TmFtZX06YnVpbGQ6cHJvZHVjdGlvbmAsXG4gICAgICAgICAgICBzZXJ2ZXJUYXJnZXQ6IGAke3Byb2plY3ROYW1lfTpzZXJ2ZXI6cHJvZHVjdGlvbmAsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBwcmVyZW5kZXJUYXJnZXQgPSBwcm9qZWN0LnRhcmdldHMuZ2V0KFBSRVJFTkRFUl9UQVJHRVRfTkFNRSk7XG4gICAgICBpZiAocHJlcmVuZGVyVGFyZ2V0KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgcHJvamVjdC50YXJnZXRzLmFkZCh7XG4gICAgICAgIG5hbWU6IFBSRVJFTkRFUl9UQVJHRVRfTkFNRSxcbiAgICAgICAgYnVpbGRlcjogJ0Bhbmd1bGFyLWRldmtpdC9idWlsZC1hbmd1bGFyOnByZXJlbmRlcicsXG4gICAgICAgIGRlZmF1bHRDb25maWd1cmF0aW9uOiAncHJvZHVjdGlvbicsXG4gICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICByb3V0ZXM6IFsnLyddLFxuICAgICAgICB9LFxuICAgICAgICBjb25maWd1cmF0aW9uczoge1xuICAgICAgICAgIHByb2R1Y3Rpb246IHtcbiAgICAgICAgICAgIGJyb3dzZXJUYXJnZXQ6IGAke3Byb2plY3ROYW1lfTpidWlsZDpwcm9kdWN0aW9uYCxcbiAgICAgICAgICAgIHNlcnZlclRhcmdldDogYCR7cHJvamVjdE5hbWV9OnNlcnZlcjpwcm9kdWN0aW9uYCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGRldmVsb3BtZW50OiB7XG4gICAgICAgICAgICBicm93c2VyVGFyZ2V0OiBgJHtwcm9qZWN0TmFtZX06YnVpbGQ6ZGV2ZWxvcG1lbnRgLFxuICAgICAgICAgICAgc2VydmVyVGFyZ2V0OiBgJHtwcm9qZWN0TmFtZX06c2VydmVyOmRldmVsb3BtZW50YCxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVdlYnBhY2tCdWlsZGVyU2VydmVyVHNDb25maWdSdWxlKG9wdGlvbnM6IEFkZFNlcnZlck9wdGlvbnMpOiBSdWxlIHtcbiAgcmV0dXJuIGFzeW5jIChob3N0KSA9PiB7XG4gICAgY29uc3QgcHJvamVjdCA9IGF3YWl0IGdldFByb2plY3QoaG9zdCwgb3B0aW9ucy5wcm9qZWN0KTtcbiAgICBjb25zdCBzZXJ2ZXJUYXJnZXQgPSBwcm9qZWN0LnRhcmdldHMuZ2V0KCdzZXJ2ZXInKTtcbiAgICBpZiAoIXNlcnZlclRhcmdldCB8fCAhc2VydmVyVGFyZ2V0Lm9wdGlvbnMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB0c0NvbmZpZ1BhdGggPSBzZXJ2ZXJUYXJnZXQub3B0aW9ucy50c0NvbmZpZztcbiAgICBpZiAoIXRzQ29uZmlnUGF0aCB8fCB0eXBlb2YgdHNDb25maWdQYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgLy8gTm8gdHNjb25maWcgcGF0aFxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHRzQ29uZmlnID0gbmV3IEpTT05GaWxlKGhvc3QsIHRzQ29uZmlnUGF0aCk7XG4gICAgY29uc3QgZmlsZXNBc3ROb2RlID0gdHNDb25maWcuZ2V0KFsnZmlsZXMnXSk7XG4gICAgY29uc3Qgc2VydmVyRmlsZVBhdGggPSAnc2VydmVyLnRzJztcbiAgICBpZiAoQXJyYXkuaXNBcnJheShmaWxlc0FzdE5vZGUpICYmICFmaWxlc0FzdE5vZGUuc29tZSgoeyB0ZXh0IH0pID0+IHRleHQgPT09IHNlcnZlckZpbGVQYXRoKSkge1xuICAgICAgdHNDb25maWcubW9kaWZ5KFsnZmlsZXMnXSwgWy4uLmZpbGVzQXN0Tm9kZSwgc2VydmVyRmlsZVBhdGhdKTtcbiAgICB9XG4gIH07XG59XG5cbmZ1bmN0aW9uIGFkZERlcGVuZGVuY2llcygpOiBSdWxlIHtcbiAgcmV0dXJuIGNoYWluKFtcbiAgICBhZGREZXBlbmRlbmN5KCdleHByZXNzJywgbGF0ZXN0VmVyc2lvbnNbJ2V4cHJlc3MnXSwge1xuICAgICAgdHlwZTogRGVwZW5kZW5jeVR5cGUuRGVmYXVsdCxcbiAgICB9KSxcbiAgICBhZGREZXBlbmRlbmN5KCdAdHlwZXMvZXhwcmVzcycsIGxhdGVzdFZlcnNpb25zWydAdHlwZXMvZXhwcmVzcyddLCB7XG4gICAgICB0eXBlOiBEZXBlbmRlbmN5VHlwZS5EZXYsXG4gICAgfSksXG4gIF0pO1xufVxuXG5mdW5jdGlvbiBhZGRTZXJ2ZXJGaWxlKG9wdGlvbnM6IFNlcnZlck9wdGlvbnMsIGlzU3RhbmRhbG9uZTogYm9vbGVhbik6IFJ1bGUge1xuICByZXR1cm4gYXN5bmMgKGhvc3QpID0+IHtcbiAgICBjb25zdCBwcm9qZWN0ID0gYXdhaXQgZ2V0UHJvamVjdChob3N0LCBvcHRpb25zLnByb2plY3QpO1xuICAgIGNvbnN0IGJyb3dzZXJEaXN0RGlyZWN0b3J5ID0gYXdhaXQgZ2V0T3V0cHV0UGF0aChob3N0LCBvcHRpb25zLnByb2plY3QsICdidWlsZCcpO1xuXG4gICAgcmV0dXJuIG1lcmdlV2l0aChcbiAgICAgIGFwcGx5KFxuICAgICAgICB1cmwoXG4gICAgICAgICAgYC4vZmlsZXMvJHtcbiAgICAgICAgICAgIHByb2plY3Q/LnRhcmdldHM/LmdldCgnYnVpbGQnKT8uYnVpbGRlciA9PT0gQnVpbGRlcnMuQXBwbGljYXRpb25cbiAgICAgICAgICAgICAgPyAnYXBwbGljYXRpb24tYnVpbGRlcidcbiAgICAgICAgICAgICAgOiAnc2VydmVyLWJ1aWxkZXInXG4gICAgICAgICAgfWAsXG4gICAgICAgICksXG4gICAgICAgIFtcbiAgICAgICAgICBhcHBseVRlbXBsYXRlcyh7XG4gICAgICAgICAgICAuLi5zdHJpbmdzLFxuICAgICAgICAgICAgLi4ub3B0aW9ucyxcbiAgICAgICAgICAgIGJyb3dzZXJEaXN0RGlyZWN0b3J5LFxuICAgICAgICAgICAgaXNTdGFuZGFsb25lLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIG1vdmUocHJvamVjdC5yb290KSxcbiAgICAgICAgXSxcbiAgICAgICksXG4gICAgKTtcbiAgfTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gKG9wdGlvbnM6IEFkZFNlcnZlck9wdGlvbnMpOiBSdWxlIHtcbiAgcmV0dXJuIGFzeW5jIChob3N0KSA9PiB7XG4gICAgY29uc3QgYnJvd3NlckVudHJ5UG9pbnQgPSBhd2FpdCBnZXRNYWluRmlsZVBhdGgoaG9zdCwgb3B0aW9ucy5wcm9qZWN0KTtcbiAgICBjb25zdCBpc1N0YW5kYWxvbmUgPSBpc1N0YW5kYWxvbmVBcHAoaG9zdCwgYnJvd3NlckVudHJ5UG9pbnQpO1xuXG4gICAgY29uc3Qgd29ya3NwYWNlID0gYXdhaXQgZ2V0V29ya3NwYWNlKGhvc3QpO1xuICAgIGNvbnN0IGNsaWVudFByb2plY3QgPSB3b3Jrc3BhY2UucHJvamVjdHMuZ2V0KG9wdGlvbnMucHJvamVjdCk7XG4gICAgaWYgKCFjbGllbnRQcm9qZWN0KSB7XG4gICAgICB0aHJvdyB0YXJnZXRCdWlsZE5vdEZvdW5kRXJyb3IoKTtcbiAgICB9XG4gICAgY29uc3QgaXNVc2luZ0FwcGxpY2F0aW9uQnVpbGRlciA9XG4gICAgICBjbGllbnRQcm9qZWN0LnRhcmdldHMuZ2V0KCdidWlsZCcpPy5idWlsZGVyID09PSBCdWlsZGVycy5BcHBsaWNhdGlvbjtcblxuICAgIHJldHVybiBjaGFpbihbXG4gICAgICBleHRlcm5hbFNjaGVtYXRpYygnQHNjaGVtYXRpY3MvYW5ndWxhcicsICdzZXJ2ZXInLCB7XG4gICAgICAgIC4uLm9wdGlvbnMsXG4gICAgICAgIHNraXBJbnN0YWxsOiB0cnVlLFxuICAgICAgfSksXG4gICAgICAuLi4oaXNVc2luZ0FwcGxpY2F0aW9uQnVpbGRlclxuICAgICAgICA/IFtcbiAgICAgICAgICAgIHVwZGF0ZUFwcGxpY2F0aW9uQnVpbGRlcldvcmtzcGFjZUNvbmZpZ1J1bGUoY2xpZW50UHJvamVjdC5yb290LCBvcHRpb25zKSxcbiAgICAgICAgICAgIHVwZGF0ZUFwcGxpY2F0aW9uQnVpbGRlclRzQ29uZmlnUnVsZShvcHRpb25zKSxcbiAgICAgICAgICBdXG4gICAgICAgIDogW1xuICAgICAgICAgICAgYWRkU2NyaXB0c1J1bGUob3B0aW9ucyksXG4gICAgICAgICAgICB1cGRhdGVXZWJwYWNrQnVpbGRlclNlcnZlclRzQ29uZmlnUnVsZShvcHRpb25zKSxcbiAgICAgICAgICAgIHVwZGF0ZVdlYnBhY2tCdWlsZGVyV29ya3NwYWNlQ29uZmlnUnVsZShvcHRpb25zKSxcbiAgICAgICAgICBdKSxcbiAgICAgIGFkZFNlcnZlckZpbGUob3B0aW9ucywgaXNTdGFuZGFsb25lKSxcbiAgICAgIGFkZERlcGVuZGVuY2llcygpLFxuICAgIF0pO1xuICB9O1xufVxuIl19
"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOutputPath = exports.getProject = void 0;
const schematics_1 = require("@angular-devkit/schematics");
const utility_1 = require("@schematics/angular/utility");
async function getProject(host, projectName) {
    const workspace = await (0, utility_1.readWorkspace)(host);
    const project = workspace.projects.get(projectName);
    if (!project || project.extensions.projectType !== 'application') {
        throw new schematics_1.SchematicsException(`Universal requires a project type of 'application'.`);
    }
    return project;
}
exports.getProject = getProject;
async function getOutputPath(host, projectName, target) {
    // Generate new output paths
    const project = await getProject(host, projectName);
    const serverTarget = project.targets.get(target);
    if (!serverTarget || !serverTarget.options) {
        throw new schematics_1.SchematicsException(`Cannot find 'options' for ${projectName} ${target} target.`);
    }
    const { outputPath } = serverTarget.options;
    if (typeof outputPath !== 'string') {
        throw new schematics_1.SchematicsException(`outputPath for ${projectName} ${target} target is not a string.`);
    }
    return outputPath;
}
exports.getOutputPath = getOutputPath;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9hbmd1bGFyL3Nzci9zY2hlbWF0aWNzL3V0aWxpdHkvdXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7O0FBR0gsMkRBQXVFO0FBQ3ZFLHlEQUE0RDtBQUVyRCxLQUFLLFVBQVUsVUFBVSxDQUM5QixJQUFVLEVBQ1YsV0FBbUI7SUFFbkIsTUFBTSxTQUFTLEdBQUcsTUFBTSxJQUFBLHVCQUFhLEVBQUMsSUFBSSxDQUFDLENBQUM7SUFDNUMsTUFBTSxPQUFPLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7SUFFcEQsSUFBSSxDQUFDLE9BQU8sSUFBSSxPQUFPLENBQUMsVUFBVSxDQUFDLFdBQVcsS0FBSyxhQUFhLEVBQUU7UUFDaEUsTUFBTSxJQUFJLGdDQUFtQixDQUFDLHFEQUFxRCxDQUFDLENBQUM7S0FDdEY7SUFFRCxPQUFPLE9BQU8sQ0FBQztBQUNqQixDQUFDO0FBWkQsZ0NBWUM7QUFFTSxLQUFLLFVBQVUsYUFBYSxDQUNqQyxJQUFVLEVBQ1YsV0FBbUIsRUFDbkIsTUFBMEI7SUFFMUIsNEJBQTRCO0lBQzVCLE1BQU0sT0FBTyxHQUFHLE1BQU0sVUFBVSxDQUFDLElBQUksRUFBRSxXQUFXLENBQUMsQ0FBQztJQUNwRCxNQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNqRCxJQUFJLENBQUMsWUFBWSxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRTtRQUMxQyxNQUFNLElBQUksZ0NBQW1CLENBQUMsNkJBQTZCLFdBQVcsSUFBSSxNQUFNLFVBQVUsQ0FBQyxDQUFDO0tBQzdGO0lBRUQsTUFBTSxFQUFFLFVBQVUsRUFBRSxHQUFHLFlBQVksQ0FBQyxPQUFPLENBQUM7SUFDNUMsSUFBSSxPQUFPLFVBQVUsS0FBSyxRQUFRLEVBQUU7UUFDbEMsTUFBTSxJQUFJLGdDQUFtQixDQUMzQixrQkFBa0IsV0FBVyxJQUFJLE1BQU0sMEJBQTBCLENBQ2xFLENBQUM7S0FDSDtJQUVELE9BQU8sVUFBVSxDQUFDO0FBQ3BCLENBQUM7QUFwQkQsc0NBb0JDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCB7IHdvcmtzcGFjZXMgfSBmcm9tICdAYW5ndWxhci1kZXZraXQvY29yZSc7XG5pbXBvcnQgeyBTY2hlbWF0aWNzRXhjZXB0aW9uLCBUcmVlIH0gZnJvbSAnQGFuZ3VsYXItZGV2a2l0L3NjaGVtYXRpY3MnO1xuaW1wb3J0IHsgcmVhZFdvcmtzcGFjZSB9IGZyb20gJ0BzY2hlbWF0aWNzL2FuZ3VsYXIvdXRpbGl0eSc7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRQcm9qZWN0KFxuICBob3N0OiBUcmVlLFxuICBwcm9qZWN0TmFtZTogc3RyaW5nLFxuKTogUHJvbWlzZTx3b3Jrc3BhY2VzLlByb2plY3REZWZpbml0aW9uPiB7XG4gIGNvbnN0IHdvcmtzcGFjZSA9IGF3YWl0IHJlYWRXb3Jrc3BhY2UoaG9zdCk7XG4gIGNvbnN0IHByb2plY3QgPSB3b3Jrc3BhY2UucHJvamVjdHMuZ2V0KHByb2plY3ROYW1lKTtcblxuICBpZiAoIXByb2plY3QgfHwgcHJvamVjdC5leHRlbnNpb25zLnByb2plY3RUeXBlICE9PSAnYXBwbGljYXRpb24nKSB7XG4gICAgdGhyb3cgbmV3IFNjaGVtYXRpY3NFeGNlcHRpb24oYFVuaXZlcnNhbCByZXF1aXJlcyBhIHByb2plY3QgdHlwZSBvZiAnYXBwbGljYXRpb24nLmApO1xuICB9XG5cbiAgcmV0dXJuIHByb2plY3Q7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRPdXRwdXRQYXRoKFxuICBob3N0OiBUcmVlLFxuICBwcm9qZWN0TmFtZTogc3RyaW5nLFxuICB0YXJnZXQ6ICdzZXJ2ZXInIHwgJ2J1aWxkJyxcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIC8vIEdlbmVyYXRlIG5ldyBvdXRwdXQgcGF0aHNcbiAgY29uc3QgcHJvamVjdCA9IGF3YWl0IGdldFByb2plY3QoaG9zdCwgcHJvamVjdE5hbWUpO1xuICBjb25zdCBzZXJ2ZXJUYXJnZXQgPSBwcm9qZWN0LnRhcmdldHMuZ2V0KHRhcmdldCk7XG4gIGlmICghc2VydmVyVGFyZ2V0IHx8ICFzZXJ2ZXJUYXJnZXQub3B0aW9ucykge1xuICAgIHRocm93IG5ldyBTY2hlbWF0aWNzRXhjZXB0aW9uKGBDYW5ub3QgZmluZCAnb3B0aW9ucycgZm9yICR7cHJvamVjdE5hbWV9ICR7dGFyZ2V0fSB0YXJnZXQuYCk7XG4gIH1cblxuICBjb25zdCB7IG91dHB1dFBhdGggfSA9IHNlcnZlclRhcmdldC5vcHRpb25zO1xuICBpZiAodHlwZW9mIG91dHB1dFBhdGggIT09ICdzdHJpbmcnKSB7XG4gICAgdGhyb3cgbmV3IFNjaGVtYXRpY3NFeGNlcHRpb24oXG4gICAgICBgb3V0cHV0UGF0aCBmb3IgJHtwcm9qZWN0TmFtZX0gJHt0YXJnZXR9IHRhcmdldCBpcyBub3QgYSBzdHJpbmcuYCxcbiAgICApO1xuICB9XG5cbiAgcmV0dXJuIG91dHB1dFBhdGg7XG59XG4iXX0=
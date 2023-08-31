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
exports.addInitialNavigation = exports.getImportOfIdentifier = exports.findImport = exports.getOutputPath = exports.stripTsExtension = exports.getProject = void 0;
const schematics_1 = require("@angular-devkit/schematics");
const utility_1 = require("@schematics/angular/utility");
const ts = __importStar(require("typescript"));
async function getProject(host, projectName) {
    const workspace = await (0, utility_1.readWorkspace)(host);
    const project = workspace.projects.get(projectName);
    if (!project || project.extensions.projectType !== 'application') {
        throw new schematics_1.SchematicsException(`Universal requires a project type of 'application'.`);
    }
    return project;
}
exports.getProject = getProject;
function stripTsExtension(file) {
    return file.replace(/\.ts$/, '');
}
exports.stripTsExtension = stripTsExtension;
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
function findImport(sourceFile, moduleName, symbolName) {
    // Only look through the top-level imports.
    for (const node of sourceFile.statements) {
        if (!ts.isImportDeclaration(node) ||
            !ts.isStringLiteral(node.moduleSpecifier) ||
            node.moduleSpecifier.text !== moduleName) {
            continue;
        }
        const namedBindings = node.importClause && node.importClause.namedBindings;
        if (!namedBindings || !ts.isNamedImports(namedBindings)) {
            continue;
        }
        if (namedBindings.elements.some((element) => element.name.text === symbolName)) {
            return namedBindings;
        }
    }
    return null;
}
exports.findImport = findImport;
/** Gets import information about the specified identifier by using the Type checker. */
function getImportOfIdentifier(typeChecker, node) {
    const symbol = typeChecker.getSymbolAtLocation(node);
    if (!symbol || !symbol.declarations?.length) {
        return null;
    }
    const decl = symbol.declarations[0];
    if (!ts.isImportSpecifier(decl)) {
        return null;
    }
    const importDecl = decl.parent.parent.parent;
    if (!ts.isStringLiteral(importDecl.moduleSpecifier)) {
        return null;
    }
    return {
        // Handles aliased imports: e.g. "import {Component as myComp} from ...";
        name: decl.propertyName ? decl.propertyName.text : decl.name.text,
        importModule: importDecl.moduleSpecifier.text,
        node: importDecl,
    };
}
exports.getImportOfIdentifier = getImportOfIdentifier;
function addInitialNavigation(node) {
    const existingOptions = node.arguments[1];
    // If the user has explicitly set initialNavigation, we respect that
    if (existingOptions &&
        existingOptions.properties.some((exp) => ts.isPropertyAssignment(exp) &&
            ts.isIdentifier(exp.name) &&
            exp.name.text === 'initialNavigation')) {
        return node;
    }
    const enabledLiteral = ts.factory.createStringLiteral('enabledBlocking');
    // TypeScript will emit the Node with double quotes.
    // In schematics we usually write code with a single quotes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    enabledLiteral.singleQuote = true;
    const initialNavigationProperty = ts.factory.createPropertyAssignment('initialNavigation', enabledLiteral);
    const routerOptions = existingOptions
        ? ts.factory.updateObjectLiteralExpression(existingOptions, ts.factory.createNodeArray([...existingOptions.properties, initialNavigationProperty]))
        : ts.factory.createObjectLiteralExpression([initialNavigationProperty], true);
    const args = [node.arguments[0], routerOptions];
    return ts.factory.createCallExpression(node.expression, node.typeArguments, args);
}
exports.addInitialNavigation = addInitialNavigation;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9hbmd1bGFyL3Nzci9zY2hlbWF0aWNzL3V0aWxpdHkvdXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFHSCwyREFBdUU7QUFDdkUseURBQTREO0FBQzVELCtDQUFpQztBQUUxQixLQUFLLFVBQVUsVUFBVSxDQUM5QixJQUFVLEVBQ1YsV0FBbUI7SUFFbkIsTUFBTSxTQUFTLEdBQUcsTUFBTSxJQUFBLHVCQUFhLEVBQUMsSUFBSSxDQUFDLENBQUM7SUFDNUMsTUFBTSxPQUFPLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7SUFFcEQsSUFBSSxDQUFDLE9BQU8sSUFBSSxPQUFPLENBQUMsVUFBVSxDQUFDLFdBQVcsS0FBSyxhQUFhLEVBQUU7UUFDaEUsTUFBTSxJQUFJLGdDQUFtQixDQUFDLHFEQUFxRCxDQUFDLENBQUM7S0FDdEY7SUFFRCxPQUFPLE9BQU8sQ0FBQztBQUNqQixDQUFDO0FBWkQsZ0NBWUM7QUFFRCxTQUFnQixnQkFBZ0IsQ0FBQyxJQUFZO0lBQzNDLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUM7QUFDbkMsQ0FBQztBQUZELDRDQUVDO0FBRU0sS0FBSyxVQUFVLGFBQWEsQ0FDakMsSUFBVSxFQUNWLFdBQW1CLEVBQ25CLE1BQTBCO0lBRTFCLDRCQUE0QjtJQUM1QixNQUFNLE9BQU8sR0FBRyxNQUFNLFVBQVUsQ0FBQyxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDcEQsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDakQsSUFBSSxDQUFDLFlBQVksSUFBSSxDQUFDLFlBQVksQ0FB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QUFDLEdBQUcsQ0FBQztZQUM1QixFQUFFLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUM7WUFDekIsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssbUJBQW1CLENBQ3hDLEVBQ0Q7UUFDQSxPQUFPLElBQUksQ0FBQztLQUNiO0lBRUQsTUFBTSxjQUFjLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBQ3pFLG9EQUFvRDtJQUNwRCwyREFBMkQ7SUFDM0QsOERBQThEO0lBQzdELGNBQXNCLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQztJQUUzQyxNQUFNLHlCQUF5QixHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsd0JBQXdCLENBQ25FLG1CQUFtQixFQUNuQixjQUFjLENBQ2YsQ0FBQztJQUNGLE1BQU0sYUFBYSxHQUFHLGVBQWU7UUFDbkMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsNkJBQTZCLENBQ3RDLGVBQWUsRUFDZixFQUFFLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDLEdBQUcsZUFBZSxDQUFDLFVBQVUsRUFBRSx5QkFBeUIsQ0FBQyxDQUFDLENBQ3ZGO1FBQ0gsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsNkJBQTZCLENBQUMsQ0FBQyx5QkFBeUIsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2hGLE1BQU0sSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQztJQUVoRCxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ3BGLENBQUM7QUFuQ0Qsb0RBbUNDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCB7IHdvcmtzcGFjZXMgfSBmcm9tICdAYW5ndWxhci1kZXZraXQvY29yZSc7XG5pbXBvcnQgeyBTY2hlbWF0aWNzRXhjZXB0aW9uLCBUcmVlIH0gZnJvbSAnQGFuZ3VsYXItZGV2a2l0L3NjaGVtYXRpY3MnO1xuaW1wb3J0IHsgcmVhZFdvcmtzcGFjZSB9IGZyb20gJ0BzY2hlbWF0aWNzL2FuZ3VsYXIvdXRpbGl0eSc7XG5pbXBvcnQgKiBhcyB0cyBmcm9tICd0eXBlc2NyaXB0JztcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFByb2plY3QoXG4gIGhvc3Q6IFRyZWUsXG4gIHByb2plY3ROYW1lOiBzdHJpbmcsXG4pOiBQcm9taXNlPHdvcmtzcGFjZXMuUHJvamVjdERlZmluaXRpb24+IHtcbiAgY29uc3Qgd29ya3NwYWNlID0gYXdhaXQgcmVhZFdvcmtzcGFjZShob3N0KTtcbiAgY29uc3QgcHJvamVjdCA9IHdvcmtzcGFjZS5wcm9qZWN0cy5nZXQocHJvamVjdE5hbWUpO1xuXG4gIGlmICghcHJvamVjdCB8fCBwcm9qZWN0LmV4dGVuc2lvbnMucHJvamVjdFR5cGUgIT09ICdhcHBsaWNhdGlvbicpIHtcbiAgICB0aHJvdyBuZXcgU2NoZW1hdGljc0V4Y2VwdGlvbihgVW5pdmVyc2FsIHJlcXVpcmVzIGEgcHJvamVjdCB0eXBlIG9mICdhcHBsaWNhdGlvbicuYCk7XG4gIH1cblxuICByZXR1cm4gcHJvamVjdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cmlwVHNFeHRlbnNpb24oZmlsZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIGZpbGUucmVwbGFjZSgvXFwudHMkLywgJycpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0T3V0cHV0UGF0aChcbiAgaG9zdDogVHJlZSxcbiAgcHJvamVjdE5hbWU6IHN0cmluZyxcbiAgdGFyZ2V0OiAnc2VydmVyJyB8ICdidWlsZCcsXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICAvLyBHZW5lcmF0ZSBuZXcgb3V0cHV0IHBhdGhzXG4gIGNvbnN0IHByb2plY3QgPSBhd2FpdCBnZXRQcm9qZWN0KGhvc3QsIHByb2plY3ROYW1lKTtcbiAgY29uc3Qgc2VydmVyVGFyZ2V0ID0gcHJvamVjdC50YXJnZXRzLmdldCh0YXJnZXQpO1xuICBpZiAoIXNlcnZlclRhcmdldCB8fCAhc2VydmVyVGFyZ2V0Lm9wdGlvbnMpIHtcbiAgICB0aHJvdyBuZXcgU2NoZW1hdGljc0V4Y2VwdGlvbihgQ2Fubm90IGZpbmQgJ29wdGlvbnMnIGZvciAke3Byb2plY3ROYW1lfSAke3RhcmdldH0gdGFyZ2V0LmApO1xuICB9XG5cbiAgY29uc3QgeyBvdXRwdXRQYXRoIH0gPSBzZXJ2ZXJUYXJnZXQub3B0aW9ucztcbiAgaWYgKHR5cGVvZiBvdXRwdXRQYXRoICE9PSAnc3RyaW5nJykge1xuICAgIHRocm93IG5ldyBTY2hlbWF0aWNzRXhjZXB0aW9uKFxuICAgICAgYG91dHB1dFBhdGggZm9yICR7cHJvamVjdE5hbWV9ICR7dGFyZ2V0fSB0YXJnZXQgaXMgbm90IGEgc3RyaW5nLmAsXG4gICAgKTtcbiAgfVxuXG4gIHJldHVybiBvdXRwdXRQYXRoO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmluZEltcG9ydChcbiAgc291cmNlRmlsZTogdHMuU291cmNlRmlsZSxcbiAgbW9kdWxlTmFtZTogc3RyaW5nLFxuICBzeW1ib2xOYW1lOiBzdHJpbmcsXG4pOiB0cy5OYW1lZEltcG9ydHMgfCBudWxsIHtcbiAgLy8gT25seSBsb29rIHRocm91Z2ggdGhlIHRvcC1sZXZlbCBpbXBvcnRzLlxuICBmb3IgKGNvbnN0IG5vZGUgb2Ygc291cmNlRmlsZS5zdGF0ZW1lbnRzKSB7XG4gICAgaWYgKFxuICAgICAgIXRzLmlzSW1wb3J0RGVjbGFyYXRpb24obm9kZSkgfHxcbiAgICAgICF0cy5pc1N0cmluZ0xpdGVyYWwobm9kZS5tb2R1bGVTcGVjaWZpZXIpIHx8XG4gICAgICBub2RlLm1vZHVsZVNwZWNpZmllci50ZXh0ICE9PSBtb2R1bGVOYW1lXG4gICAgKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zdCBuYW1lZEJpbmRpbmdzID0gbm9kZS5pbXBvcnRDbGF1c2UgJiYgbm9kZS5pbXBvcnRDbGF1c2UubmFtZWRCaW5kaW5ncztcblxuICAgIGlmICghbmFtZWRCaW5kaW5ncyB8fCAhdHMuaXNOYW1lZEltcG9ydHMobmFtZWRCaW5kaW5ncykpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChuYW1lZEJpbmRpbmdzLmVsZW1lbnRzLnNvbWUoKGVsZW1lbnQpID0+IGVsZW1lbnQubmFtZS50ZXh0ID09PSBzeW1ib2xOYW1lKSkge1xuICAgICAgcmV0dXJuIG5hbWVkQmluZGluZ3M7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCB0eXBlIEltcG9ydCA9IHtcbiAgbmFtZTogc3RyaW5nO1xuICBpbXBvcnRNb2R1bGU6IHN0cmluZztcbiAgbm9kZTogdHMuSW1wb3J0RGVjbGFyYXRpb247XG59O1xuXG4vKiogR2V0cyBpbXBvcnQgaW5mb3JtYXRpb24gYWJvdXQgdGhlIHNwZWNpZmllZCBpZGVudGlmaWVyIGJ5IHVzaW5nIHRoZSBUeXBlIGNoZWNrZXIuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0SW1wb3J0T2ZJZGVudGlmaWVyKFxuICB0eXBlQ2hlY2tlcjogdHMuVHlwZUNoZWNrZXIsXG4gIG5vZGU6IHRzLklkZW50aWZpZXIsXG4pOiBJbXBvcnQgfCBudWxsIHtcbiAgY29uc3Qgc3ltYm9sID0gdHlwZUNoZWNrZXIuZ2V0U3ltYm9sQXRMb2NhdGlvbihub2RlKTtcblxuICBpZiAoIXN5bWJvbCB8fCAhc3ltYm9sLmRlY2xhcmF0aW9ucz8ubGVuZ3RoKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdCBkZWNsID0gc3ltYm9sLmRlY2xhcmF0aW9uc1swXTtcblxuICBpZiAoIXRzLmlzSW1wb3J0U3BlY2lmaWVyKGRlY2wpKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdCBpbXBvcnREZWNsID0gZGVjbC5wYXJlbnQucGFyZW50LnBhcmVudDtcblxuICBpZiAoIXRzLmlzU3RyaW5nTGl0ZXJhbChpbXBvcnREZWNsLm1vZHVsZVNwZWNpZmllcikpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgLy8gSGFuZGxlcyBhbGlhc2VkIGltcG9ydHM6IGUuZy4gXCJpbXBvcnQge0NvbXBvbmVudCBhcyBteUNvbXB9IGZyb20gLi4uXCI7XG4gICAgbmFtZTogZGVjbC5wcm9wZXJ0eU5hbWUgPyBkZWNsLnByb3BlcnR5TmFtZS50ZXh0IDogZGVjbC5uYW1lLnRleHQsXG4gICAgaW1wb3J0TW9kdWxlOiBpbXBvcnREZWNsLm1vZHVsZVNwZWNpZmllci50ZXh0LFxuICAgIG5vZGU6IGltcG9ydERlY2wsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRJbml0aWFsTmF2aWdhdGlvbihub2RlOiB0cy5DYWxsRXhwcmVzc2lvbik6IHRzLkNhbGxFeHByZXNzaW9uIHtcbiAgY29uc3QgZXhpc3RpbmdPcHRpb25zID0gbm9kZS5hcmd1bWVudHNbMV0gYXMgdHMuT2JqZWN0TGl0ZXJhbEV4cHJlc3Npb24gfCB1bmRlZmluZWQ7XG5cbiAgLy8gSWYgdGhlIHVzZXIgaGFzIGV4cGxpY2l0bHkgc2V0IGluaXRpYWxOYXZpZ2F0aW9uLCB3ZSByZXNwZWN0IHRoYXRcbiAgaWYgKFxuICAgIGV4aXN0aW5nT3B0aW9ucyAmJlxuICAgIGV4aXN0aW5nT3B0aW9ucy5wcm9wZXJ0aWVzLnNvbWUoXG4gICAgICAoZXhwKSA9PlxuICAgICAgICB0cy5pc1Byb3BlcnR5QXNzaWdubWVudChleHApICYmXG4gICAgICAgIHRzLmlzSWRlbnRpZmllcihleHAubmFtZSkgJiZcbiAgICAgICAgZXhwLm5hbWUudGV4dCA9PT0gJ2luaXRpYWxOYXZpZ2F0aW9uJyxcbiAgICApXG4gICkge1xuICAgIHJldHVybiBub2RlO1xuICB9XG5cbiAgY29uc3QgZW5hYmxlZExpdGVyYWwgPSB0cy5mYWN0b3J5LmNyZWF0ZVN0cmluZ0xpdGVyYWwoJ2VuYWJsZWRCbG9ja2luZycpO1xuICAvLyBUeXBlU2NyaXB0IHdpbGwgZW1pdCB0aGUgTm9kZSB3aXRoIGRvdWJsZSBxdW90ZXMuXG4gIC8vIEluIHNjaGVtYXRpY3Mgd2UgdXN1YWxseSB3cml0ZSBjb2RlIHdpdGggYSBzaW5nbGUgcXVvdGVzXG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gIChlbmFibGVkTGl0ZXJhbCBhcyBhbnkpLnNpbmdsZVF1b3RlID0gdHJ1ZTtcblxuICBjb25zdCBpbml0aWFsTmF2aWdhdGlvblByb3BlcnR5ID0gdHMuZmFjdG9yeS5jcmVhdGVQcm9wZXJ0eUFzc2lnbm1lbnQoXG4gICAgJ2luaXRpYWxOYXZpZ2F0aW9uJyxcbiAgICBlbmFibGVkTGl0ZXJhbCxcbiAgKTtcbiAgY29uc3Qgcm91dGVyT3B0aW9ucyA9IGV4aXN0aW5nT3B0aW9uc1xuICAgID8gdHMuZmFjdG9yeS51cGRhdGVPYmplY3RMaXRlcmFsRXhwcmVzc2lvbihcbiAgICAgICAgZXhpc3RpbmdPcHRpb25zLFxuICAgICAgICB0cy5mYWN0b3J5LmNyZWF0ZU5vZGVBcnJheShbLi4uZXhpc3RpbmdPcHRpb25zLnByb3BlcnRpZXMsIGluaXRpYWxOYXZpZ2F0aW9uUHJvcGVydHldKSxcbiAgICAgIClcbiAgICA6IHRzLmZhY3RvcnkuY3JlYXRlT2JqZWN0TGl0ZXJhbEV4cHJlc3Npb24oW2luaXRpYWxOYXZpZ2F0aW9uUHJvcGVydHldLCB0cnVlKTtcbiAgY29uc3QgYXJncyA9IFtub2RlLmFyZ3VtZW50c1swXSwgcm91dGVyT3B0aW9uc107XG5cbiAgcmV0dXJuIHRzLmZhY3RvcnkuY3JlYXRlQ2FsbEV4cHJlc3Npb24obm9kZS5leHByZXNzaW9uLCBub2RlLnR5cGVBcmd1bWVudHMsIGFyZ3MpO1xufVxuIl19
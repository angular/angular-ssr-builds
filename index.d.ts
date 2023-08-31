import { ApplicationRef } from '@angular/core';
import { StaticProvider } from '@angular/core';
import { Type } from '@angular/core';

/**
 * A common rendering engine utility. This abstracts the logic
 * for handling the platformServer compiler, the module cache, and
 * the document loader
 */
export declare class CommonEngine {
    private bootstrap?;
    private providers;
    private readonly templateCache;
    private readonly inlineCriticalCssProcessor;
    private readonly pageIsSSG;
    constructor(bootstrap?: Type<{}> | (() => Promise<ApplicationRef>) | undefined, providers?: StaticProvider[]);
    /**
     * Render an HTML document for a specific URL with specified
     * render options
     */
    render(opts: CommonEngineRenderOptions): Promise<string>;
    /** Retrieve the document from the cache or the filesystem */
    private getDocument;
}

export declare interface CommonEngineRenderOptions {
    bootstrap?: Type<{}> | (() => Promise<ApplicationRef>);
    providers?: StaticProvider[];
    url?: string;
    document?: string;
    documentFilePath?: string;
    /**
     * Reduce render blocking requests by inlining critical CSS.
     * Defaults to true.
     */
    inlineCriticalCss?: boolean;
    /**
     * Base path location of index file.
     * Defaults to the 'documentFilePath' dirname when not provided.
     */
    publicPath?: string;
}

export { }

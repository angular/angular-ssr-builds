import { ɵSERVER_CONTEXT, INITIAL_CONFIG, renderApplication, renderModule } from '@angular/platform-server';
import * as fs from 'node:fs';
import { resolve, dirname } from 'node:path';
import { URL } from 'node:url';
import Critters from 'critters';
import { readFile } from 'node:fs/promises';

/**
 * Pattern used to extract the media query set by Critters in an `onload` handler.
 */
const MEDIA_SET_HANDLER_PATTERN = /^this\.media=["'](.*)["'];?$/;
/**
 * Name of the attribute used to save the Critters media query so it can be re-assigned on load.
 */
const CSP_MEDIA_ATTR = 'ngCspMedia';
/**
 * Script text used to change the media value of the link tags.
 */
const LINK_LOAD_SCRIPT_CONTENT = [
    `(() => {`,
    // Save the `children` in a variable since they're a live DOM node collection.
    // We iterate over the direct descendants, instead of going through a `querySelectorAll`,
    // because we know that the tags will be directly inside the `head`.
    `  const children = document.head.children;`,
    // Declare `onLoad` outside the loop to avoid leaking memory.
    // Can't be an arrow function, because we need `this` to refer to the DOM node.
    `  function onLoad() {this.media = this.getAttribute('${CSP_MEDIA_ATTR}');}`,
    // Has to use a plain for loop, because some browsers don't support
    // `forEach` on `children` which is a `HTMLCollection`.
    `  for (let i = 0; i < children.length; i++) {`,
    `    const child = children[i];`,
    `    child.hasAttribute('${CSP_MEDIA_ATTR}') && child.addEventListener('load', onLoad);`,
    `  }`,
    `})();`,
].join('\n');
class CrittersExtended extends Critters {
    optionsExtended;
    resourceCache;
    warnings = [];
    errors = [];
    initialEmbedLinkedStylesheet;
    addedCspScriptsDocuments = new WeakSet();
    documentNonces = new WeakMap();
    constructor(optionsExtended, resourceCache) {
        super({
            logger: {
                warn: (s) => this.warnings.push(s),
                error: (s) => this.errors.push(s),
                info: () => { },
            },
            logLevel: 'warn',
            path: optionsExtended.outputPath,
            publicPath: optionsExtended.deployUrl,
            compress: !!optionsExtended.minify,
            pruneSource: false,
            reduceInlineStyles: false,
            mergeStylesheets: false,
            // Note: if `preload` changes to anything other than `media`, the logic in
            // `embedLinkedStylesheetOverride` will have to be updated.
            preload: 'media',
            noscriptFallback: true,
            inlineFonts: true,
        });
        this.optionsExtended = optionsExtended;
        this.resourceCache = resourceCache;
        // We can't use inheritance to override `embedLinkedStylesheet`, because it's not declared in
        // the `Critters` .d.ts which means that we can't call the `super` implementation. TS doesn't
        // allow for `super` to be cast to a different type.
        this.initialEmbedLinkedStylesheet = this.embedLinkedStylesheet;
        this.embedLinkedStylesheet = this.embedLinkedStylesheetOverride;
    }
    async readFile(path) {
        let resourceContent = this.resourceCache.get(path);
        if (resourceContent === undefined) {
            resourceContent = await readFile(path, 'utf-8');
            this.resourceCache.set(path, resourceContent);
        }
        return resourceContent;
    }
    /**
     * Override of the Critters `embedLinkedStylesheet` method
     * that makes it work with Angular's CSP APIs.
     */
    embedLinkedStylesheetOverride = async (link, document) => {
        if (link.getAttribute('media') === 'print' && link.next?.name === 'noscript') {
            // Workaround for https://github.com/GoogleChromeLabs/critters/issues/64
            // NB: this is only needed for the webpack based builders.
            const media = link.getAttribute('onload')?.match(MEDIA_SET_HANDLER_PATTERN);
            if (media) {
                link.removeAttribute('onload');
                link.setAttribute('media', media[1]);
                link?.next?.remove();
            }
        }
        const returnValue = await this.initialEmbedLinkedStylesheet(link, document);
        const cspNonce = this.findCspNonce(document);
        if (cspNonce) {
            const crittersMedia = link.getAttribute('onload')?.match(MEDIA_SET_HANDLER_PATTERN);
            if (crittersMedia) {
                // If there's a Critters-generated `onload` handler and the file has an Angular CSP nonce,
                // we have to remove the handler, because it's incompatible with CSP. We save the value
                // in a different attribute and we generate a script tag with the nonce that uses
                // `addEventListener` to apply the media query instead.
                link.removeAttribute('onload');
                link.setAttribute(CSP_MEDIA_ATTR, crittersMedia[1]);
                this.conditionallyInsertCspLoadingScript(document, cspNonce);
            }
            // Ideally we would hook in at the time Critters inserts the `style` tags, but there isn't
            // a way of doing that at the moment so we fall back to doing it any time a `link` tag is
            // inserted. We mitigate it by only iterating the direct children of the `<head>` which
            // should be pretty shallow.
            document.head.children.forEach((child) => {
                if (child.tagName === 'style' && !child.hasAttribute('nonce')) {
                    child.setAttribute('nonce', cspNonce);
                }
            });
        }
        return returnValue;
    };
    /**
     * Finds the CSP nonce for a specific document.
     */
    findCspNonce(document) {
        if (this.documentNonces.has(document)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return this.documentNonces.get(document);
        }
        // HTML attribute are case-insensitive, but the parser used by Critters is case-sensitive.
        const nonceElement = document.querySelector('[ngCspNonce], [ngcspnonce]');
        const cspNonce = nonceElement?.getAttribute('ngCspNonce') || nonceElement?.getAttribute('ngcspnonce') || null;
        this.documentNonces.set(document, cspNonce);
        return cspNonce;
    }
    /**
     * Inserts the `script` tag that swaps the critical CSS at runtime,
     * if one hasn't been inserted into the document already.
     */
    conditionallyInsertCspLoadingScript(document, nonce) {
        if (this.addedCspScriptsDocuments.has(document)) {
            return;
        }
        if (document.head.textContent.includes(LINK_LOAD_SCRIPT_CONTENT)) {
            // Script was already added during the build.
            this.addedCspScriptsDocuments.add(document);
            return;
        }
        const script = document.createElement('script');
        script.setAttribute('nonce', nonce);
        script.textContent = LINK_LOAD_SCRIPT_CONTENT;
        // Append the script to the head since it needs to
        // run as early as possible, after the `link` tags.
        document.head.appendChild(script);
        this.addedCspScriptsDocuments.add(document);
    }
}
class InlineCriticalCssProcessor {
    options;
    resourceCache = new Map();
    constructor(options) {
        this.options = options;
    }
    async process(html, options) {
        const critters = new CrittersExtended({ ...this.options, ...options }, this.resourceCache);
        const content = await critters.process(html);
        return {
            content,
            errors: critters.errors.length ? critters.errors : undefined,
            warnings: critters.warnings.length ? critters.warnings : undefined,
        };
    }
}

const SSG_MARKER_REGEXP = /ng-server-context=["']\w*\|?ssg\|?\w*["']/;
/**
 * A common rendering engine utility. This abstracts the logic
 * for handling the platformServer compiler, the module cache, and
 * the document loader
 */
class CommonEngine {
    bootstrap;
    providers;
    templateCache = new Map();
    inlineCriticalCssProcessor;
    pageIsSSG = new Map();
    constructor(bootstrap, providers = []) {
        this.bootstrap = bootstrap;
        this.providers = providers;
        this.inlineCriticalCssProcessor = new InlineCriticalCssProcessor({
            minify: false,
        });
    }
    /**
     * Render an HTML document for a specific URL with specified
     * render options
     */
    async render(opts) {
        const { inlineCriticalCss = true, url } = opts;
        if (opts.publicPath && opts.documentFilePath && url !== undefined) {
            const pathname = canParseUrl(url) ? new URL(url).pathname : url;
            // Remove leading forward slash.
            const pagePath = resolve(opts.publicPath, pathname.substring(1), 'index.html');
            if (pagePath !== resolve(opts.documentFilePath)) {
                // View path doesn't match with prerender path.
                const pageIsSSG = this.pageIsSSG.get(pagePath);
                if (pageIsSSG === undefined) {
                    if (await exists(pagePath)) {
                        const content = await fs.promises.readFile(pagePath, 'utf-8');
                        const isSSG = SSG_MARKER_REGEXP.test(content);
                        this.pageIsSSG.set(pagePath, isSSG);
                        if (isSSG) {
                            return content;
                        }
                    }
                    else {
                        this.pageIsSSG.set(pagePath, false);
                    }
                }
                else if (pageIsSSG) {
                    // Serve pre-rendered page.
                    return fs.promises.readFile(pagePath, 'utf-8');
                }
            }
        }
        // if opts.document dosen't exist then opts.documentFilePath must
        const extraProviders = [
            { provide: ɵSERVER_CONTEXT, useValue: 'ssr' },
            ...(opts.providers ?? []),
            ...this.providers,
        ];
        let document = opts.document;
        if (!document && opts.documentFilePath) {
            document = await this.getDocument(opts.documentFilePath);
        }
        if (document) {
            extraProviders.push({
                provide: INITIAL_CONFIG,
                useValue: {
                    document,
                    url: opts.url,
                },
            });
        }
        const moduleOrFactory = this.bootstrap || opts.bootstrap;
        if (!moduleOrFactory) {
            throw new Error('A module or bootstrap option must be provided.');
        }
        const html = await (isBootstrapFn(moduleOrFactory)
            ? renderApplication(moduleOrFactory, { platformProviders: extraProviders })
            : renderModule(moduleOrFactory, { extraProviders }));
        if (!inlineCriticalCss) {
            return html;
        }
        const { content, errors, warnings } = await this.inlineCriticalCssProcessor.process(html, {
            outputPath: opts.publicPath ?? (opts.documentFilePath ? dirname(opts.documentFilePath) : ''),
        });
        // eslint-disable-next-line no-console
        warnings?.forEach((m) => console.warn(m));
        // eslint-disable-next-line no-console
        errors?.forEach((m) => console.error(m));
        return content;
    }
    /** Retrieve the document from the cache or the filesystem */
    async getDocument(filePath) {
        let doc = this.templateCache.get(filePath);
        if (!doc) {
            doc = await fs.promises.readFile(filePath, 'utf-8');
            this.templateCache.set(filePath, doc);
        }
        return doc;
    }
}
async function exists(path) {
    try {
        await fs.promises.access(path, fs.constants.F_OK);
        return true;
    }
    catch {
        return false;
    }
}
function isBootstrapFn(value) {
    // We can differentiate between a module and a bootstrap function by reading `cmp`:
    return typeof value === 'function' && !('ɵmod' in value);
}
// The below can be removed in favor of URL.canParse() when Node.js 18 is dropped
function canParseUrl(url) {
    try {
        return !!new URL(url);
    }
    catch {
        return false;
    }
}

export { CommonEngine };
//# sourceMappingURL=ssr.mjs.map

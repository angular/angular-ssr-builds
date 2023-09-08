/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
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
export class InlineCriticalCssProcessor {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lLWNzcy1wcm9jZXNzb3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9hbmd1bGFyL3Nzci9zcmMvaW5saW5lLWNzcy1wcm9jZXNzb3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztHQU1HO0FBRUgsT0FBTyxRQUFRLE1BQU0sVUFBVSxDQUFDO0FBQ2hDLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUU1Qzs7R0FFRztBQUNILE1BQU0seUJBQXlCLEdBQUcsOEJBQThCLENBQUM7QUFFakU7O0dBRUc7QUFDSCxNQUFNLGNBQWMsR0FBRyxZQUFZLENBQUM7QUFFcEM7O0dBRUc7QUFDSCxNQUFNLHdCQUF3QixHQUFHO0lBQy9CLFVBQVU7SUFDViw4RUFBOEU7SUFDOUUseUZBQXlGO0lBQ3pGLG9FQUFvRTtJQUNwRSw0Q0FBNEM7SUFDNUMsNkRBQTZEO0lBQzdELCtFQUErRTtJQUMvRSx3REFBd0QsY0FBYyxNQUFNO0lBQzVFLG1FQUFtRTtJQUNuRSx1REFBdUQ7SUFDdkQsK0NBQStDO0lBQy9DLGdDQUFnQztJQUNoQywyQkFBMkIsY0FBYywrQ0FBK0M7SUFDeEYsS0FBSztJQUNMLE9BQU87Q0FDUixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQThDYixNQUFNLGdCQUFpQixTQUFRLFFBQVE7SUFXMUI7SUFDUTtJQVhWLFFBQVEsR0FBYSxFQUFFLENBQUM7SUFDeEIsTUFBTSxHQUFhLEVBQUUsQ0FBQztJQUN2Qiw0QkFBNEIsQ0FBMEI7SUFDdEQsd0JBQXdCLEdBQUcsSUFBSSxPQUFPLEVBQW1CLENBQUM7SUFDMUQsY0FBYyxHQUFHLElBQUksT0FBTyxFQUFrQyxDQUFDO0lBS3ZFLFlBQ1csZUFBb0YsRUFDNUUsYUFBa0M7UUFFbkQsS0FBSyxDQUFDO1lBQ0osTUFBTSxFQUFFO2dCQUNOLElBQUksRUFBRSxDQUFDLENBQVMsRUFBRSxF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LFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFNBQVM7WUFDNUQsUUFBUSxFQUFFLFFBQVEsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxTQUFTO1NBQ25FLENBQUM7SUFDSixDQUFDO0NBQ0YiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0IENyaXR0ZXJzIGZyb20gJ2NyaXR0ZXJzJztcbmltcG9ydCB7IHJlYWRGaWxlIH0gZnJvbSAnbm9kZTpmcy9wcm9taXNlcyc7XG5cbi8qKlxuICogUGF0dGVybiB1c2VkIHRvIGV4dHJhY3QgdGhlIG1lZGlhIHF1ZXJ5IHNldCBieSBDcml0dGVycyBpbiBhbiBgb25sb2FkYCBoYW5kbGVyLlxuICovXG5jb25zdCBNRURJQV9TRVRfSEFORExFUl9QQVRURVJOID0gL150aGlzXFwubWVkaWE9W1wiJ10oLiopW1wiJ107PyQvO1xuXG4vKipcbiAqIE5hbWUgb2YgdGhlIGF0dHJpYnV0ZSB1c2VkIHRvIHNhdmUgdGhlIENyaXR0ZXJzIG1lZGlhIHF1ZXJ5IHNvIGl0IGNhbiBiZSByZS1hc3NpZ25lZCBvbiBsb2FkLlxuICovXG5jb25zdCBDU1BfTUVESUFfQVRUUiA9ICduZ0NzcE1lZGlhJztcblxuLyoqXG4gKiBTY3JpcHQgdGV4dCB1c2VkIHRvIGNoYW5nZSB0aGUgbWVkaWEgdmFsdWUgb2YgdGhlIGxpbmsgdGFncy5cbiAqL1xuY29uc3QgTElOS19MT0FEX1NDUklQVF9DT05URU5UID0gW1xuICBgKCgpID0+IHtgLFxuICAvLyBTYXZlIHRoZSBgY2hpbGRyZW5gIGluIGEgdmFyaWFibGUgc2luY2UgdGhleSdyZSBhIGxpdmUgRE9NIG5vZGUgY29sbGVjdGlvbi5cbiAgLy8gV2UgaXRlcmF0ZSBvdmVyIHRoZSBkaXJlY3QgZGVzY2VuZGFudHMsIGluc3RlYWQgb2YgZ29pbmcgdGhyb3VnaCBhIGBxdWVyeVNlbGVjdG9yQWxsYCxcbiAgLy8gYmVjYXVzZSB3ZSBrbm93IHRoYXQgdGhlIHRhZ3Mgd2lsbCBiZSBkaXJlY3RseSBpbnNpZGUgdGhlIGBoZWFkYC5cbiAgYCAgY29uc3QgY2hpbGRyZW4gPSBkb2N1bWVudC5oZWFkLmNoaWxkcmVuO2AsXG4gIC8vIERlY2xhcmUgYG9uTG9hZGAgb3V0c2lkZSB0aGUgbG9vcCB0byBhdm9pZCBsZWFraW5nIG1lbW9yeS5cbiAgLy8gQ2FuJ3QgYmUgYW4gYXJyb3cgZnVuY3Rpb24sIGJlY2F1c2Ugd2UgbmVlZCBgdGhpc2AgdG8gcmVmZXIgdG8gdGhlIERPTSBub2RlLlxuICBgICBmdW5jdGlvbiBvbkxvYWQoKSB7dGhpcy5tZWRpYSA9IHRoaXMuZ2V0QXR0cmlidXRlKCcke0NTUF9NRURJQV9BVFRSfScpO31gLFxuICAvLyBIYXMgdG8gdXNlIGEgcGxhaW4gZm9yIGxvb3AsIGJlY2F1c2Ugc29tZSBicm93c2VycyBkb24ndCBzdXBwb3J0XG4gIC8vIGBmb3JFYWNoYCBvbiBgY2hpbGRyZW5gIHdoaWNoIGlzIGEgYEhUTUxDb2xsZWN0aW9uYC5cbiAgYCAgZm9yIChsZXQgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7IGkrKykge2AsXG4gIGAgICAgY29uc3QgY2hpbGQgPSBjaGlsZHJlbltpXTtgLFxuICBgICAgIGNoaWxkLmhhc0F0dHJpYnV0ZSgnJHtDU1BfTUVESUFfQVRUUn0nKSAmJiBjaGlsZC5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgb25Mb2FkKTtgLFxuICBgICB9YCxcbiAgYH0pKCk7YCxcbl0uam9pbignXFxuJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW5saW5lQ3JpdGljYWxDc3NQcm9jZXNzT3B0aW9ucyB7XG4gIG91dHB1dFBhdGg/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW5saW5lQ3JpdGljYWxDc3NQcm9jZXNzb3JPcHRpb25zIHtcbiAgbWluaWZ5PzogYm9vbGVhbjtcbiAgZGVwbG95VXJsPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElubGluZUNyaXRpY2FsQ3NzUmVzdWx0IHtcbiAgY29udGVudDogc3RyaW5nO1xuICB3YXJuaW5ncz86IHN0cmluZ1tdO1xuICBlcnJvcnM/OiBzdHJpbmdbXTtcbn1cblxuLyoqIFBhcnRpYWwgcmVwcmVzZW50YXRpb24gb2YgYW4gYEhUTUxFbGVtZW50YC4gKi9cbmludGVyZmFjZSBQYXJ0aWFsSFRNTEVsZW1lbnQge1xuICBnZXRBdHRyaWJ1dGUobmFtZTogc3RyaW5nKTogc3RyaW5nIHwgbnVsbDtcbiAgc2V0QXR0cmlidXRlKG5hbWU6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IHZvaWQ7XG4gIGhhc0F0dHJpYnV0ZShuYW1lOiBzdHJpbmcpOiBib29sZWFuO1xuICByZW1vdmVBdHRyaWJ1dGUobmFtZTogc3RyaW5nKTogdm9pZDtcbiAgYXBwZW5kQ2hpbGQoY2hpbGQ6IFBhcnRpYWxIVE1MRWxlbWVudCk6IHZvaWQ7XG4gIHJlbW92ZSgpOiB2b2lkO1xuICBuYW1lOiBzdHJpbmc7XG4gIHRleHRDb250ZW50OiBzdHJpbmc7XG4gIHRhZ05hbWU6IHN0cmluZyB8IG51bGw7XG4gIGNoaWxkcmVuOiBQYXJ0aWFsSFRNTEVsZW1lbnRbXTtcbiAgbmV4dDogUGFydGlhbEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgcHJldjogUGFydGlhbEhUTUxFbGVtZW50IHwgbnVsbDtcbn1cblxuLyoqIFBhcnRpYWwgcmVwcmVzZW50YXRpb24gb2YgYW4gSFRNTCBgRG9jdW1lbnRgLiAqL1xuaW50ZXJmYWNlIFBhcnRpYWxEb2N1bWVudCB7XG4gIGhlYWQ6IFBhcnRpYWxIVE1MRWxlbWVudDtcbiAgY3JlYXRlRWxlbWVudCh0YWdOYW1lOiBzdHJpbmcpOiBQYXJ0aWFsSFRNTEVsZW1lbnQ7XG4gIHF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3I6IHN0cmluZyk6IFBhcnRpYWxIVE1MRWxlbWVudCB8IG51bGw7XG59XG5cbi8qKiBTaWduYXR1cmUgb2YgdGhlIGBDcml0dGVycy5lbWJlZExpbmtlZFN0eWxlc2hlZXRgIG1ldGhvZC4gKi9cbnR5cGUgRW1iZWRMaW5rZWRTdHlsZXNoZWV0Rm4gPSAoXG4gIGxpbms6IFBhcnRpYWxIVE1MRWxlbWVudCxcbiAgZG9jdW1lbnQ6IFBhcnRpYWxEb2N1bWVudCxcbikgPT4gUHJvbWlzZTx1bmtub3duPjtcblxuY2xhc3MgQ3JpdHRlcnNFeHRlbmRlZCBleHRlbmRzIENyaXR0ZXJzIHtcbiAgcmVhZG9ubHkgd2FybmluZ3M6IHN0cmluZ1tdID0gW107XG4gIHJlYWRvbmx5IGVycm9yczogc3RyaW5nW10gPSBbXTtcbiAgcHJpdmF0ZSBpbml0aWFsRW1iZWRMaW5rZWRTdHlsZXNoZWV0OiBFbWJlZExpbmtlZFN0eWxlc2hlZXRGbjtcbiAgcHJpdmF0ZSBhZGRlZENzcFNjcmlwdHNEb2N1bWVudHMgPSBuZXcgV2Vha1NldDxQYXJ0aWFsRG9jdW1lbnQ+KCk7XG4gIHByaXZhdGUgZG9jdW1lbnROb25jZXMgPSBuZXcgV2Vha01hcDxQYXJ0aWFsRG9jdW1lbnQsIHN0cmluZyB8IG51bGw+KCk7XG5cbiAgLy8gSW5oZXJpdGVkIGZyb20gYENyaXR0ZXJzYCwgYnV0IG5vdCBleHBvc2VkIGluIHRoZSB0eXBpbmdzLlxuICBwcm90ZWN0ZWQgZGVjbGFyZSBlbWJlZExpbmtlZFN0eWxlc2hlZXQ6IEVtYmVkTGlua2VkU3R5bGVzaGVldEZuO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHJlYWRvbmx5IG9wdGlvbnNFeHRlbmRlZDogSW5saW5lQ3JpdGljYWxDc3NQcm9jZXNzb3JPcHRpb25zICYgSW5saW5lQ3JpdGljYWxDc3NQcm9jZXNzT3B0aW9ucyxcbiAgICBwcml2YXRlIHJlYWRvbmx5IHJlc291cmNlQ2FjaGU6IE1hcDxzdHJpbmcsIHN0cmluZz4sXG4gICkge1xuICAgIHN1cGVyKHtcbiAgICAgIGxvZ2dlcjoge1xuICAgICAgICB3YXJuOiAoczogc3RyaW5nKSA9PiB0aGlzLndhcm5pbmdzLnB1c2gocyksXG4gICAgICAgIGVycm9yOiAoczogc3RyaW5nKSA9PiB0aGlzLmVycm9ycy5wdXNoKHMpLFxuICAgICAgICBpbmZvOiAoKSA9PiB7fSxcbiAgICAgIH0sXG4gICAgICBsb2dMZXZlbDogJ3dhcm4nLFxuICAgICAgcGF0aDogb3B0aW9uc0V4dGVuZGVkLm91dHB1dFBhdGgsXG4gICAgICBwdWJsaWNQYXRoOiBvcHRpb25zRXh0ZW5kZWQuZGVwbG95VXJsLFxuICAgICAgY29tcHJlc3M6ICEhb3B0aW9uc0V4dGVuZGVkLm1pbmlmeSxcbiAgICAgIHBydW5lU291cmNlOiBmYWxzZSxcbiAgICAgIHJlZHVjZUlubGluZVN0eWxlczogZmFsc2UsXG4gICAgICBtZXJnZVN0eWxlc2hlZXRzOiBmYWxzZSxcbiAgICAgIC8vIE5vdGU6IGlmIGBwcmVsb2FkYCBjaGFuZ2VzIHRvIGFueXRoaW5nIG90aGVyIHRoYW4gYG1lZGlhYCwgdGhlIGxvZ2ljIGluXG4gICAgICAvLyBgZW1iZWRMaW5rZWRTdHlsZXNoZWV0T3ZlcnJpZGVgIHdpbGwgaGF2ZSB0byBiZSB1cGRhdGVkLlxuICAgICAgcHJlbG9hZDogJ21lZGlhJyxcbiAgICAgIG5vc2NyaXB0RmFsbGJhY2s6IHRydWUsXG4gICAgICBpbmxpbmVGb250czogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIFdlIGNhbid0IHVzZSBpbmhlcml0YW5jZSB0byBvdmVycmlkZSBgZW1iZWRMaW5rZWRTdHlsZXNoZWV0YCwgYmVjYXVzZSBpdCdzIG5vdCBkZWNsYXJlZCBpblxuICAgIC8vIHRoZSBgQ3JpdHRlcnNgIC5kLnRzIHdoaWNoIG1lYW5zIHRoYXQgd2UgY2FuJ3QgY2FsbCB0aGUgYHN1cGVyYCBpbXBsZW1lbnRhdGlvbi4gVFMgZG9lc24ndFxuICAgIC8vIGFsbG93IGZvciBgc3VwZXJgIHRvIGJlIGNhc3QgdG8gYSBkaWZmZXJlbnQgdHlwZS5cbiAgICB0aGlzLmluaXRpYWxFbWJlZExpbmtlZFN0eWxlc2hlZXQgPSB0aGlzLmVtYmVkTGlua2VkU3R5bGVzaGVldDtcbiAgICB0aGlzLmVtYmVkTGlua2VkU3R5bGVzaGVldCA9IHRoaXMuZW1iZWRMaW5rZWRTdHlsZXNoZWV0T3ZlcnJpZGU7XG4gIH1cblxuICBwdWJsaWMgb3ZlcnJpZGUgYXN5bmMgcmVhZEZpbGUocGF0aDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBsZXQgcmVzb3VyY2VDb250ZW50ID0gdGhpcy5yZXNvdXJjZUNhY2hlLmdldChwYXRoKTtcbiAgICBpZiAocmVzb3VyY2VDb250ZW50ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJlc291cmNlQ29udGVudCA9IGF3YWl0IHJlYWRGaWxlKHBhdGgsICd1dGYtOCcpO1xuICAgICAgdGhpcy5yZXNvdXJjZUNhY2hlLnNldChwYXRoLCByZXNvdXJjZUNvbnRlbnQpO1xuICAgIH1cblxuICAgIHJldHVybiByZXNvdXJjZUNvbnRlbnQ7XG4gIH1cblxuICAvKipcbiAgICogT3ZlcnJpZGUgb2YgdGhlIENyaXR0ZXJzIGBlbWJlZExpbmtlZFN0eWxlc2hlZXRgIG1ldGhvZFxuICAgKiB0aGF0IG1ha2VzIGl0IHdvcmsgd2l0aCBBbmd1bGFyJ3MgQ1NQIEFQSXMuXG4gICAqL1xuICBwcml2YXRlIGVtYmVkTGlua2VkU3R5bGVzaGVldE92ZXJyaWRlOiBFbWJlZExpbmtlZFN0eWxlc2hlZXRGbiA9IGFzeW5jIChsaW5rLCBkb2N1bWVudCkgPT4ge1xuICAgIGlmIChsaW5rLmdldEF0dHJpYnV0ZSgnbWVkaWEnKSA9PT0gJ3ByaW50JyAmJiBsaW5rLm5leHQ/Lm5hbWUgPT09ICdub3NjcmlwdCcpIHtcbiAgICAgIC8vIFdvcmthcm91bmQgZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9Hb29nbGVDaHJvbWVMYWJzL2NyaXR0ZXJzL2lzc3Vlcy82NFxuICAgICAgLy8gTkI6IHRoaXMgaXMgb25seSBuZWVkZWQgZm9yIHRoZSB3ZWJwYWNrIGJhc2VkIGJ1aWxkZXJzLlxuICAgICAgY29uc3QgbWVkaWEgPSBsaW5rLmdldEF0dHJpYnV0ZSgnb25sb2FkJyk/Lm1hdGNoKE1FRElBX1NFVF9IQU5ETEVSX1BBVFRFUk4pO1xuICAgICAgaWYgKG1lZGlhKSB7XG4gICAgICAgIGxpbmsucmVtb3ZlQXR0cmlidXRlKCdvbmxvYWQnKTtcbiAgICAgICAgbGluay5zZXRBdHRyaWJ1dGUoJ21lZGlhJywgbWVkaWFbMV0pO1xuICAgICAgICBsaW5rPy5uZXh0Py5yZW1vdmUoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCByZXR1cm5WYWx1ZSA9IGF3YWl0IHRoaXMuaW5pdGlhbEVtYmVkTGlua2VkU3R5bGVzaGVldChsaW5rLCBkb2N1bWVudCk7XG4gICAgY29uc3QgY3NwTm9uY2UgPSB0aGlzLmZpbmRDc3BOb25jZShkb2N1bWVudCk7XG5cbiAgICBpZiAoY3NwTm9uY2UpIHtcbiAgICAgIGNvbnN0IGNyaXR0ZXJzTWVkaWEgPSBsaW5rLmdldEF0dHJpYnV0ZSgnb25sb2FkJyk/Lm1hdGNoKE1FRElBX1NFVF9IQU5ETEVSX1BBVFRFUk4pO1xuXG4gICAgICBpZiAoY3JpdHRlcnNNZWRpYSkge1xuICAgICAgICAvLyBJZiB0aGVyZSdzIGEgQ3JpdHRlcnMtZ2VuZXJhdGVkIGBvbmxvYWRgIGhhbmRsZXIgYW5kIHRoZSBmaWxlIGhhcyBhbiBBbmd1bGFyIENTUCBub25jZSxcbiAgICAgICAgLy8gd2UgaGF2ZSB0byByZW1vdmUgdGhlIGhhbmRsZXIsIGJlY2F1c2UgaXQncyBpbmNvbXBhdGlibGUgd2l0aCBDU1AuIFdlIHNhdmUgdGhlIHZhbHVlXG4gICAgICAgIC8vIGluIGEgZGlmZmVyZW50IGF0dHJpYnV0ZSBhbmQgd2UgZ2VuZXJhdGUgYSBzY3JpcHQgdGFnIHdpdGggdGhlIG5vbmNlIHRoYXQgdXNlc1xuICAgICAgICAvLyBgYWRkRXZlbnRMaXN0ZW5lcmAgdG8gYXBwbHkgdGhlIG1lZGlhIHF1ZXJ5IGluc3RlYWQuXG4gICAgICAgIGxpbmsucmVtb3ZlQXR0cmlidXRlKCdvbmxvYWQnKTtcbiAgICAgICAgbGluay5zZXRBdHRyaWJ1dGUoQ1NQX01FRElBX0FUVFIsIGNyaXR0ZXJzTWVkaWFbMV0pO1xuICAgICAgICB0aGlzLmNvbmRpdGlvbmFsbHlJbnNlcnRDc3BMb2FkaW5nU2NyaXB0KGRvY3VtZW50LCBjc3BOb25jZSk7XG4gICAgICB9XG5cbiAgICAgIC8vIElkZWFsbHkgd2Ugd291bGQgaG9vayBpbiBhdCB0aGUgdGltZSBDcml0dGVycyBpbnNlcnRzIHRoZSBgc3R5bGVgIHRhZ3MsIGJ1dCB0aGVyZSBpc24ndFxuICAgICAgLy8gYSB3YXkgb2YgZG9pbmcgdGhhdCBhdCB0aGUgbW9tZW50IHNvIHdlIGZhbGwgYmFjayB0byBkb2luZyBpdCBhbnkgdGltZSBhIGBsaW5rYCB0YWcgaXNcbiAgICAgIC8vIGluc2VydGVkLiBXZSBtaXRpZ2F0ZSBpdCBieSBvbmx5IGl0ZXJhdGluZyB0aGUgZGlyZWN0IGNoaWxkcmVuIG9mIHRoZSBgPGhlYWQ+YCB3aGljaFxuICAgICAgLy8gc2hvdWxkIGJlIHByZXR0eSBzaGFsbG93LlxuICAgICAgZG9jdW1lbnQuaGVhZC5jaGlsZHJlbi5mb3JFYWNoKChjaGlsZCkgPT4ge1xuICAgICAgICBpZiAoY2hpbGQudGFnTmFtZSA9PT0gJ3N0eWxlJyAmJiAhY2hpbGQuaGFzQXR0cmlidXRlKCdub25jZScpKSB7XG4gICAgICAgICAgY2hpbGQuc2V0QXR0cmlidXRlKCdub25jZScsIGNzcE5vbmNlKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJldHVyblZhbHVlO1xuICB9O1xuXG4gIC8qKlxuICAgKiBGaW5kcyB0aGUgQ1NQIG5vbmNlIGZvciBhIHNwZWNpZmljIGRvY3VtZW50LlxuICAgKi9cbiAgcHJpdmF0ZSBmaW5kQ3NwTm9uY2UoZG9jdW1lbnQ6IFBhcnRpYWxEb2N1bWVudCk6IHN0cmluZyB8IG51bGwge1xuICAgIGlmICh0aGlzLmRvY3VtZW50Tm9uY2VzLmhhcyhkb2N1bWVudCkpIHtcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tbm9uLW51bGwtYXNzZXJ0aW9uXG4gICAgICByZXR1cm4gdGhpcy5kb2N1bWVudE5vbmNlcy5nZXQoZG9jdW1lbnQpITtcbiAgICB9XG5cbiAgICAvLyBIVE1MIGF0dHJpYnV0ZSBhcmUgY2FzZS1pbnNlbnNpdGl2ZSwgYnV0IHRoZSBwYXJzZXIgdXNlZCBieSBDcml0dGVycyBpcyBjYXNlLXNlbnNpdGl2ZS5cbiAgICBjb25zdCBub25jZUVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbbmdDc3BOb25jZV0sIFtuZ2NzcG5vbmNlXScpO1xuICAgIGNvbnN0IGNzcE5vbmNlID1cbiAgICAgIG5vbmNlRWxlbWVudD8uZ2V0QXR0cmlidXRlKCduZ0NzcE5vbmNlJykgfHwgbm9uY2VFbGVtZW50Py5nZXRBdHRyaWJ1dGUoJ25nY3Nwbm9uY2UnKSB8fCBudWxsO1xuXG4gICAgdGhpcy5kb2N1bWVudE5vbmNlcy5zZXQoZG9jdW1lbnQsIGNzcE5vbmNlKTtcblxuICAgIHJldHVybiBjc3BOb25jZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBJbnNlcnRzIHRoZSBgc2NyaXB0YCB0YWcgdGhhdCBzd2FwcyB0aGUgY3JpdGljYWwgQ1NTIGF0IHJ1bnRpbWUsXG4gICAqIGlmIG9uZSBoYXNuJ3QgYmVlbiBpbnNlcnRlZCBpbnRvIHRoZSBkb2N1bWVudCBhbHJlYWR5LlxuICAgKi9cbiAgcHJpdmF0ZSBjb25kaXRpb25hbGx5SW5zZXJ0Q3NwTG9hZGluZ1NjcmlwdChkb2N1bWVudDogUGFydGlhbERvY3VtZW50LCBub25jZTogc3RyaW5nKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuYWRkZWRDc3BTY3JpcHRzRG9jdW1lbnRzLmhhcyhkb2N1bWVudCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoZG9jdW1lbnQuaGVhZC50ZXh0Q29udGVudC5pbmNsdWRlcyhMSU5LX0xPQURfU0NSSVBUX0NPTlRFTlQpKSB7XG4gICAgICAvLyBTY3JpcHQgd2FzIGFscmVhZHkgYWRkZWQgZHVyaW5nIHRoZSBidWlsZC5cbiAgICAgIHRoaXMuYWRkZWRDc3BTY3JpcHRzRG9jdW1lbnRzLmFkZChkb2N1bWVudCk7XG5cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBzY3JpcHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcbiAgICBzY3JpcHQuc2V0QXR0cmlidXRlKCdub25jZScsIG5vbmNlKTtcbiAgICBzY3JpcHQudGV4dENvbnRlbnQgPSBMSU5LX0xPQURfU0NSSVBUX0NPTlRFTlQ7XG4gICAgLy8gQXBwZW5kIHRoZSBzY3JpcHQgdG8gdGhlIGhlYWQgc2luY2UgaXQgbmVlZHMgdG9cbiAgICAvLyBydW4gYXMgZWFybHkgYXMgcG9zc2libGUsIGFmdGVyIHRoZSBgbGlua2AgdGFncy5cbiAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHNjcmlwdCk7XG4gICAgdGhpcy5hZGRlZENzcFNjcmlwdHNEb2N1bWVudHMuYWRkKGRvY3VtZW50KTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgSW5saW5lQ3JpdGljYWxDc3NQcm9jZXNzb3Ige1xuICBwcml2YXRlIHJlYWRvbmx5IHJlc291cmNlQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG4gIGNvbnN0cnVjdG9yKHByb3RlY3RlZCByZWFkb25seSBvcHRpb25zOiBJbmxpbmVDcml0aWNhbENzc1Byb2Nlc3Nvck9wdGlvbnMpIHt9XG5cbiAgYXN5bmMgcHJvY2VzcyhcbiAgICBodG1sOiBzdHJpbmcsXG4gICAgb3B0aW9uczogSW5saW5lQ3JpdGljYWxDc3NQcm9jZXNzT3B0aW9ucyxcbiAgKTogUHJvbWlzZTxJbmxpbmVDcml0aWNhbENzc1Jlc3VsdD4ge1xuICAgIGNvbnN0IGNyaXR0ZXJzID0gbmV3IENyaXR0ZXJzRXh0ZW5kZWQoeyAuLi50aGlzLm9wdGlvbnMsIC4uLm9wdGlvbnMgfSwgdGhpcy5yZXNvdXJjZUNhY2hlKTtcbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgY3JpdHRlcnMucHJvY2VzcyhodG1sKTtcblxuICAgIHJldHVybiB7XG4gICAgICBjb250ZW50LFxuICAgICAgZXJyb3JzOiBjcml0dGVycy5lcnJvcnMubGVuZ3RoID8gY3JpdHRlcnMuZXJyb3JzIDogdW5kZWZpbmVkLFxuICAgICAgd2FybmluZ3M6IGNyaXR0ZXJzLndhcm5pbmdzLmxlbmd0aCA/IGNyaXR0ZXJzLndhcm5pbmdzIDogdW5kZWZpbmVkLFxuICAgIH07XG4gIH1cbn1cbiJdfQ==
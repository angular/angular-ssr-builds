import { InjectionToken } from '@angular/core';

/**
 * Injection token for the current request.
 * @developerPreview
 */
const REQUEST = new InjectionToken('REQUEST');
/**
 * Injection token for the response initialization options.
 * @developerPreview
 */
const RESPONSE_INIT = new InjectionToken('RESPONSE_INIT');
/**
 * Injection token for additional request context.
 * @developerPreview
 */
const REQUEST_CONTEXT = new InjectionToken('REQUEST_CONTEXT');

export { REQUEST, REQUEST_CONTEXT, RESPONSE_INIT };
//# sourceMappingURL=tokens.mjs.map

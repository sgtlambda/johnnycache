'use strict';

class Intent {

    /**
     * @param {Function} run
     * @param {Object|null} cacheableOptions These options will be passed down
     *   to the Operation constructor. If "null" is given, the intent is considered "non-cacheable"
     *   and "run" will always be invoked.
     */
    constructor(run, cacheableOptions = {}) {
        this.run     = run;
        this.options = cacheableOptions;
    }

    get isCacheable() {
        return !!this.options;
    }
}

module.exports = Intent;
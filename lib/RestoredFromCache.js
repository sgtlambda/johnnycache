'use strict';

class RestoredFromCache {

    /**
     * Represents an extraction (where a result was restored from cache)
     * @param {Result} result The cached result that was extracted
     * @param {Number} runtime The time it took to extract
     */
    constructor(result, runtime) {
        this.result  = result;
        this.runtime = runtime;
    }
}

module.exports = RestoredFromCache;
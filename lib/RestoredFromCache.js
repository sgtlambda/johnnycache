'use strict';

class RestoredFromCache {

    /**
     * Represents an extraction (where a result was restored from cache)
     * @param {CachedResult} cachedResult The cached result that was extracted
     * @param {Number} runtime The time it took to extract
     */
    constructor(cachedResult, runtime) {
        this.cachedResult = cachedResult;
        this.runtime      = runtime;
    }
}

module.exports = RestoredFromCache;
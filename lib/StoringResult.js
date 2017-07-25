'use strict';

class StoringResult {

    /**
     * @param {Promise.<SavedToCache>} savedToCache
     * @param {CacheableOperation} cacheableOperation
     */
    constructor({savedToCache, cacheableOperation}) {

        this.savedToCache       = savedToCache;
        this.cacheableOperation = cacheableOperation;
    }
}

module.exports = StoringResult;
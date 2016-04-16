'use strict';

class StoringResult {

    /**
     * @param {Promise.<SavedToCache>} savedToCache
     */
    constructor(savedToCache) {

        this.savedToCache = savedToCache;
    }
}

module.exports = StoringResult;
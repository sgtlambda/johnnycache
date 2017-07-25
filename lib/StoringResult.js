'use strict';

class StoringResult {

    /**
     * @param {Promise.<SavedToCache>} savedToCache
     * @param {Operation} operation
     */
    constructor({savedToCache, operation}) {

        this.savedToCache = savedToCache;
        this.operation    = operation;
    }
}

module.exports = StoringResult;
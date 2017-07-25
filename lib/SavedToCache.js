'use strict';

class SavedToCache {

    /**
     * Represents an event where a cacheable operation was ran and the result was saved to cache
     * @param {Number} operationRuntime The time it took to perform the operation
     * @param {Number} storageRuntime The time it took to save the result to the cache
     * @param {Result} result
     *
     * // @TODO "runtime" is not the appropriate noun
     */
    constructor({operationRuntime, storageRuntime, result}) {
        this.operationRuntime = operationRuntime;
        this.storageRuntime   = storageRuntime;
        this.result           = result;
    }
}

module.exports = SavedToCache;
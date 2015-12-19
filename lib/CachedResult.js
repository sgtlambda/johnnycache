'use strict';

class CachedResult {

    constructor(cacheableOperation, doc) {
        this.cacheableOperation = cacheableOperation;
        this.doc                = doc;
    }
}

module.exports = CachedResult;
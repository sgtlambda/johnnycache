'use strict';

const slug    = require('slugs');
const sprintf = require('sprintf-js').sprintf;

class CachedResult {

    constructor(hash, action, ttl, fileName, compress) {
        this.hash       = hash;
        this.action     = action;
        this.ttl        = ttl;
        this.fileName   = fileName;
        this.compressed = compress;
    }

    /**
     * @returns {object}
     */
    getDocument() {
        return {
            action:     this.action,
            hash:       this.hash,
            created:    Date.now(),
            expires:    this.ttl !== null ? (Date.now() + this.ttl) : -1,
            fileName:   this.fileName,
            compressed: this.compressed
        };
    }

    /**
     * @param {CacheableOperation} cacheableOperation
     * @returns {Promise.<CachedResult>}
     */
    static createNew(cacheableOperation) {
        return cacheableOperation.getHash().then(hash => {
            let action   = cacheableOperation.action;
            let fileName = slug(sprintf('%s-%s', action.substring(0, 16), hash.substring(0, 16)));
            return new CachedResult(hash, action, cacheableOperation.ttl, fileName, cacheableOperation.compress);
        });
    }

    /**
     * @param {CacheableOperation} cacheableOperation
     * @param {{action: *, hash: *, expires: number, fileName: *}} doc
     * @returns {Promise.<CachedResult>}
     */
    static fromDocument(cacheableOperation, doc) {
        return CachedResult.createNew(cacheableOperation).then(cachedResult => {
            cachedResult.fileName = doc.fileName;
            return cachedResult;
        });
    }
}

module.exports = CachedResult;
'use strict';

const slug    = require('slugs');
const sprintf = require('sprintf-js').sprintf;

class CachedResult {

    /**
     * @param {CacheableOperation} cacheableOperation Associated cacheableOperation
     * @param {object} [doc] The doc from the db
     */
    constructor(hash, action, ttl, fileName) {
        this.hash     = hash;
        this.action   = action;
        this.ttl      = ttl;
        this.fileName = fileName;
    }

    /**
     * @returns {{action: *, hash: *, expires: number, fileName: *}}
     */
    getDocument() {
        return {
            action:   this.action,
            hash:     this.hash,
            expires:  this.ttl !== null ? (Date.now() + this.ttl) : -1,
            fileName: this.fileName
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
            return new CachedResult(hash, action, cacheableOperation.ttl, fileName);
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
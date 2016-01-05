'use strict';

const slug    = require('slugs');
const sprintf = require('sprintf-js').sprintf;

class CachedResult {

    constructor(fileHash, action, outputHash, ttl, fileName, compress) {
        this.fileHash   = fileHash;
        this.outputHash = outputHash;
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
            fileHash:   this.fileHash,
            outputHash: this.outputHash,
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
        if (cacheableOperation === null)
            return Promise.resolve(new CachedResult(null, null, null, null, null, null));
        return Promise.all([
            cacheableOperation.getFileHash(),
            cacheableOperation.getOutputHash()
        ]).then(hashes => {
            let fileHash   = hashes[0];
            let outputHash = hashes[1];
            let action     = cacheableOperation.action;
            var ttl        = cacheableOperation.ttl;
            let ext        = cacheableOperation.compressed ? 'tar.gz' : 'tar';
            let fileName   = slug(sprintf('%s-%s', action.substring(0, 16), fileHash.substring(0, 16))) + '.' + ext;
            return new CachedResult(fileHash, action, outputHash, ttl, fileName, cacheableOperation.compress);
        });
    }

    /**
     * @param {CacheableOperation|null} cacheableOperation
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
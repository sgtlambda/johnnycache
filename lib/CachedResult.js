'use strict';

const slug    = require('slugs');
const sprintf = require('sprintf-js').sprintf;

class CachedResult {

    constructor(fileHash, action, outputHash, ttl, fileName, compress, fileSize, runtime) {
        this.action  = action;
        this.created = Date.now();
        this.expires = ttl !== null ? (Date.now() + ttl) : -1;
        this.runtime = runtime;

        this.fileHash   = fileHash;
        this.outputHash = outputHash;

        this.fileName = fileName;
        this.fileSize = fileSize;

        this.compressed = compress;
    }

    /**
     * Retrieve a serialized object ready for insertion into the index DB
     * @returns {object}
     */
    getDocument() {
        return {
            action:     this.action,
            fileHash:   this.fileHash,
            outputHash: this.outputHash,
            created:    this.created,
            expires:    this.expires,
            fileName:   this.fileName,
            compressed: this.compressed,
            fileSize:   this.fileSize,
            runtime:    this.runtime
        };
    }

    /**
     * Sets the file and output hashes
     * (necessary if this CachedResult is to be saved to the index)
     * @param {CacheableOperation} op
     * @Returns {Promise}
     */
    async setHashes(op) {

        const [fileHash, outputHash] = await Promise.all([
            op.getFileHash(),
            op.getOutputHash()
        ]);

        this.fileHash   = fileHash;
        this.outputHash = outputHash;

        let basename = slug(sprintf('%s-%s', this.action.substring(0, 32), this.fileHash.substring(0, 4)));
        let ext      = op.compressed ? 'tar.gz' : 'tar';

        this.fileName = basename + '.' + ext;
    }

    /**
     * Create a new CachedResult instance, optionally based on the given CacheableOperation
     * @param {CacheableOperation|null} op
     * @returns {CachedResult}
     */
    static createNew(op) {
        if (op === null)
            return new CachedResult(null, null, null, null, null, null, null, null);
        else {
            let cachedResult              = new CachedResult(null, op.action, null, op.ttl, null, op.compress, null, op.runtime);
            cachedResult.workingDirectory = op.workingDirectory;
            return cachedResult;
        }
    }

    /**
     * @param {CacheableOperation|null} cacheableOperation
     * @param {{action: *, hash: *, expires: number, fileName: *}} doc
     * @returns {CachedResult}
     */
    static fromDocument(cacheableOperation, doc) {
        let cachedResult      = CachedResult.createNew(cacheableOperation);
        cachedResult.fileName = doc.fileName;
        cachedResult.fileSize = doc.fileSize;
        cachedResult.expires  = doc.expires;
        cachedResult.created  = doc.created;
        cachedResult.runtime  = doc.runtime;
        cachedResult.id       = doc.id;
        return cachedResult;
    }
}

module.exports = CachedResult;
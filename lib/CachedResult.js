'use strict';

const assert = require('assert');
const slug   = require('slugs');

/**
 * Structure that represents a cached result
 */
class CachedResult {

    constructor({

        fileHash = null,
        action = null,
        outputHash = null,
        ttl = null,
        fileName = null,
        compress = null,
        fileSize = null,
        runtime = null,
        workingDirectory = null,

    } = {}) {

        this.fileHash         = fileHash;
        this.action           = action;
        this.outputHash       = outputHash;
        this.expires          = ttl === null ? -1 : (Date.now() + ttl);
        this.fileName         = fileName;
        this.compress         = compress;
        this.fileSize         = fileSize;
        this.runtime          = runtime;
        this.workingDirectory = workingDirectory;

        this.created = Date.now();
    }

    /**
     * Sets the file and output hashes
     * (necessary if this CachedResult is to be saved to the index)
     * @param {CacheableOperation} op
     * @Returns {Promise}
     */
    async assignHashes(op) {
        const {fileHash, outputHash} = await op.getHashes();

        this.fileHash   = fileHash;
        this.outputHash = outputHash;
    }

    /**
     * Assign output filename
     * @param op
     */
    assignFilename(op) {
        assert(this.action && this.fileHash);
        const basename = `${slug(this.action).substring(0, 32)}-${this.fileHash.substring(0, 4)}`;
        const ext      = op.compress ? 'tar.gz' : 'tar';
        this.fileName  = `${basename}.${ext}`;
    }

    /**
     * Retrieve a serialized object ready for insertion into the index DB
     * @returns {object}
     */
    toDocument() {
        return {
            action:     this.action,
            fileHash:   this.fileHash,
            outputHash: this.outputHash,
            created:    this.created,
            expires:    this.expires,
            fileName:   this.fileName,
            compress:   this.compress,
            fileSize:   this.fileSize,
            runtime:    this.runtime
        };
    }

    /**
     * @param {CacheableOperation|null} op
     * @param {{action: *, hash: *, expires: number, fileName: *}} doc
     * @returns {CachedResult}
     */
    static fromDocument(op, doc) {
        let cachedResult      = new CachedResult(op === null ? {} : op);
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
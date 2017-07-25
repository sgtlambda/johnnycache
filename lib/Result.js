'use strict';

const {assign, pick} = require('lodash');

/**
 * Structure that represents a cached result
 */
class Result {

    constructor({

        fileHash = null,
        action = null,
        outputHash = null,
        ttl = null,
        expires = null,
        filename = null,
        compress = null,
        fileSize = null,
        runtime = null,
        workingDirectory = null,

        created = null,

    } = {}) {

        this.fileHash         = fileHash;
        this.action           = action;
        this.outputHash       = outputHash;
        this.expires          = expires || (ttl === null ? -1 : (Date.now() + ttl));
        this.filename         = filename;
        this.compress         = compress;
        this.fileSize         = fileSize;
        this.runtime          = runtime;
        this.workingDirectory = workingDirectory;

        this.created = created || Date.now();
    }

    /**
     * Retrieve a serialized object ready for insertion into the index DB
     * @returns {object}
     */
    toDocument() {
        return pick(this, [
            'action',
            'fileHash',
            'outputHash',
            'created',
            'expires',
            'filename',
            'compress',
            'fileSize',
            'runtime',
        ]);
    }

    /**
     * @param {Operation|null} op
     * @param {{action: *, hash: *, expires: number, filename: *}} doc
     * @returns {Result}
     */
    static fromDocument({workingDirectory} = {}, doc) {
        let result = new Result(assign({}, doc, {workingDirectory}));
        result.id  = doc.id;
        return result;
    }
}

module.exports = Result;
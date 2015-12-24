'use strict';

const zlib               = require('zlib');
const gunzipMaybe        = require('gunzip-maybe');
const tar                = require('tar');
const del                = require('del');
const nectar             = require('nectar');
const Datastore          = require('nedb');
const pify               = require('pify');
const path               = require('path');
const fs                 = require('fs');
const _                  = require('lodash');
const EventEmitter       = require('events').EventEmitter;
const Promise            = require('pinkie-promise');
const CacheableOperation = require('./CacheableOperation');
const CachedResult       = require('./CachedResult');

class Cache extends EventEmitter {

    constructor(options) {
        super();
        if (typeof options == 'undefined')
            options = {};
        options        = _.defaults(options, {
            workspace: path.join(process.cwd(), '.johnny')
        });
        this.workspace = options.workspace;
        this.index     = new Datastore({filename: path.join(this.workspace, '.index'), autoload: true});
        this.ready     = this.prepare();
    }

    /**
     * @returns {Promise}
     */
    awaitReady() {
        return this.ready;
    }

    getCurrentTime() {
        return Date.now();
    }

    /**
     * @returns {Promise}
     */
    prepare() {
        return this.purgeExpired();
    }

    /**
     * @returns {Promise}
     */
    purgeExpired() {
        return pify(this.index.remove.bind(this.index))({expires: {$ne: -1, $lte: this.getCurrentTime()}})
            .then(() => pify(this.index.find.bind(this.index))({}))
            .then(docs => {
                let globs = [path.join(this.workspace, '*.*')];
                return _.reduce(docs, (queue, doc) => queue.then(() => CachedResult.fromDocument(null, doc))
                    .then(cachedResult => {
                        globs.push('!' + this.getStorageLocation(cachedResult));
                    }), Promise.resolve())
                    .then(() => del(globs));
            });
    }

    /**
     * @param {CachedResult} cachedResult
     */
    getStorageLocation(cachedResult) {
        return path.join(this.workspace, cachedResult.fileName);
    }

    getExtractPath() {
        return process.cwd();
    }

    /**
     * @param {CacheableOperation} cacheableOperation
     * @return {Promise.<CachedResult>}
     */
    run(cacheableOperation) {
        let cachedResult;
        let jobs = [CachedResult.createNew(cacheableOperation), cacheableOperation.run()];
        return Promise.all(jobs)
            .then(values => cachedResult = values[0])
            .then(() => {
                if (cacheableOperation.onStore) cacheableOperation.onStore(cacheableOperation);
                let writeStream = fs.createWriteStream(this.getStorageLocation(cachedResult));
                if (cacheableOperation.compress)
                    writeStream = zlib.createGzip().pipe(writeStream);
                return nectar(cacheableOperation.output, writeStream);
            })
            .then(() => pify(this.index.insert.bind(this.index))(cachedResult.getDocument()))
            .then(() => cachedResult);
    }

    /**
     * Restores the given cached result
     * @param cachedResult
     * @returns {Promise.<CachedResult>}
     */
    restore(cachedResult) {
        let extract    = tar.Extract({
            path: this.getExtractPath()
        });
        let readStream = fs.createReadStream(this.getStorageLocation(cachedResult)).pipe(gunzipMaybe());
        readStream.pipe(extract);
        return new Promise(resolve => extract.on('end', resolve))
            .then(() => cachedResult);
    }

    /**
     * Generates the query for retreiving the appropriate cached result document
     * @param {CacheableOperation} cacheableOperation
     * @returns {Promise.<object>}
     */
    getQuery(cacheableOperation) {
        return cacheableOperation.getHash()
            .then(hash => {
                return {
                    hash:   hash,
                    action: cacheableOperation.action,
                    $or:    [{expires: -1}, {expires: {$gt: this.getCurrentTime()}}]
                };
            });
    }

    /**
     * @param {CacheableOperation} cacheableOperation
     * @returns {Promise.<object|null>}
     */
    getCachedResult(cacheableOperation) {
        let jobs = [this.getQuery(cacheableOperation), this.awaitReady()];
        return Promise.all(jobs)
            .then(values => pify(this.index.find.bind(this.index))(values[0]))
            .then(docs => docs.length ? CachedResult.fromDocument(cacheableOperation, docs[0]) : null);
    }

    /**
     * @param {function} run
     * @param {object} options
     * @returns {Promise.<CachedResult>}
     */
    doCached(run, options) {
        let cacheableOperation = new CacheableOperation(run, options);
        return this.getCachedResult(cacheableOperation)
            .then(cachedResult => {
                if (cachedResult !== null) {
                    if (options.onRestore) options.onRestore(cacheableOperation, cachedResult);
                    return this.restore(cachedResult);
                } else {
                    if (options.onRun) options.onRun(cacheableOperation);
                    return this.run(cacheableOperation);
                }
            });
    }
}

module.exports = Cache;
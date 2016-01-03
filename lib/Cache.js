'use strict';

const promiseRetry       = require('promise-retry');
const zlib               = require('zlib');
const gunzipMaybe        = require('gunzip-maybe');
const tar                = require('tar');
const del                = require('del');
const nectar             = require('nectar');
const Datastore          = require('nedb');
const pify               = require('pify');
const path               = require('path');
const fs                 = require('fs');
const pathExists         = require('path-exists');
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
     * Prevent hash collisions
     * @param {CachedResult} cachedResult
     * @returns {Promise}
     */
    incrementFilename(cachedResult) {
        let updatedFilename;
        let baseName  = path.basename(cachedResult.fileName).substring(0, path.basename(cachedResult.fileName).lastIndexOf('.'));
        let ext       = path.extname(cachedResult.fileName);
        let increment = 0;
        return promiseRetry((retry) => {
            updatedFilename = baseName + (increment ? ('-' + increment) : '') + ext;
            let fileName    = this.getStorageLocation(updatedFilename);
            return pathExists(fileName).then(exists => {
                if (exists) {
                    increment++;
                    retry(new Error('file exists'));
                }
            });
        }, {retries: 100, minTimeout: 0}).then(() => {
            cachedResult.fileName = updatedFilename;
            return cachedResult;
        });
    }

    /**
     * @param {CachedResult|string} obj
     * @return {string}
     */
    getStorageLocation(obj) {
        if (obj instanceof CachedResult)
            obj = obj.fileName;
        return path.join(this.workspace, obj);
    }

    getExtractPath() {
        return process.cwd();
    }

    /**
     * Creates a new CachedResult object for saving
     * @param cacheableOperation
     * @returns {Promise.<CachedResult>}
     */
    prepareResult(cacheableOperation) {
        return CachedResult.createNew(cacheableOperation)
            .then(cachedResult => this.incrementFilename(cachedResult));
    }

    /**
     * @param {CacheableOperation} cacheableOperation
     * @return {Promise.<CachedResult>}
     */
    run(cacheableOperation) {
        let cachedResult;
        let jobs = [this.prepareResult(cacheableOperation), cacheableOperation.run()];
        return Promise.all(jobs)
            .then(values => {
                cachedResult = values[0];
                if (cacheableOperation.onStore) cacheableOperation.onStore(cacheableOperation);
                let writeStream = fs.createWriteStream(this.getStorageLocation(cachedResult));
                if (cacheableOperation.compress) writeStream = zlib.createGzip().pipe(writeStream);
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
     * Checks whether the cached result has a corresponding file
     * @param {CachedResult} cachedResult
     * @returns {Promise.<CachedResult|null>}
     */
    ensureExists(cachedResult) {
        return pify(fs.access)(this.getStorageLocation(cachedResult))
            .then(() => cachedResult, () => null);
    }

    /**
     * @param {function} run
     * @param {object} options
     * @returns {Promise.<CachedResult>}
     */
    doCached(run, options) {
        let cacheableOperation = new CacheableOperation(run, options);
        return this.getCachedResult(cacheableOperation)
            .then(cachedResult => cachedResult !== null ? this.ensureExists(cachedResult) : null)
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
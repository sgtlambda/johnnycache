'use strict';

const tar                = require('tar');
const nectar             = require('nectar');
const Datastore          = require('nedb');
const pify               = require('pify');
const path               = require('path');
const fs                 = require('fs');
const sprintf            = require('sprintf-js').sprintf;
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
        this.prepare().then(() => {
            this.emit('ready');
            this.ready = true;
        });
    }

    /**
     * @returns {Promise}
     */
    awaitReady() {
        return this.ready ? Promise.resolve() : new Promise(resolve => this.once('ready', () => resolve()));
    }

    static getCurrentTime() {
        return Date.now();
    }

    /**
     * @returns {Promise}
     */
    prepare() {
        return this.removeExpired();
    }

    /**
     * @returns {Promise}
     */
    removeExpired() {
        return pify(this.index.remove.bind(this.index))({expires: {$ne: -1, $lte: Cache.getCurrentTime()}});
    }

    /**
     * @param {CachedResult} cachedResult
     */
    getStorageLocation(cachedResult) {
        return sprintf('%s.tar', path.join(this.workspace, cachedResult.fileName));
    }

    getExtractPath() {
        return process.cwd();
    }

    /**
     * @param {CacheableOperation} cacheableOperation
     */
    run(cacheableOperation) {
        let cachedResult;
        let jobs = [CachedResult.createNew(cacheableOperation), cacheableOperation.run()];
        return Promise.all(jobs)
            .then(values => cachedResult = values[0])
            .then(() => nectar(cacheableOperation.output, this.getStorageLocation(cachedResult)))
            .then(() => pify(this.index.insert.bind(this.index))(cachedResult.getDocument()));
    }

    restore(cachedResult) {
        let extract    = tar.Extract({
            path: this.getExtractPath()
        });
        let readStream = fs.createReadStream(this.getStorageLocation(cachedResult));
        readStream.pipe(extract);
        return new Promise(resolve => readStream.on('end', resolve));
    }

    /**
     * @param {CacheableOperation} cacheableOperation
     * @returns {Promise.<object>}
     */
    getQuery(cacheableOperation) {
        return cacheableOperation.getHash()
            .then(hash => {
                return {
                    hash:   hash,
                    action: cacheableOperation.action,
                    $or:    [{expires: -1}, {expires: {$gt: Cache.getCurrentTime()}}]
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
     * @returns {Promise}
     */
    doCached(run, options) {
        let cacheableOperation = new CacheableOperation(run, options);
        return this.getCachedResult(cacheableOperation)
            .then(cachedResult => cachedResult !== null ? this.restore(cachedResult) : this.run(cacheableOperation));
    }
}

module.exports = Cache;
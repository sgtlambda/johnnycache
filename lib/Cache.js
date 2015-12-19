'use strict';

const Datastore          = require('nedb');
const jummy              = require('jummy');
const pify               = require('pify');
const path               = require('path');
const _                  = require('lodash');
const EventEmitter       = require('events').EventEmitter();
const Promise            = require('pinkie-promise');
const CacheableOperation = require('./CacheableOperation');
const CachedResult       = require('./CachedResult');

class Cache extends EventEmitter {

    constructor(options) {
        options        = _.defaults(options, {
            workspace: path.join(process.cwd(), '.johnny')
        });
        this.workspace = options.workspace;
        this.index     = new Datastore({filename: path.join(this.workspace, '.index'), autoload: true});
        this.prepare().then(() => {
            this.ready = true;
            this.emit('ready');
        });
    }

    /**
     * @returns {Promise}
     */
    awaitReady() {
        return this.ready ? Promise.resolve() : new Promise((resolve) => this.once('ready', () => resolve()));
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
        return pify(this.index).remove({expires: {$ne: -1, $lte: Cache.getCurrentTime()}});
    }

    /**
     * @param {CacheableOperation} cacheableOperation
     */
    run(cacheableOperation) {
        return Promise.resolve(cacheableOperation.run())
            .then(() => {

            });
    }

    restore(cachedResult) {

    }

    /**
     * @param {CacheableOperation} cacheableOperation
     * @returns {Promise.<object>}
     */
    getQuery(cacheableOperation) {
        return cacheableOperation.getHash()
            .then((hash) => {
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
        return Promise.all([
                this.getQuery(cacheableOperation),
                this.awaitReady()
            ])
            .then((values) => pify(this.index).find(values[0]))
            .then((docs) => docs.length ? new CachedResult(cacheableOperation, docs[0]) : null);
    }

    /**
     * @param options
     * @returns {Promise}
     */
    doCached(options) {
        let cacheableOperation = new CacheableOperation(options);
        return this.getCachedResult(cacheableOperation)
            .then((cachedResult) => cachedResult !== null ? this.restore(cachedResult) : this.run(cacheableOperation));
    }
}

module.exports = Cache;
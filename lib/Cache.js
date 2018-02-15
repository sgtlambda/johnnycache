'use strict';

const assert        = require('assert');
const del           = require('del');
const extrakt       = require('extrakt');
const mkdirp        = require('make-dir');
const path          = require('path');
const pathExists    = require('path-exists');
const parseFilesize = require('filesize-parser');
const _             = require('lodash');
const EventEmitter  = require('events').EventEmitter;
const Promise       = require('bluebird');

const Query             = require('./Query');
const Operation         = require('./Operation');
const Result            = require('./Result');
const RestoredFromCache = require('./RestoredFromCache');
const Index             = require('./Index');
const Runner            = require('./Runner');

const getRedundantResults = require('./util/getRedundantResults');

/**
 * @event run({operation})
 * Fired when no cached result is found and thus the callback is ran
 *
 * @event restore({result, operation})
 * Fired when a cached result is found, before it's restored
 *
 * @event store({operation)}
 * Fired after a cacheable operation has completed running, when the result is about to be stored
 *
 * @event sync()
 * Fired when the index is refreshed / synchronised with the filesystem
 *
 * @event cleanup({current, allowed, removing})
 * Fired when the cache exceeds the maximum allowed size and redundant results are removed from the index
 *
 * @event query({values})
 * Fired when the cache index is queried
 *
 * @event saved({result, operation})
 * Fired when a result was saved to the cache
 */
class Cache extends EventEmitter {

    constructor({

        compress = false,
        workingDirectory = process.cwd(),
        maxSize = '512mb',
        workspace = null,
        dataStore = null,

    } = {}) {

        super();

        this.operationDefaults = {workingDirectory, compress};
        this.workingDirectory  = workingDirectory;
        this.workspace         = workspace || path.join(this.workingDirectory, '.johnny');
        this.dataStore         = dataStore || path.join(this.workspace, '.index.json');
        this.maxSize           = parseFilesize(maxSize);
        this.index             = new Index({filename: this.dataStore});
        this.ready             = this.sync();
    }

    /**
     * Makes sure the cache size does not exceed the maximum allowed size, removing the most irrelevant rows from the DB
     * @param {Number} [freeUp = 0] The number of bytes to additionally clear up
     * @returns {[]} The results that were removed
     */
    maintainMaxSize(freeUp = 0) {

        const docs = this.index.all();

        const results         = _.map(docs, doc => Result.fromDocument({}, doc));
        const totalCacheSize  = _.sumBy(results, result => result.fileSize) + freeUp;
        const resultsToRemove = getRedundantResults(results, this.maxSize, totalCacheSize);

        if (_.size(resultsToRemove)) {
            this.emit('cleanup', {current: totalCacheSize, allowed: this.maxSize, removing: resultsToRemove});
            this.removeResults(resultsToRemove);
        }

        return resultsToRemove;
    }

    /**
     * Remove the given results from the index
     * @param {Result[]} results
     */
    removeResults(results) {
        const ids = _.map(results, 'id');
        return this.index.removeById(ids);
    }

    /**
     * Returns a promise for the preparation of the cache
     * @returns {Promise}
     */
    awaitReady() {
        if (this.ready === null) this.ready = this.sync();
        return this.ready;
    }

    /**
     * Prepare the cache
     * Runs some update / refresh operations (usually performed on instantiation)
     * @returns {this}
     */
    async sync() {
        this.emit('sync');

        if (!this.mkdirp) {
            // Make sure the workspace directory exists
            await mkdirp(this.workspace);
            this.mkdirp = true;
        }

        // Synchronize the index database
        await this.index.sync();

        // Remove expired rows from the index
        this.index.removeExpired();

        // Remove irrelevant rows from the index if the max size is exceeded
        this.maintainMaxSize();

        // Delete all cache files that are not represented in the index
        await this.purgeUntracked();

        return this;
    }

    /**
     * Remove files for which there is no related row in the index
     * @returns {Promise}
     */
    purgeUntracked() {
        const docs      = this.index.all();
        const wildcard  = path.join(this.workspace, '*.*');
        const whitelist = _.map(docs, doc => `!${this.getAbsolutePath(doc.filename)}`);

        return del([wildcard].concat(whitelist), {force: true});
    }

    /**
     * Get the absolute path for the given file name
     * @param {string} filename
     * @return {string}
     */
    getAbsolutePath(filename) {
        assert(filename);
        return path.join(this.workspace, filename);
    }

    /**
     * Insert the given result into the index
     * @param result
     */
    insert(result) {
        result.id = this.index.insert(result.toDocument()).id;
    }

    /**
     * Restores the result for the given operation
     * @param operation
     * @returns {Promise.<RestoredFromCache>}
     */
    async restore(operation) {
        const result = await this.getResult(operation);
        let start    = Date.now();
        this.emit('restore', {result, operation});
        await extrakt(this.getAbsolutePath(result.filename), result.workingDirectory);
        const runtime = Date.now() - start;
        return new RestoredFromCache({result, runtime});
    }

    /**
     * Try to find a cached result for the given operation
     * @param {Operation} operation
     * @returns {Result}
     */
    async getResult(operation) {

        const [query] = await Promise.all([
            Query.fromOperation(operation),
            this.awaitReady()
        ]);

        this.emit('query', {query: query.constraints});

        const doc = this.index.findOne(query.predicate);

        return (doc && await pathExists(this.getAbsolutePath(doc.filename))) ?
            Result.fromDocument(operation, doc) :
            null;
    }

    /**
     * Check whether there is a result available for the given intent
     * @param {Operation} operation
     * @returns {Promise.<boolean>}
     */
    async hasResult(operation) {
        return !!(await this.getResult(operation));
    }

    /**
     * Convert the given intent to an operation
     * @param {Intent} intent
     * @returns {Operation}
     */
    convertIntent(intent) {
        return new Operation(intent.run, {...this.operationDefaults, ...intent.options});
    }

    /**
     * @TODO we need a naming difference between "run" and "run"..
     * This method will actually RUN the operation runner function
     * Whereas "Cache.run" will either restore or run the operation
     * @param operation
     * @returns {SavedToCache}
     */
    runOperation(operation) {
        return (new Runner({cache: this, operation})).run();
    }

    /**
     * Convert the given intent and run the resulting operation
     * @param {Intent} intent
     * @returns {SavedToCache|RestoredFromCache}
     */
    async run(intent) {
        const operation = this.convertIntent(intent);
        if (await this.hasResult(operation)) return this.restore(operation);
        else return this.runOperation(operation);
    }
}

module.exports = Cache;
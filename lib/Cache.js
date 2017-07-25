'use strict';

const assert         = require('assert');
const promiseRetry   = require('promise-retry');
const zlib           = require('zlib');
const del            = require('del');
const nectar         = require('nectar');
const extrakt        = require('extrakt');
const pify           = require('pify');
const mkdirp         = require('make-dir');
const path           = require('path');
const fs             = require('fs');
const pathExists     = require('path-exists');
const filesizeParser = require('filesize-parser');
const defaults       = require('defa');
const _              = require('lodash');
const EventEmitter   = require('events').EventEmitter;
const Promise        = require('bluebird');
const StreamCounter  = require('stream-counter');

const getRedundantResults      = require('./util/getRedundantResults');
const streamToMultiple         = require('./util/streamToMultiple');
const basenameWithoutExtension = require('./util/basenameWithoutExtension');

const CacheableOperation = require('./CacheableOperation');
const CachedResult       = require('./CachedResult');
const StoringResult      = require('./StoringResult');
const RestoredFromCache  = require('./RestoredFromCache');
const SavedToCache       = require('./SavedToCache');
const Index              = require('./Index');

/**
 * @event run({cacheableOperation})
 * Fired when no cached result is found and thus the callback is ran
 *
 * @event restore({cachedResult, cacheableOperation})
 * Fired when a cached result is found, before it's restored
 *
 * @event store({cacheableOperation)}
 * Fired after a cacheable operation has completed running, when the result is about to be stored
 *
 * @event sync
 * Fired when the index is refreshed / synchronised with the filesystem
 *
 * @event cleanup({current, allowed, removing})
 * Fired when the cache exceeds the maximum allowed size and redundant results are removed from the index
 *
 * @event query({values})
 * Fired when the cache index is queried
 *
 * @event saved({cachedResult, cacheableOperation})
 * Fired when a result was saved to the cache
 */
class Cache extends EventEmitter {

    constructor(options = {}) {
        super();
        defaults(options, {
            compress:         false,
            lazyLoad:         false,
            workingDirectory: process.cwd()
        }, options => ({
            workspace: path.join(options.workingDirectory, '.johnny'),
            maxSize:   '512mb'
        }), options => ({
            maxSizeBytes: () => filesizeParser(options.maxSize),
            dataStore:    () => path.join(options.workspace, '.index.json')
        }));
        this.compress         = options.compress;
        this.lazyLoad         = options.lazyLoad;
        this.workspace        = options.workspace;
        this.workingDirectory = options.workingDirectory;
        this.maxSize          = options.maxSizeBytes;
        this.index            = new Index({filename: options.dataStore});
        this.ready            = this.lazyLoad ? null : this.sync();
    }

    /**
     * Makes sure the cache size does not exceed the maximum allowed size, removing the most irrelevant rows from the DB
     * @param {Number} [freeUp = 0] The number of bytes to additionally clear up
     * @returns {[]} The results that were removed
     */
    maintainMaxSize(freeUp = 0) {

        const docs = this.getAllDocs();

        const cachedResults   = _.map(docs, doc => CachedResult.fromDocument(null, doc));
        const totalCacheSize  = _.sumBy(cachedResults, cachedResult => cachedResult.fileSize) + freeUp;
        const resultsToRemove = getRedundantResults(cachedResults, this.maxSize, totalCacheSize);

        if (_.size(resultsToRemove)) {
            this.emit('cleanup', {current: totalCacheSize, allowed: this.maxSize, removing: resultsToRemove,});
            this.removeResults(resultsToRemove);
        }

        return resultsToRemove;
    }

    /**
     * Remove the given results from the index
     * @param {CachedResult[]} cachedResults
     */
    removeResults(cachedResults) {
        const ids = _.map(cachedResults, 'id');
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
        this.untrackExpired();

        // Remove irrelevant rows from the index if the max size is exceeded
        this.maintainMaxSize();

        // Delete all cache files that are not represented in the index
        await this.purgeUntracked();

        return this;
    }

    /**
     * Remove expired row from the index
     */
    untrackExpired() {
        return this.index.removeExpired();
    }

    /**
     * Gets all documents from the index
     * @returns {array}
     */
    getAllDocs() {
        return this.index.all();
    }

    /**
     * Remove files for which there is no related row in the index
     * @returns {Promise}
     */
    async purgeUntracked() {

        const docs = this.getAllDocs();

        const wildcard = path.join(this.workspace, '*.*');

        const whitelist = _.map(docs, doc => `!${this.getAbsolutePath(doc.fileName)}`);

        return del([wildcard].concat(whitelist), {force: true});
    }

    /**
     * Increment the suffix of the filename on the given cachedResult
     * until no other cachedResult with the same filename exists
     *
     * @param {CachedResult} cachedResult
     * @returns {Promise}
     */
    async incrementFilename(cachedResult) {

        let updatedFilename;
        let baseName  = basenameWithoutExtension(cachedResult.fileName);
        let ext       = path.extname(cachedResult.fileName);
        let increment = 0;

        await promiseRetry(async retry => {
            updatedFilename = baseName + (increment ? ('-' + increment) : '') + ext;
            let fileName    = this.getAbsolutePath(updatedFilename);
            const exists    = await pathExists(fileName);
            if (exists) {
                increment++;
                retry(new Error('file exists'));
            }
        }, {retries: 100, minTimeout: 0});

        cachedResult.fileName = updatedFilename;
        return cachedResult;
    }

    /**
     * Get the absolute path for the given file name
     * @param {string} fileName
     * @return {string}
     */
    getAbsolutePath(fileName) {
        assert(fileName);
        return path.join(this.workspace, fileName);
    }

    /**
     * Creates a new CachedResult object for saving
     * @param op
     * @returns {Promise.<CachedResult>}
     */
    async prepareResult(op) {
        const cachedResult = new CachedResult(op);
        await cachedResult.assignHashes(op);
        cachedResult.assignFilename(op);
        await this.incrementFilename(cachedResult);
        return cachedResult;
    }

    /**
     * Create a writestream for the archive corresponding to the given result
     * @param {CachedResult} result
     * @returns {*}
     */
    createWritestream(result) {

        const writeStream = fs.createWriteStream(this.getAbsolutePath(result.fileName));

        return result.compress ? zlib.createGzip().pipe(writeStream) : writeStream;
    }

    /**
     * Perform the actual archiving operation, writing the
     * files at the output of the given cacheable operation to the destination archive file
     * @param cacheableOperation
     * @param {CachedResult} result
     * @returns {Promise.<void>}
     */
    async writeArchive({cacheableOperation, result}) {

        // Create a stream to write the archive to
        const archive = this.createWritestream(result);

        // Use a StreamCounter to keep track of the archive filesize
        const counter = new StreamCounter();

        const target = streamToMultiple([archive, counter]);

        // Perform the actual archiving (tarring)
        await nectar(cacheableOperation.output, target, {cwd: cacheableOperation.workingDirectory});

        // Assign file size on the result
        result.fileSize = counter.bytes;
    }

    /**
     * Save the result of the given operation to cache
     * @param {CacheableOperation} cacheableOperation
     * @returns {Promise.<SavedToCache>}
     */
    async storeResult(cacheableOperation) {

        let startSave = Date.now();
        const result  = await this.prepareResult(cacheableOperation);

        this.emit('store', {cacheableOperation});

        await this.writeArchive({cacheableOperation, result});

        const inserted = this.index.insert(result.toDocument());

        result.id = inserted.id;

        await this.sync();

        this.emit('saved', {cacheableOperation, cachedResult: result});
        return new SavedToCache(cacheableOperation.runtime, Date.now() - startSave, result);
    }

    /**
     * Run the cacheable operation and save the result to the cache
     * @param {CacheableOperation} cacheableOperation
     * @return {Promise.<StoringResult|SavedToCache>} An instance of either StoringResult or SavedToCache,
     * depending on the value of options.awaitStore passed to Cache.doCached
     */
    async run(cacheableOperation) {

        this.emit('run', {cacheableOperation});

        await this.awaitReady();

        await cacheableOperation.run();

        const storingResult = new StoringResult(this.storeResult(cacheableOperation), cacheableOperation);

        return cacheableOperation.awaitStore ? storingResult.savedToCache : storingResult;
    }

    /**
     * Restores the given cached result
     * @param cachedResult
     * @param {CacheableOperation} [cacheableOperation = null] The source CacheableOperation "query"
     * @returns {Promise.<RestoredFromCache>}
     */
    async restore(cachedResult, cacheableOperation = null) {
        this.emit('restore', {cachedResult, cacheableOperation});

        let start = Date.now();

        await extrakt(this.getAbsolutePath(cachedResult.fileName), cachedResult.workingDirectory);

        return new RestoredFromCache(cachedResult, Date.now() - start);
    }

    /**
     * Generates the filter callback for retreiving the appropriate cached result document
     * @param {CacheableOperation} cacheableOperation
     * @returns {function}
     */
    static async getQuery(cacheableOperation) {

        const [fileHash, outputHash] = await Promise.all([
            cacheableOperation.getFileHash(),
            cacheableOperation.getOutputHash()
        ]);

        const filter = {
            fileHash,
            outputHash,
            action: cacheableOperation.action,
        };

        const query = doc => {
            if (!_.isMatch(doc, filter)) return false;
            const {expires} = doc;
            return !(expires !== -1 && expires <= Date.now());
        };

        query.filter = filter;

        return query;
    }

    /**
     * @param {CacheableOperation} cacheableOperation
     * @returns {Promise.<object|null>}
     */
    async getCachedResult(cacheableOperation) {

        const [query] = await Promise.all([
            Cache.getQuery(cacheableOperation),
            this.awaitReady()
        ]);

        this.emit('query', {query: query.filter});

        const doc = this.index.findOne(query);

        return doc ? CachedResult.fromDocument(cacheableOperation, doc) : null;
    }

    /**
     * Checks whether the cached result has a corresponding file
     * If the result file does not exist or null is given, the promise will resolve to null
     * @param {Object|CachedResult|null} cachedResult
     * @returns {Boolean}
     */
    async resultExists(cachedResult) {
        if (cachedResult === null) return false;
        try {
            await pify(fs.access)(this.getAbsolutePath(cachedResult.fileName));
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * @param {function} run
     * @param {object} options
     * @returns {Promise.<StoringResult|SavedToCache|RestoredFromCache>}
     */
    async doCached(run, options) {

        let cacheableOperation = new CacheableOperation(run, defaults(options, {
            compress:         this.compress,
            workingDirectory: this.workingDirectory
        }));

        let cachedResult = await this.getCachedResult(cacheableOperation);

        if (await this.resultExists(cachedResult)) {
            return this.restore(cachedResult, cacheableOperation);
        } else {
            return this.run(cacheableOperation);
        }
    }
}

module.exports                   = Cache;
module.exports.StoringResult     = StoringResult;
module.exports.SavedToCache      = SavedToCache;
module.exports.RestoredFromCache = RestoredFromCache;
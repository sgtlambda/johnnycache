'use strict';

const promiseRetry   = require('promise-retry');
const zlib           = require('zlib');
const del            = require('del');
const nectar         = require('nectar');
const extrakt        = require('extrakt');
const pify           = require('pify');
const mkdirp         = pify(require('mkdirp'));
const path           = require('path');
const fs             = require('fs');
const pathExists     = require('path-exists');
const filesizeParser = require('filesize-parser');
const defaults       = require('defa');
const _              = require('lodash');
const EventEmitter   = require('events').EventEmitter;
const Promise        = require('bluebird');
const StreamCounter  = require('stream-counter');

const CacheableOperation  = require('./CacheableOperation');
const CachedResult        = require('./CachedResult');
const getRedundantResults = require('./util/getRedundantResults');
const streamToMultiple    = require('./util/streamToMultiple');
const StoringResult       = require('./StoringResult');
const RestoredFromCache   = require('./RestoredFromCache');
const SavedToCache        = require('./SavedToCache');
const Index               = require('./Index');

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

    constructor(options) {
        super();
        options = _.isObject(options) ? options : {};
        defaults(options, {
            compress:         false,
            lazyLoad:         false,
            workingDirectory: process.cwd()
        }, options => ({
            workspace: path.join(options.workingDirectory, '.johnny'),
            maxSize:   '512mb'
        }), options => ({
            maxSizeBytes: () => filesizeParser(options.maxSize),
            dataStore:    () => path.join(options.workspace, '.index')
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
     * @returns {Promise}
     */
    maintainMaxSize(freeUp) {
        if (!freeUp) freeUp = 0;
        return this.getAllDocs()
            .then(docs => _.map(docs, doc => CachedResult.fromDocument(null, doc)))
            .then(cachedResults => {
                let totalCacheSize  = _.sumBy(cachedResults, cachedResult => cachedResult.fileSize) + freeUp;
                let resultsToRemove = getRedundantResults(cachedResults, this.maxSize, totalCacheSize);
                if (_.size(resultsToRemove)) {
                    this.emit('cleanup', {current: totalCacheSize, allowed: this.maxSize, removing: resultsToRemove,});
                    return this.removeResults(resultsToRemove);
                }
            });
    }

    /**
     * Remove the given results from the index
     * @param {CachedResult[]} cachedResults
     */
    removeResults(cachedResults) {
        return this.index.Result.destroy({where: {id: {$in: _.map(cachedResults, 'id')}}});
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
     * @returns {Promise.<this>}
     */
    sync() {
        this.emit('sync');

        // Make sure the workspace directory exists
        return mkdirp(this.workspace)

        // Synchronize the index database
            .then(() => this.index.sync())

            // Remove expired rows from the index
            .then(() => this.untrackExpired())

            // Remove irrelevant rows from the index if the max size is exceeded
            .then(() => this.maintainMaxSize())

            // Delete all cache files that are not represented in the index
            .then(() => this.purgeUntracked())

            // Return this
            .then(() => this);
    }

    /**
     * Remove expired row from the index
     * @returns {Promise}
     */
    untrackExpired() {
        return this.index.Result.destroy({where: {expires: {ne: -1, lte: Date.now()}}});
    }

    /**
     * Gets all documents from the index
     * @returns {Promise}
     */
    getAllDocs() {
        return this.index.Result.findAll();
    }

    /**
     * Remove files for which there is no related row in the index
     * @returns {Promise}
     */
    async purgeUntracked() {

        const docs = await this.getAllDocs();

        const globs = [path.join(this.workspace, '*.*')].concat(_.map(docs, doc => {
            return '!' + this.getStorageLocation(CachedResult.fromDocument(null, doc));
        }));

        return del(globs, {force: true});
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
        let baseName  = path.basename(cachedResult.fileName).substring(0, path.basename(cachedResult.fileName).lastIndexOf('.'));
        let ext       = path.extname(cachedResult.fileName);
        let increment = 0;

        await promiseRetry(async retry => {
            updatedFilename = baseName + (increment ? ('-' + increment) : '') + ext;
            let fileName    = this.getStorageLocation(updatedFilename);
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
     * Get the storage location path for the given object (CachedResult, SavedToCache, RestoredFromCache or string)
     * @param {CachedResult|SavedToCache|RestoredFromCache|string} obj
     * @return {string}
     */
    getStorageLocation(obj) {
        if (obj instanceof SavedToCache || obj instanceof RestoredFromCache)
            obj = obj.cachedResult;
        if (obj instanceof CachedResult)
            obj = obj.fileName;
        return path.join(this.workspace, obj);
    }

    /**
     * Creates a new CachedResult object for saving
     * @param cacheableOperation
     * @returns {Promise.<CachedResult>}
     */
    async prepareResult(cacheableOperation) {

        const cachedResult = CachedResult.createNew(cacheableOperation);

        await cachedResult.setHashes(cacheableOperation);

        await this.incrementFilename(cachedResult);

        return cachedResult;
    }

    /**
     * Create a writestream for the archive corresponding to the given operation and its result
     * @param cacheableOperation
     * @param cachedResult
     * @returns {*}
     */
    createWritestream(cacheableOperation, cachedResult) {

        const writeStream = fs.createWriteStream(this.getStorageLocation(cachedResult));

        if (cacheableOperation.compress) return zlib.createGzip().pipe(writeStream);

        else return writeStream;
    }

    /**
     * Perform the actual archiving operation, writing the
     * files at the output of the given cacheable operation to the destination archive file
     * @param cacheableOperation
     * @param cachedResult
     * @returns {Promise.<void>}
     */
    async writeArchive({cacheableOperation, cachedResult}) {

        // Create a stream to write the archive to
        const archive = this.createWritestream(cacheableOperation, cachedResult);

        // Use a StreamCounter to keep track of the archive filesize
        const counter = new StreamCounter();

        const target = streamToMultiple([archive, counter]);

        // Perform the actual archiving (tarring)
        await nectar(cacheableOperation.output, target, {cwd: cacheableOperation.workingDirectory});

        cachedResult.fileSize = counter.bytes;
    }

    /**
     * Save the result of the given operation to cache
     * @param {CacheableOperation} cacheableOperation
     * @returns {Promise.<SavedToCache>}
     */
    async storeResult(cacheableOperation) {

        let startSave      = Date.now();
        const cachedResult = await this.prepareResult(cacheableOperation);

        this.emit('store', {cacheableOperation});

        await this.writeArchive({cacheableOperation, cachedResult});

        const inserted = await this.index.Result.create(cachedResult.getDocument());

        cachedResult.id = inserted.id;

        await this.sync();

        this.emit('saved', {cacheableOperation, cachedResult});
        return new SavedToCache(cacheableOperation.runtime, Date.now() - startSave, cachedResult);
    }

    /**
     * Run the cacheable operation and save the result to the cache
     * @param {CacheableOperation} cacheableOperation
     * @return {Promise.<StoringResult|SavedToCache>} An instance of either StoringResult or SavedToCache,
     * depending on the value of options.awaitStore passed to Cache.doCached
     */
    run(cacheableOperation) {
        this.emit('run', {cacheableOperation});
        return this.awaitReady()
            .then(() => cacheableOperation.run())
            .then(() => new StoringResult(this.storeResult(cacheableOperation), cacheableOperation))
            .then(storingResult => cacheableOperation.awaitStore ? storingResult.savedToCache : storingResult);
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

        await extrakt(this.getStorageLocation(cachedResult), cachedResult.workingDirectory);

        return new RestoredFromCache(cachedResult, Date.now() - start);
    }

    /**
     * Generates the query for retreiving the appropriate cached result document
     * @param {CacheableOperation} cacheableOperation
     * @returns {Promise.<object>}
     */
    static async getQuery(cacheableOperation) {

        const [fileHash, outputHash] = await Promise.all([
            cacheableOperation.getFileHash(),
            cacheableOperation.getOutputHash()
        ]);

        return {
            fileHash,
            outputHash,
            action: cacheableOperation.action,
            $or:    [{expires: -1}, {expires: {$gt: Date.now()}}]
        };
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

        this.emit('query', {query});
        const doc = await this.index.Result.findOne({where: query});

        return doc ? CachedResult.fromDocument(cacheableOperation, doc) : null;
    }

    /**
     * Checks whether the cached result has a corresponding file
     * If the result file does not exist or null is given, the promise will resolve to null
     * @param {CachedResult|null} cachedResult
     * @returns {Boolean}
     */
    async resultExists(cachedResult) {
        if (cachedResult === null) return false;
        try {
            await pify(fs.access)(this.getStorageLocation(cachedResult));
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
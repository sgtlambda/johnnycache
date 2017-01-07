'use strict';

const promiseRetry        = require('promise-retry');
const zlib                = require('zlib');
const del                 = require('del');
const nectar              = require('nectar');
const extrakt             = require('extrakt');
const pify                = require('pify');
const mkdirp              = pify(require('mkdirp'));
const path                = require('path');
const fs                  = require('fs');
const pathExists          = require('path-exists');
const filesizeParser      = require('filesize-parser');
const defaults            = require('defa');
const _                   = require('lodash');
const EventEmitter        = require('events').EventEmitter;
const Promise             = require('bluebird');
const CacheableOperation  = require('./CacheableOperation');
const CachedResult        = require('./CachedResult');
const getRedundantResults = require('./util/getRedundantResults');
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
                let totalCacheSize = _.sumBy(cachedResults, cachedResult => cachedResult.fileSize) + freeUp;
                let remove         = getRedundantResults(cachedResults, this.maxSize, totalCacheSize);
                if (remove.length)
                    this.emit('cleanup', {current: totalCacheSize, allowed: this.maxSize, removing: remove,});
                return remove.length ? this.removeResults(remove) : Promise.resolve();
            });
    }

    /**
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
     * Run some update / refresh operations (usually performed on instantiation)
     * @returns {Promise}
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
            .then(() => this.purgeUntracked());
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
    purgeUntracked() {
        return this.getAllDocs()
            .then(docs => [path.join(this.workspace, '*.*')].concat(_.map(docs, doc => {
                return '!' + this.getStorageLocation(CachedResult.fromDocument(null, doc));
            })))
            .then(globs => del(globs, {force: true}));
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
    prepareResult(cacheableOperation) {
        const cachedResult = CachedResult.createNew(cacheableOperation);
        return cachedResult.setHashes(cacheableOperation)
            .then(cachedResult => this.incrementFilename(cachedResult));
    }

    /**
     * Save the result of the given operation to cache
     * @param {CacheableOperation} cacheableOperation
     * @returns {Promise.<SavedToCache>}
     */
    storeResult(cacheableOperation) {
        let cachedResult;
        let startSave = Date.now();
        return this.prepareResult(cacheableOperation)
            .then(result => {
                cachedResult = result;
                this.emit('store', {cacheableOperation});
                let writeStream = fs.createWriteStream(this.getStorageLocation(cachedResult));
                if (cacheableOperation.compress) writeStream = zlib.createGzip().pipe(writeStream);
                return nectar(cacheableOperation.output, writeStream, {cwd: cacheableOperation.workingDirectory});
            })
            .then(() => this.assignFileSize(cachedResult))
            .then(() => this.index.Result.create(cachedResult.getDocument()))
            .then(inserted => cachedResult.id = inserted.id)
            .then(() => this.sync())
            .then(() => {
                this.emit('saved', {cacheableOperation, cachedResult});
                return new SavedToCache(cacheableOperation.runtime, Date.now() - startSave, cachedResult);
            });
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
    restore(cachedResult, cacheableOperation = null) {
        this.emit('restore', {cachedResult, cacheableOperation});
        let start = Date.now();
        return extrakt(this.getStorageLocation(cachedResult), cachedResult.workingDirectory)
            .then(() => new RestoredFromCache(cachedResult, Date.now() - start));
    }

    /**
     * Generates the query for retreiving the appropriate cached result document
     * @param {CacheableOperation} cacheableOperation
     * @returns {Promise.<object>}
     */
    getQuery(cacheableOperation) {
        return Promise.all([
            cacheableOperation.getFileHash(),
            cacheableOperation.getOutputHash()
        ])
            .then(hashes => {
                return {
                    fileHash:   hashes[0],
                    outputHash: hashes[1],
                    action:     cacheableOperation.action,
                    $or:        [{expires: -1}, {expires: {$gt: Date.now()}}]
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
            .then(values => {
                this.emit('query', {query: values[0]});
                return this.index.Result.findOne({where: values[0]});
            })
            .then(doc => doc ? CachedResult.fromDocument(cacheableOperation, doc) : null);
    }

    /**
     * Check the file size of the stored file related to the cached result and assign it to the object
     * @param {CachedResult} cachedResult
     * @returns {Promise}
     */
    assignFileSize(cachedResult) {
        return pify(fs.stat)(this.getStorageLocation(cachedResult))
            .then(stat => {
                cachedResult.fileSize = stat.size;
            }, () => null);
    }

    /**
     * Checks whether the cached result has a corresponding file
     * If the result file does not exist or null is given, the promise will resolve to null
     * @param {CachedResult|null} cachedResult
     * @returns {Promise.<CachedResult|null>}
     */
    ensureExists(cachedResult) {
        if (cachedResult === null) return Promise.resolve(null);
        return pify(fs.access)(this.getStorageLocation(cachedResult))
            .then(() => cachedResult, () => null);
    }

    /**
     * @param {function} run
     * @param {object} options
     * @returns {Promise.<StoringResult|SavedToCache|RestoredFromCache>}
     */
    doCached(run, options) {
        let cacheableOperation = new CacheableOperation(run, defaults(options, {
            compress:         this.compress,
            workingDirectory: this.workingDirectory
        }));
        return this.getCachedResult(cacheableOperation)
            .then(cachedResult => this.ensureExists(cachedResult))
            .then(cachedResult => cachedResult !== null ?
                this.restore(cachedResult, cacheableOperation) :
                this.run(cacheableOperation)
            );
    }
}

module.exports                   = Cache;
module.exports.StoringResult     = StoringResult;
module.exports.SavedToCache      = SavedToCache;
module.exports.RestoredFromCache = RestoredFromCache;
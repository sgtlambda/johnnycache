'use strict';

const promiseRetry       = require('promise-retry');
const zlib               = require('zlib');
const del                = require('del');
const nectar             = require('nectar');
const extrakt            = require('extrakt');
const Datastore          = require('nedb');
const pify               = require('pify');
const path               = require('path');
const fs                 = require('fs');
const pathExists         = require('path-exists');
const filesizeParser     = require('filesize-parser');
const defaults           = require('defa');
const _                  = require('lodash');
const EventEmitter       = require('events').EventEmitter;
const Promise            = require('bluebird');
const CacheableOperation = require('./CacheableOperation');
const CachedResult       = require('./CachedResult');

class Cache extends EventEmitter {

    constructor(options) {
        super();
        options = _.isObject(options) ? options : {};
        defaults(options, {
            workspace: path.join(process.cwd(), '.johnny'),
            maxSize:   '512mb'
        }, options => {
            return {
                maxSizeBytes: () => filesizeParser(options.maxSize),
                dataStore:    () => path.join(options.workspace, '.index')
            }
        });
        this.workspace = options.workspace;
        this.maxSize   = options.maxSizeBytes;
        this.index     = new Datastore({filename: options.dataStore, autoload: true});
        this.ready     = this.sync();
    }

    /**
     * Get the relevance score for the given cachedResult (based on this score, irrelevant entries are removed)
     * @param cachedResult
     * @returns {Promise.<Number>}
     */
    getScoreFor(cachedResult) {

        // Substract one point for every month in age
        let age = cachedResult.created / (31 * 24 * 60 * 60 * 1000);

        // Substract one point for every order of magnitude in filesize
        let size = -Math.log10(cachedResult.fileSize);

        // Add two points for every order of magnitude in operation runtime
        let runtime = Math.log10(cachedResult.runtime) * 2;

        // Remove 20 points if there is a newer entry with an equivalent action name in the index
        let redundant = pify(this.index.find.bind(this.index))({
            action:  cachedResult.action,
            created: {$gt: cachedResult.created}
        }).then(docs => docs.length ? -20 : 0);

        let factors = [age, size, runtime, redundant];

        return _.reduce(_.map(factors, score => Promise.resolve(score)), (queue, score) => {
            return queue.then(currentScore => score.then(score => currentScore + score));
        }, Promise.resolve(0));
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
                return Promise.map(cachedResults, cachedResult => this.getScoreFor(cachedResult).then(score => {
                    cachedResult.score = score;
                    return cachedResult;
                })).then(cachedResults => {
                    let sortedCacheResults = _.sortBy(cachedResults, 'score');
                    let remove             = [];
                    while (totalCacheSize > this.maxSize) {
                        let removeOne = sortedCacheResults.shift(sortedCacheResults);
                        remove.push(removeOne);
                        totalCacheSize -= removeOne.fileSize;
                    }
                    return remove.length ? this.removeResults(remove) : Promise.resolve();
                })
            });
    }

    /**
     * @param {CachedResult[]} cachedResults
     */
    removeResults(cachedResults) {
        return pify(this.index.remove.bind(this.index))({
            "_id": {$in: _.map(cachedResults, cachedResult => cachedResult._id)}
        });
    }

    /**
     * Returns a promise for the preparation of the cache
     * @returns {Promise}
     */
    awaitReady() {
        return this.ready;
    }

    /**
     * Run some update / refresh operations
     * @returns {Promise}
     */
    sync() {
        return this.untrackExpired()
            .then(() => this.maintainMaxSize())
            .then(() => this.purgeUntracked());
    }

    /**
     * Remove expired row from the index
     * @returns {Promise}
     */
    untrackExpired() {
        return pify(this.index.remove.bind(this.index))({expires: {$ne: -1, $lte: Date.now()}});
    }

    /**
     * Gets all documents from the index
     * @returns {Promise}
     */
    getAllDocs() {
        return pify(this.index.find.bind(this.index))({});
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
            .then(globs => del(globs));
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
        const cachedResult = CachedResult.createNew(cacheableOperation);
        return cachedResult.setHashes(cacheableOperation)
            .then(cachedResult => this.incrementFilename(cachedResult));
    }

    /**
     * @param {CacheableOperation} cacheableOperation
     * @return {Promise.<CachedResult>}
     */
    run(cacheableOperation) {
        let cachedResult;
        return this.awaitReady()
            .then(() => cacheableOperation.run())
            .then(() => this.prepareResult(cacheableOperation))
            .then(result => {
                cachedResult = result;
                if (cacheableOperation.onStore) cacheableOperation.onStore(cacheableOperation);
                let writeStream = fs.createWriteStream(this.getStorageLocation(cachedResult));
                if (cacheableOperation.compress) writeStream = zlib.createGzip().pipe(writeStream);
                return nectar(cacheableOperation.output, writeStream);
            })
            .then(() => this.assignFileSize(cachedResult))
            .then(() => pify(this.index.insert.bind(this.index))(cachedResult.getDocument()))
            .then(() => this.sync())
            .then(() => cachedResult);
    }

    /**
     * Restores the given cached result
     * @param cachedResult
     * @returns {Promise.<CachedResult>}
     */
    restore(cachedResult) {
        return extrakt(this.getStorageLocation(cachedResult), this.getExtractPath())
            .then(() => cachedResult);
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
            .then(values => pify(this.index.find.bind(this.index))(values[0]))
            .then(docs => docs.length ? CachedResult.fromDocument(cacheableOperation, docs[0]) : null);
    }

    /**
     * Check the file size of the storage file related to the cached result and assign it to the object
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
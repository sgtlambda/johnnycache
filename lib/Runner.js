'use strict';

const fs   = require('fs');
const zlib = require('zlib');

const nectar        = require('nectar');
const StreamCounter = require('stream-counter');
const slug          = require('slugs');

const Result       = require('./Result');
const SavedToCache = require('./SavedToCache');

const splitStream       = require('./util/splitStream');
const incrementFilename = require('./util/incrementFilename');

class Runner {

    constructor({cache, operation}) {
        this.cache     = cache;
        this.operation = operation;
    }

    /**
     * Prepares a new Result object for saving
     */
    static async prepareResult({operation, cache}) {
        const result = new Result(operation);

        const {inputHash, outputHash} = await operation.getHashes();
        result.inputHash              = inputHash;
        result.outputHash             = outputHash;

        const basename = `${slug(result.action).substring(0, 32)}-${result.inputHash.substring(0, 8)}`;
        const ext      = operation.compress ? 'tar.gz' : 'tar';
        const filename = `${basename}.${ext}`;

        result.filename = await incrementFilename({
            filename,
            getAbsolutePath: p => cache.getAbsolutePath(p),
        });

        return result;
    }

    /**
     * Save the result of the given operation to cache
     * @returns {SavedToCache}
     */
    async storeResult() {
        let startSave = Date.now();
        this.result   = await Runner.prepareResult(this);

        this.cache.emit('store', {operation: this.operation});
        await this.writeArchive();
        this.cache.insert(this.result);
        await this.cache.sync();
        this.cache.emit('saved', {operation: this.operation, result: this.result});

        return new SavedToCache({
            operationRuntime: this.operation.runtime,
            storageRuntime:   Date.now() - startSave,
            result:           this.result,
        });
    }

    /**
     * Create a writeStream for the archive
     * @returns {*}
     */
    createWriteStream() {
        const destination = this.cache.getAbsolutePath(this.result.filename);
        const writeStream = fs.createWriteStream(destination);
        return this.result.compress ? zlib.createGzip().pipe(writeStream) : writeStream;
    }

    /**
     * Perform the actual archiving operation, writing the
     * files at the output of the given cacheable operation to the destination archive file
     * @returns {Promise.<void>}
     */
    async writeArchive() {

        // Create a stream to write the archive to
        const archive = this.createWriteStream();

        // Use a StreamCounter to keep track of the archive filesize
        const counter = new StreamCounter();

        // Perform the actual archiving (tarring)
        await nectar(this.operation.output, splitStream([archive, counter]), {cwd: this.operation.workingDirectory});

        // Assign file size on the result
        this.result.fileSize = counter.bytes;
    }

    /**
     * Run the cacheable operation and save the result to the cache
     * @return {SavedToCache}
     */
    async run() {
        this.cache.emit('run', {operation: this.operation});
        await this.cache.awaitReady();
        await this.operation.run();
        return this.storeResult();
    }
}

module.exports = Runner;
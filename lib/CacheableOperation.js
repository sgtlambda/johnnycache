'use strict';

const {isString, defaults} = require('lodash');
const jummy                = require('jummy');
const hasha                = require('hasha');
const pTry                 = require('p-try');

class CacheableOperation {

    /**
     * @param {function} run
     * @param {object} options
     */
    constructor(run, options) {
        this._run = run;

        options = CacheableOperation._sanitizeOptions(options);

        this.action           = options.action;
        this.compress         = options.compress;
        this.input            = options.input;
        this.output           = options.output;
        this.ttl              = options.ttl;
        this.onStore          = options.onStore;
        this.awaitStore       = options.awaitStore;
        this.workingDirectory = options.workingDirectory;
        this.hash             = null;
    }

    /**
     * Execute the runner function, keeping track of the runtime
     * @returns {Promise}
     */
    async run() {
        let start = Date.now();
        await pTry(this._run);
        this.runtime = Date.now() - start;
    }

    /**
     * Retrieve the combined hash of the input files
     * @returns {Promise.<string>}
     */
    async getFileHash() {
        if (this.hash === null)
            this.hash = this.input ?
                await jummy(this.input, {wd: this.workingDirectory}) :
                '(no input)';
        return this.hash;
    }

    /**
     * Retrieve the hash of the output argument
     * @returns {Promise.<string>}
     */
    getOutputHash() {
        return hasha(this.output);
    }

    /**
     * Get both hashes as an object
     * @returns {Promise.<{fileHash: *, outputHash: *}>}
     */
    async getHashes() {
        const [fileHash, outputHash] = await Promise.all([
            this.getFileHash(),
            this.getOutputHash()
        ]);
        return {fileHash, outputHash};
    }

    static _sanitizeOptions(options) {
        if (isString(options.input)) options.input = [options.input];
        if (isString(options.output)) options.output = [options.output];

        const action = `${options.input ? options.input.join(',') : '(no input)'} > ${options.output.join(',')}`;

        options = defaults(options, {
            awaitStore: true,
            ttl:        null,
            action
        });
        return options;
    }
}

module.exports = CacheableOperation;
'use strict';

const arrify = require('arrify');
const jummy  = require('jummy');
const hasha  = require('hasha');
const pTry   = require('p-try');

class Operation {

    /**
     * @param {function} run
     * @param {object} options
     */
    constructor(run, {

        workingDirectory,
        action,
        input,
        output,
        ttl = null,
        compress = false

    } = {}) {

        this._run = run;

        this.workingDirectory = workingDirectory;
        this.action           = action || `${input ? input.join(',') : '(no input)'} > ${output.join(',')}`;
        this.input            = arrify(input);
        this.output           = arrify(output);
        this.ttl              = ttl;
        this.compress         = compress;

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
        if (!this.fileHash)
            this.fileHash = this.input ?
                await jummy(this.input, {wd: this.workingDirectory}) :
                '(no input)';
        return this.fileHash;
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
}

module.exports = Operation;
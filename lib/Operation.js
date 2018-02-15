'use strict';

const arrify = require('arrify');
const jummy  = require('jummy');
const hasha  = require('hasha');
const pTry   = require('p-try');

const isEnv = i => i.startsWith('$');

class Operation {

    /**
     * @param {Function} run
     * @param {Object} options
     */
    constructor(run, {

        workingDirectory,
        action,
        input = [],
        output = [],
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
     * Get non-ENV inputs
     */
    get inputFiles() {
        return this.input.filter(i => !isEnv(i));
    }

    /**
     * Get ENV inputs
     */
    get inputEnvs() {
        return this.input.filter(isEnv).map(i => i.substring(1));
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
        return await jummy(this.inputFiles, {wd: this.workingDirectory});
    }

    /**
     * Retrieve the values of all the input env queries
     * from the environment variables at process.env
     * @returns {Object}
     */
    getEnvs() {
        return this.inputEnvs.reduce((obj, env) => {
            obj[env] = Operation.getEnv(env);
            return obj;
        }, {});
    }

    /**
     * Get combined input hash (both files as well as env)
     * @returns {String}
     */
    async getInputHash() {
        const fileHash = await this.getFileHash();
        const envs     = this.getEnvs();
        return hasha(JSON.stringify({fileHash, envs,}));
    }

    /**
     * Get the environment variable with the given name
     * @param v
     * @returns {String}
     */
    static getEnv(v) {
        return process.env[v];
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
     * @returns {Promise.<{inputHash: *, outputHash: *}>}
     */
    async getHashes() {
        if (!this.hashes) {
            const [inputHash, outputHash] = await Promise.all([
                this.getInputHash(),
                this.getOutputHash()
            ]);

            this.hashes = {inputHash, outputHash};
        }
        return this.hashes;
    }
}

module.exports = Operation;
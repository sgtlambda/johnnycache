'use strict';

const _      = require('lodash');
const arrify = require('arrify');
const jummy  = require('jummy');
const hasha  = require('hasha');
const pTry   = require('p-try');

const isEnv = i => _.startsWith(i, '$');

class Operation {

    /**
     * @param {function} run
     * @param {object} options
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
        return _(this.input).filter(_.negate(isEnv)).value();
    }

    /**
     * Get ENV inputs
     */
    get inputEnvs() {
        return _(this.input).filter(isEnv).map(i => i.substring(1)).value();
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
     * Retrieve the combined hash of the input environment variables
     * @returns {Promise.<void>}
     */
    getEnvs() {
        const envs = {};
        _.forEach(this.inputEnvs, env => {
            envs[env] = Operation.getEnv(env);
        });
        return envs;
    }

    /**
     * Get combined input hash (both files as well as env)
     * @returns {Promise.<void>}
     */
    async getInputHash() {
        return hasha(JSON.stringify({
            fileHash: await this.getFileHash(),
            envs:     this.getEnvs(),
        }));
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
'use strict';

const jummy   = require('jummy');
const hasha   = require('hasha');
const Promise = require('pinkie-promise');
const sprintf = require('sprintf-js').sprintf;
const _       = require('lodash');

class CacheableOperation {

    /**
     * @param {function} run
     * @param {object} options
     */
    constructor(run, options) {
        this._run             = run;
        options               = CacheableOperation._sanitizeOptions(options);
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
    run() {
        let start = Date.now();
        return Promise.resolve(this._run()).then(() => {
            this.runtime = Date.now() - start;
        });
    }

    /**
     * Retrieve the combined hash of the input files
     * @returns {Promise.<string>}
     */
    getFileHash() {
        if (this.hash !== null)
            return Promise.resolve(this.hash);
        else
            return (this.input ? jummy(this.input, {
                wd: this.workingDirectory
            }) : Promise.resolve('(no input')).then(hash => {
                this.hash = hash;
                return hash;
            });
    }

    /**
     * Retrieve the hash of the output argument
     * @returns {Promise.<string>}
     */
    getOutputHash() {
        return hasha(this.output);
    }

    static _sanitizeOptions(options) {
        if (_.isString(options.input)) options.input = [options.input];
        if (_.isString(options.output)) options.output = [options.output];
        options = _.defaults(options, {
            awaitStore: true,
            ttl:        null,
            action:     sprintf('%s > %s', options.input ? options.input.join(',') : '(no input)', options.output.join(','))
        });
        return options;
    }
}

module.exports = CacheableOperation;
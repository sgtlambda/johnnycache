'use strict';

const jummy   = require('jummy');
const Promise = require('pinkie-promise');
const sprintf = require('sprintf-js').sprintf;
const _       = require('lodash');

class CacheableOperation {

    constructor(options) {
        options     = CacheableOperation._sanitizeOptions(options);
        this.action = options.action;
        this.input  = options.input;
        this.output = options.output;
        this.run    = options.run;
        this.ttl    = options.ttl;
        this.hash   = null;
    }

    /**
     * @returns {Promise.<string>}
     */
    getHash() {
        if (this.hash !== null)
            return Promise.resolve(this.hash);
        else
            return jummy(this.input).then(hash => {
                this.hash = hash;
                return hash;
            });
    }

    static _sanitizeOptions(options) {
        if (_.isString(options.input)) options.input = [options.input];
        if (_.isString(options.output)) options.input = [options.output];
        options = _.defaults(options, {
            ttl:    null,
            action: sprintf('%s > %s', options.input.join(','), options.output.join(','))
        });
        return options;
    }
}

module.exports = CacheableOperation;
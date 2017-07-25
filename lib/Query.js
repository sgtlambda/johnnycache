'use strict';

const {isMatch} = require('lodash');

const hasExpired = require('./util/hasExpired');

/**
 * Document query abstraction
 */
class Query {

    constructor(constraints) {
        this.constraints = constraints;
    }

    get predicate() {
        return doc => isMatch(doc, this.constraints) && !hasExpired(doc);
    }

    /**
     * Create a new Query instance based on the given operation
     * @param {Operation} op
     * @returns {Promise.<Query>}
     */
    static async fromOperation(op) {
        const {inputHash, outputHash} = await op.getHashes();
        return new Query({inputHash, outputHash, action: op.action});
    }
}

module.exports = Query;
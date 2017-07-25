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
     * @param {Operation} operation
     * @returns {Promise.<Query>}
     */
    static async fromOperation(operation) {
        const {inputHash, outputHash} = await operation.getHashes();
        return new Query({inputHash, outputHash, action: operation.action});
    }
}

module.exports = Query;
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
}

module.exports = Query;
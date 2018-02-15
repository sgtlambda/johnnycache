'use strict';

const _ = require('lodash');

/**
 * Get the relevance score for the given result (based on this score, irrelevant entries are removed)
 * @param {Result} result
 * @param {Result[]} [allResults]
 * @returns {Number}
 */
module.exports = (result, allResults) => {

    // Substract one point for every month in age
    const age = result.created / (31 * 24 * 60 * 60 * 1000);

    // Substract one point for every order of magnitude in filesize
    const size = -Math.log10(result.fileSize);

    // Add two points for every order of magnitude in operation runtime
    const runtime = Math.log10(result.runtime) * 2;

    // Remove 20 points if there is a newer entry with an equivalent action name in the index
    const redundant = allResults && allResults.length ? (_.some(allResults, otherResult => {
        return otherResult.action === result.action && otherResult.created > result.created;
    }) ? -20 : 0) : 0;

    // Add all factors that are a number (to protect against NaN screwing everything up)
    return _.reduce([age, size, runtime, redundant], (total, add) => _.isNumber(add) ? total + add : total, 0);
};
'use strict';

const _ = require('lodash');

/**
 * Get the relevance score for the given cachedResult (based on this score, irrelevant entries are removed)
 * @param {CachedResult} result
 * @param {CachedResult[]} [allResults]
 * @returns {Number}
 */
module.exports = (result, allResults) => {

    // Substract one point for every month in age
    let age = result.created / (31 * 24 * 60 * 60 * 1000);

    // Substract one point for every order of magnitude in filesize
    let size = -Math.log10(result.fileSize);

    // Add two points for every order of magnitude in operation runtime
    let runtime = Math.log10(result.runtime) * 2;

    // Remove 20 points if there is a newer entry with an equivalent action name in the index
    let redundant = allResults && allResults.length ? (_.some(allResults, otherResult => {
        return otherResult.action == result.action && otherResult.created > result.created;
    }) ? -20 : 0) : 0;

    return age + size + runtime + redundant;
};
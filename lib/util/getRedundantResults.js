'use strict';

const getScoreForResult = require('./getScoreForResult');
const _                 = require('lodash');

/**
 * Get the results that should be removed to maintain the maximum allowed cache size
 * @param {CachedResult[]} results
 * @param allowedMaxSize
 * @param currentTotalSize
 * @returns {CachedResult[]}
 */
module.exports = (results, allowedMaxSize, currentTotalSize) => {

    if (currentTotalSize <= allowedMaxSize) return [];

    let mappedResults = _.map(results, result => {
        var score = module.exports.getScore(result, results);
        return {result, score};
    });

    let sortedCacheResults = _.map(_.sortBy(mappedResults, 'score'), 'result');
    let remove             = [];
    while (currentTotalSize > allowedMaxSize && sortedCacheResults.length) {
        let removeOne = sortedCacheResults.shift();
        remove.push(removeOne);
        currentTotalSize -= removeOne.fileSize;
    }
    return remove;
};

module.exports.getScore = getScoreForResult;
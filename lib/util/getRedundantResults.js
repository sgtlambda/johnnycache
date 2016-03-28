'use strict';

const Promise           = require('bluebird');
const getScoreForResult = require('./getScoreForResult');
const _                 = require('lodash');

/**
 * Get the results that should be removed to maintain the maximum allowed cache size
 * @param {CachedResult[]} results
 * @param allowedMaxSize
 * @param currentTotalSize
 * @returns {Promise.<CachedResult[]>}
 */
module.exports = (results, allowedMaxSize, currentTotalSize) => {

    return Promise.map(results, cachedResult => module.exports.getScore(cachedResult, results).then(score => {
        return {
            result: cachedResult,
                    score
        };
    })).then(mappedResults => {
        let sortedCacheResults = _.map(_.sortBy(mappedResults, 'score'), 'result');
        let remove             = [];
        while (currentTotalSize > allowedMaxSize) {
            let removeOne = sortedCacheResults.shift();
            remove.push(removeOne);
            currentTotalSize -= removeOne.fileSize;
        }
        return remove;
    })
};

module.exports.getScore = getScoreForResult;
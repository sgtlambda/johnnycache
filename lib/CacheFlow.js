'use strict';

/**
 * Represents a series of Operations that can be optimized to skip
 * unneeded intermediate steps
 */
class CacheFlow {

    constructor(steps) {
        this.steps = steps;
    }
}

module.exports = CacheFlow;
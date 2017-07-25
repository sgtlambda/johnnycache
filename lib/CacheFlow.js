'use strict';

const assert = require('assert');
const _      = require('lodash');

const Step = require('./Step');

const isDependency = require('./util/isDependency');

/**
 * Represents a series of Operations that can be optimized to skip
 * unneeded intermediate steps
 */
class CacheFlow {

    constructor({cache, steps = []}) {
        assert(cache);
        this.cache = cache;
        this.steps = steps;
    }

    async evaluateIntermediateDependencies(finalStep) {

        const dependencies = _(_.clone(this.steps))
            .remove('isIntermediate')
            .filter(step => {
                if (!step.isIntermediate) return false;
                if (finalStep.index !== null && step.index > finalStep.index) return false;
                return isDependency(finalStep.operation.inputFiles, step.operation.output);
            })
            .value();

        for (let step of dependencies) {

            // The dependency has been set to "RUN" or "RESTORE" somewhere else, leave it like that.
            if (step.status === Step.STATUS_RUN || step.status === Step.STATUS_RESTORE) continue;

            // The "final step" will be restored and thus this step can be safely skipped.
            if (finalStep.status === Step.STATUS_RESTORE) {
                step.status = Step.STATUS_SKIP;
                step.forward.push(finalStep);
            }

            // If we need the results of the intermediate step, evaluate the step
            else await this.evaluateStep(step);
        }
    }

    /**
     * Set the "status" on the given step according to whether
     * a cached result is available for the operation
     * @param step
     * @returns {Promise.<void>}
     */
    async evaluateStep(step) {
        step.status = await this.cache.hasResult(step.operation) ? Step.STATUS_RESTORE : Step.STATUS_RUN;
    }

    /**
     * Optimize the flow
     */
    async evaluate() {
        for (let step of this.steps) {
            if (step.isIntermediate) continue;
            await this.evaluateStep(step);
            await this.evaluateIntermediateDependencies(step);
        }
    }

    /**
     * Perform a sanity checks on the internal steps
     */
    async sanityCheck() {
        if (_.some(this.steps, step => step.status === null))
            throw new Error('Steps must be either skipped, ran or restored.');
    }

    /**
     * Run all steps
     * @returns {Promise.<void>}
     */
    async run() {
        await this.evaluate();
        await this.sanityCheck();
        for (let step of this.steps)
            await this.runStep(step);
    }

    /**
     * Run or restore the given step based on its status
     * @param step
     * @param options
     * @returns {Promise.<StoringResult|SavedToCache>}
     */
    runStep(step, options = {}) {
        if (step.status === Step.STATUS_RESTORE)
            return this.cache.restore(step.operation);
        else if (step.status === Step.STATUS_RUN)
            return this.cache.runOperation(step.operation, options);
        else if (step.status === Step.STATUS_SKIP) {
            // @TODO emit "forward" event
        }
    }
}

module.exports = CacheFlow;
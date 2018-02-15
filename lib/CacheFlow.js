'use strict';

const assert = require('assert');

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

    /**
     * For the given "final" (destination) step,
     * determine its intermediate dependencies and
     * appropriately set each of their statuses
     * @param finalStep
     * @returns {Promise.<void>}
     */
    async evaluateIntermediateDependencies(finalStep) {

        const dependencies = this.steps.filter(step => {

            // Do not consider this step if it's not intermediate
            // (as it will be ran anyways)
            if (!step.isIntermediate) return false;

            // If the step is beyond the "destination" step (has a higher index),
            // don't process it either
            if (finalStep.index !== null && step.index > finalStep.index) return false;

            // If the "destination" step depends on this one, proceed with processing it
            return isDependency(finalStep.operation.inputFiles, step.operation.output);
        });

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
     * Optimize the flow by setting the statuses on all steps within the flow.
     * Wherever possible, steps will be set to "SKIP"
     * @param {Step[]|null} [steps = null] If provided, only evaluates the given steps
     */
    async evaluate(steps = null) {

        if (steps === null) steps = this.steps;

        for (let step of steps) {
            if (step.isIntermediate || step.evaluated) continue;

            // First set the status on the step itself
            await this.evaluateStep(step);

            // Then set the statuses on all the "intermediate" steps
            // according to the existing state
            await this.evaluateIntermediateDependencies(step);

            step.evaluated = true;
        }
    }

    /**
     * Perform a sanity checks on the internal steps
     */
    async sanityCheck() {
        for (const step of this.steps)
            if (step.status === null)
                throw new Error('One or more steps within the CacheFlow have not been evaluated');
    }

    /**
     * Run all pending steps
     * @returns {Promise.<void>}
     */
    async run() {
        await this.sanityCheck();
        for (const step of this.steps)
            await this.runStep(step);
    }

    /**
     * Clear the internal state (steps)
     */
    clear() {
        this.steps = [];
        return this;
    }

    /**
     * Run or restore the given step based on its status
     * @param step
     * @returns {RestoredFromCache|SavedToCache|null}
     */
    runStep(step) {
        if (step.status === Step.STATUS_RESTORE)
            return this.cache.restore(step.operation);

        else if (step.status === Step.STATUS_RUN)
            return step.isCacheable ?
                this.cache.runOperation(step.operation) :
                step.run();

        else if (step.status === Step.STATUS_SKIP) {
            this.cache.emitForward();
            return null;
        }
    }

    /**
     * Append "steps" defined as objects: {intent: Intent, isIntermediate: Boolean}
     * @param {object[]} steps
     */
    async add(steps) {
        const newSteps = steps.map(({intent, isIntermediate = false}, i) => {
            const index = i + this.steps.length;
            return new Step({
                index,
                isIntermediate,
                operation: intent.isCacheable ? this.cache.convertIntent(intent) : null,
                run:       intent.isCacheable ? null : intent.run,
            });
        });

        this.steps = this.steps.concat(newSteps);

        await this.evaluate(newSteps);
    }
}

module.exports = CacheFlow;
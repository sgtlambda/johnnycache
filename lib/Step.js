'use strict';

const STATUS_SKIP    = Symbol('skip');
const STATUS_RESTORE = Symbol('restore');
const STATUS_RUN     = Symbol('run');

/**
 * Represents a single step in a cache flow
 * Note that this structure is stateful, i.e. the properties
 * will be updated when the owner cache flow is evaluated
 */
class Step {

    constructor({
        operation,
        isIntermediate = false,
        status = null,
        index = null,
        forward = [],
    }) {
        this.operation      = operation;
        this.isIntermediate = isIntermediate;
        this.index          = index;
        this.forward        = forward;

        // "intermediate" steps should have their status set to "SKIP" by default
        this.status    = status || (isIntermediate ? STATUS_SKIP : null);
        this.evaluated = false;
    }
}

Step.STATUS_SKIP    = STATUS_SKIP;
Step.STATUS_RESTORE = STATUS_RESTORE;
Step.STATUS_RUN     = STATUS_RUN;

module.exports = Step;
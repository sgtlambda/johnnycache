'use strict';

const STATUS_SKIP    = Symbol('skip');
const STATUS_RESTORE = Symbol('restore');
const STATUS_RUN     = Symbol('run');

/**
 * Represents a single step in a cache flow
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
        this.status         = status || (isIntermediate ? STATUS_SKIP : null);
        this.index          = index;
        this.forward        = forward;
    }
}

Step.STATUS_SKIP    = STATUS_SKIP;
Step.STATUS_RESTORE = STATUS_RESTORE;
Step.STATUS_RUN     = STATUS_RUN;

module.exports = Step;
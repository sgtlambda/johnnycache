'use strict';

const assert = require('assert');

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

        // Either "operation" or "run" must be defined --
        // "operation" indicating it's a cacheable operation,
        // "run" indicating it isn't
        operation = null,
        run = null,

        isIntermediate = false,
        status = null,
        index = null,
        forward = [],
        wrap = null,

    }) {

        // assert "operation XOR run"
        assert(operation || run && !(operation && run));

        this.operation      = operation;
        this.isIntermediate = isIntermediate;
        this.index          = index;
        this.forward        = forward;
        this.wrap           = wrap;

        this.status = status;

        // "intermediate" steps should have their status set to "SKIP" by default
        if (!this.status && isIntermediate) this.status = STATUS_SKIP;

        // "non-cacheable" steps should have their status set to "RUN" by default
        if (!this.status && !this.isCacheable) this.status = STATUS_RUN;

        this.evaluated = false;
    }

    get isCacheable() {
        return !!this.operation;
    }
}

Step.STATUS_SKIP    = STATUS_SKIP;
Step.STATUS_RESTORE = STATUS_RESTORE;
Step.STATUS_RUN     = STATUS_RUN;

module.exports = Step;
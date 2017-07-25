'use strict';

const {defaults, includes} = require('lodash');
const lodashId             = require('lodash-id');
const mkdirp               = require('make-dir');
const path                 = require('path');
const low                  = require('lowdb');

/**
 * Prepare the database
 *
 * @param {String} filename
 *
 * @returns {{db: *, result: *}}
 */
const prepareDb = ({filename}) => {

    const db = low(filename);

    db._.mixin(lodashId);
    db.defaults({results: []}).write();

    return db;
};

class Index {

    /**
     * @param options
     */
    constructor(options) {

        this.options = defaults(options, {
            filename: path.join(process.cwd(), '.index.json'),
        });
    }

    async sync() {

        if (!this.db) {
            await mkdirp(path.dirname(this.options.filename));
            this.db = prepareDb(this.options);
        }
    }

    /**
     * Internal object path accessor
     */
    get results() {
        return this.db.get('results');
    }

    /**
     * Get all results
     */
    all() {
        return this.results.value();
    }

    /**
     * Insert new row
     * @param data
     */
    insert(data) {
        return this.results.insert(data).write();
    }

    /**
     * Find one specific result (using lodash .find)
     * @param query
     */
    findOne(query) {
        return this.results.find(query).value();
    }

    /**
     * Remove all expired records
     */
    removeExpired() {
        this.results
            .remove(({expires}) => expires === -1 ? false : expires <= Date.now())
            .write();
    }

    /**
     * Remove all records with the given ids
     * @param ids
     */
    removeById(ids) {
        this.results
            .remove(doc => includes(ids, doc.id))
            .write();
    }
}

module.exports = Index;
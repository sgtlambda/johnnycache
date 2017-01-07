'use strict';

const {noop, defaults}    = require('lodash');
const path                = require('path');
const Sequelize           = require('sequelize');

class Index {

    /**
     * @param options
     */
    constructor(options) {

        options = defaults(options, {
            filename: path.join(process.cwd(), '.index'),
            log:      noop,
        });

        const {db, Result} = Index.prepareDb(options);

        this.db     = db;
        this.Result = Result;
    }

    /**
     * Prepare the "Result" collection for mutations
     *
     * @returns {Promise}
     */
    sync() {
        if (!this.ready) this.ready = this.Result.sync();
        return this.ready;
    }

    /**
     * Prepare the database
     *
     * @param {String} options.filename
     * @param {Function} options.log
     *
     * @returns {{db: Sequelize, result: Model}}
     */
    static prepareDb(options) {

        const db = new Sequelize('cachething', 'carrier', null, {
            'dialect': 'sqlite',
            'storage': options.filename,
            'logging': options.log,
        });

        const Result = Index.defineResultModel(db);

        return {db, Result};
    }

    /**
     * Define the "Result" model on the given database instance
     * @param db
     * @returns {*|void|Model|{}}
     */
    static defineResultModel(db) {

        return db.define('Result', {
            action:     Sequelize.STRING,
            fileHash:   Sequelize.STRING,
            outputHash: Sequelize.STRING,
            created:    Sequelize.BIGINT,
            expires:    Sequelize.BIGINT,
            fileName:   Sequelize.STRING,
            compressed: Sequelize.BOOLEAN,
            fileSize:   Sequelize.BIGINT,
            runtime:    Sequelize.BIGINT
        });
    }
}

module.exports = Index;
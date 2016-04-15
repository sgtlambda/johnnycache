'use strict';

const path      = require('path');
const defaults  = require('defa');
const Sequelize = require('sequelize');

class Index {

    constructor(options) {

        defaults(options, {
            'filename': () => path.join(process.cwd(), '.index')
        });

        this.prepareDb(options.filename);
    }

    sync() {
        if (!this.ready)
            this.ready = this.Result.sync();

        return this.ready;
    }

    log() {
        // do nothing
    }

    /**
     * Prepare the database and insert models and stuff
     * @param {String} filename
     * @returns {Promise}
     */
    prepareDb(filename) {

        const sequelize = new Sequelize('cachething', 'carrier', null, {
            'dialect': 'sqlite',
            'storage': filename,
            'logging': msg => this.log(msg)
        });

        this.db = sequelize;

        this.Result = sequelize.define('Result', {
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
const _ = require("underscore");

exports.up = async function(knex, Promise) {
    // create the table & reference to verion in the question sets table
    await knex.schema
    .createTable('test_versions', function(table) {
        table.increments();
        table.string('name', 45).notNullable();
        table.string('questionIds', 5000);
        table.specificType('current', 'TINYINT(1)').notNullable();
        table.datetime('createdAt').notNullable();
    })
    .table('question_sets', function(table) {
        table.integer('versionId', 10).unsigned().after('questionIds').references('id').inTable('test_versions');
    });

    // get the list of all question IDs and add them to a new version right now
    await knex.select('*').from('questions')
    .then((questions) => {
        ids = _.map(questions, q => q.id);
        return knex('test_versions').insert({
            name: 'v1',
            current: 1,
            questionIds: JSON.stringify(ids),
            createdAt: new Date()
        });
    })
    // mark all the question sets with the given ID
    .then((ids) => {
        let versionId = ids[0];
        return knex('question_sets').update({
            versionId: versionId
        });
    })
    // alter the question_sets table to mark the versionId column as non nullable
    .then(() => {
        return knex.schema.raw('SET foreign_key_checks = 0;').table('question_sets', function(table) {
            table.integer('versionId', 10).unsigned().notNullable().alter();
        }).raw('SET foreign_key_checks = 1;');
    })

};

exports.down = async function(knex, Promise) {

};

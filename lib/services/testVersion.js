'use strict';

const Boom = require('boom');
const Schmervice = require('schmervice');
const _ = require("underscore");
const CONSTANTS = require('../constants');

module.exports = class TestVersioningService extends Schmervice.Service {

    async findById(id, txn=null) {
        const { TestVersion } = this.server.models();
        return await TestVersion.query(txn).throwIfNotFound().findById(id);
    }

    async findAll(txn) {
        const { TestVersion } = this.server.models();
        return await TestVersion.query(txn);
    }

    async findCurrent(txn) {
        const { TestVersion } = this.server.models();
        let version = await TestVersion.query().findOne({ current: true });
        return version;
    }

    async createAndMarkAsCurrent(versionName, questionIds, buckets, txn=null) {
        const {
            Question,
            QuestionBucket,
            QuestionBucketChoice,
            TestVersion
        } = this.server.models();

        // check if the given question IDs exist
        let questions = await Question.query(txn).whereIn('id', questionIds);
        if (questions.length != questionIds.length) {
            throw Boom.badRequest("All the questionIds given are not valid.");
        }

        // check if the bucket IDs given as the keys of the bucket key exist
        let bucketIds = _.map(buckets, b => b.bucketId);
        let dbBuckets = await QuestionBucket.query(txn).whereIn('id', bucketIds).eager('choices');
        if (dbBuckets.length != bucketIds.length) {
            throw Boom.badRequest("All the IDs of the bucket in the bucket object are not valid.");
        }

        // check if the choice IDs are valid
        _.each(buckets, (b) => {
            let dbBucket = _.where(dbBuckets, {id: b.bucketId})[0];
            _.each(b.choiceIds, (cId) => {
                let dbChoice = _.where(dbBucket.choices, {id: cId});
                if (dbChoice.length <= 0) {
                    throw Boom.badRequest("All the choice IDs are not valid.");
                }
            })
        });

        // construct the version json
        let versionObj = {
            questionIds: questionIds,
            buckets: buckets,
        }

        // find the current version
        let oldVersion = await this.findCurrent();

        // create a new version with the newly constructed version object
        let currentVerison = await TestVersion.query(txn).insertGraph({
            name: versionName,
            data: versionObj,
            current: true
        })

        // disable the current flag on the older current version
        oldVersion.current = false;
        await TestVersion.query(txn).upsertGraph(oldVersion);

        return currentVerison;
    }

    async getQuestions(version) {
        const { Question, QuestionBucket, QuestionBucketChoice } = this.server.models();

        let versionQuestions = {
            withoutChoices: [],
            buckets: []
        }

        // load the questions which are not attached to any choice
        let questions = await Question.query().whereIn('id', version.data.questionIds).eager('options');
        _.each(CONSTANTS.questions.topics, (topic) => {
            versionQuestions.withoutChoices[topic] = { easy: [], medium: [], hard: [] }
        });
        _.each(questions, (q) => {
            if (q.difficulty == CONSTANTS.questions.difficulty.easy) {
                versionQuestions.withoutChoices[q.topic].easy.push(q);
            } else if (q.difficulty == CONSTANTS.questions.difficulty.medium) {
                versionQuestions.withoutChoices[q.topic].medium.push(q);
            } else {
                versionQuestions.withoutChoices[q.topic].hard.push(q);
            }
        })

        // load the questions in different choices associated with a bucket
        let promises = [];
        _.each(version.data.buckets, (b) => {
            let promise = QuestionBucket.query().findById(b.bucketId)
                .then((bucket) => {
                    versionQuestions.buckets.push({ name: bucket.name, id: bucket.id, choices: [] });
                    return QuestionBucketChoice.query().whereIn('id', b.choiceIds).eager('bucket');
                })
                .then((choices) => {
                    let newPromises = [];
                    _.each(choices, (choice) => {
                        let p = Question.query().whereIn('id', choice.questionIds).eager('options')
                            .then((ques) => {
                                let bucketIndex = _.findIndex(versionQuestions.buckets, (b) => {
                                    if (b.id == choice.bucket.id) {
                                        return true
                                    } else {
                                        return false
                                    }
                                });
                                let allQuestions = _.map(choice.questionIds, (questionId) => {
                                     let q = _.where(ques, {id: questionId})[0];
                                     return q;
                                });
                                versionQuestions.buckets[bucketIndex].choices.push({
                                    questions: allQuestions,
                                    id: choice.id
                                });
                            });
                        newPromises.push(p);
                    });
                    return Promise.all(newPromises);
                });
            promises.push(promise);
        });

        await Promise.all(promises);

        return versionQuestions;

    }

    async getReportForVersion(version) {
        const { QuestionAttempt } = this.server.models();

        let questions = await this.findAllQuestions(version);

        // group the ids on basis of mcq & integer type questions
        let mcqIds = [];
        let intIds = [];
        _.each(questions, (q) => {
            if (q.type == CONSTANTS.questions.types.mcq) {
                mcqIds.push(q.id);
            } else {
                intIds.push(q.id);
            }
        });

        // reports for mcq ids
        let mcqReport = await QuestionAttempt.knex()
                .select('questionId', 'selectedOptionId')
                .count('* as count')
                .from('question_attempts')
                .whereIn('questionId', mcqIds)
                .groupBy('selectedOptionId');
        mcqReport = _.groupBy(mcqReport, 'questionId');

        // reports for integer ids
        let intReport = await QuestionAttempt.knex()
                .select('questionId', 'textAnswer')
                .count('* as count')
                .from('question_attempts')
                .whereIn('questionId', intIds)
                .groupBy('textAnswer');
        intReport = _.groupBy(intReport, 'questionId');

        let allReports = _.extend(mcqReport, intReport);

        questions = _.map(questions, (q) => {
            q.report = _.object( _.map(allReports[q.id], (row) => {
                if (q.type == CONSTANTS.questions.types.mcq) {
                    return [row.selectedOptionId, row.count];
                } else {
                    return [row.textAnswer, row.count];
                }
            }) );
            return q;
        });

        return questions;

    }
};

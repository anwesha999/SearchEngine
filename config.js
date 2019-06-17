let elasticSearch = require('elasticsearch');

module.exports = {
    DB_USERNAME: 'root',
    DB_PASSWORD: 'root123',
    DB_SERVER_IP: 'localhost',
    DB_DATABASE_NAME: 'secure-trace',
    ES_CANDIDATE_INDEX_NAME: 'tekizma-11',
    ES_JOB_INDEX_NAME: 'tekizma-15',
    ES_CANDIDATE_INDEX_TYPE: 'st-job-portal-test-11',
    ES_JOB_INDEX_TYPE: 'st-job-portal-job-15',
    ES_HOST: 'localhost:9200',
    ES_LOG_LEVEL: 'trace',
    PREFERRED_SKILL_MATCH_PERCENT: 5,
    APPLICATION_PORT: 3002,
    IS_LOOKING_FOR_JOB: 'true'
};

module.exports.ELASTIC_SEARCH_CONNECTION = new elasticSearch.Client({
    host: this.ES_HOST,
    requestTimeout: 60000,
    log: this.ES_LOG_LEVEL
});


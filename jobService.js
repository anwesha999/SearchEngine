const config = require('./config');
const utility = require('./common-utility');
const constants = require('./constants');
const elasticSearchObj = config.ELASTIC_SEARCH_CONNECTION;
const indexJobName = config.ES_JOB_INDEX_NAME;
const typeJobName = config.ES_JOB_INDEX_TYPE;


function importingJsonData(recordset) {
    return new Promise((resolve, reject) => {
        const bulkIndex = function bulkIndex(index, type, listOfData) {
            let bulkBody = [];
            for (let i in listOfData) {
                const data = listOfData[i];
                bulkBody.push({
                    index: {
                        _index: index,
                        _type: type,
                        _id: data.JOB_ID
                    }
                });
                bulkBody.push(data);
            }
            elasticSearchObj.bulk({ body: bulkBody }).then(response => {
                utility.printLog("elasticSearchResponse" + response, constants.LOG_LEVEL.DEBUG);
                resolve(response);
            }).catch(err => {
                reject({ "status": err.status, "message": err.msg });
            });
        };
        const index = function elasticMapping() {
            bulkIndex(indexJobName, typeJobName, recordset);
        };
        index();
    });
}


function buildIndexingData(jobId, json) {
    console.log("buildIndexingDataFromNLP function has", jobId);
    let indexingDataJson = {};
    indexingDataJson.JOB_ID = json.JOB_ID;
    indexingDataJson.JOB_NAME = json.JOB_NAME;
    indexingDataJson.JOB_DESCRIPTION = json.JOB_DESCRIPTION;
    indexingDataJson.CUSTOMER_ID = json.CUSTOMER_ID;
    indexingDataJson.REQUIRED_SKILLS = json.REQUIRED_SKILLS;
    indexingDataJson.PREFERRED_SKILLS = json.PREFERRED_SKILLS;
    indexingDataJson.YRS_OF_EXP = json.YRS_OF_EXP;
    indexingDataJson.ADDITIONAL_INFO = json.ADDITIONAL_INFO;
    indexingDataJson.ACTIVE_FLAG = json.ACTIVE_FLAG;
    indexingDataJson.created_logon = json.created_logon;
    indexingDataJson.created_date = json.created_date;
    indexingDataJson.updated_logon = json.updated_logon;
    indexingDataJson.updated_date = json.updated_date;
    indexingDataJson.job_id = json.job_id;
    indexingDataJson.job_location_id = json.job_location_id;
    indexingDataJson.active_flag = json.active_flag;
    indexingDataJson.REMOTE_FLAG = json.REMOTE_FLAG;
    indexingDataJson.locations = json.locations;
    utility.printLog("indexingDataJson" + indexingDataJson, constants.LOG_LEVEL.DEBUG);
    return indexingDataJson;
};


exports.indexJobData = function (jobId, json) {
    return new Promise((resolve, reject) => {
        let response = {};
        let unProcessedjobId = [];
        if (!jobId) {
            utility.printLog("Job Id Not Found in JSON Indexing");
            reject({ "status": 404, "message": "Job Id Not Found" });
        } else if (!json || Object.keys(json).length === 0) {
            let returnObj = {};
            returnObj.JOB_ID = jobId;
            returnObj.message = "Job Data Not Found in JSON";
            unProcessedjobId.push(returnObj);
            resolve({ response, unProcessedjobId });
        } else if (parseInt(jobId, 10) !== parseInt(json.JOB_ID, 10)) {
            let returnObj = {};
            returnObj.JOB_ID = jobId;
            returnObj.message = "Looks like something is wrong. Request Param Job Id and Request Body Job Id is not matching";
            unProcessedjobId.push(returnObj);
            resolve({ response, unProcessedjobId });
        } else {
            let dataJson = buildIndexingData(jobId, json);
            let listJsonData = [];
            listJsonData.push(dataJson);
            utility.printLog("ListJsonData" + listJsonData, constants.LOG_LEVEL.INFO);
            importingJsonData(listJsonData).then(response => {
                utility.printLog("Indexing Complete", constants.LOG_LEVEL.INFO);
                resolve({ response, unProcessedjobId });
            }).catch(err => {
                let returnObj = {};
                returnObj.JOB_ID = jobId;
                returnObj.message = "Error while Indexing Job Data";
                unProcessedjobId.push(returnObj);
                utility.printLog("Indexing Complete", constants.LOG_LEVEL.INFO);
                resolve({ response, unProcessedjobId });
            });
        }

    });
}

//Searching function and applying pagination in the searching function
exports.search = function (jobId) {
    return new Promise((resolve, reject) => {
        utility.printLog("Request Received for Search with Params with jobId: " + jobId, constants.LOG_LEVEL.INFO);
        const search = function search(index, type, body) {
            return elasticSearchObj.search({ index: index, type: type, body: body });
        };
        let finalSearchQuery = buildFinalSearchQuery(jobId);
        const elasticMapping = function elasticMapping() {
            let body = {
                "from": 0,
                "size": 1,
                "query": {
                    "bool": {
                        "must": finalSearchQuery
                    }
                }
            };
            search(indexJobName, typeJobName, body)
                .then(results => {
                    utility.printLog("Search Result Received", constants.LOG_LEVEL.INFO);
                    resolve(results);
                })
                .catch(error => {
                    utility.printLog("Error while searching", constants.LOG_LEVEL.ERROR);
                    reject(error);
                });
        };
        elasticMapping();
    });
};

function buildFinalSearchQuery(jobId) {
    let jobIdQuery = {};
    jobIdQuery.JOB_ID = jobId;
    let matchQuery = {};
    matchQuery.match = jobIdQuery;
    let finalSearchQuery = [];
    finalSearchQuery.push(matchQuery);
    return finalSearchQuery;
}

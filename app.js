const sql = require("mssql");
const utility = require('./common-utility');
const constants = require('./constants');
const config = require('./config');
const moment = require('moment');
const momentPreciseRangePlugin = require("moment-precise-range-plugin");
const sqlQuery = require('./sqlQuery');
const elasticSearchObj = config.ELASTIC_SEARCH_CONNECTION;
const username = config.DB_USERNAME;
const password = config.DB_PASSWORD;
const server = config.DB_SERVER_IP;
const databaseName = config.DB_DATABASE_NAME;
const indexName = config.ES_CANDIDATE_INDEX_NAME;
const typeName = config.ES_CANDIDATE_INDEX_TYPE;
const perPreferredSkillMatchPercentage = config.PREFERRED_SKILL_MATCH_PERCENT;
const isLookingForJobValue = config.IS_LOOKING_FOR_JOB;

const dbConfig = {
    user: username,
    password: password,
    server: server,
    database: databaseName,
    encrypt: true
};

//SQL Connection
//sql.connect(dbConfig, function (err) {
//   if (err) console.log(err);
//  let request = new sql.Request();
let request = undefined;

//Indexing the data in elastic search
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
                        _id: data.candidate_id
                    }
                });
                bulkBody.push(data);
            }
            elasticSearchObj.bulk({ body: bulkBody }).then(response => {
                utility.printLog("elasticSearchresponse" + response, constants.LOG_LEVEL.DEBUG);
                resolve(response);
            }).catch(err => {
                reject({ "status": err.status, "message": err.msg });
            });
        };
        const index = function elasticMapping() {
            bulkIndex(indexName, typeName, recordset);
        };
        index();
    });
}

//Splitting the values in requiredskills and further matching it with the skills
function buildSkillJsonSearchQuery(inputSkills) {
    let arr = [];
    let splittedSkills = [];
    splittedSkills = inputSkills.split(",");
    for (let j in splittedSkills) {
        let skillJson = {};
        let matchJson = {};
        skillJson['skillSet.skill'] = splittedSkills[j].trim();
        matchJson.match = skillJson;
        arr.push(matchJson);
    }
    return (arr);
}

function getNestedObject(skill) {
    return {
        "nested": {
            "path": "skillSet",
            "query": {
                "bool": {
                    "must": skill,
                }
            }
        }
    };
}

function buildFinalSearchQuery(searchQuery) {
    let shouldQuery = {};
    shouldQuery.should = searchQuery;
    let boolQuery = {};
    boolQuery.bool = shouldQuery;
    let finalSearchQuery = [];
    finalSearchQuery.push(boolQuery);
    return finalSearchQuery;
}

function createFilterQuery(minYearsOfExperience, candidateId, transactionId, companyId, online_intrvw_flag) {
    if (!minYearsOfExperience || minYearsOfExperience < 0) {
        minYearsOfExperience = 0;
    }

    if(minYearsOfExperience > 0 && minYearsOfExperience < 10){
        minYearsOfExperience = "0"+minYearsOfExperience;
    }
    let filterQuery = [];

    let gteQuery = {};
    gteQuery.gte = minYearsOfExperience;
    if(parseInt(minYearsOfExperience) > 99)
        gteQuery.lte = 100;
    // gteQuery.lte = minYearsOfExperience+1000;
    let workExperienceQuery = {};
    workExperienceQuery.workExperience = gteQuery;
    let rangeQuery = {};
    rangeQuery.range = workExperienceQuery;
    filterQuery.push(rangeQuery);


    let isLookingForJobQuery = {};
    isLookingForJobQuery.isLookingForJob = isLookingForJobValue;
    let matchQueryIsLookingForJob = {};
    matchQueryIsLookingForJob.match = isLookingForJobQuery;
    filterQuery.push(matchQueryIsLookingForJob);

    let companyIdQuery = {};
    companyIdQuery.ownerCompanyId = companyId;
    let matchQueryCompanyId = {};
    matchQueryCompanyId.match = companyIdQuery;
    if (companyId)
        filterQuery.push(matchQueryCompanyId);

    let candidateIdQuery = {};
    candidateIdQuery.candidate_id = candidateId;
    let matchQuery = {};
    matchQuery.match = candidateIdQuery;

    let transactionIdQuery = {};
    transactionIdQuery.candidate_trans_id = transactionId;
    let matchQueryTransaction = {};
    matchQueryTransaction.match = transactionIdQuery;

    let online_intrvw_flagQuery = {};
    online_intrvw_flagQuery.online_intrvw_flag = online_intrvw_flag;
    let matchQueryonline_intrvw_flag = {};
    matchQueryonline_intrvw_flag.match = online_intrvw_flagQuery;

    if (candidateId && !transactionId)
        filterQuery.push(matchQuery);
    else if (transactionId && !candidateId)
        filterQuery.push(matchQueryTransaction);
    else if (candidateId && transactionId)
        filterQuery.push(matchQuery, matchQueryTransaction);
    else if (minYearsOfExperience && !candidateId && !transactionId && !companyId)
        filterQuery.push(rangeQuery)

    return filterQuery;
};

//Searching function and applying pagination in the searching function
exports.search = function (searchRequiredSkills, searchPreferredSkills, minYearsOfExperience, offset, size, candidateId, transactionId, companyId, online_intrvw_flag) {
    return new Promise((resolve, reject) => {
        utility.printLog("Request Received for Search with Params with Required Skills: " + searchRequiredSkills + "" +
            " Preferred Skills: " + searchPreferredSkills + " Min Year Of Experience: " + minYearsOfExperience + " Offset: " + offset + " Size:" + size
            + " CandidateId:" + candidateId + " TransactionId:" + transactionId + " CompanyId:" + companyId+ "online_intrvw_flag:"+online_intrvw_flag, constants.LOG_LEVEL.INFO);
        const search = function search(index, type, body) {
            return elasticSearchObj.search({ index: index, type: type, body: body });
        };
        let searchQuery = [];
        if (searchRequiredSkills) {
            for (let i = 0; i < searchRequiredSkills.split(',').length; i++) {
                let skill = buildSkillJsonSearchQuery(searchRequiredSkills.split(',')[i]);
                searchQuery.push(getNestedObject(skill));
            }
        }
        if (searchPreferredSkills) {
            for (let i = 0; i < searchPreferredSkills.split(',').length; i++) {
                let skill = buildSkillJsonSearchQuery(searchPreferredSkills.split(',')[i]);
                searchQuery.push(getNestedObject(skill));
            }
        }

        let finalSearchQuery = buildFinalSearchQuery(searchQuery);
        let filterQuery = createFilterQuery(minYearsOfExperience, candidateId, transactionId, companyId, online_intrvw_flag);
        if (!offset) {
            offset = 0;
        }
        if (!size) {
            size = 10;
        }
        const elasticMapping = function elasticMapping() {

            let body = {
                "from": offset,
                "size": size,
                "query": {
                    "bool": {
                        "must": finalSearchQuery,
                        "filter": filterQuery
                    }
                }
            };

            search(indexName, typeName, body)
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

//To concat firstname, lastname
function buildName(queryResponse) {
    let candidateName = " ";
    let firstName = queryResponse.FIRST_NAME;
    let lastName = queryResponse.LAST_NAME;
    if (firstName && lastName) {
        candidateName = firstName + " " + lastName;
    } else {
        candidateName = firstName;
    }
    return candidateName;
}

//To  get the candidate_id
function buildListofCandidateId(candidateId, transactionId) {
    return new Promise((resolve, reject) => {
        let listCandidateId = [];

        let query = sqlQuery.sqlQueries.queryAllCandidate;
        if (transactionId) {
            query = sqlQuery.sqlQueries.queryTransaction + transactionId;
        }

        if (!candidateId) {

            request.query(query, (err, response) => {
                if (err) {
                    utility.printLog("Something Bad happened while running query " + query, constants.LOG_LEVEL.ERROR);
                    reject(listCandidateId);
                }
                if (!response || !response.recordset) {
                    reject(listCandidateId);
                }
                for (let i in response.recordset) {
                    listCandidateId.push(response.recordset[i].CANDIDATE_ID);
                }
                resolve(listCandidateId);
            })
        } else {
            listCandidateId.push(candidateId);
            resolve(listCandidateId);
        }
    })
};


function formatDate(date) {
    let d = new Date(date),
        month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return [year, month, day].join('-');
}

function calculateTotalWorkEx(startDate, endDate) {
    let totalWorkEx = "";
    if (!startDate)
        startDate = new Date();
    let startDateFormat = formatDate(startDate);
    let endDateFormat = formatDate(endDate);
    let startDateValue = moment(new Date(startDateFormat)); // yyyy-MM-dd
    let endDateValue = moment(new Date(endDateFormat)); // yyyy-MM-dd
    let diff = moment.preciseDiff(startDateValue, endDateValue, true);
    let year = diff.years;
    let month = diff.months;
    totalWorkEx = year + "." + month;
    return totalWorkEx;
}

//To get WorkExperience from startDate and endDate
function getWorkExpData(transactionId, location) {
    return new Promise((resolve, reject) => {
        let companyLocation = location;
        let totalWorkEx = "";
        let workExQuery = "";
        if (!transactionId) {
            resolve({ workExQuery, companyLocation, totalWorkEx });
        } else {
            workExQuery = sqlQuery.sqlQueries.queryWorkexp + transactionId;
            utility.printLog("workExQuery" + workExQuery, constants.LOG_LEVEL.DEBUG);
            request.query(workExQuery, (err, response) => {
                if (err) {
                    utility.printLog("Error while running query work experience" + workExQuery, constants.LOG_LEVEL.ERROR);
                    resolve({ workExQuery, companyLocation, totalWorkEx });
                }
                if (!response || !response.recordset) {
                    resolve({ workExQuery, companyLocation, totalWorkEx });
                }
                let queryResponse = response.recordset[0];
                let startDate = queryResponse.startDate;
                let endDate = queryResponse.endDate;
                if (!endDate)
                    endDate = new Date();
                totalWorkEx = calculateTotalWorkEx(startDate, endDate);

                if (!companyLocation && endDate) {
                    let latestWorkExQuery = sqlQuery.sqlQueries.queryLatestWorkExp1 + transactionId + sqlQuery.sqlQueries.queryLatestWorkExp2 +
                        sqlQuery.sqlQueries.queryLatestWorkExp3 + endDate + sqlQuery.sqlQueries.queryLatestWorkExp4;
                    request.query(latestWorkExQuery, (err, response) => {
                        if (err) {
                            utility.printLog("Error while fetching current company location", constants.LOG_LEVEL.ERROR);
                            resolve({ workExQuery, companyLocation, totalWorkEx });
                        }
                        if (!response || !response.recordset) {
                            resolve({ workExQuery, companyLocation, totalWorkEx });
                        }
                        let queryResponseLocation = response.recordset;
                        let companyLocation = queryResponseLocation.CLIENT_LOCATION_CONCAT;
                        resolve({ workExQuery, companyLocation, totalWorkEx });
                    })
                } else {
                    resolve({ workExQuery, companyLocation, totalWorkEx });
                }
            })
        }
    });
};


//Mapping between candidate_id and candidate_trans_id
function getTransactionId(candidateIdVar, transactionId) {
    return new Promise((resolve, reject) => {
        if (transactionId) {
            resolve(transactionId);
        }
        let mappingQuery = sqlQuery.sqlQueries.queryMapping + candidateIdVar;
        utility.printLog("mappingQuery" + mappingQuery, constants.LOG_LEVEL.DEBUG);
        request.query(mappingQuery, (err, response) => {
            if (err) {
                utility.printLog("Error while fetching max trans id", constants.LOG_LEVEL.ERROR);
                resolve(transactionId);
            }
            if (response && response.recordset) {
                transactionId = response.recordset[0].trans_id;
                if (transactionId)
                    resolve(transactionId);
                else {
                    utility.printLog("Error while fetching max trans id", constants.LOG_LEVEL.ERROR);
                    resolve(transactionId);
                }
            }
        });
    });
}

//To get Personal Data of the Candidate
function getPersonalDataJSON(candidateIdVar) {
    let candidateName = "";
    return new Promise((resolve, reject) => {
        let personalDataQuery = sqlQuery.sqlQueries.queryPersonalData + candidateIdVar;
        utility.printLog("personalDataQuery" + personalDataQuery, constants.LOG_LEVEL.DEBUG);
        request.query(personalDataQuery, (err, response) => {
            if (err) {
                utility.printLog("Error while fetching personal data", constants.LOG_LEVEL.ERROR);
                resolve(personalDataQuery);
            }
            if (response && response.recordset) {
                let responseResult = response.recordset[0];
                let candidateId = responseResult.CANDIDATE_ID;
                candidateName = buildName(responseResult);
                resolve({ personalDataQuery, candidateId, candidateName });
            } else {
                resolve({ personalDataQuery });
            }
        });
    });
};

//To get Location of the Candidate
function getLocationDataJSON(transactionId) {
    return new Promise((resolve, reject) => {
        if (!transactionId) {
            resolve("");
        } else {
            let locationQuery = sqlQuery.sqlQueries.queryLocation + transactionId;
            utility.printLog("locationQuery" + locationQuery, constants.LOG_LEVEL.DEBUG);
            request.query(locationQuery, (err, response) => {
                if (err) {
                    utility.printLog("Error while fetching address", constants.LOG_LEVEL.ERROR);
                    resolve("");
                }
                if (!response || !response.recordset) {
                    resolve("");
                } else
                    resolve(response.recordset[0].HOME_ADDR_CONCAT);
            })
        }
    });
}

function buildSkillObjectForIndexing(skill, rank) {
    let skillObj = {};
    skillObj.skill = skill;
    skillObj.rank = rank;
    return skillObj;
}

//To get Skills & SkillRank of the candidate
function buildSkills(transactionIdVar) {
    return new Promise((resolve, reject) => {
        let skillArray = [];
        if (!transactionIdVar) {
            resolve(skillArray);
        } else {
            let skillsQuery = sqlQuery.sqlQueries.querySkills + transactionIdVar;
            request.query(skillsQuery, (err, response) => {
                if (err) {
                    utility.printLog("Error while fetching skill data", constants.LOG_LEVEL.ERROR);
                    resolve(skillArray);
                }
                for (var j in response.recordset) {
                    if (response.recordset[j].skill_value) {
                        skillArray.push(buildSkillObjectForIndexing(response.recordset[j].skill_value.trim(), response.recordset[j].skill_rank));
                    }
                }
                resolve(skillArray);
            })
        }
    });
}

//Creating a JSON index from Json data to put in elasticsearch
function buildIndexData(candidateName, candidateLocation, totalWorkEx, skillsdata, transactionIdVar, candidateIdVar) {
    let dataJson = {};
    dataJson.candidate_name = candidateName;
    dataJson.candidate_location = candidateLocation;
    dataJson.workExperience = parseInt(totalWorkEx);
    dataJson.skillSet = skillsdata;
    dataJson.candidate_trans_id = transactionIdVar;
    dataJson.candidate_id = candidateIdVar;
    return dataJson;
}

//Calling of all the functions within this function and building JSON
exports.indexData = function (transactionId, candidateId, jsonData) {
    return new Promise((resolve, reject) => {
        let response = {};
        let unProcessedCandidateId = [];
        if (jsonData && Object.keys(jsonData).length > 0) {
            if (!candidateId) {
                utility.printLog("Candidate Id Not Found in JSON Indexing");
                reject({ "status": 404, "message": "Candidate Id Not Found" });
            }
            if (!transactionId) {
                let returnObj = {};
                returnObj.candidateId = candidateId;
                returnObj.message = "Transaction Id Not Found";
                unProcessedCandidateId.push(returnObj);
                resolve({ response, unProcessedCandidateId });
            }
            if (!jsonData.candidateData || Object.keys(jsonData.candidateData).length === 0) {
                let returnObj = {};
                returnObj.candidateId = candidateId;
                returnObj.message = "Candidate Data Not Found in JSON";
                unProcessedCandidateId.push(returnObj);
                resolve({ response, unProcessedCandidateId });
            }
            let dataJson = buildIndexingDataFromNLPResponse(jsonData, transactionId, candidateId);
            let listJsonData = [];
            listJsonData.push(dataJson);
            utility.printLog("ListJsonData" + listJsonData, constants.LOG_LEVEL.INFO);
            importingJsonData(listJsonData).then(response => {
                utility.printLog("Indexing Complete", constants.LOG_LEVEL.INFO);
                resolve({ response, unProcessedCandidateId });
            }).catch(err => {
                let returnObj = {};
                returnObj.candidateId = candidateId;
                returnObj.message = "Error while Indexing Data";
                unProcessedCandidateId.push(returnObj);
                utility.printLog("Indexing Complete", constants.LOG_LEVEL.INFO);
                resolve({ response, unProcessedCandidateId });
            });
        } else {
            buildListofCandidateId(candidateId, transactionId).then(listCandidateId => {
                if (listCandidateId && listCandidateId.length > 0) {
                    utility.printLog("Total Number Of Candidates " + listCandidateId.length, constants.LOG_LEVEL.INFO);
                    let count = 0;
                    for (let i in listCandidateId) {
                        let candidateIdVar = listCandidateId[i];
                        utility.printLog("candidateIdVar" + candidateIdVar, constants.LOG_LEVEL.DEBUG);
                        getTransactionId(candidateIdVar, transactionId).then(transactionIdVar => {
                            utility.printLog("transactionIdVar" + transactionIdVar, constants.LOG_LEVEL.DEBUG);
                            if (transactionIdVar) {
                                getLocationDataJSON(transactionIdVar).then(location => {
                                    utility.printLog("location" + location, constants.LOG_LEVEL.DEBUG);
                                    getPersonalDataJSON(candidateIdVar).then(__ret => {
                                        let candidateName = __ret.candidateName;
                                        if (candidateName) {
                                            getWorkExpData(transactionIdVar, location).then(__ret1 => {
                                                let candidateLocation = __ret1.companyLocation;
                                                let totalWorkEx = __ret1.totalWorkEx;
                                                buildSkills(transactionIdVar).then(skillsdata => {
                                                    let listJsonData = [];
                                                    let dataJson = buildIndexData(candidateName, candidateLocation, totalWorkEx, skillsdata, transactionIdVar, candidateIdVar);
                                                    listJsonData.push(dataJson);
                                                    utility.printLog("datajson" + listJsonData, constants.LOG_LEVEL.DEBUG);
                                                    importingJsonData(listJsonData).then(response => {
                                                        count++;
                                                        if (count === listCandidateId.length) {
                                                            utility.printLog("Indexing Complete", constants.LOG_LEVEL.INFO);
                                                            resolve({ response, unProcessedCandidateId });
                                                        }
                                                    }).catch(err => {
                                                        count++;
                                                        let returnObj = {};
                                                        returnObj.candidateId = candidateIdVar;
                                                        returnObj.message = "Error while Indexing Data";
                                                        unProcessedCandidateId.push(returnObj);
                                                        if (i === (listCandidateId.length - 1)) {
                                                            utility.printLog("Indexing Complete", constants.LOG_LEVEL.INFO);
                                                            resolve({ response, unProcessedCandidateId });
                                                        }
                                                    });
                                                });
                                            });
                                        } else {
                                            count++;
                                            utility.printLog("Personal Data Not found for candidate id " + candidateIdVar, constants.LOG_LEVEL.ERROR);
                                            let returnObj = {};
                                            returnObj.candidateId = candidateIdVar;
                                            returnObj.message = "Personal Data Not found";
                                            unProcessedCandidateId.push(returnObj);
                                            if (count === listCandidateId.length) {
                                                utility.printLog("Indexing Complete", constants.LOG_LEVEL.INFO);
                                                resolve({ response, unProcessedCandidateId });
                                            }
                                        }
                                    });
                                });
                            } else {
                                count++;
                                utility.printLog("Transaction Id Not Found for candidate id " + candidateIdVar + " " + i, constants.LOG_LEVEL.ERROR);
                                let returnObj = {};
                                returnObj.candidateId = candidateIdVar;
                                returnObj.message = "Transaction Id Not Found";
                                unProcessedCandidateId.push(returnObj);
                                if (count === listCandidateId.length) {
                                    utility.printLog("Indexing Complete", constants.LOG_LEVEL.INFO);
                                    resolve({ response, unProcessedCandidateId });
                                }
                            }
                        });
                    }
                } else {
                    utility.printLog("No Candidate Id to ES_CANDIDATE_INDEX_NAME Data", constants.LOG_LEVEL.INFO);
                    reject({ "status": 404, "message": "Candidate Id Not Found" });
                }
            }).catch(err => {
                utility.printLog("Candidate Id not found", constants.LOG_LEVEL.ERROR);
                reject({ "status": 404, "message": "Candidate Id Not Found" });
            });
        }
    });
};

exports.createIndex = function () {
    return new Promise(((resolve, reject) => {
        elasticSearchObj.indices.create({
            index: indexName
        }).then(response => {
            if (response && response.acknowledged)
                resolve({ "status": 200 });
            else
                reject({ "status": 500 });
        })
    }))
};

function buildIndexingDataFromNLPResponse(data, transactionId, candidateId) {
    let skillArray = buildSkillArrayFromJson(data.candidateData.candidate_skills);
    let workExperienceData = getWorkExpFromJson(data.candidateData.candidate_exp);
    let personalData = getPersonalDetailFromJson(data.candidateData.candidate, workExperienceData[1]);
    let indexingDataJson = buildIndexData(personalData[0], personalData[1], workExperienceData[0], skillArray, transactionId, candidateId);

    indexingDataJson.ownerCompanyId = data.ownerCompanyId;
    indexingDataJson.isLookingForJob = data.isLookingForJob;
    indexingDataJson.confidence = data.confidence;
    indexingDataJson.retention = data.retention;
    indexingDataJson.image_url = data.image_url;
    indexingDataJson.video_url = data.video_url;
    indexingDataJson.like_flag = data.like_flag;
    indexingDataJson.online_intrvw_flag = data.online_intrvw_flag;
    indexingDataJson.onsite_intrvw_flag = data.onsite_intrvw_flag;
    indexingDataJson.offer_flag = data.offer_flag;
    indexingDataJson.hire_flag = data.hire_flag;
    indexingDataJson.video_conf_score = data.video_conf_score;
    indexingDataJson.video_comm_score = data.video_comm_score;
    utility.printLog("indexingDataJson" + indexingDataJson, constants.LOG_LEVEL.DEBUG);
    return indexingDataJson;
};

function getPersonalDetailFromJson(data, latestCompanyAddress) {
    let name = "";
    let fullAddress = "";
    if (!data) {
        utility.printLog("Personal Data Not Found", constants.LOG_LEVEL.INFO);
        return [name, fullAddress];
    }
    name = data.name;
    let address = data.address;
    let city = data.city;
    let state = data.state;
    let country = data.country;
    if (address) {
        fullAddress = fullAddress + address + " ";
    }
    if (city) {
        fullAddress = fullAddress + city + " ";
    }
    if (state) {
        fullAddress = fullAddress + state + " ";
    }
    if (country) {
        fullAddress = fullAddress + country + " ";
    }
    if (!fullAddress) {
        fullAddress = latestCompanyAddress;
    }
    return [name, fullAddress];
}

function buildSkillArrayFromJson(data) {
    let skillArray = [];
    if (!data || !data['list of techBean']) {
        utility.printLog("Candidate Skills Not found in json data", constants.LOG_LEVEL.INFO);
        return skillArray;
    }
    for (let i in data['list of techBean']) {
        skillArray.push(buildSkillObjectForIndexing(data['list of techBean'][i].technicalSkill.trim(), data['list of techBean'][i].rank));
    }
    return skillArray;
}

function getWorkExpFromJson(data) {
    let currentLocation = null;
    let totalWorkEx = "";
    if (!data) {
        utility.printLog("Work Experience Not Found from JSON Data", constants.LOG_LEVEL.INFO);
        return [totalWorkEx, currentLocation];
    }
    let firstExperienceIndex = data.length - 1;
    let latestExperience = data[0];
    if (latestExperience.companyLocation) {
        currentLocation = latestExperience.companyLocation;
    }
    let endDate = latestExperience.endDate;
    if (endDate === 'null' || 'Till Date') {
        endDate = formatDate(new Date());
    } else {
        endDate = formatDate(endDate);
    }
    let firstExperience = data[firstExperienceIndex];
    let startDate = formatDate(firstExperience.startDate);
    totalWorkEx = calculateTotalWorkEx(startDate, endDate);
    return [totalWorkEx, currentLocation];
}

exports.mappingData = function () {
    return new Promise((resolve, reject) => {
        elasticSearchObj.indices.putMapping({
            index: indexName,
            type: typeName,
            body: {
                properties: {
                    "skillSet": {
                        "type": "nested"
                    }
                }
            }
        }).then(resp => {
            if (err) {
                utility.printLog("err", constants.LOG_LEVEL.ERROR);
                reject({ "status": 500 });
            } else {
                if (resp && resp.acknowledged)
                    resolve({ "status": 200 });
                else
                    reject({ "status": 500 });
            }
        }).catch(err => {
            utility.printLog("error" + JSON.stringify(err), constants.LOG_LEVEL.ERROR);
            reject({ "message": JSON.stringify(err).msg, "status": err.status });
        })
    });
};


//Update Value
exports.updateData = function (candId, json) {
    return new Promise((resolve, reject) => {
        elasticSearchObj.update({
            id: candId,
            index: indexName,
            type: typeName,
            body: {
                doc: json
            }
        }).then(resp => {
            utility.printLog("after elastic search query" + resp, constants.LOG_LEVEL.INFO)
            if (err) {
                utility.printLog("err", constants.LOG_LEVEL.ERROR);
                reject({ "status": 500 });
            } else {
                if (resp && resp.acknowledged)
                    resolve({ "status": 200 });
                else

                    reject({ "status": 500 });
            }
        }).catch(err => {
            utility.printLog("error" + JSON.stringify(err), constants.LOG_LEVEL.ERROR);
            reject({ "message": JSON.stringify(err).msg, "status": err.status });
        })
    });
};


//Overall Match Percentage Calculation
exports.calculateSkillMatchPercentage = function (requiredSkills, preferredSkills, arr) {
    utility.printLog("Percentage Calculation Started", constants.LOG_LEVEL.INFO);
    let commaSeperatedRequiredSkills = [];
    if (requiredSkills)
        commaSeperatedRequiredSkills = requiredSkills.split(',');
    let commaSeperatedPreferredSkills = [];
    if (preferredSkills)
        preferredSkills = preferredSkills.split(',');
    let requiredSkillsLowerCase = [];
    let preferredSkillsLowerCase = [];
    for (let i = 0; i < commaSeperatedRequiredSkills.length; i++) {
        requiredSkillsLowerCase.push(commaSeperatedRequiredSkills[i].toLowerCase());
    }
    for (let i = 0; i < commaSeperatedPreferredSkills.length; i++) {
        preferredSkillsLowerCase.push(commaSeperatedPreferredSkills[i].toLowerCase());
    }
    for (let i = 0; i < arr.length; i++) {
        let obj = arr[i];
        let candSkills = [];

        for (let j = 0; j < obj.skillSet.length; j++) {
            if (!candSkills.includes(obj.skillSet[j].skill.toLowerCase().trim())) {
                candSkills.push(obj.skillSet[j].skill.toLowerCase().trim());
            }
        }
        let cummulativeRequiredSkillPercentageCalculation = 0;
        for (let j = 0; j < requiredSkillsLowerCase.length; j++) {
            for (let k = 0; k < candSkills.length; k++) {
                if (candSkills[k].trim() === requiredSkillsLowerCase[j].trim()) {
                    let rankTemp = obj.skillSet[k].rank;
                    let rankCal = rankCalculator(rankTemp);
                    cummulativeRequiredSkillPercentageCalculation = (cummulativeRequiredSkillPercentageCalculation + rankCal);
                }
            }
        }
        let aggregateRequiredSkillMatchPercentage = 0;
        if (requiredSkillsLowerCase.length > 0) {
            aggregateRequiredSkillMatchPercentage = cummulativeRequiredSkillPercentageCalculation / requiredSkillsLowerCase.length;
        }

        let numberOfPreferredSkillsMatch = 0;
        for (let j = 0; j < preferredSkillsLowerCase.length; j++) {
            for (let k = 0; k < candSkills.length; k++) {
                if (candSkills[k].trim() === preferredSkillsLowerCase[j].trim()) {
                    numberOfPreferredSkillsMatch++;
                }
            }
        }
        let preferredSkillMatchPercentage = perPreferredSkillMatchPercentage * (numberOfPreferredSkillsMatch);
        let rankOverallSkill = aggregateRequiredSkillMatchPercentage + preferredSkillMatchPercentage;
        if (rankOverallSkill > 100) {
            rankOverallSkill = 100;
        }
        obj.matchPercentage = rankOverallSkill;
    }
    arr.sort(getSortOrder("matchPercentage"));
    utility.printLog("Percentage Calculation DONE", constants.LOG_LEVEL.INFO);
    return (arr);
};


function rankCalculator(rankTemp) {
    if (rankTemp > 0 & rankTemp < 3) {
        matchPer = 100;
    } else if (rankTemp > 2 & rankTemp < 6) {
        matchPer = 95;
    } else if (rankTemp > 5 & rankTemp < 9) {
        matchPer = 90;
    } else {
        matchPer = 70;
    }
    return (matchPer);
}

function getSortOrder(prop) {
    return function (a, b) {
        if (b[prop] > a[prop]) {
            return 1;
        } else if (b[prop] < a[prop]) {
            return -1;
        }
        return 0;
    }
}

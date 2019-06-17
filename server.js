const candidateService = require('./app.js');
const jobService = require('./jobService.js')
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const moment = require('moment');
const momentPreciseRangePlugin = require("moment-precise-range-plugin");
const utility = require('./common-utility');
const constants = require('./constants');
const config = require('./config');
const cors = require('cors');
app.use(cors());
const Math = require('mathjs');
const AUTH_TOKEN = 'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6Ik9UQTFNelpFTTBRd1JqRkZSalpDUVVFMk5qTXpORU5CTlVVMlJqZzVNak5CTWtReU9UZzFPQSJ9.eyJpc3MiOiJodHRwczovLzl6ZXN0YXBwLmF1dGgwLmNvbS8iLCJzdWIiOiJhdXRoMHw1YzUwNGFlYzVkMzczZDA4ODcwYjUwNWEiLCJhdWQiOlsiaHR0cHM6Ly9kZXZhcGkuOXplc3QuY29tL3Ryb3VibGVzaG9vdCIsImh0dHBzOi8vOXplc3RhcHAuYXV0aDAuY29tL3VzZXJpbmZvIl0sImlhdCI6MTU1MTM0ODU2OSwiZXhwIjoxNTUxMzUyMTY5LCJhenAiOiJxMlZZR2ltdVpXTjd0N1M0dHBGR0xKSERhS1JLNlRycSIsInNjb3BlIjoib3BlbmlkIHByb2ZpbGUgZW1haWwgYWRkcmVzcyBwaG9uZSBvZmZsaW5lX2FjY2VzcyIsImd0eSI6InBhc3N3b3JkIn0.ESjS7cOVoGPLXE7q5_HdOAYwm948qa6w4P3mQF-ZbBIzQw0Mb1fLkLpf4PXmkWe1PzU6Wrs29Y5bN9udux5kMQXf7mTa_GDcrA0r6_6J7cIIZjkzJgnHmFNlKW9QVjPjRGQ5kKZuTSYaJ3BB-90lVbAcEgW-XPy4uqhLfqsW2Wn8x6fKm7aoXHv0dy0qzVTxhcOrvZB4f9DrmUnrrnaFGPVIPpZgUBTvOGjLDYAkN09mgwbQgB2qolasE_ltugrKEcjRQ5TQc4gTDgwfa2NnJ_s9Z5JibMoG89yhljomHzWTuXJ-eA7Ca0lLhM61VPf7vOpj3PELbihSmFKSvFyB6w';
app.use(bodyParser.json());
app.use(bodyParser.raw());

function isAuthenticated(req) {
    if (req && req.headers && req.header('Token')) {
        let token = req.header('Token');
        if (token === AUTH_TOKEN) {
            return true;
        }
        utility.printLog("Authentication Failed", constants.LOG_LEVEL.ERROR);
        return false;
    }
    utility.printLog("Request Doesn't Contain Auth Token", constants.LOG_LEVEL.ERROR);
    return false;
}
function unAuthorisedResponse(res) {
    return res.status(401).send({ "message": "You are not authorised" });
}


function doIndexing(transId, candId, json, res) {
    candidateService.indexData(transId, candId, json).then(function (resp) {
        res.status(200).send({
            "message": "Data stored successfully",
            "not_processed": resp.unProcessedCandidateId
        });
    }).catch(indexError => {
        utility.printLog("indexError" + indexError, constants.LOG_LEVEL.ERROR);
        res.status(indexError.status).send({"message": indexError.message});
    });
}

//For migrating all the data stored in Ms Sql DB to Elastic Search
app.put('/index', function (req, res) {
    utility.printLog("Indexing Request Received", constants.LOG_LEVEL.INFO);
    let transId = req.query.transId;
    let candId = req.query.candId;
    let json = req.body;
    if (!isAuthenticated(req)) {
        unAuthorisedResponse(res);
    } else {
        candidateService.mappingData().then(function (response) {
            doIndexing(transId, candId, json, res);
        }).catch(error => {
            utility.printLog("Error While Creating Mapping" + error.status, constants.LOG_LEVEL.ERROR);
            if (error.status === 404) {
                utility.printLog("Index Not Exist. Creating Index", constants.LOG_LEVEL.INFO);
                candidateService.createIndex().then(function (response) {
                    candidateService.mappingData().then(function (response) {
                        doIndexing(transId, candId, json, res);
                    }).catch(err => {
                        utility.printLog("Error while mapping", constants.LOG_LEVEL.ERROR);
                        res.status(err.status).send(error.message);
                    })
                }).catch(err => {
                    utility.printLog("Error while creating index", constants.LOG_LEVEL.ERROR);
                    res.status(err.status);
                })
            } else if(error.status){
                res.status(error.status).send(error.message);
            }else{
                doIndexing(transId, candId, json, res);
            }
        });
    }
});


//To apply job search
//For migrating all the data stored in Ms Sql DB to Elastic Search
app.put('/index-job', function (req, res) {
    utility.printLog("Indexing Request Received", constants.LOG_LEVEL.INFO);
    let jobId = req.query.jobId;
    let json = req.body;
    if (!isAuthenticated(req)) {
        unAuthorisedResponse(res);
    } else {
        jobService.indexJobData(jobId, json).then(function (resp) {
            res.status(200).send({
                "message": "Data stored successfully",
                "not_processed": resp.unProcessedjobId
            });
            console.log("jobid received", jobId);
        }).catch(indexError => {
            utility.printLog("indexError" + indexError, constants.LOG_LEVEL.ERROR);
            res.status(indexError.status).send({ "message": indexError.message });
        });
    }
});

//To apply jobSearch
app.get('/job-search/', function (req, res) {
    utility.printLog("search request received", constants.LOG_LEVEL.INFO);
    let jobId = req.query.jobId;
    let offset = req.query.offset;
    let size = req.query.size;
    if (!isAuthenticated(req)) {
        unAuthorisedResponse(res);
    } else if (!jobId) {
        res.status(400).send({ "message": "Required Parameters not passed" })
    } else {
        jobService.search(jobId).then(results => {
            let total = results.hits.total;
            let arr = [];
            for (let j in results.hits.hits) {
                let requiredSkills = results.hits.hits[j]._source.REQUIRED_SKILLS;
                let preferredSkills = results.hits.hits[j]._source.PREFERRED_SKILLS;
                let yrsOfExp = results.hits.hits[j]._source.YRS_OF_EXP;
              
                let total = results.hits.total;
                let arr = [];
                for (let j in results.hits.hits) {
                    arr.push(results.hits.hits[j]._source);
                }

                res.send({ 'total': total, 'matches': arr });
            }
        });
    }
});

function buildCandidateSearchData(arr, requiredSkills, preferredSkills) {
    arr = candidateService.calculateSkillMatchPercentage(requiredSkills, preferredSkills, arr)
    let resultArr = [];
    for (let j in arr) {
        let resultJson = {};
        let arrSkill = [];
        for (let k = 0; k < arr[j].skillSet.length; k++) {
            arrSkill.push(arr[j].skillSet[k].skill);
            if (k === 9)
                break;
        }
        resultJson.candidate_name = arr[j].candidate_name;
        resultJson.candidate_id = arr[j].candidate_id;
        resultJson.location = arr[j].candidate_location;
        resultJson.workExperience = arr[j].workExperience;
        resultJson.ownerCompanyId = arr[j].ownerCompanyId;
        resultJson.isLookingForJob = arr[j].isLookingForJob;
        resultJson.matchPercentage = arr[j].matchPercentage;
        resultJson.candidate_trans_id = arr[j].candidate_trans_id;
        resultJson.skill = arrSkill.join(",");
        resultJson.confidence = arr[j].confidence;
        resultJson.retention = arr[j].retention;
        resultJson.image_url = arr[j].image_url;
        resultJson.video_url = arr[j].video_url;
        resultJson.like_flag = arr[j].like_flag;
        resultJson.online_intrvw_flag = arr[j].online_intrvw_flag;
        resultJson.onsite_intrvw_flag = arr[j].onsite_intrvw_flag;
        resultJson.offer_flag = arr[j].offer_flag;
        resultJson.hire_flag = arr[j].hire_flag;
		resultJson.video_conf_score = arr[j].video_conf_score;
		resultJson.video_comm_score = arr[j].video_comm_score;
        resultArr.push(resultJson);
    }
    return {arr, resultArr};
}

//To apply search
app.get('/search/', function (req, res) {
    utility.printLog("Search Request Received", constants.LOG_LEVEL.INFO);
    let requiredSkills = req.query.rs;
    let preferredSkills = req.query.ps;
    let minYearsOfExperience = req.query.mye;
    let offset = req.query.offset;
    let size = req.query.size;
    let candidateId = req.query.candId;
    let transactionId = req.query.transId;
    let companyId = req.query.compId;
    let jobId = req.query.jobId;
    if (!isAuthenticated(req)) {
        unAuthorisedResponse(res);
    } else if (!requiredSkills && !preferredSkills && !minYearsOfExperience && !candidateId && !transactionId && !companyId && !jobId) {
        res.status(400).send({ "message": "Required Parameters not passed" })
    }
    else if (jobId) {
        jobService.search(jobId).then(results => {
            for (let j in results.hits.hits) {
                requiredSkills = results.hits.hits[j]._source.REQUIRED_SKILLS;
                preferredSkills = results.hits.hits[j]._source.PREFERRED_SKILLS;
                minYearsOfExperience = results.hits.hits[j]._source.YRS_OF_EXP;
            }
            candidateService.search(requiredSkills, preferredSkills, minYearsOfExperience, offset, size, candidateId, transactionId, companyId).then(results => {
                let total = results.hits.total;
                let arr = [];
                for (let j in results.hits.hits) {
                    arr.push(results.hits.hits[j]._source);
                }
                const __ret = buildCandidateSearchData(arr, requiredSkills, preferredSkills);
                arr = __ret.arr;
                let resultArr = __ret.resultArr;
                res.send({ 'total': total, 'matches': resultArr });
            }).catch(error => {
                console.error(error);
                res.status(500).send({ "message": "Something went bad." });
            });
        }).catch(error => {
            console.error(error);
            res.status(500).send({ "message": "Something went bad." });
        });
    }
    else {
        candidateService.search(requiredSkills, preferredSkills, minYearsOfExperience, offset, size, candidateId, transactionId, companyId).then(results => {
            let total = results.hits.total;
            let arr = [];
            for (let j in results.hits.hits) {
                arr.push(results.hits.hits[j]._source);
            }
            const __ret = buildCandidateSearchData(arr, requiredSkills, preferredSkills);
            arr = __ret.arr;
            let resultArr = __ret.resultArr;
            res.send({ 'total': total, 'matches': resultArr });
        }).catch(error => {
            console.error(error);
            res.status(500).send({ "message": "Something went bad." });
        });
    }
});

//To do Mapping in ElasticSearch
app.get('/mapping', function (req, res) {
    utility.printLog("Mapping Creation Request Received", constants.LOG_LEVEL.INFO);
    if (!isAuthenticated(req)) {
        unAuthorisedResponse(res);
    } else {
        candidateService.mappingData().then(function (response) {
            res.status(200).send({ "message": "Mapping Created" });
        }).catch(error => {
            res.status(500).send({ "message": "Something Went Bad" });
        });
    }
});

app.put('/update',function (req, res) {
    utility.printLog("Updating Request Received", constants.LOG_LEVEL.INFO);
    let candId = req.query.candId;
    let json = req.body;
    if (!isAuthenticated(req)) {
        unAuthorisedResponse(res);
    } else {
        candidateService.updateData(candId, json).then(function (response) {
            res.status(200).send({ "message": "Updated" });
        }).catch(error => {
            if(error.status)
                res.status(error.status).send({ "message": "Something Went Bad" });
            else
                res.status(200).send({ "message": "Updated" });
        });
    }
});

app.listen(config.APPLICATION_PORT);
module.exports = app;


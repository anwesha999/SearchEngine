module.exports.sqlQueries = {
    queryAllCandidate: 'select [CANDIDATE_ID] from CANDIDATES',
    queryTransaction: 'Select CANDIDATE_ID from CANDIDATE_TRANSACTIONS where CANDIDATE_TRANS_ID =',
    queryWorkexp: "select Min(CONVERT(varchar,[START_DATE], 110))as startDate, Max(case when ([END_DATE]='Till Date' OR [END_DATE]='PRESENT'OR [END_DATE]='NULL') then convert(varchar ,GETDATE(), 110) else CONVERT(varchar,[END_DATE], 110)end)as endDate from [CANDIDATE_TRANS_WORK_EXP] where [CANDIDATE_TRANS_ID] =",
    queryMapping: 'Select MAX(CANDIDATE_TRANS_ID)AS trans_id from CANDIDATE_TRANSACTIONS where CANDIDATE_ID =',
    queryPersonalData: 'select CANDIDATE_ID, [FIRST_NAME], [LAST_NAME] from CANDIDATES  where CANDIDATE_ID =',
    queryLocation: "select [HOME_ADDR_CONCAT] from [CANDIDATE_TRANSACTIONS] where [CANDIDATE_TRANS_ID]=",
    querySkills: "select skill_value, skill_rank from [candidate_trans_skills] where [CANDIDATE_TRANS_ID]=",
    queryLatestWorkExp1: "select [CLIENT_LOCATION_CONCAT] from candidate_trans_work_exp where " +
        "candidate_trans_id = ",
    queryLatestWorkExp2: " and (end_date = 'PRESENT' OR end_date = 'TILL_DATE' ",
    queryLatestWorkExp3: " OR end_date = '",
    queryLatestWorkExp4: "')"
};
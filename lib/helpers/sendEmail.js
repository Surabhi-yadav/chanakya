const AWS = require('aws-sdk');
// Set the region
const CONSTANTS = require('../constants');
const _ = require('underscore');
const handleBar = require("./handleBarsConfig");
const fs = require('fs');
const { promisify } = require("util");


const SESEmail = (receiverEmails, text, CcEmails = [], subject = '', isHtmlText = false) => {
	AWS.config.update({
		region: 'us-east-1',
		accessKeyId: CONSTANTS.aws.ses.accessKey,
		secretAccessKey: CONSTANTS.aws.ses.secretKey,
	});

	let params = {
		Destination: {
			/* required */
			CcAddresses: CcEmails,
			ToAddresses: receiverEmails,
		},
		Message: {
			/* required */
			Body: {
				/* required */
			},
			Subject: {
				Charset: CONSTANTS.aws.ses.charset,
				Data: subject,
			},
		},
		Source: CONSTANTS.aws.ses.senderEmail /* required */,
	};

	params['Message']['Body'][isHtmlText ? 'Html' : 'Text'] = {
		Charset: CONSTANTS.aws.ses.charset,
		Data: text,
	};

	// Create the promise and SES service object
	const sesParam = {
		apiVersion: CONSTANTS.aws.ses.apiVersion,
	};
	let sendPromise = new AWS.SES(sesParam).sendEmail(params).promise();

	// Handle promise's fulfilled/rejected states
	return sendPromise
		.then(function(data) {
			return Promise.resolve();
		})
		.catch(function(err) {
			console.error(err, err.stack);
			return Promise.reject();
		});
};

/**
 * 
 * @param {
 *          keysAdded: 0, // Total number of new keys added
            incomingCallAdded: 0, // Total number of new incoming call added

            syncErrors: {

                // errors while syncing the platform with gSheet
                platform : {
                    enrolmentKeys: [], // {key: 'EDT567', errors: ['errors']}
                    incomingCalls: []  // {id: 3, errors: ['errors']}
                },
            }
 * } reports 
 */
const sendEmailReport = reports => {

	const source = fs.readFileSync(CONSTANTS.gSheet.emailReport.syncReportHTMLReport, "utf-8")
	const htmlString = handleBar.compile(source)(reports)
	const receiverEmails = CONSTANTS.gSheet.emailReport.to;
	const CcEmails = CONSTANTS.gSheet.emailReport.cc;
	const subject = CONSTANTS.gSheet.emailReport.subject;
	return SESEmail(receiverEmails, htmlString, CcEmails, subject, true);
}


module.exports = {
	sendEmailReport: sendEmailReport,
	SESEmail: SESEmail,
};

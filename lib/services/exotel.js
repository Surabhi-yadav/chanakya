'use strict';

const Schmervice = require('schmervice');
const axios = require("axios");
const querystring = require('querystring');
const CONSTANTS = require('../constants');

module.exports = class ExotelService extends Schmervice.Service {

    constructor() {
        super();
        this.axios = axios.create({
            baseURL: 'https://api.exotel.in/v1/Accounts/' + CONSTANTS.exotel.sid,
            auth: {
                username: CONSTANTS.exotel.sid,
                password: CONSTANTS.exotel.token
            }
        });
    }
    
    hasTemplateForStage(stage){
        return stage in CONSTANTS.smsTemplates
    }

    async sendSMS(mobile, template, templateContext={}) {
        let response;
        try{
            console.log(CONSTANTS.smsTemplates[template](templateContext));
            return await this.axios.post('/Sms/send', querystring.stringify({
                From: CONSTANTS.exotel.senderId,
                To: mobile,
                Body: CONSTANTS.smsTemplates[template](templateContext)
            }));
        } catch(e) {
            // returning true here as promise won't fail and if the sms is sent to a malformed number
            // which exotel rejects, the code would still go on. otherwise if the message is sent to a
            // malformed number resulting into an error by exotel, there would be infinite tries because
            // of sync from exotel and result in heavy bills. this is super important. we've already lost
            // more than INR 10k in this :( :(
            console.log(e);
            return true;
        }
    }

};

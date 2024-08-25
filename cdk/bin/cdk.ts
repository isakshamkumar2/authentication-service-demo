#!/usr/bin/env node
import 'source-map-support/register';
import { AuthenticationService } from '../lib/auth-service-stack';
import { App } from 'aws-cdk-lib';
import * as dotenv from 'dotenv';
import { AUTHENTICATION_SERVICE_NAME } from '../lib/constants';
dotenv.config();

const app = new App();
new AuthenticationService(app, `${AUTHENTICATION_SERVICE_NAME}STACK`, {
  env:{
    account: process.env.AWS_ACCOUNT_ID,
    region: process.env.AWS_REGION
  }
});
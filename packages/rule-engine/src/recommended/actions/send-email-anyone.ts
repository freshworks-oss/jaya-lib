import { ProductEventPayload } from '@freshworks-jaya/marketplace-models';
import { Integrations, RuleEngineOptions } from '../../models/rule-engine';
import axios from 'axios';
import { AnyJson, Api, SendEmailAnyoneValue } from '../../models/rule';
import { Utils } from '../../Utils';
import { PlaceholdersMap } from '@freshworks-jaya/utilities';
import { ErrorCodes } from '../../models/error-codes';
import { LogSeverity } from '../../services/GoogleCloudLogging';
import constants from '../Constants';

export default async (
  integrations: Integrations,
  productEventPayload: ProductEventPayload,
  actionValue: unknown,
  placeholders: PlaceholdersMap,
  apis: Api[],
  options: RuleEngineOptions,
  ruleAlias: string,
): Promise<PlaceholdersMap> => {
  const modelProperties = productEventPayload.data.conversation || productEventPayload.data.message;
  const appId = constants.DEFAULT_ACCOUNT_ID;

  if (!integrations.emailService) {
    return Promise.reject('No email service integration');
  }

  const sendEmailAnyoneValue = actionValue as SendEmailAnyoneValue;
  let generatedPlaceholders: PlaceholdersMap = {};

  try {
    // Step 1: Setup dynamic placeholders using values from subject and body
    generatedPlaceholders = await Utils.getDynamicPlaceholders(
      `${sendEmailAnyoneValue.subject} ${sendEmailAnyoneValue.body}`,
      productEventPayload,
      integrations,
      placeholders,
      options,
      ruleAlias,
    );

    const combinedPlaceholders = { ...placeholders, ...generatedPlaceholders };

    // Step 2: Replace placeholders in subject and body
    const emailTo = sendEmailAnyoneValue.to.map((email) => {
      return {
        email: Utils.processHandlebarsAndReplacePlaceholders(email, combinedPlaceholders),
      };
    });

    // Replace end-of-line characters with <br>
    sendEmailAnyoneValue.body = sendEmailAnyoneValue.body.replace(/(?:\r\n|\r|\n)/g, '<br>');

    const emailParams = {
      body: Utils.processHandlebarsAndReplacePlaceholders(sendEmailAnyoneValue.body, combinedPlaceholders),
      subject: Utils.processHandlebarsAndReplacePlaceholders(sendEmailAnyoneValue.subject, combinedPlaceholders),
      to: emailTo,
    };

    // Step 3: Make send email API call
    const emailResponse = await axios.post(
      `${integrations.emailService.url}/api/v1/email/send`,
      JSON.stringify({
        accountId: appId,
        from: {
          email: 'no-reply@freshchat.com',
          name: 'Automated response',
        },
        html: emailParams.body,
        subject: emailParams.subject,
        to: emailParams.to,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          authorization: integrations.emailService.apiKey,
        },
      },
    );

    Utils.log(
      productEventPayload,
      integrations,
      ErrorCodes.EmailTrace,
      {
        data: emailResponse?.data,
      },
      LogSeverity.INFO,
    );
  } catch (err) {
    Utils.log(productEventPayload, integrations, ErrorCodes.SendEmail, {
      error: (axios.isAxiosError(err) ? err.response?.data : err) as AnyJson,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return Promise.reject('Failed to setup dynamic placeholders');
  }

  return Promise.resolve(generatedPlaceholders);
};

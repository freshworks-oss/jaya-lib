import { ProductEventPayload } from '@freshworks-jaya/marketplace-models';
import Freshchat from '@freshworks-jaya/freshchat-api';
import { PlaceholdersMap } from '@freshworks-jaya/utilities';
import { Integrations, RuleEngineOptions } from '../../models/rule-engine';
import { Utils } from '../../Utils';
import { AnyJson, Api } from '../../models/rule';
import { ErrorCodes, ErrorTypes } from '../../models/error-codes';
import { LogSeverity } from '../../services/GoogleCloudLogging';

export default async (
  integrations: Integrations,
  productEventPayload: ProductEventPayload,
  actionValue: unknown,
  placeholders: PlaceholdersMap,
  apis: Api[],
  options: RuleEngineOptions,
  ruleAlias: string,
): Promise<PlaceholdersMap> => {
  const freshchatApiUrl = integrations.freshchatv2.url;
  const freshchatApiToken = integrations.freshchatv2.token;
  const freshchat = new Freshchat(freshchatApiUrl, freshchatApiToken, ruleAlias);
  const modelProperties = productEventPayload.data.conversation || productEventPayload.data.message;
  const conversationId = modelProperties.conversation_id;

  let generatedPlaceholders: PlaceholdersMap = {};

  try {
    generatedPlaceholders = await Utils.getDynamicPlaceholders(
      actionValue as string,
      productEventPayload,
      integrations,
      placeholders,
      options,
      ruleAlias,
    );

    const combinedPlaceholders = { ...placeholders, ...generatedPlaceholders };

    await freshchat.postMessage(
      conversationId,
      Utils.processHandlebarsAndReplacePlaceholders(actionValue as string, combinedPlaceholders),
      'private',
      'bot',
    );
  } catch (err) {
    Utils.log(
      productEventPayload,
      integrations,
      ErrorCodes.FreshchatAction,
      {
        error: err as AnyJson,
        errorType: ErrorTypes.FreshchatSendPrivateNote,
      },
      LogSeverity.ERROR,
    );
    return Promise.reject();
  }

  return Promise.resolve(generatedPlaceholders);
};

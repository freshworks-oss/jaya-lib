import { ProductEventPayload } from '@freshworks-jaya/marketplace-models';
import Freshchat from '@freshworks-jaya/freshchat-api';
import { PlaceholdersMap } from '@freshworks-jaya/utilities';
import { Integrations, RuleEngineOptions } from '../../models/rule-engine';
import { Utils } from '../../Utils';
import { Api, PropertiesConditionValue, JsonMap, AnyJson } from '../../models/rule';
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
  const status = modelProperties.status;

  const convPropertiesActionValue = actionValue as PropertiesConditionValue;
  try {
    let properties;
    if (Array.isArray(convPropertiesActionValue.propertyValue)) {
      properties = {
        [convPropertiesActionValue.propertyKey]: convPropertiesActionValue.propertyValue,
      };
    } else {
      let generatedPlaceholders: PlaceholdersMap = {};
      generatedPlaceholders = await Utils.getDynamicPlaceholders(
        convPropertiesActionValue.propertyValue,
        productEventPayload,
        integrations,
        placeholders,
        options,
        ruleAlias,
      );
      const combinedPlaceholders = { ...placeholders, ...generatedPlaceholders };

      properties = {
        [convPropertiesActionValue.propertyKey]: Utils.processHandlebarsAndReplacePlaceholders(
          convPropertiesActionValue.propertyValue,
          combinedPlaceholders,
        ),
      };
    }

    if (Utils.isFeatureFlagEnabled(integrations, 'EXCLUSIVE_UPDATE_FOR_CONV_PROP')) {
      await freshchat.conversationPropertiesUpdate(conversationId, properties, null);
    } else {
      await freshchat.conversationPropertiesUpdate(conversationId, properties, status);
    }
  } catch (err) {
    Utils.log(
      productEventPayload,
      integrations,
      ErrorCodes.FreshchatAction,
      {
        error: err as AnyJson,
        errorType: ErrorTypes.FreshchatUpdateProperty,
        properties: err as JsonMap,
        propertyKey: convPropertiesActionValue.propertyKey,
        propertyValue: convPropertiesActionValue.propertyValue,
      },
      LogSeverity.ERROR,
    );
    return Promise.reject();
  }

  return Promise.resolve({});
};

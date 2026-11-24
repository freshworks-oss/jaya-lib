import { ProductEventPayload } from '@freshworks-jaya/marketplace-models';
import Freshchat from '@freshworks-jaya/freshchat-api';
import { PlaceholdersMap } from '@freshworks-jaya/utilities';
import { Integrations, RuleEngineOptions } from '../../models/rule-engine';
import { Utils } from '../../Utils';
import { AnyJson, Api, PropertiesConditionValue } from '../../models/rule';
import { ErrorCodes, ErrorTypes } from '../../models/error-codes';
import { LogSeverity } from '../../services/GoogleCloudLogging';

type PropertiesConditionPayload = PropertiesConditionValue[] | PropertiesConditionValue;

const getConditionPayload = (payload: PropertiesConditionPayload) => {
  return Array.isArray(payload) ? payload : [payload];
};

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

  const userPropertiesActionValue = getConditionPayload(actionValue as PropertiesConditionPayload);
  let generatedPlaceholders: PlaceholdersMap = {};

  const getPropertiesPayload = (
    propertiesPayload: PropertiesConditionValue[],
    combinedPlaceholders: PlaceholdersMap,
  ) => {
    return propertiesPayload.map((property: PropertiesConditionValue) => {
      return {
        name: property.propertyKey,
        value: Utils.processHandlebarsAndReplacePlaceholders(property.propertyValue, combinedPlaceholders),
      };
    });
  };

  try {
    let combinedPlaceholders = { ...placeholders };

    userPropertiesActionValue.forEach(async (property) => {
      generatedPlaceholders = await Utils.getDynamicPlaceholders(
        property.propertyValue,
        productEventPayload,
        integrations,
        placeholders,
        options,
        ruleAlias,
      );

      combinedPlaceholders = { ...combinedPlaceholders, ...generatedPlaceholders };
    });

    await freshchat.updateUser(productEventPayload.data.associations.user.id, {
      properties: getPropertiesPayload(userPropertiesActionValue, combinedPlaceholders),
    });
  } catch (err) {
    Utils.log(
      productEventPayload,
      integrations,
      ErrorCodes.FreshchatAction,
      {
        error: err as AnyJson,
        errorType: ErrorTypes.FreshchatUpdateProperty,
      },
      LogSeverity.ERROR,
    );
    return Promise.reject();
  }

  return Promise.resolve(generatedPlaceholders);
};

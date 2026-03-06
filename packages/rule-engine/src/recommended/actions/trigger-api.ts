import { ProductEventPayload } from '@freshworks-jaya/marketplace-models';
import { requestAxiosWrapper } from '@freshworks-jaya/marketplace-models/lib/services/request';
import { Integrations, RuleEngineOptions } from '../../models/rule-engine';
import { set, get } from 'lodash';
import {
  AnyJson,
  Api,
  JsonArray,
  JsonMap,
  TriggerWebhookValue,
  WebhookContentType,
  WebhookRequestType,
} from '../../models/rule';
import { PlaceholdersMap } from '@freshworks-jaya/utilities';
import { AxiosRequestConfig } from 'axios';
import querystring, { ParsedUrlQueryInput } from 'querystring';
import { Utils } from '../../Utils';
import * as _ from 'lodash';
import { APITraceCodes, ErrorCodes } from '../../models/error-codes';
import { LogSeverity } from '../../services/GoogleCloudLogging';

const contentTypeMap: {
  [key in WebhookContentType]: string;
} = {
  [WebhookContentType.Json]: 'application/json',
  [WebhookContentType.UrlEncoded]: 'application/x-www-form-urlencoded',
  [WebhookContentType.Xml]: 'application/xml',
};

const contentMap: {
  [key in WebhookContentType]: (content: string | JsonMap) => string;
} = {
  [WebhookContentType.Json]: (content: string | JsonMap) => {
    return JSON.stringify(content);
  },
  [WebhookContentType.UrlEncoded]: (content: string | JsonMap) => {
    return querystring.stringify(content as ParsedUrlQueryInput, '&', '=');
  },
  [WebhookContentType.Xml]: (content: string | JsonMap) => {
    return content as string;
  },
};

const isRequestTypeContentMap: {
  [key in WebhookRequestType]: boolean;
} = {
  [WebhookRequestType.Get]: false,
  [WebhookRequestType.Post]: true,
  [WebhookRequestType.Put]: true,
  [WebhookRequestType.Patch]: true,
  [WebhookRequestType.Delete]: false,
};

const replacePlaceholdersInObject = (jsonMap: JsonMap | JsonArray, combinedPlaceholders: PlaceholdersMap): void => {
  (function traverseObject(json: JsonMap | JsonArray): void {
    _.forOwn(json, (value, key) => {
      if (_.isString(value)) {
        (json as JsonMap)[key] = Utils.processHandlebarsAndReplacePlaceholders(value as string, combinedPlaceholders);
      } else if (_.isObject(value) || _.isArray(value)) {
        traverseObject(value as JsonArray | JsonMap);
      } else if (_.isInteger(value)) {
        (json as JsonMap)[key] = Number(value);
      }
    });
  })(jsonMap);
};

const getReplacedContent = (
  content: string,
  combinedPlaceholders: PlaceholdersMap,
  contentType: WebhookContentType,
): string | JsonMap => {
  if (contentType === WebhookContentType.Xml) {
    return Utils.processHandlebarsAndReplacePlaceholders(content, combinedPlaceholders);
  }

  const jsonContent = Utils.safelyParseJson(content, { allowArray: true });

  if (jsonContent) {
    replacePlaceholdersInObject(jsonContent, combinedPlaceholders);
  }

  return jsonContent || {};
};

const getReplacedHeaders = (content: string, combinedPlaceholders: PlaceholdersMap): JsonMap => {
  // replacePlaceholdersInObject(triggerWebhookValue.customHeaders, combinedPlaceholders);
  // Step 1: Parse content to JSON
  const jsonHeaders = Utils.safelyParseJson(content);

  // Step 2: replacePlaceholdersInObject
  if (jsonHeaders) {
    replacePlaceholdersInObject(jsonHeaders, combinedPlaceholders);
  }

  return jsonHeaders || {};
};

const getRequestConfig = (
  triggerWebhookValue: TriggerWebhookValue,
  combinedPlaceholders: PlaceholdersMap,
): AxiosRequestConfig => {
  // Step 1: Add mandatory method and url parameters
  const axiosRequestConfig: AxiosRequestConfig = {
    method: triggerWebhookValue.requestType,
    url: Utils.processHandlebarsAndReplacePlaceholders(triggerWebhookValue.url, combinedPlaceholders),
  };

  // Step 2: Add custom headers if available
  if (triggerWebhookValue.customHeaders) {
    // Parse custom headers to json
    axiosRequestConfig.headers = getReplacedHeaders(triggerWebhookValue.customHeaders, combinedPlaceholders);
  }

  // Step 3: Handle authentication
  if (triggerWebhookValue.authHeader?.username && triggerWebhookValue.authHeader?.password) {
    // Simple auth with username and password
    axiosRequestConfig.auth = {
      password: Utils.processHandlebarsAndReplacePlaceholders(
        triggerWebhookValue.authHeader.password,
        combinedPlaceholders,
      ),
      username: Utils.processHandlebarsAndReplacePlaceholders(
        triggerWebhookValue.authHeader.username,
        combinedPlaceholders,
      ),
    };
  } else if (triggerWebhookValue.authHeader?.apiKey) {
    // API key based authentication
    if (!axiosRequestConfig.headers) {
      axiosRequestConfig.headers = {};
    }

    axiosRequestConfig.headers['Authorization'] = `Bearer ${Utils.processHandlebarsAndReplacePlaceholders(
      triggerWebhookValue.authHeader.apiKey,
      combinedPlaceholders,
    )}`;
  }

  // Step 4: Handle contentType
  if (triggerWebhookValue.contentType) {
    const {headers, data} = handleContentTypeHeader(axiosRequestConfig, triggerWebhookValue, combinedPlaceholders);

    axiosRequestConfig.headers = headers;

    if (data) {
      axiosRequestConfig.data = data;
    }
  }

  return axiosRequestConfig;
};

const handleContentTypeHeader = (
  axiosRequestConfig: AxiosRequestConfig,
  triggerWebhookValue: TriggerWebhookValue,
  combinedPlaceholders: PlaceholdersMap,
): AxiosRequestConfig => {
  const headers: JsonMap = axiosRequestConfig.headers ?? {},
    contentType: WebhookContentType = triggerWebhookValue.contentType as WebhookContentType;
  let data = null;

  if(!headers['Content-Type']) {
    headers['Content-Type'] = contentTypeMap[contentType];
  }

  if (triggerWebhookValue.content && isRequestTypeContentMap[triggerWebhookValue.requestType]) {
    // Step 5: Handle content based on content-type
    const replacedContent = getReplacedContent(triggerWebhookValue.content, combinedPlaceholders, contentType);

    data = contentMap[contentType](replacedContent);
  }

  return { data, headers };
};

const handleFieldTypeCast = (config: TriggerWebhookValue, replacedData: string) => {
  const data = replacedData ? JSON.parse(replacedData) : {};

  if (config?.castArray?.length) {
    const castArray = config?.castArray;

    for (let i = 0; i < castArray.length; ++i) {
      const { key, type } = castArray[i];

      switch (type) {
        case 'boolean':
          set(data, key, Boolean(get(data, key)));
          break;
        case 'number':
          set(data, key, Number(get(data, key)));
          break;
        case 'string':
        default:
          set(data, key, String(get(data, key)));
          break;
      }
    }
  }

  return JSON.stringify(data);
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
  const triggerApiModelName = actionValue as string;
  const triggerApi = apis.find((api) => api.responseModelName === triggerApiModelName);

  if (!triggerApi) {
    throw new Error('Api not found');
  }

  let combinedPlaceholders: PlaceholdersMap = await generatePlaceholders(
    triggerApi.config,
    productEventPayload,
    integrations,
    placeholders,
    options,
    ruleAlias,
  );

  let axiosRequestConfig;

  try {
    axiosRequestConfig = getRequestConfig(triggerApi.config, combinedPlaceholders);
    axiosRequestConfig.data = handleFieldTypeCast(triggerApi.config, axiosRequestConfig.data);
  } catch (e) {
    Utils.log(productEventPayload, integrations, ErrorCodes.APIConfigError, {
      apiName: triggerApi.name,
      config: axiosRequestConfig as unknown as AnyJson,
      error: e as AnyJson
    });
    throw e; // re-throw the error after logging
  }

  try {
    const dateBeforeTrigger = new Date();
    const webhookResponse = await makeApiCall(axiosRequestConfig, triggerApi, integrations, productEventPayload);

    const dateAfterTrigger = new Date();
    logApiResponseTime(
      productEventPayload,
      integrations,
      triggerApi,
      dateBeforeTrigger,
      dateAfterTrigger,
      axiosRequestConfig.headers
    );
  
    return { [triggerApi.responseModelName]: webhookResponse.data };
  } catch (error) {
    Utils.log(productEventPayload, integrations, ErrorCodes.TriggerAPITrace, {
      apiName: triggerApi.name,
      error: error as AnyJson,
    }, LogSeverity.CRITICAL);
    throw error
  }
};

async function generatePlaceholders(
  config: any,
  productEventPayload: ProductEventPayload,
  integrations: Integrations,
  placeholders: PlaceholdersMap,
  options: RuleEngineOptions,
  ruleAlias: string,
): Promise<PlaceholdersMap> {
  try {
    const generatedPlaceholders = await Utils.getDynamicPlaceholders(
      JSON.stringify(config),
      productEventPayload,
      integrations,
      placeholders,
      options,
      ruleAlias,
    );

    return { ...placeholders, ...generatedPlaceholders };
  } catch (err) {
    throw new Error('Failed to generate dynamic placeholders map');
  }
}

async function makeApiCall(
  axiosRequestConfig: any,
  triggerApi: Api,
  integrations: Integrations,
  productEventPayload: ProductEventPayload
): Promise<any> {
  try {
    return await requestAxiosWrapper<JsonMap>(axiosRequestConfig, {
      isUseStaticIP: triggerApi.isUseStaticIP,
      requestProxy: integrations.marketplaceServices.requestProxy,
    });
  } catch (err) {
    Utils.log(productEventPayload, integrations, ErrorCodes.TriggerAPIError, {
      apiName: triggerApi.name,
      error: err as AnyJson,
    });
    throw new Error('Trigger webhook failure');
  }
}

function logApiResponseTime(
  productEventPayload: ProductEventPayload,
  integrations: Integrations,
  triggerApi: Api,
  dateBeforeTrigger: Date,
  dateAfterTrigger: Date,
  headers: Headers
): void {
  const apiResponseTimeInMilliseconds = dateAfterTrigger.getTime() - dateBeforeTrigger.getTime();

  Utils.log(
    productEventPayload,
    integrations,
    ErrorCodes.TriggerAPITrace,
    {
      apiName: triggerApi.name,
      apiResponseMillis: apiResponseTimeInMilliseconds,
      headers: headers as unknown as AnyJson,
      timestampAfterTrigger: dateAfterTrigger.toISOString(),
      timestampBeforeTrigger: dateBeforeTrigger.toISOString(),
    },
    LogSeverity.INFO,
  );
}
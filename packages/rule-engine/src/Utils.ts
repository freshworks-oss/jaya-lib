import { ConditionOperator } from './index';
import ruleConfig from './RuleConfig';
import { Integrations, RuleEngineOptions } from './models/rule-engine';
import Helpers from 'handlebars-helpers';
import axios from 'axios';
import {
  BusinessHour,
  findMatchingKeys,
  PlaceholdersMap,
  findAndReplacePlaceholders,
} from '@freshworks-jaya/utilities';
import {
  ActorSubEntity,
  ActorType,
  Message,
  MessagePart,
  MessageType,
  ModelProperties,
  ProductEventData,
  ProductEventPayload,
} from '@freshworks-jaya/marketplace-models';
import Freshchat from '@freshworks-jaya/freshchat-api';
import Handlebars from 'handlebars';
import { htmlToText } from 'html-to-text';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { APITraceCodes, ErrorCodes } from './models/error-codes';
import { AnyJson, ConditionDataType, JsonMap } from './models/rule';
import { GoogleCloudLogging, LogSeverity } from './services/GoogleCloudLogging';

dayjs.extend(utc);

// Register Handlebars helpers
Handlebars.registerHelper(Helpers());
Handlebars.registerHelper(
  'date',
  function (context: string, block: { hash: { format: string | undefined; offset: string } }) {
    let date = dayjs(context);

    const offsetString = block?.hash?.offset;
    const offsetNumber = offsetString && parseInt(offsetString, 10);

    if (Number.isInteger(offsetNumber)) {
      date = date.utcOffset(offsetNumber as number);
    }

    if (block?.hash?.format) {
      return date.format(block.hash.format);
    }

    return date.format();
  },
);
Handlebars.registerHelper('htmlToText', function (context: string) {
  return htmlToText(context);
});
Handlebars.registerHelper('matchRegex', function (sentence: string, regex: RegExp) {
  const isRegExp = (val: RegExp | JsonMap): boolean => {
    if (val instanceof RegExp) {
      return true;
    }

    return (
      typeof val.flags === 'string' &&
      typeof val.ignoreCase === 'boolean' &&
      typeof val.multiline === 'boolean' &&
      typeof val.global === 'boolean'
    );
  };

  if (!(typeof sentence === 'string' && sentence !== '')) {
    return [];
  }
  if (!isRegExp(regex)) {
    throw new TypeError('expected a regular expression');
  }
  return sentence.match(regex);
});

export class Utils {
  public static safelyParseJson(value: string, options?: { allowArray?: boolean }): JsonMap | null {
    try {
      const jsonMap: JsonMap = JSON.parse(value);
      if (
        (typeof jsonMap === 'object' && jsonMap.constructor === Object) ||
        (options?.allowArray && Array.isArray(jsonMap))
      ) {
        return jsonMap;
      }

      throw new Error('Not a valid Json Map');
    } catch (err) {
      return null;
    }
  }

  /**
   * Logs the given event payload to Google Cloud Logging.
   *
   * @param {ProductEventPayload} productEventPayload - The payload of the product event.
   * @param {Integrations} integrations - The integrations object containing the Google Cloud Logging configuration.
   * @param {ErrorCodes | APITraceCodes} errorCode - The error or trace code associated with the event.
   * @param {JsonMap | AnyJson} info - Additional information to be logged.
   * @param {LogSeverity} [severity=LogSeverity.ERROR] - The severity of the log. Defaults to ERROR.
   *
   * @returns {Promise<void>} A Promise that resolves when the log has been successfully written.
   *
   * @throws Will throw an error if the logging fails.
   */
  
  public static async log(
    productEventPayload: ProductEventPayload,
    integrations: Integrations,
    errorCode: ErrorCodes | APITraceCodes,
    info: JsonMap | AnyJson,
    severity: LogSeverity = LogSeverity.ERROR,
  ): Promise<void> {
    try {
      const { data, domain, timestamp, event, region } = productEventPayload;
      const conversation = data?.conversation || data?.message;
      const { conversation_id: conversationId, app_id: appAlias, messages } = conversation || {};
      const messageId = messages?.[0]?.id || 0;
      const { sub_entity: actorSubentity = null, type: actorType } = data.actor;
  
      const googleCloudLogging = new GoogleCloudLogging(integrations.googleCloudLoggingConfig);
      
      await googleCloudLogging.log(
        {
          actor_subentity: actorSubentity,
          actor_type: actorType,
          appAlias,
          conversation_id: conversationId,
          domain,
          error_code: errorCode,
          event_epoch: new Date(timestamp * 1000).toISOString(),
          event_name: event,
          info,
          message_id: messageId,
          region,
        },
        severity,
      );
    } catch (err) {}
  }

  /**
   * Gets a concatenated string of messageParts with type 'text'.
   */
  public static getMessagePartsTextContent(messageParts: MessagePart[]): string {
    let messageContent = '';

    if (messageParts && messageParts.length) {
      messageContent = messageParts
        .filter((messagePart) => messagePart.text || messagePart.email)
        .map((messagePart) => {
          return (messagePart.text && messagePart.text.content) || (messagePart.email && messagePart.email.subject);
        })
        .join(' ');
    }

    return messageContent;
  }

  /**
   * Collects messages from both `message` and `conversation` models on a product event.
   */
  public static getMessagesFromProductEventData(productEventData: ProductEventData): Message[] {
    const messages: Message[] = [];
    const seenIds = new Set<string>();

    const appendMessages = (modelMessages?: Message[]) => {
      if (!modelMessages) {
        return;
      }
      modelMessages.forEach((message) => {
        if (!seenIds.has(message.id)) {
          seenIds.add(message.id);
          messages.push(message);
        }
      });
    };

    appendMessages(productEventData.message?.messages);
    appendMessages(productEventData.conversation?.messages);

    return messages;
  }

  /**
   * System/reopen status messages must not satisfy MESSAGE_TEXT conditions.
   */
  public static isRelevantMessageTextMessage(message: Message): boolean {
    if (message.message_type === MessageType.System) {
      return false;
    }

    const metaData = message as Message & { meta_data?: { isReopen?: boolean } };
    if (metaData.meta_data?.isReopen) {
      return false;
    }

    return message.message_type === MessageType.Normal;
  }

  /**
   * Resolves the message body used for MESSAGE_TEXT (and similar) conditions from the event payload.
   * Prefers the `message` model on onMessageCreate, then the latest non-system normal message.
   */
  public static getConditionMessageText(productEventData: ProductEventData): string {
    const messageModelFirst = productEventData.message?.messages?.[0];
    if (messageModelFirst && this.isRelevantMessageTextMessage(messageModelFirst)) {
      return this.getMessagePartsTextContent(messageModelFirst.message_parts);
    }

    const eventMessages = this.getMessagesFromProductEventData(productEventData);
    for (let index = eventMessages.length - 1; index >= 0; index -= 1) {
      const message = eventMessages[index];
      if (this.isRelevantMessageTextMessage(message)) {
        return this.getMessagePartsTextContent(message.message_parts);
      }
    }

    return '';
  }

  public static shouldFetchUserMessageTextForConditions(productEventData: ProductEventData): boolean {
    if (this.getConditionMessageText(productEventData)) {
      return false;
    }

    const { actor } = productEventData;
    return actor.type === ActorType.User || actor.sub_entity === ActorSubEntity.UserMessage;
  }

  public static async fetchLatestUserMessageText(
    productEventData: ProductEventData,
    integrations: Integrations,
    ruleAlias: string,
  ): Promise<string> {
    const modelProperties = productEventData.conversation || productEventData.message;
    const conversationId = modelProperties?.conversation_id;

    if (!conversationId) {
      return '';
    }

    const freshchatApiUrl = integrations.freshchatv2.url;
    const freshchatApiToken = integrations.freshchatv2.token;
    const freshchat = new Freshchat(freshchatApiUrl, freshchatApiToken, ruleAlias);

    try {
      const messages = await freshchat.getConversationMessages(conversationId);
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message.actor_type === ActorType.User && message.message_type === MessageType.Normal) {
          return this.getMessagePartsTextContent(message.message_parts as MessagePart[]);
        }
      }
    } catch (err) {
      this.log(
        { data: productEventData } as ProductEventPayload,
        integrations,
        ErrorCodes.FreshchatPlaceholder,
        { error: err as AnyJson, errorType: 'FETCH_USER_MESSAGE_FOR_CONDITION' },
      );
    }

    return '';
  }

  public static async resolveConditionMessageText(
    productEventData: ProductEventData,
    integrations: Integrations,
    ruleAlias: string,
  ): Promise<string> {
    return (await this.resolveConditionMessageTextResult(productEventData, integrations, ruleAlias)).text;
  }

  /**
   * Resolves the MESSAGE_TEXT value and reports whether it was resolved from an actual user message.
   *
   * `resolved` is true only when a real user message (inline or fetched) was found. It is false when
   * the only message available is a system/reopen status line and no user message could be recovered.
   * Callers evaluating "absence" operators (DOES_NOT_CONTAIN / CONTAINS_NONE_OF) must treat an
   * unresolved result as fail-closed so a reopen event cannot satisfy the exclusion by virtue of an
   * empty string.
   */
  public static async resolveConditionMessageTextResult(
    productEventData: ProductEventData,
    integrations: Integrations,
    ruleAlias: string,
  ): Promise<{ resolved: boolean; text: string }> {
    const inlineText = this.getConditionMessageText(productEventData);
    if (inlineText) {
      return { resolved: true, text: inlineText };
    }

    // No usable inline text. This happens on reopen/system events where the inline payload only
    // carries the reopen status message. Try to recover the real user message from the API.
    if (this.shouldFetchUserMessageTextForConditions(productEventData)) {
      const fetchedText = await this.fetchLatestUserMessageText(productEventData, integrations, ruleAlias);
      if (fetchedText) {
        return { resolved: true, text: fetchedText };
      }
      // User-origin event but no user message could be recovered (fetch failed or returned none).
      return { resolved: false, text: '' };
    }

    // Not a user-origin event and no relevant inline message: the MESSAGE_TEXT context is unresolved.
    return { resolved: false, text: '' };
  }

  public static async enrichProductEventPayloadWithLatestUserMessage(
    payload: ProductEventPayload,
    integrations: Integrations,
    ruleAlias: string,
  ): Promise<ProductEventPayload> {
    const userMessageText = await this.fetchLatestUserMessageText(payload.data, integrations, ruleAlias);
    if (!userMessageText) {
      return payload;
    }

    const modelProperties = payload.data.conversation || payload.data.message;
    if (!modelProperties) {
      return payload;
    }

    const enrichedUserMessage: Message = {
      actor_id: payload.data.actor.id,
      actor_type: ActorType.User,
      app_id: modelProperties.app_id,
      channel_id: modelProperties.channel_id,
      conversation_id: modelProperties.conversation_id,
      created_time: new Date().toISOString(),
      id: payload.data.message?.messages?.[0]?.id || modelProperties.messages?.[0]?.id || 'user-message-for-condition',
      interaction_id: '',
      is_agent_first_response: false,
      is_agent_interim_first_response: false,
      is_first_message: false,
      message_parts: [{ text: { content: userMessageText } }],
      message_type: MessageType.Normal,
      org_actor_id: null,
      org_contact_id: null,
      reply_parts: [],
    };

    // Build the `message` model for the enriched payload. Prefer the existing `message` model shape
    // when present (onMessageCreate); otherwise fall back to the conversation/message model
    // properties so the required ModelProperties fields are populated. Only `messages` is overridden
    // so downstream MESSAGE_TEXT re-evaluation reads the real user message.
    const baseMessageModel = payload.data.message || modelProperties;

    return {
      ...payload,
      data: {
        ...payload.data,
        message: {
          ...baseMessageModel,
          messages: [enrichedUserMessage],
        },
      },
    };
  }

  /**
   * Gets a concatenated string of messageParts with type 'email'.
   */
  public static getMessagePartsEmailContent(messageParts: MessagePart[]): string {
    let messageContent = '';

    if (messageParts && messageParts.length) {
      messageContent = messageParts
        .filter((messagePart) => messagePart.email)
        .map((messagePart) => {
          return messagePart.email && messagePart.email.content;
        })
        .join(' ');
    }

    return messageContent;
  }

  public static processHanldebars(value: string, placeholders: PlaceholdersMap): string {
    let processedString = '';
    let isError = false;
    try {
      const template = Handlebars.compile(value as string);
      processedString = template(placeholders);
    } catch (err) {
      isError = true;
    }

    return isError ? value : processedString;
  }

  public static processHandlebarsAndReplacePlaceholders(value: string, placeholders: PlaceholdersMap): string {
    const handlebarsProcessedValue = this.processHanldebars(value, placeholders);

    return findAndReplacePlaceholders(handlebarsProcessedValue, placeholders);
  }

  public static async getDynamicPlaceholders(
    text: string,
    productEventPayload: ProductEventPayload,
    integrations: Integrations,
    givenPlaceholders: PlaceholdersMap,
    options: RuleEngineOptions,
    ruleAlias: string,
  ): Promise<PlaceholdersMap> {
    // Step 1: Extract dynamic placeholder keys from text
    // Step 2: Fetch data required by all matching keys
    // Step 3: Return the generated placeholders map
    const generatedPlaceholders: PlaceholdersMap = {};

    if (ruleConfig.dynamicPlaceholders) {
      // Step 1
      // ------
      // Will receive an array like ['metrics.average_wait_time']
      const matchingDynamicPlaceholderKeys = findMatchingKeys(text, ruleConfig.dynamicPlaceholders);

      // Step 2
      // ------
      if (matchingDynamicPlaceholderKeys) {
        for (let i = 0, len = matchingDynamicPlaceholderKeys.length; i < len; i++) {
          const dynamicPlaceholderKey = matchingDynamicPlaceholderKeys[i];

          // Check if the placeholder key already exists in either the given placeholders or the generated placeholders in this function.
          if ({ ...givenPlaceholders, ...generatedPlaceholders }[dynamicPlaceholderKey]) {
            continue;
          }

          try {
            const value = await ruleConfig.dynamicPlaceholders[dynamicPlaceholderKey](
              productEventPayload,
              integrations,
              options,
              ruleAlias,
            );
            generatedPlaceholders[dynamicPlaceholderKey] = value;
          } catch (err) {
            this.log(productEventPayload, integrations, ErrorCodes.DynamicPlaceholder, {
              dynamicPlaceholderKey,
              error: err as AnyJson,
            });
          }
        }
      }
    }

    // Step 3
    // ------
    return Promise.resolve(generatedPlaceholders);
  }

  /**
   * Converts operand to string.
   */
  public static convertOperand(operand: string): string {
    let retVal: string = operand && operand.toString().trim();

    retVal = typeof retVal === 'string' ? retVal : '';
    return retVal;
  }

  /**
   * Performs operation defined by 'operator' on operands operand1 and operand2.
   */
  public static evaluateCondition(
    operator: ConditionOperator,
    operand1: string | boolean,
    operand2: string | boolean,
    integrations: Integrations,
    options: RuleEngineOptions,
    ruleAlias: string,
    conditionDataType?: ConditionDataType,
  ): Promise<void> {
    const sanitizedOperand1 =
      conditionDataType === ConditionDataType.Boolean ? operand1 : this.convertOperand(operand1 as string);
    const sanitizedOperand2 = this.convertOperand(operand2 as string);

    const operatorFunc = ruleConfig.operators && ruleConfig.operators[operator];

    if (operatorFunc) {
      return operatorFunc(sanitizedOperand1 as string, sanitizedOperand2, integrations, options, ruleAlias);
    }

    throw new Error('no matching condition');
  }

  /**
   * Either resolve or reject based on boolean param.
   */
  public static promisify = (response: boolean): Promise<void> => {
    return response ? Promise.resolve() : Promise.reject();
  };

  /**
   * Gets business hour for an account based on businessHourId provided.
   */
  public static getBusinessHour = (
    businessHourId: string,
    integrations: Integrations,
    ruleAlias: string,
  ): Promise<BusinessHour> => {
    const freshchatApiUrl = integrations.freshchatv1.url;
    const freshchatApiToken = integrations.freshchatv1.token;
    return new Promise((resolve, reject) => {
      axios
        .get(`${freshchatApiUrl}/operating_hours_v2`, {
          headers: {
            Authorization: freshchatApiToken,
            'Content-Type': 'application/json',
            'x-automation-rule-alias': ruleAlias,
            'x-service': 'advanced_automation',
          },
        })
        .then((response: { data: { operatingHours: BusinessHour[] } }) => {
          const matchingBusinessHour = response.data.operatingHours.find((businessHour) => {
            return businessHour.operatingHoursId === parseInt(businessHourId, 10);
          });
          if (matchingBusinessHour) {
            resolve(matchingBusinessHour);
          } else {
            reject();
          }
        })
        .catch((err) => {
          reject(err);
        });
    });
  };
  
  public static registerEmptyPlaceholder(
    convFieldsMap: Map<string, string>,
    conversation: ModelProperties,
    dynamicPlaceholders: PlaceholdersMap,
  ): void {
    convFieldsMap.forEach((value: string, key: string) => {
      if (conversation.properties[key] === undefined) {
        const placeholderKey = `conversation.properties.${value}`;
        dynamicPlaceholders[placeholderKey] = '';
      }
    });
  }

  public static setConversationFields(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conversationFieldsResponse: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    choicesMap: Map<string, any>,
    convFieldsMap: Map<string, string>,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conversationFieldsResponse.data.forEach((field: any) => {
      if (field.type === 'DROPDOWN' || field.type === 'MULTI_SELECT_DROPDOWN') {
        choicesMap.set(field.column_name, field.choices);
      }
      convFieldsMap.set(field.column_name, field.name);
    });
  }

  /*
  * Check if feature flag is available and enabled.
  */
  public static isFeatureFlagEnabled = (
    integrations: Integrations,
    featureFlag: string,
  ): Boolean => {
    return integrations?.featureFlags?.[featureFlag] || false;
  };

}

/* eslint-disable complexity */
// Simple library to handle the actions to be performed
import {
  ProductEventData,
  User,
  ActorType,
  Agent,
  Group,
  ProductEventPayload,
  Actor,
  LabelCategory,
  LabelSubcategory,
} from '@freshworks-jaya/marketplace-models';
import { Action, AnyJson, Api, CustomPlaceholdersMap } from './models/rule';
import { Integrations, RuleEngineOptions } from './models/rule-engine';
import ruleConfig from './RuleConfig';
import { isUsernameGenerated, PlaceholdersMap, capitalizeAll } from '@freshworks-jaya/utilities';
import { Utils } from './Utils';
import Freshchat from '@freshworks-jaya/freshchat-api';
import { APITraceCodes } from './models/error-codes';
import { LogSeverity } from './services/GoogleCloudLogging';

export class ActionExecutor {
  /**
   * Calls the appropriate method to perform the action.
   */
  public static handleAction(
    integrations: Integrations,
    action: Action,
    productEventPayload: ProductEventPayload,
    placeholders: PlaceholdersMap,
    apis: Api[],
    options: RuleEngineOptions,
    ruleAlias?: string,
  ): Promise<PlaceholdersMap> {
    const actionFunc = ruleConfig.actions && ruleConfig.actions[action.type];

    if (actionFunc) {
      const alias = ruleAlias || '';
      return actionFunc(integrations, productEventPayload, action.value, placeholders, apis, options, alias);
    }
    return Promise.reject('Invalid action type');
  }

  /**
   *
   * Sets up placeholders for productEventData
   */
  public static getPlaceholders(
    productEventData: ProductEventData,
    integrations: Integrations,
    convFieldsMap: Map<string, string>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    choicesMap: Map<string, any>,
  ): PlaceholdersMap {
    const user = productEventData.associations.user || ({} as User);
    const actor = productEventData.actor || ({} as Actor);
    const agent =
      productEventData.associations.agent ||
      (productEventData.actor.type === ActorType.Agent ? productEventData.actor : ({} as Agent));
    const { channel } = productEventData.associations;
    const group = productEventData.associations.group || ({} as Group);
    const labelCategory = productEventData.associations.label_category || ({} as LabelCategory);
    const labelSubcategory = productEventData.associations.label_subcategory || ({} as LabelSubcategory);

    const conversation = productEventData.conversation || productEventData.message;
    const firstMessage = conversation.messages && conversation.messages.length && conversation.messages[0];
    const firstMessageText = (firstMessage && Utils.getMessagePartsTextContent(firstMessage.message_parts)) || '';
    const interactionId = (firstMessage && firstMessage.interaction_id) || '';

    // Register static placeholders
    const placeholders = {
      actor: actor,
      'actor.email': actor.email,
      'actor.first_name': actor.first_name,
      'actor.id': actor.id,
      'actor.last_name': actor.last_name,
      agent: agent,
      'agent.email': agent.email,
      'agent.first_name': agent.first_name,
      'agent.id': agent.id,
      'agent.last_name': agent.last_name,
      channel: channel,
      'channel.id': channel.id,
      'channel.name': channel.name,
      conversation: conversation,
      'conversation.app_id': conversation.app_id,
      'conversation.assigned_agent_id': conversation.assigned_group_id,
      'conversation.assigned_group_id': conversation.assigned_group_id,
      'conversation.do_not_auto_resolve': (!!conversation.do_not_auto_resolve).toString(),
      'conversation.id': conversation.conversation_id,
      'conversation.status': conversation.status,
      'freshchat.api_token_v1': integrations.freshchatv1.token,
      'freshchat.api_token_v2': integrations.freshchatv2.token,
      'freshchat.api_url_v1': integrations.freshchatv1.url,
      'freshchat.api_url_v2': integrations.freshchatv2.url,
      'freshdesk.api_token': integrations.freshdesk?.token,
      'freshdesk.api_url': integrations.freshdesk?.url,
      group: group,
      'group.description': group.description,
      'group.id': group.id,
      'group.name': group.name,
      label_category: labelCategory,
      'label_category.id': labelCategory.id,
      'label_category.name': labelCategory.name,
      label_subcategory: labelSubcategory,
      'label_subcategory.id': labelSubcategory.id,
      'label_subcategory.name': labelSubcategory.name,
      message: firstMessage,
      'message.interaction_id': interactionId,
      'message.text': firstMessageText,
      'timezone.offset': integrations.timezoneOffset?.toString(),
      user: user,
      'user.email': user.email,
      'user.first_name': user.first_name,
      'user.id': user.id,
      'user.last_name': user.last_name,
      'user.phone': user.phone,
    } as PlaceholdersMap;

    if (isUsernameGenerated(user.first_name || '')) {
      placeholders['user.first_name'] = '';
      placeholders['user.last_name'] = '';
    } else {
      placeholders['user.first_name'] = capitalizeAll(user.first_name);
      placeholders['user.last_name'] = capitalizeAll(user.last_name);
    }

    // Register dynamic placeholders
    const dynamicPlaceholders: PlaceholdersMap = {};
    user.properties &&
      user.properties.forEach((userProperty) => {
        const placeholderKey = `user.properties.${userProperty.name}`;
        dynamicPlaceholders[placeholderKey] = userProperty.value;
        // For backward compatibility with migrated accounts
        if (userProperty.oldName) {
          const oldPlaceholderKey = `user.properties.${userProperty.oldName}`;
          dynamicPlaceholders[oldPlaceholderKey] = userProperty.value;
        }
      });
    // Register empty placeholder for conversation properties which are not filled
    Utils.registerEmptyPlaceholder(convFieldsMap, conversation, dynamicPlaceholders);
    // For conversation properties with a value
    conversation.properties &&
      Object.keys(conversation.properties).forEach(function (key) {
        const placeholderKey = `conversation.properties.${convFieldsMap.get(key)}`;
        const choices = choicesMap.get(key);
        if (choices) {
          if (Array.isArray(conversation.properties[key])) {
            const dropdownOptions: Array<string> = [];
            conversation.properties[key].filter((choice: string) => {
              dropdownOptions.push(choices.find((option: { id: string }) => choice === option.id).value);
            });
            dynamicPlaceholders[placeholderKey] = dropdownOptions.toString();
          } else {
            dynamicPlaceholders[placeholderKey] = choices.find(
              (option: { id: string }) => option.id === conversation.properties[key],
            ).value;
          }
        } else {
          dynamicPlaceholders[placeholderKey] = conversation.properties[key].toString();
        }
      });

    return { ...placeholders, ...dynamicPlaceholders };
  }

  /**
   * Iterates through all the actions and performs each one as configured.
   */
  public static async handleActions(
    integrations: Integrations,
    actions: Action[],
    productEventPayload: ProductEventPayload,
    apis: Api[],
    customPlaceholders: CustomPlaceholdersMap,
    options: RuleEngineOptions,
    ruleAlias?: string,
  ): Promise<void> {
    const freshchatApiUrl = integrations.freshchatv2.url;
    const freshchatApiToken = integrations.freshchatv2.token;
    const freshchat = new Freshchat(freshchatApiUrl, freshchatApiToken, ruleAlias);
    const convFieldsMap = new Map<string, string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const choicesMap = new Map<string, any>();
    const propStart = Date.now();
    console.log({ s: 'FetchConversationPropertiesStart', ts: propStart });
    const { data: conversationFieldsResponse, error } = await freshchat.getConversationPropertyFields();
    console.log({ s: 'FetchConversationPropertiesEnd', ts: Date.now(), d: Date.now() - propStart });
    if (error) {
      Utils.log(
        productEventPayload,
        integrations,
        APITraceCodes.CONVERSATION_PROPERTIES_FEATURE_ACCESS,
        error as AnyJson,
        LogSeverity.ALERT,
      );
    } else {
      Utils.setConversationFields(conversationFieldsResponse, choicesMap, convFieldsMap);
    }
    let placeholders = this.getPlaceholders(productEventPayload.data, integrations, convFieldsMap, choicesMap);

    placeholders = { ...placeholders, ...customPlaceholders };

    console.log({ s: 'ActionLoopStart', ts: Date.now() });
    for (let i = 0; actions && i < actions.length; i += 1) {
      const actionStart = Date.now();
      try {
        const action = actions[i];
        console.log({ s: `ActionStart_${action.type}`, ts: actionStart });
        const placeholdersFromAction = await this.handleAction(
          integrations,
          action,
          productEventPayload,
          placeholders,
          apis,
          options,
          ruleAlias,
        );
        console.log({ s: `ActionEnd_${action.type}`, ts: Date.now(), d: Date.now() - actionStart });
        placeholders = { ...placeholders, ...placeholdersFromAction };
      } catch (err) {
        console.log({ s: `ActionEnd_${actions[i]?.type}`, ts: Date.now(), d: Date.now() - actionStart });
        // Error while executing an action
        // Queietly suppressing it so that next action can be executed
        // So, doing nothing here
        if (options.enableLogger) {
          Utils.log(
            productEventPayload,
            integrations,
            APITraceCodes.ACTION_HANDLER_ERROR,
            err as AnyJson,
            LogSeverity.NOTICE,
          );
        }
      }
    }

    return Promise.resolve();
  }
}

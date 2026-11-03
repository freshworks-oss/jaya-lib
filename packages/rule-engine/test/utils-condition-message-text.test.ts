import { assert } from 'chai';
import { ActorSubEntity, ActorType, MessageType, ProductEventData } from '@freshworks-jaya/marketplace-models';
import { Utils } from '../src/Utils';
import messageTextCondition from '../src/recommended/conditions/message-text';
import { Condition, ConditionKey, ConditionOperator } from '../src/models/rule';
import { Integrations, RuleEngineOptions } from '../src/models/rule-engine';
import ruleConfig from '../src/RuleConfig';
import recommendedPlugins from '../src/recommended/index';

const userMessage = {
  actor_id: 'user-1',
  actor_type: ActorType.User,
  app_id: 'app-1',
  channel_id: 'channel-1',
  conversation_id: 'conv-1',
  created_time: '2020-01-01T00:00:00.000Z',
  id: 'user-msg-1',
  interaction_id: 'interaction-1',
  is_agent_first_response: false,
  is_agent_interim_first_response: false,
  is_first_message: false,
  message_parts: [{ text: { content: 'Rozmowa dotyczy konwersacji z dnia dzisiaj' } }],
  message_type: MessageType.Normal,
  org_actor_id: null,
  org_contact_id: null,
  reply_parts: [],
};

const reopenSystemMessage = {
  ...userMessage,
  actor_type: ActorType.System,
  id: 'reopen-msg-1',
  message_parts: [{ text: { content: 'Conversation reopened due to new incoming message' } }],
  message_type: MessageType.System,
  meta_data: { isReopen: true },
};

describe('Utils.getConditionMessageText', () => {
  it('uses user message from message model on onMessageCreate', () => {
    const productEventData = {
      message: { messages: [userMessage] },
      actor: { type: ActorType.User, id: 'user-1' },
    } as unknown as ProductEventData;

    assert.equal(Utils.getConditionMessageText(productEventData), userMessage.message_parts[0].text.content);
  });

  it('ignores reopen system message on conversation update user_message events', () => {
    const productEventData = {
      conversation: { messages: [reopenSystemMessage] },
      actor: { type: ActorType.System, sub_entity: ActorSubEntity.UserMessage, id: 'system' },
    } as unknown as ProductEventData;

    assert.equal(Utils.getConditionMessageText(productEventData), '');
  });

  it('prefers user message when both reopen system and user messages are present', () => {
    const productEventData = {
      conversation: { messages: [reopenSystemMessage] },
      message: { messages: [userMessage] },
      actor: { type: ActorType.System, sub_entity: ActorSubEntity.UserMessage, id: 'system' },
    } as unknown as ProductEventData;

    assert.equal(Utils.getConditionMessageText(productEventData), userMessage.message_parts[0].text.content);
  });
});

describe('message-text condition on reopen', () => {
  const integrations = {} as unknown as Integrations;
  const options = {} as RuleEngineOptions;
  const doesNotContain = {
    key: ConditionKey.MessageText,
    operator: ConditionOperator.DoesNotContain,
    value: 'test',
  } as Condition;

  const reopenOnly = {
    conversation: { messages: [reopenSystemMessage] },
    actor: { type: ActorType.System, sub_entity: ActorSubEntity.UserMessage, id: 'system' },
  } as unknown as ProductEventData;

  const withUserMessage = (text: string) =>
    ({
      conversation: { messages: [reopenSystemMessage] },
      message: { messages: [{ ...userMessage, message_parts: [{ text: { content: text } }] }] },
      actor: { type: ActorType.System, sub_entity: ActorSubEntity.UserMessage, id: 'system' },
    } as unknown as ProductEventData);

  const run = async (data: ProductEventData): Promise<boolean> => {
    try {
      await messageTextCondition(doesNotContain, data, integrations, options, 'rule-alias');
      return true;
    } catch {
      return false;
    }
  };

  beforeEach(() => ruleConfig.registerPlugins(recommendedPlugins));
  afterEach(() => ruleConfig.reset());

  it('rejects "does not contain" when only the reopen system message is present', async () => {
    assert.isFalse(await run(reopenOnly));
  });

  it('rejects "does not contain" when the user message contains the phrase', async () => {
    assert.isFalse(await run(withUserMessage('this is a test')));
  });

  it('passes "does not contain" when the user message lacks the phrase', async () => {
    assert.isTrue(await run(withUserMessage('hello there')));
  });
});

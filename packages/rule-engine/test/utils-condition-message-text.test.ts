import { assert } from 'chai';
import nock from 'nock';
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
    assert.isTrue(Utils.shouldFetchUserMessageTextForConditions(productEventData));
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

/**
 * End-to-end reproduction of ticket CX-369091 "WoC Test":
 *   Triggers: user starts a new conversation / system reopens due to user message / system reopens a conversation
 *   Conditions (ALL): Business hours outside ... AND Message Text does not contain "test"
 *
 * The bug: on a reopen the MESSAGE_TEXT "does not contain" check evaluated against the reopen
 * status line (or empty text), so it wrongly PASSED and the rule fired even though the user's
 * message contained the excluded phrase. These tests drive the real `message-text` condition
 * handler through reopen payloads.
 */
describe('message-text condition on reopen (CX-369091)', () => {
  const freshchatBaseUrl = 'https://test.freshchat.com/v2';
  // Fetch strips the trailing "/v2" and re-appends the versioned path.
  const freshchatHost = 'https://test.freshchat.com';
  const conversationId = 'conv-reopen-1';

  const integrations = {
    freshchatv2: {
      token: 'testToken',
      url: freshchatBaseUrl,
    },
  } as unknown as Integrations;

  const options = {
    isSchedulerEnabled: false,
    isUseStaticIP: false,
    maxProductEventDelay: 30000,
  } as RuleEngineOptions;

  const doesNotContainCondition: Condition = {
    key: ConditionKey.MessageText,
    operator: ConditionOperator.DoesNotContain,
    value: 'test',
  } as Condition;

  const reopenPayload = {
    conversation: {
      app_id: 'app-1',
      channel_id: 'channel-1',
      conversation_id: conversationId,
      messages: [{ ...reopenSystemMessage, conversation_id: conversationId }],
    },
    actor: { type: ActorType.System, sub_entity: ActorSubEntity.UserMessage, id: 'system' },
  } as unknown as ProductEventData;

  const messagesPath = `/v2/conversations/${conversationId}/messages`;

  beforeEach(() => {
    ruleConfig.registerPlugins(recommendedPlugins);
  });

  afterEach(() => {
    ruleConfig.reset();
    nock.cleanAll();
  });

  it('REJECTS "does not contain" when the fetched user message DOES contain the phrase (rule must not fire)', async () => {
    nock(freshchatHost)
      .get(messagesPath)
      .query(true)
      .reply(200, {
        messages: [
          {
            ...userMessage,
            conversation_id: conversationId,
            message_parts: [{ text: { content: 'please run the test suite now' } }],
          },
        ],
      });

    let rejected = false;
    try {
      await messageTextCondition(doesNotContainCondition, reopenPayload, integrations, options, 'rule-alias');
    } catch {
      rejected = true;
    }

    assert.isTrue(rejected, 'does-not-contain should REJECT because the real user message contains "test"');
  });

  it('PASSES "does not contain" when the fetched user message does NOT contain the phrase', async () => {
    nock(freshchatHost)
      .get(messagesPath)
      .query(true)
      .reply(200, {
        messages: [
          {
            ...userMessage,
            conversation_id: conversationId,
            message_parts: [{ text: { content: 'dzień dobry, mam pytanie' } }],
          },
        ],
      });

    let resolved = false;
    try {
      await messageTextCondition(doesNotContainCondition, reopenPayload, integrations, options, 'rule-alias');
      resolved = true;
    } catch {
      resolved = false;
    }

    assert.isTrue(resolved, 'does-not-contain should PASS because the real user message does not contain "test"');
  });

  it('FAILS CLOSED: "does not contain" REJECTS when no user message can be resolved on reopen', async () => {
    // Fetch returns only system/non-user messages -> text cannot be resolved from a user message.
    nock(freshchatHost)
      .get(messagesPath)
      .query(true)
      .reply(200, {
        messages: [{ ...reopenSystemMessage, conversation_id: conversationId }],
      });

    let rejected = false;
    try {
      await messageTextCondition(doesNotContainCondition, reopenPayload, integrations, options, 'rule-alias');
    } catch {
      rejected = true;
    }

    assert.isTrue(rejected, 'unresolved message text must fail-closed for an absence operator, not pass on empty text');
  });

  it('FAILS CLOSED: "does not contain" REJECTS when the user-message fetch errors out', async () => {
    nock(freshchatHost).get(messagesPath).query(true).reply(500, { error: 'boom' });

    let rejected = false;
    try {
      await messageTextCondition(doesNotContainCondition, reopenPayload, integrations, options, 'rule-alias');
    } catch {
      rejected = true;
    }

    assert.isTrue(rejected, 'a failed fetch must not degrade to passing the exclusion on empty text');
  });
});

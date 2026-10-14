import { assert } from 'chai';
import {
  ActorSubEntity,
  ActorType,
  MessageType,
  ProductEventData,
} from '@freshworks-jaya/marketplace-models';
import { Utils } from '../src/Utils';

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
    } as ProductEventData;

    assert.equal(Utils.getConditionMessageText(productEventData), userMessage.message_parts[0].text.content);
  });

  it('ignores reopen system message on conversation update user_message events', () => {
    const productEventData = {
      conversation: { messages: [reopenSystemMessage] },
      actor: { type: ActorType.System, sub_entity: ActorSubEntity.UserMessage, id: 'system' },
    } as ProductEventData;

    assert.equal(Utils.getConditionMessageText(productEventData), '');
    assert.isTrue(Utils.shouldFetchUserMessageTextForConditions(productEventData));
  });

  it('prefers user message when both reopen system and user messages are present', () => {
    const productEventData = {
      conversation: { messages: [reopenSystemMessage] },
      message: { messages: [userMessage] },
      actor: { type: ActorType.System, sub_entity: ActorSubEntity.UserMessage, id: 'system' },
    } as ProductEventData;

    assert.equal(Utils.getConditionMessageText(productEventData), userMessage.message_parts[0].text.content);
  });
});

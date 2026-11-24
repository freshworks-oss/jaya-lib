import { Event, ProductEventData } from '@freshworks-jaya/marketplace-models';
import { TriggerAction } from '../../models/rule';

// eslint-disable-next-line complexity
export default (productEvent: Event, productEventData: ProductEventData, triggerAction: TriggerAction): boolean => {
  const { actor, changes } = productEventData;
  const { model_changes } = changes || {};
  const { assigned_agent_id, assigned_group_id, status, priority } = model_changes || {};

  const match = model_changes && Object.keys(model_changes).find((key) => /^cf_[a-zA-Z0-9_]+/.test(key));

  return (
    productEvent === Event.ConversationUpdate &&
    actor?.actor_source != null &&
    actor.actor_source !== 'API' &&
    !!model_changes &&
    !!(assigned_agent_id || assigned_group_id || status || priority || match)
  );
};

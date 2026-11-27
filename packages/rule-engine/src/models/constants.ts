import { TriggerActionType, TriggerActorCause, TriggerActorType } from './rule';

// this is to check and cancel continuous assignment event firing
export const assignmentConditions = [
  {
    action: {
      change: {
        from: 'ANY',
        to: 'ASSIGNED',
      },
      type: TriggerActionType.ConversationAgentAssign,
    },
    actor: {
      cause: TriggerActorCause.IntelliAssign,
      type: TriggerActorType.System,
    },
  },
  {
    action: {
      change: {
        from: 'ANY',
        to: 'ASSIGNED',
      },
      type: TriggerActionType.ConversationAgentAssign,
    },
    actor: {
      cause: TriggerActorCause.AssignmentRule,
      type: TriggerActorType.System,
    },
  },
  {
    action: {
      change: {
        from: 'ANY',
        to: 'ANY',
      },
      type: TriggerActionType.ConversationGroupAssign,
    },
    actor: {
      cause: TriggerActorCause.AssignmentRule,
      type: TriggerActorType.System,
    },
  },
];

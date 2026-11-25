export enum ConversationStatus {
  Assigned = 'assigned',
  New = 'new',
  Resolved = 'resolved',
  WaitingOnCustomer = 'waiting on customer',
  WaitingOnInternalTeam = 'waiting on internal team',
}

export enum ChangedStatus {
  Assigned = 'assigned',
  New = 'new',
  Resolved = 'resolved',
  WaitingOnCustomer = 'waiting on customer',
  WaitingOnInternalTeam = 'waiting on internal team',
}

export enum MessageType {
  Normal = 'normal',
  Private = 'private',
  System = 'system',
}

export enum ActorType {
  Agent = 'agent',
  Bot = 'bot',
  System = 'system',
  User = 'user',
}

export enum ConversationSource {
  AppleBusinessChat = 'ABC',
  FacebookMessenger = 'FACEBOOK_MESSENGER',
  FacebookNative = 'FB_NATIVE',
  FreshbotsWidget = 'FRESHBOTS_WIDGET',
  GoogleBusinessMessages = 'GBM',
  LineMessenger = 'LINE',
  MobileSDK = 'MOBILE',
  WebMessenger = 'WEBCHAT',
  WhatsApp = 'WHATSAPP',
  Email = 'EMAIL',
}

export enum MessageSource {
  Api = 'api',
  FacebookMessenger = 'facebook_messenger',
  FacebookNative = 'facebook_native',
  Freshdesk = 'freshdesk',
  Invalid = 'invalid',
  Mobile = 'mobile',
  Smooch = 'smooch',
  System = 'system',
  Web = 'web',
  Zendesk = 'zendesk',
}

export enum ResponseDueType {
  FirstResponseDue = 'FIRST_RESPONSE_DUE',
  NoResponseDue = 'NO_RESPONSE_DUE',
  ResponseDue = 'RESPONSE_DUE',
}

export enum ResolutionDueType {
  NO_RESOLUTION_DUE = 'NO_RESOLUTION_DUE',
  RESOLUTION_DUE = 'RESOLUTION_DUE',
}

export enum ActorSubEntity {
  AgentGroupMapping = 'agent_group_mapping',
  AssignmentRule = 'assignment_rule',
  AutoResolve = 'auto_resolve',
  ChannelGroupMapping = 'channel_group_mapping',
  FreddyBot = 'freddy_bot',
  HallwayBot = 'hallway_bot',
  Intelliassign = 'intelliassign',
  UserMessage = 'user_message',
}

export interface Group {
  agents: string[];
  description: string;
  id: string;
  name: string;
  routing_type: string;
}

export interface Channel {
  assign_to_group: string;
  enabled: boolean;
  icon?: {
    url: string;
  };
  id: string;
  locale: string;
  name: string;
  public: boolean;
  tags: string[];
  updated_time: string;
  welcome_message: Message;
}

export interface UserProperty {
  name: string;
  oldName?: string;
  value: string;
}

export interface User {
  avatar?: {
    url?: string;
  };
  created_time: string;
  email?: string;
  first_name?: string;
  id: string;
  last_name?: string;
  org_contact_id: string;
  phone?: string;
  properties?: UserProperty[];
  reference_id?: string;
  updated_time?: string;
}

export interface MessagePart {
  callback?: {
    label: string;
    payload: string;
  };
  collection?: {
    sub_parts: MessagePart[];
  };
  email?: {
    content: string;
    subject: string;
  };
  image?: { url: string };
  quick_reply_button?: {
    custom_reply_text?: string;
    label: string;
  };
  text?: { content: string };
  url_button?: {
    label: string;
    target: string;
    url: string;
  };
}

export interface ReplyPart {
  collection: {
    sub_parts: MessagePart[];
  };
}

export interface Actor {
  actor_source?: string;
  avatar: {
    url: string;
  };
  email: string;
  first_name: string;
  id: string;
  last_name: string;
  org_actor_id: string | null;
  org_contact_id: string | null;
  phone: string;
  sub_entity?: ActorSubEntity;
  type: ActorType;
}

export interface Message {
  actor_id: string;
  actor_type: ActorType;
  app_id: string;
  channel_id: string;
  conversation_id: string;
  created_time: string;
  id: string;
  interaction_id: string;
  is_agent_first_response: boolean;
  is_agent_interim_first_response: boolean;
  is_first_message: boolean;
  message_parts: MessagePart[];
  message_source?: MessageSource;
  message_type: MessageType;
  org_actor_id: string | null;
  org_contact_id: string | null;
  reply_parts: ReplyPart[];
}
export interface ModelProperties {
  app_id: string;
  assigned_agent_id: string | null;
  assigned_group_id: string | null;
  assigned_org_agent_id: string | null;
  assigned_org_group_id: string | null;
  assigned_time: string | null;
  channel_id: string;
  conversation_id: string;
  created_time: string;
  do_not_auto_resolve: boolean;
  ext_entity_meta: {
    meta: {
      call_life_cycle_event_type: string;
      call_status: string;
      call_type: string;
    };
  };
  first_agent_assigned_time: string | null;
  first_group_assigned_time: string | null;
  group_assigned_time: string | null;
  is_offline: boolean;
  label_category_id: string | null;
  label_subcategory_id: string | null;
  messages?: Message[];
  org_contact_id: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties: any;
  reopened_time: string | null;
  resolution_due_breached?: boolean;
  resolution_due_type: ResolutionDueType;
  resolved_time: string | null;
  response_due_type: ResponseDueType;
  sla_policy_name?: string | null;
  source?: ConversationSource;
  statistics: {
    agent_reassignment_time_bhrs: number;
    agent_reassignment_time_chrs: number;
    first_agent_assignment_time_bhrs: number;
    first_agent_assignment_time_chrs: number;
    first_group_assignment_time_bhrs: number;
    first_group_assignment_time_chrs: number;
    first_response_time_bhrs: number;
    first_response_time_chrs: number;
    group_reassignment_time_bhrs: number;
    group_reassignment_time_chrs: number;
    resolution_time_bhrs: number;
    resolution_time_chrs: number;
    sla_breach: [boolean, boolean];
    wait_time_bhrs: number;
    wait_time_chrs: number;
  };
  status: ConversationStatus;
  user_id: string;
}

export interface Agent {
  avatar: unknown;
  email: string;
  first_name: string;
  id: string;
  last_name: string;
}

export interface LabelCategory {
  created_time: string;
  id: string;
  is_enabled: boolean;
  name: string;
  updated_time: string;
}

export interface LabelSubcategory {
  category_id: string;
  created_time: string;
  id: string;
  is_enabled: boolean;
  name: string;
  updated_time: string;
}

export interface ProductEventData {
  actor: Actor;
  associations: {
    agent: Agent;
    channel: Channel;
    group: Group;
    label_category: LabelCategory;
    label_subcategory: LabelSubcategory;
    user: User;
  };
  changes: {
    model_changes: {
      assigned_agent_id: [string, string];
      assigned_group_id: [string, string];
      do_not_auto_resolve: [boolean, boolean];
      label_category_id: [string, string];
      label_subcategory_id: [string, string];
      priority: [string, string];
      resolution_sla_breach: [boolean, boolean];
      sla_breach: [boolean, boolean];
      status: [ChangedStatus, ChangedStatus];
    };
  };
  conversation: ModelProperties;
  message: ModelProperties;
}
